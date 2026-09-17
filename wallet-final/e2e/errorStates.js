'use strict';
// wallet-final/e2e/errorStates.js
// ─────────────────────────────────────────────────────────────────
//  États d'erreur : ce que voit l'utilisateur quand le serveur ne répond pas.
//
//  Né d'un audit par observation (serveur normal, lent, en panne) des écrans
//  principaux. Règle vérifiée ici : une erreur ne se déguise jamais en écran
//  vide ni en chargement sans fin, elle se dit, et elle propose de réessayer.
//  Défauts relevés avant correction :
//   1. Activité en panne → « Aucune transaction pour l'instant » : faux, et
//      inquiétant sur un portefeuille.
//   2. Fiche d'un jeton en panne → « Chargement… » encore affiché après 20 s,
//      le graphique retentant en boucle sans jamais le dire.
//   3. NFT en panne → le texte brut du serveur, en rouge, sans rien pour
//      réessayer.
//   4. Les erreurs passaient par window.alert() : la boîte native du
//      navigateur (« nexiawallet.com indique… »), qui fait penser à du
//      phishing sur un portefeuille.
//
//  La panne est simulée en interceptant les appels au backend, puis levée
//  pour vérifier que « Réessayer » ramène bien l'écran normal.
//
//  USAGE :
//    npm run test:e2e
//    BASE_URL=https://nexiawallet.com node e2e/errorStates.js
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const { BENIGN_PATTERNS } = require('../lib/sentryNoise');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BACKEND = 'crypto-wallet-backend-production-5c6c.up.railway.app';
const TEST_PIN = '123456';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${message}`);
  if (!ok) echecs += 1;
};

// Libellés RNW : glyphe de police d'icônes invisible (zone à usage privé
// Unicode) en tête, que trim() ne retire pas.
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

// Texte visible à l'écran : l'élément doit avoir une taille, pour ne pas
// compter l'accueil resté présent sous un écran ouvert par-dessus.
const visible = (page, texte) => page.evaluate((t) => Array.from(document.querySelectorAll('div,span'))
  .some((e) => e.children.length === 0 && (e.innerText || '').includes(t) && e.getBoundingClientRect().height > 0
    && e.getBoundingClientRect().top < window.innerHeight && e.getBoundingClientRect().bottom > 0), texte);

async function attendre(page, texte, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if (await visible(page, texte)) return true;
    await wait(300);
  }
  return false;
}

async function session(browser) {
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, locale: 'fr-FR' });
  const etat = { panne: false };
  await context.route(`https://${BACKEND}/**`, (route) => (etat.panne
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false,"error":"Service indisponible"}' })
    : route.continue()));
  const page = await context.newPage();
  const dialogues = [];
  page.on('dialog', (d) => { dialogues.push(d.message()); d.dismiss().catch(() => {}); });
  const erreurs = [];
  page.on('pageerror', (e) => {
    if (!BENIGN_PATTERNS.some((motif) => String(e.message).includes(motif))) erreurs.push(e.message);
  });

  await page.goto(`${BASE_URL}/?e2e-erreurs=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
  return { context, page, etat, dialogues, erreurs };
}

async function retour(page) {
  await page.evaluate(() => { const r = Array.from(document.querySelectorAll('[aria-label="Retour"]')); if (r.length) r[r.length - 1].click(); });
  await wait(1000);
}

(async () => {
  console.log(`États d'erreur — ${BASE_URL}`);
  const browser = await chromium.launch();
  const { context, page, etat, dialogues, erreurs } = await session(browser);
  try {
    console.log('\n1. Activité, serveur en panne');
    etat.panne = true;
    verifier(await cliquer(page, { role: 'button', texte: 'Activité' }), 'écran Activité ouvert');
    await wait(3500);
    verifier(!(await visible(page, "Aucune transaction pour l'instant")), "la panne n'est pas présentée comme un historique vide");
    verifier(await visible(page, 'Réessayer'), 'un bouton Réessayer est proposé');
    etat.panne = false;
    await cliquer(page, { texte: 'Réessayer' });
    verifier(await attendre(page, "Aucune transaction pour l'instant", 25000), 'après Réessayer, serveur rétabli : le vrai historique (vide) s\'affiche');
    await retour(page);

    console.log('\n2. Fiche d\'un jeton, serveur en panne');
    etat.panne = true;
    verifier(await cliquer(page, { role: 'button', texte: 'Ethereum', commencePar: true, dernier: false }), 'fiche Ethereum ouverte');
    verifier(await attendre(page, 'Réessayer', 10000), 'le graphique indique son échec et propose de réessayer en moins de 10 s');
    etat.panne = false;
    await cliquer(page, { texte: 'Réessayer' });
    await wait(12000);
    verifier(!(await visible(page, 'Réessayer')), 'après Réessayer, serveur rétabli : plus aucun état d\'erreur');
    await retour(page);

    console.log('\n3. NFT, serveur en panne');
    etat.panne = true;
    verifier(await cliquer(page, { role: 'button', texte: 'NFT' }), 'écran NFT ouvert');
    await wait(4000);
    verifier(await visible(page, 'Réessayer'), 'un bouton Réessayer est proposé');
    verifier(!(await visible(page, 'Service indisponible')), "le texte brut du serveur n'est pas montré à l'utilisateur");
    etat.panne = false;
    await cliquer(page, { texte: 'Réessayer' });
    verifier(await attendre(page, 'Aucun NFT trouvé', 25000), 'après Réessayer, serveur rétabli : l\'état vide normal s\'affiche');
    await retour(page);

    console.log('\n4. Erreur d\'une action (paiement par carte), serveur en panne');
    etat.panne = true;
    verifier(await cliquer(page, { role: 'button', texte: 'Acheter' }), 'écran Acheter ouvert');
    await wait(1500);
    const avant = dialogues.length;
    verifier(await cliquer(page, { texte: 'Payer avec carte' }), 'bouton Payer avec carte trouvé');
    const affichee = await attendre(page, 'Erreur paiement', 8000);
    verifier(dialogues.length === avant, `aucune boîte de dialogue native du navigateur${dialogues.length > avant ? ` (reçue : « ${dialogues[dialogues.length - 1].slice(0, 60)} »)` : ''}`);
    verifier(affichee, "l'erreur est affichée dans l'app elle-même");
    etat.panne = false;
  } catch (e) {
    verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
  }
  verifier(erreurs.length === 0, `aucune erreur JavaScript dans la page${erreurs.length ? ` (${erreurs[0].slice(0, 120)})` : ''}`);
  await context.close();
  await browser.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert');
  process.exit(echecs ? 1 : 0);
})();
