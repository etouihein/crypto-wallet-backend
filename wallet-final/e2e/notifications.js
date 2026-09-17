'use strict';
// wallet-final/e2e/notifications.js
// ─────────────────────────────────────────────────────────────────
//  Notifications de réception et de confirmation d'envoi — test de bout en
//  bout sur le vrai export web, avec une blockchain simulée.
//
//  Né du signalement « pas de notif quand on reçoit ou envoie des sous ».
//  Avant : une seule notification, sur natif uniquement, pour la crypto
//  native du réseau actif ; rien sur le web, rien pour USDT/USDC/SOL/BTC,
//  rien quand un envoi est confirmé. Choix validé (option A) : détection sur
//  l'appareil, sans serveur qui surveille les adresses.
//
//  Les nœuds RPC publics (ethereum-rpc / bsc-rpc .publicnode.com) sont
//  remplacés par un nœud simulé qui répond ce que le test décide : solde,
//  reçu de transaction… Le relevé des soldes a lieu toutes les 45 s : le
//  test attend jusqu'à 60 s une notification.
//
//  USAGE :
//    npm run test:e2e
//    BASE_URL=https://nexiawallet.com node e2e/notifications.js
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const { BENIGN_PATTERNS } = require('../lib/sentryNoise');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BACKEND = 'crypto-wallet-backend-production-5c6c.up.railway.app';
const TEST_PIN = '123456';
const DESTINATAIRE = '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${message}`);
  if (!ok) echecs += 1;
};

const hex = (n) => `0x${BigInt(n).toString(16)}`;
const ETH = (x) => hex(BigInt(Math.round(x * 1e6)) * 10n ** 12n);
const uint256 = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;

const BLOC = {
  number: '0x1000000', hash: `0x${'11'.repeat(32)}`, parentHash: `0x${'22'.repeat(32)}`, nonce: '0x0000000000000000',
  sha3Uncles: `0x${'33'.repeat(32)}`, logsBloom: `0x${'00'.repeat(256)}`, transactionsRoot: `0x${'44'.repeat(32)}`,
  stateRoot: `0x${'55'.repeat(32)}`, receiptsRoot: `0x${'66'.repeat(32)}`, miner: `0x${'00'.repeat(20)}`,
  difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x100', gasLimit: '0x1c9c380', gasUsed: '0x0',
  timestamp: '0x65000000', transactions: [], uncles: [], baseFeePerGas: '0x3b9aca00',
};

// Nœud JSON-RPC simulé : répond à tout ce qu'ethers demande pour lire un
// solde, estimer des frais, signer et suivre une transaction.
function noeudSimule(etat) {
  const repondre = ({ method, params }) => {
    switch (method) {
      case 'eth_chainId': return etat.chainId;
      case 'net_version': return String(parseInt(etat.chainId, 16));
      case 'eth_getBalance': return etat.solde;
      case 'eth_call': return etat.soldeJeton || uint256(0);
      case 'eth_blockNumber': return '0x1000000';
      case 'eth_gasPrice': return '0x3b9aca00';
      case 'eth_maxPriorityFeePerGas': return '0x3b9aca00';
      case 'eth_estimateGas': return '0x5208';
      case 'eth_getTransactionCount': return '0x0';
      case 'eth_getBlockByNumber': return BLOC;
      case 'eth_getCode': return '0x';
      case 'eth_getTransactionReceipt':
        return etat.recu ? {
          transactionHash: params[0], transactionIndex: '0x0', blockHash: `0x${'77'.repeat(32)}`, blockNumber: '0xffffff',
          from: `0x${'12'.repeat(20)}`, to: DESTINATAIRE, cumulativeGasUsed: '0x5208', gasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00', contractAddress: null, logs: [], logsBloom: `0x${'00'.repeat(256)}`,
          status: etat.recu === 'echec' ? '0x0' : '0x1', type: '0x2',
        } : null;
      default: return null;
    }
  };
  return async (route) => {
    let corps = null;
    try { corps = JSON.parse(route.request().postData() || 'null'); } catch { /* corps illisible */ }
    if (!corps) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    etat.appels.push(...(Array.isArray(corps) ? corps : [corps]).map((r) => r.method));
    const une = (r) => ({ jsonrpc: '2.0', id: r.id, result: repondre(r) });
    const sortie = Array.isArray(corps) ? corps.map(une) : une(corps);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sortie) });
  };
}

const NETTOYER = `(s) => String(s || '').split('').filter((ch) => {
  const k = ch.charCodeAt(0);
  return !(k <= 32 || k === 160 || (k >= 0x200b && k <= 0x200f) || k === 0xfeff || (k >= 0xe000 && k <= 0xf8ff));
}).join('')`;

async function cliquer(page, { role, texte, commencePar = false, dernier = true }) {
  return page.evaluate(({ role, texte, commencePar, dernier, src }) => {
    // eslint-disable-next-line no-new-func
    const net = new Function(`return ${src}`)();
    const cible = net(texte);
    const liste = Array.from(document.querySelectorAll(role ? `[role="${role}"]` : '[role="button"],div,span'))
      .filter((e) => (commencePar ? net(e.innerText).startsWith(cible) : net(e.innerText) === cible));
    const el = dernier ? liste.pop() : liste[0];
    if (el) el.click();
    return !!el;
  }, { role, texte, commencePar, dernier, src: NETTOYER });
}

const texteDansLaPage = (page, t) => page.evaluate((x) => (document.body.innerText || '').includes(x), t);

// Guette une notification dans l'app pendant `delaiMs` : renvoie son texte
// complet dès qu'elle apparaît, ou null.
async function guetter(page, titre, contenu, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const trouve = await page.evaluate(({ titre, contenu }) => {
      const t = document.body.innerText || '';
      return t.includes(titre) && (!contenu || t.includes(contenu));
    }, { titre, contenu });
    if (trouve) return true;
    await wait(400);
  }
  return false;
}

// Nœud Solana simulé : solde, empreinte de bloc (nécessaire pour signer) et
// état d'une signature (pour la confirmation).
function noeudSolana(etat) {
  const repondre = ({ method }) => {
    switch (method) {
      case 'getBalance': return { context: { slot: 1 }, value: etat.lamports };
      case 'getLatestBlockhash': return { context: { slot: 1 }, value: { blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi', lastValidBlockHeight: 1000 } };
      case 'getSignatureStatuses':
        return { context: { slot: 1 }, value: [etat.confirmee ? { slot: 1, confirmations: 10, err: null, confirmationStatus: 'confirmed' } : null] };
      case 'getVersion': return { 'solana-core': '1.18.0' };
      default: return null;
    }
  };
  return async (route) => {
    let corps = null;
    try { corps = JSON.parse(route.request().postData() || 'null'); } catch { /* corps illisible */ }
    if (!corps) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const une = (r) => ({ jsonrpc: '2.0', id: r.id, result: repondre(r) });
    const sortie = Array.isArray(corps) ? corps.map(une) : une(corps);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sortie) });
  };
}

async function nouvelleSession(browser, { eth, bsc, sol }) {
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, locale: 'fr-FR' });
  await context.route(/ethereum-rpc\.publicnode\.com/, noeudSimule(eth));
  if (bsc) await context.route(/bsc-rpc\.publicnode\.com/, noeudSimule(bsc));
  if (sol) await context.route(/solana-rpc\.publicnode\.com/, noeudSolana(sol));
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => {
    if (!BENIGN_PATTERNS.some((motif) => String(e.message).includes(motif))) erreurs.push(e.message);
  });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(`${BASE_URL}/?e2e-notif=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByText('Créer mon wallet', { exact: true }).waitFor({ timeout: 120000 });
  await wait(800);
  await page.getByText('Créer mon wallet', { exact: true }).click();
  await wait(2000);
  for (const ch of TEST_PIN) { await page.getByText(ch, { exact: true }).first().click(); await wait(150); }
  await wait(1200);
  for (const ch of TEST_PIN) { await page.getByText(ch, { exact: true }).first().click(); await wait(150); }
  await wait(3500);
  await page.getByText("Je l'ai notée en lieu sûr", { exact: false }).click({ timeout: 15000 }).catch(() => {});
  await wait(1200);
  await cliquer(page, { texte: 'Passer' });
  await wait(1500);
  return { context, page, erreurs };
}

const etatNoeud = (chainId, solde, extra = {}) => ({ chainId, solde, soldeJeton: uint256(0), recu: null, appels: [], ...extra });

(async () => {
  console.log(`Notifications — ${BASE_URL}`);
  const browser = await chromium.launch();

  // ── 1 ────────────────────────────────────────────────────────────────
  console.log('\n1. Des ETH arrivent pendant que l\'app est ouverte');
  {
    const eth = etatNoeud('0x1', ETH(0));
    const { context, page, erreurs } = await nouvelleSession(browser, { eth });
    try {
      await wait(4000);
      verifier(eth.appels.includes('eth_getBalance'), 'le solde est bien relevé auprès du nœud (simulé)');
      verifier(!(await texteDansLaPage(page, 'Fonds reçus')), 'aucune notification au déverrouillage : le premier relevé sert de référence');
      eth.solde = ETH(0.05);
      const t0 = Date.now();
      const vue = await guetter(page, 'Fonds reçus', '+0.05 ETH', 60000);
      verifier(vue, vue ? `notification « Fonds reçus +0.05 ETH » affichée ${Math.round((Date.now() - t0) / 1000)} s après l'arrivée` : 'notification « Fonds reçus +0.05 ETH » affichée en moins de 60 s');
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  // ── 2 ────────────────────────────────────────────────────────────────
  // Le piège : les soldes affichés ne sont pas rangés par réseau. Passer
  // d'Ethereum (0) à BNB Chain (1 BNB, 10 USDT) ne doit rien signaler ; une
  // vraie arrivée sur BNB Chain, ensuite, oui.
  console.log('\n2. Changer de réseau ne passe pas pour une réception');
  {
    const eth = etatNoeud('0x1', ETH(0));
    const bsc = etatNoeud('0x38', ETH(1), { soldeJeton: uint256(10n * 10n ** 18n) });
    const { context, page, erreurs } = await nouvelleSession(browser, { eth, bsc });
    try {
      await wait(3000);
      const recherche = page.locator('[aria-label="Recherche"]');
      await recherche.first().click();
      await wait(400);
      await page.locator('input').first().fill('réglages');
      await wait(500);
      await page.getByText('Réglages', { exact: true }).last().click();
      await wait(1200);
      verifier(await cliquer(page, { texte: 'BNB Smart Chain', commencePar: true }), 'réseau BNB Smart Chain choisi dans les Paramètres');
      await page.evaluate(() => { const r = Array.from(document.querySelectorAll('[aria-label="Retour"]')); if (r.length) r[r.length - 1].click(); });
      const fausseAlerte = await guetter(page, 'Fonds reçus', null, 15000);
      verifier(!fausseAlerte, 'aucune « réception » annoncée en changeant de réseau, alors que le solde affiché passe de 0 à 1 BNB');
      bsc.solde = ETH(1.5);
      const vraie = await guetter(page, 'Fonds reçus', '+0.5 BNB', 60000);
      verifier(vraie, 'une vraie arrivée sur BNB Chain, ensuite, est bien annoncée (+0.5 BNB)');
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  // ── 3 ────────────────────────────────────────────────────────────────
  console.log('\n3. Un envoi est suivi jusqu\'à sa confirmation');
  {
    const eth = etatNoeud('0x1', ETH(1));
    const { context, page, erreurs } = await nouvelleSession(browser, { eth });
    let diffusions = 0;
    await context.route(`https://${BACKEND}/wallet/tx/broadcast`, (route) => {
      diffusions += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, txHash: `0x${'ab'.repeat(32)}`, network: 'ethereum' }) });
    });
    try {
      await wait(4000);
      verifier(await cliquer(page, { role: 'button', texte: 'Envoyer' }), 'écran Envoyer ouvert');
      await wait(1500);
      await page.getByPlaceholder('0x123...abc ou nom.eth').fill(DESTINATAIRE);
      await page.getByPlaceholder('0.00', { exact: true }).fill('0.01');
      await wait(600);
      verifier(await cliquer(page, { texte: 'Continuer' }), 'Continuer');
      await wait(3000);
      verifier(await cliquer(page, { texte: "✅ Confirmer l'envoi" }) || await cliquer(page, { texte: "Confirmer l'envoi", commencePar: true }), "Confirmer l'envoi");
      const soumise = await guetter(page, 'Transaction Soumise', null, 15000);
      verifier(soumise && diffusions === 1, `transaction signée et diffusée (diffusions : ${diffusions})`);
      verifier(await texteDansLaPage(page, 'Tu seras prévenu'), "l'utilisateur sait qu'il sera prévenu de la confirmation");
      await cliquer(page, { texte: 'OK' });
      await wait(3000);
      verifier(!(await texteDansLaPage(page, 'Envoi confirmé')), 'rien n\'est annoncé tant que le réseau n\'a pas confirmé');
      eth.recu = 'succes';
      const confirme = await guetter(page, 'Envoi confirmé', '0.01 ETH', 30000);
      verifier(confirme, 'notification « Envoi confirmé 0.01 ETH » dès que le réseau confirme');
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  // ── 4 ────────────────────────────────────────────────────────────────
  // Solana n'est pas un réseau EVM : son suivi passe par l'état de la
  // signature, pas par un reçu de transaction.
  console.log("\n4. Un envoi de SOL est suivi jusqu'à sa confirmation");
  {
    const eth = etatNoeud('0x1', ETH(0));
    const sol = { lamports: 2_000_000_000, confirmee: false }; // 2 SOL
    const { context, page, erreurs } = await nouvelleSession(browser, { eth, sol });
    let diffusions = 0;
    await context.route(`https://${BACKEND}/wallet/tx/broadcast-solana`, (route) => {
      diffusions += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, txHash: '5Xk9mQ7bTt4mWZ8m6L3vQxMjKcJ2v8nP1sR6yF4dA9hE3uV7wC2xB5nT8qY1zL6kM' }) });
    });
    try {
      await wait(4000);
      verifier(await cliquer(page, { role: 'button', texte: 'Envoyer' }), 'écran Envoyer ouvert');
      await wait(1500);
      verifier(await cliquer(page, { texte: 'SOL' }), 'jeton SOL choisi');
      await wait(900);
      await page.getByPlaceholder('Adresse Solana (base58)').fill('8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p');
      await page.getByPlaceholder('0.00', { exact: true }).fill('0.02');
      await wait(600);
      verifier(await cliquer(page, { texte: 'Continuer' }), 'Continuer');
      await wait(2500);
      verifier(await cliquer(page, { texte: "✅ Confirmer l'envoi" }), "Confirmer l'envoi");
      const soumise = await guetter(page, 'Transaction Soumise', null, 15000);
      verifier(soumise && diffusions === 1, `transaction Solana signée et diffusée (diffusions : ${diffusions})`);
      await cliquer(page, { texte: 'OK' });
      await wait(3000);
      verifier(!(await texteDansLaPage(page, 'Envoi confirmé')), "rien n'est annoncé tant que Solana n'a pas confirmé");
      sol.confirmee = true;
      verifier(await guetter(page, 'Envoi confirmé', '0.02 SOL', 30000), 'notification « Envoi confirmé 0.02 SOL » dès que Solana confirme');
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  await browser.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert');
  process.exit(echecs ? 1 : 0);
})();
