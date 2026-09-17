'use strict';
// wallet-final/e2e/receiveAddress.js
// ─────────────────────────────────────────────────────────────────
//  « Recevoir » doit montrer l'adresse de la chaîne du jeton — test de bout
//  en bout sur le vrai export web.
//
//  Né d'un signalement « SOL n'a pas la bonne adresse ». Depuis la fiche SOL,
//  le bouton Recevoir ouvrait l'écran sans lui dire quelle chaîne afficher :
//  l'écran restait sur EVM et montrait l'adresse 0x sous le logo Solana. Des
//  SOL envoyés à cette adresse sont perdus. Le bouton Envoyer, juste à côté,
//  transmettait pourtant bien le jeton.
//
//  Vérifie aussi que le bouton Recevoir de l'accueil revient sur EVM après
//  un passage par la fiche SOL, au lieu de garder Solana en mémoire.
//
//  USAGE :
//    npm run test:e2e
//    BASE_URL=https://nexiawallet.com node e2e/receiveAddress.js
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const { BENIGN_PATTERNS } = require('../lib/sentryNoise');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PIN = '123456';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${message}`);
  if (!ok) echecs += 1;
};

// Libellés des composants React Native Web : un glyphe de police d'icônes
// invisible (zone à usage privé Unicode) précède le texte, et trim() ne le
// retire pas. On compare donc sur le texte nettoyé, code par code.
const NETTOYER = `(s) => String(s || '').split('').filter((ch) => {
  const k = ch.charCodeAt(0);
  return !(k <= 32 || k === 160 || (k >= 0x200b && k <= 0x200f) || k === 0xfeff || (k >= 0xe000 && k <= 0xf8ff));
}).join('')`;

// Clique le DERNIER élément dont le texte nettoyé vaut `texte` : les écrans
// ouverts par-dessus (fiche jeton, Recevoir) sont rendus en fin de document,
// après l'accueil qui reste présent en dessous.
async function cliquerDernier(page, texte, { commencePar = false } = {}) {
  return page.evaluate(({ texte, commencePar, src }) => {
    // eslint-disable-next-line no-new-func
    const net = new Function(`return ${src}`)();
    const cible = net(texte);
    const el = Array.from(document.querySelectorAll('[role="button"], div, span'))
      .filter((e) => (commencePar ? net(e.innerText).startsWith(cible) : net(e.innerText) === cible))
      .pop();
    if (el) el.click();
    return !!el;
  }, { texte, commencePar, src: NETTOYER });
}

async function lireEcranRecevoir(page) {
  return page.evaluate(() => {
    const txt = document.body.innerText || '';
    const adresses = (txt.match(/\b(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|bc1[a-z0-9]{25,62})\b/g) || []);
    return {
      bandeauSolana: txt.includes('Réseau Solana'),
      bandeauEvm: txt.includes('Valable pour Ethereum'),
      derniereAdresse: adresses.length ? adresses[adresses.length - 1] : null,
    };
  });
}

(async () => {
  console.log(`Adresse affichée sur Recevoir — ${BASE_URL}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, locale: 'fr-FR' });
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => {
    if (!BENIGN_PATTERNS.some((motif) => String(e.message).includes(motif))) erreurs.push(e.message);
  });

  try {
    await page.goto(`${BASE_URL}/?e2e-recevoir=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
    await cliquerDernier(page, 'Passer');
    await wait(1500);

    console.log('\n1. Depuis la fiche SOL');
    verifier(await cliquerDernier(page, 'Solana', { commencePar: true }), 'fiche du jeton Solana ouverte');
    await wait(2000);
    verifier(await cliquerDernier(page, 'Recevoir'), 'bouton Recevoir de la fiche trouvé');
    await wait(1800);
    const sol = await lireEcranRecevoir(page);
    verifier(sol.bandeauSolana, 'l\'écran annonce le réseau Solana');
    verifier(!!sol.derniereAdresse && !sol.derniereAdresse.startsWith('0x') && !sol.derniereAdresse.startsWith('bc1'),
      `l'adresse affichée est une adresse Solana, pas une adresse 0x (affichée : ${sol.derniereAdresse})`);

    console.log('\n2. Retour à l\'accueil, puis Recevoir');
    // Ferme Recevoir puis la fiche, par leurs boutons Retour (recharger la page
    // verrouillerait le portefeuille).
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        const retours = Array.from(document.querySelectorAll('[aria-label="Retour"]'));
        if (retours.length) retours[retours.length - 1].click();
      });
      await wait(1200);
    }
    const ouvert = await page.evaluate((src) => {
      // eslint-disable-next-line no-new-func
      const net = new Function(`return ${src}`)();
      const b = Array.from(document.querySelectorAll('[role="button"]')).find((e) => net(e.innerText) === 'Recevoir');
      if (b) b.click();
      return !!b;
    }, NETTOYER);
    verifier(ouvert, 'bouton Recevoir de l\'accueil trouvé');
    await wait(1800);
    const evm = await lireEcranRecevoir(page);
    verifier(evm.bandeauEvm && !evm.bandeauSolana, 'l\'écran revient sur les réseaux EVM');
    verifier(!!evm.derniereAdresse && evm.derniereAdresse.startsWith('0x'),
      `l'adresse affichée est l'adresse 0x (affichée : ${evm.derniereAdresse})`);
  } catch (e) {
    verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
  }

  verifier(erreurs.length === 0, `aucune erreur JavaScript dans la page${erreurs.length ? ` (${erreurs[0].slice(0, 120)})` : ''}`);
  await browser.close();
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert');
  process.exit(echecs ? 1 : 0);
})();
