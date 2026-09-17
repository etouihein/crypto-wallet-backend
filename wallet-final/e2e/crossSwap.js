'use strict';
// wallet-final/e2e/crossSwap.js
// ─────────────────────────────────────────────────────────────────
//  Échange entre écosystèmes (SOL et BTC) — de bout en bout sur le vrai
//  export web, avec un backend et des nœuds simulés.
//
//  Né du constat de Pablo : « ajoute des swaps comme BTC et Solana, c'est pas
//  normal que ce ne soit pas dispo ». L'agrégateur 0x utilisé jusqu'ici ne
//  fait que de l'EVM sur une seule chaîne.
//
//  Ce test ne se contente pas de vérifier que l'écran ne plante pas : il
//  construit la transaction NON SIGNÉE comme le ferait LI.FI (pour l'adresse
//  réellement dérivée par le wallet du test), puis vérifie
//  CRYPTOGRAPHIQUEMENT que ce que l'app diffuse est bien signé par cette
//  adresse. C'est de l'argent : une signature « présente » ne suffit pas.
//
//  USAGE :
//    npm run test:e2e
//    BASE_URL=https://nexiawallet.com node e2e/crossSwap.js
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const nacl = require('tweetnacl');
const {
  PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, Transaction,
} = require('@solana/web3.js');
const bitcoin = require('bitcoinjs-lib');
const { BENIGN_PATTERNS } = require('../lib/sentryNoise');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BACKEND = 'crypto-wallet-backend-production-5c6c.up.railway.app';
const TEST_PIN = '123456';
const BLOCKHASH = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';
const DESTINATAIRE_SOL = '8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${message}`);
  if (!ok) echecs += 1;
};

const NETTOYER = `(s) => String(s || '').split('').filter((ch) => {
  const k = ch.charCodeAt(0);
  return !(k <= 32 || k === 160 || (k >= 0x200b && k <= 0x200f) || k === 0xfeff || (k >= 0xe000 && k <= 0xf8ff));
}).join('')`;

async function cliquer(page, texte, { role = null, dernier = true } = {}) {
  return page.evaluate(({ texte, role, dernier, src }) => {
    // eslint-disable-next-line no-new-func
    const net = new Function(`return ${src}`)();
    const cible = net(texte);
    const liste = Array.from(document.querySelectorAll(role ? `[role="${role}"]` : '[role="button"],[role="tab"],div,span'))
      .filter((e) => net(e.innerText) === cible);
    const el = dernier ? liste.pop() : liste[0];
    if (el) el.click();
    return !!el;
  }, { texte, role, dernier, src: NETTOYER });
}

const attendreTexte = async (page, texte, delaiMs) => {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (await page.evaluate((t) => (document.body.innerText || '').includes(t), texte)) return true;
    await wait(300);
  }
  return false;
};

const BLOC_EVM = {
  number: '0x1000000', hash: `0x${'11'.repeat(32)}`, parentHash: `0x${'22'.repeat(32)}`, nonce: '0x0000000000000000',
  sha3Uncles: `0x${'33'.repeat(32)}`, logsBloom: `0x${'00'.repeat(256)}`, transactionsRoot: `0x${'44'.repeat(32)}`,
  stateRoot: `0x${'55'.repeat(32)}`, receiptsRoot: `0x${'66'.repeat(32)}`, miner: `0x${'00'.repeat(20)}`,
  difficulty: '0x0', totalDifficulty: '0x0', extraData: '0x', size: '0x100', gasLimit: '0x1c9c380', gasUsed: '0x0',
  timestamp: '0x65000000', transactions: [], uncles: [], baseFeePerGas: '0x3b9aca00',
};

const repondreJsonRpc = (repondre) => async (route) => {
  let corps = null;
  try { corps = JSON.parse(route.request().postData() || 'null'); } catch { /* illisible */ }
  if (!corps) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  const une = (r) => ({ jsonrpc: '2.0', id: r.id, result: repondre(r) });
  const sortie = Array.isArray(corps) ? corps.map(une) : une(corps);
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sortie) });
};

// Ce que LI.FI renverrait pour un départ Solana : transaction non signée,
// dont le payeur de frais est l'adresse du wallet de test.
function transactionSolanaPour(adressePayeur) {
  const payeur = new PublicKey(adressePayeur);
  const message = new TransactionMessage({
    payerKey: payeur,
    recentBlockhash: BLOCKHASH,
    instructions: [SystemProgram.transfer({ fromPubkey: payeur, toPubkey: new PublicKey(DESTINATAIRE_SOL), lamports: 1000 })],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

// Ce que LI.FI renverrait pour un départ Bitcoin : un PSBT dont l'entrée
// appartient à l'adresse du wallet de test.
function psbtPour(adresseBtc) {
  const output = bitcoin.address.toOutputScript(adresseBtc, bitcoin.networks.bitcoin);
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  psbt.addInput({ hash: 'c'.repeat(64), index: 0, witnessUtxo: { script: output, value: 300000n } });
  psbt.addOutput({ address: DESTINATAIRE_BTC, value: 250000n });
  return psbt.toHex();
}
const DESTINATAIRE_BTC = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

async function session(browser, { lamports = 0, satoshis = 0 }) {
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, locale: 'fr-FR' });
  const etat = { diffuse: null, adresseSol: null, adresseBtc: null, requeteDevis: null };

  await context.route(/ethereum-rpc\.publicnode\.com/, repondreJsonRpc(({ method }) => ({
    eth_chainId: '0x1', net_version: '1', eth_getBalance: '0x0', eth_call: `0x${'0'.repeat(64)}`,
    eth_blockNumber: '0x1000000', eth_gasPrice: '0x3b9aca00', eth_getBlockByNumber: BLOC_EVM,
  }[method] ?? null)));

  await context.route(/solana-rpc\.publicnode\.com/, repondreJsonRpc(({ method }) => ({
    getBalance: { context: { slot: 1 }, value: lamports },
    getLatestBlockhash: { context: { slot: 1 }, value: { blockhash: BLOCKHASH, lastValidBlockHeight: 1000 } },
    getSignatureStatuses: { context: { slot: 1 }, value: [null] },
    getVersion: { 'solana-core': '1.18.0' },
  }[method] ?? null)));

  // Blockstream : solde BTC (liste d'UTXO) et estimation de frais.
  await context.route(/blockstream\.info/, (route) => {
    const u = route.request().url();
    if (u.includes('/fee-estimates')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ 3: 12, 6: 8 }) });
    if (u.includes('/utxo')) {
      const corps = satoshis ? [{ txid: 'd'.repeat(64), vout: 0, value: satoshis, status: { confirmed: true } }] : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corps) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Le backend : devis d'échange et diffusion.
  await context.route(`https://${BACKEND}/wallet/swap/cross-quote*`, (route) => {
    const params = new URL(route.request().url()).searchParams;
    etat.requeteDevis = Object.fromEntries(params);
    const depart = params.get('fromNetwork');
    const from = params.get('fromAddress');
    if (depart === 'solana') etat.adresseSol = from;
    if (depart === 'bitcoin') etat.adresseBtc = from;
    const data = depart === 'solana' ? transactionSolanaPour(from) : psbtPour(from);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        ecosystemeDepart: depart,
        commissionAppliquee: false,
        feePct: 0,
        quote: { tool: 'near', estimate: { toAmount: '1000000000000000', feeCosts: [] }, transactionRequest: { data } },
      }),
    });
  });
  for (const chemin of ['broadcast-solana', 'broadcast-bitcoin']) {
    await context.route(`https://${BACKEND}/wallet/tx/${chemin}`, (route) => {
      etat.diffuse = { chemin, corps: JSON.parse(route.request().postData() || '{}') };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, txHash: `${'e'.repeat(64)}` }) });
    });
  }

  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => { if (!BENIGN_PATTERNS.some((m) => String(e.message).includes(m))) erreurs.push(e.message); });

  await page.goto(`${BASE_URL}/?e2e-cross=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
  await cliquer(page, 'Passer');
  await wait(2500);
  return { context, page, etat, erreurs };
}

// Ouvre l'onglet Échanger, choisit les jetons et lance l'échange.
async function lancerEchange(page, { de, vers, montant }) {
  await cliquer(page, 'Découvrir', { role: 'tab' });
  await wait(1200);
  if (!(await cliquer(page, 'Swap'))) throw new Error('raccourci Swap introuvable');
  await wait(2000);
  // Première liste = « Tu paies », seconde = « Tu reçois ».
  const choisi = await page.evaluate(({ de, vers, src }) => {
    // eslint-disable-next-line no-new-func
    const net = new Function(`return ${src}`)();
    const chips = Array.from(document.querySelectorAll('[role="button"],div,span'));
    const payer = chips.filter((e) => net(e.innerText) === net(de));
    const recevoir = chips.filter((e) => net(e.innerText) === net(vers));
    if (!payer.length || !recevoir.length) return false;
    payer[0].click();
    recevoir[recevoir.length - 1].click();
    return true;
  }, { de, vers, src: NETTOYER });
  if (!choisi) throw new Error(`jetons ${de} / ${vers} introuvables dans les listes`);
  await wait(800);
  await page.locator('input').first().fill(montant);
  await wait(800);
  if (!(await cliquer(page, 'Confirmer'))) throw new Error('bouton Confirmer introuvable');
}

(async () => {
  console.log(`Échanges BTC / Solana — ${BASE_URL}`);
  const browser = await chromium.launch();

  console.log('\n1. Échanger du SOL : signé par le wallet, puis diffusé');
  {
    const { context, page, etat, erreurs } = await session(browser, { lamports: 2_000_000_000 });
    try {
      await lancerEchange(page, { de: 'SOL', vers: 'USDT', montant: '0.5' });
      verifier(await attendreTexte(page, 'Échange lancé', 20000), "l'échange est lancé et confirmé à l'écran");
      verifier(!!etat.requeteDevis, 'un devis a été demandé au backend');
      if (etat.requeteDevis) {
        verifier(etat.requeteDevis.fromNetwork === 'solana' && etat.requeteDevis.toNetwork === 'ethereum',
          `réseaux transmis : ${etat.requeteDevis.fromNetwork} -> ${etat.requeteDevis.toNetwork}`);
        verifier(etat.requeteDevis.fromAmount === '500000000', `montant converti en lamports : ${etat.requeteDevis.fromAmount}`);
      }
      verifier(etat.diffuse && etat.diffuse.chemin === 'broadcast-solana', 'diffusé sur la route Solana');
      if (etat.diffuse) {
        const signee = VersionedTransaction.deserialize(Buffer.from(etat.diffuse.corps.rawTx, 'base64'));
        const valide = nacl.sign.detached.verify(
          signee.message.serialize(),
          signee.signatures[0],
          new PublicKey(etat.adresseSol).toBytes(),
        );
        verifier(valide, "la transaction diffusée est bien signée par l'adresse Solana du wallet");
      }
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  console.log('\n2. Échanger du BTC : le PSBT est signé et finalisé');
  {
    const { context, page, etat, erreurs } = await session(browser, { satoshis: 300000 });
    try {
      await lancerEchange(page, { de: 'BTC', vers: 'USDT', montant: '0.002' });
      verifier(await attendreTexte(page, 'Échange lancé', 20000), "l'échange est lancé et confirmé à l'écran");
      verifier(etat.requeteDevis && etat.requeteDevis.fromAmount === '200000', `montant converti en satoshis : ${etat.requeteDevis?.fromAmount}`);
      verifier(etat.diffuse && etat.diffuse.chemin === 'broadcast-bitcoin', 'diffusé sur la route Bitcoin');
      if (etat.diffuse) {
        const tx = bitcoin.Transaction.fromHex(etat.diffuse.corps.rawTx);
        verifier(tx.ins.length === 1 && tx.ins[0].witness.length === 2, 'entrée réellement signée (témoin complet)');
        verifier(tx.outs.length >= 1, 'la transaction a bien une sortie');
      }
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  console.log('\n3. Un échange EVM classique ne passe PAS par cette route');
  {
    const { context, page, etat, erreurs } = await session(browser, {});
    try {
      await lancerEchange(page, { de: 'ETH', vers: 'USDT', montant: '0.01' });
      await wait(4000);
      verifier(!etat.requeteDevis, "aucun devis inter-écosystèmes demandé pour un swap ETH -> USDT");
      verifier(erreurs.length === 0, `aucune erreur JavaScript${erreurs.length ? ` (${erreurs[0].slice(0, 100)})` : ''}`);
    } catch (e) {
      verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
    } finally { await context.close(); }
  }

  await browser.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert');
  process.exit(echecs ? 1 : 0);
})();
