'use strict';
// wallet-final/e2e/qrScanner.js
// ─────────────────────────────────────────────────────────────────
//  Scanner QR de la version web — test de bout en bout sur le vrai export.
//
//  Né d'un signalement « le scan QR ne scanne rien du tout ». Mesuré avant
//  correction : scanner ouvert pendant 60 s, la caméra était relancée
//  10 FOIS. L'effet qui démarre la caméra dépendait de `onScanned`, une
//  fonction recréée à chaque rendu du composant principal — or les
//  rafraîchissements automatiques (gas, marché, portefeuille) redessinent
//  l'app toutes les 25 à 45 s. Chaque rendu arrêtait la caméra puis la
//  relançait, remettant l'autofocus à zéro : sur un vrai téléphone le QR
//  n'avait jamais le temps d'être net et décodé.
//
//  La caméra est simulée : getUserMedia renvoie le flux d'un <canvas>, vide
//  au départ puis qui affiche un vrai QR code à la demande. Chromium
//  uniquement — le WebKit de Playwright sous Windows n'implémente pas
//  canvas.captureStream, ce banc ne peut donc pas simuler la caméra de
//  Safari.
//
//  USAGE :
//    npm run test:e2e                          (build local + tous les tests)
//    BASE_URL=https://nexiawallet.com node e2e/qrScanner.js
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const QRCode = require('qrcode');
// Bruit connu du SDK WalletConnect (analytics annulées, voir lib/sentryNoise.js) :
// présent à chaque chargement, sans rapport avec le scanner.
const { BENIGN_PATTERNS } = require('../lib/sentryNoise');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PIN = '123456';
const ADRESSE = '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC';
// Au-delà du premier rafraîchissement automatique (gas, toutes les 25 s) :
// c'est lui qui déclenchait la première salve de redémarrages, à 23 s.
const DUREE_OBSERVATION_MS = 32000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let echecs = 0;
const verifier = (ok, message) => {
  console.log(`  ${ok ? 'OK   ' : 'ECHEC'} ${message}`);
  if (!ok) echecs += 1;
};

// Ouvre l'app, crée un portefeuille, arrive sur Envoyer et lance le scanner.
// Les gros boutons et onglets sont des composants React Native Web qui ne
// réagissent qu'à un click() appelé dans la page, et leur libellé commence
// par un glyphe de police d'icônes invisible (zone à usage privé Unicode).
async function ouvrirScanner(page) {
  await page.goto(`${BASE_URL}/?e2e-qr=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
  await page.evaluate(() => {
    const passer = Array.from(document.querySelectorAll('div,span')).filter((e) => (e.innerText || '').trim() === 'Passer').pop();
    if (passer) passer.click();
  });
  await wait(1500);
  const envoyer = await page.evaluate(() => {
    const net = (s) => String(s || '').split('').filter((ch) => {
      const k = ch.charCodeAt(0);
      return !(k <= 32 || (k >= 0xe000 && k <= 0xf8ff));
    }).join('');
    const b = Array.from(document.querySelectorAll('[role="button"]')).find((e) => net(e.innerText) === 'Envoyer');
    if (b) b.click();
    return !!b;
  });
  if (!envoyer) throw new Error('bouton Envoyer introuvable sur l\'accueil');
  await wait(2000);
  const scanner = await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Scanner un QR code"]');
    if (b) b.click();
    return !!b;
  });
  if (!scanner) throw new Error('bouton « Scanner un QR code » introuvable');
}

async function caméraSimulée(context, { largeur, hauteur, tailleQr }) {
  const qr = await QRCode.toDataURL(ADRESSE, { width: 800, margin: 4 });
  await context.addInitScript(({ qr, largeur, hauteur, tailleQr }) => {
    window.__appelsCamera = 0;
    window.__montrerQr = false;
    const img = new Image();
    img.src = qr;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__appelsCamera += 1;
      const c = document.createElement('canvas');
      c.width = largeur;
      c.height = hauteur;
      const ctx = c.getContext('2d');
      const dessiner = () => {
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(0, 0, largeur, hauteur);
        if (window.__montrerQr && img.complete) {
          const cote = Math.round(hauteur * tailleQr);
          ctx.drawImage(img, (largeur - cote) / 2, (hauteur - cote) / 2, cote, cote);
        }
        requestAnimationFrame(dessiner);
      };
      dessiner();
      return c.captureStream(30);
    };
  }, { qr, largeur, hauteur, tailleQr });
}

async function attendreAdresse(page, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const remplie = await page.evaluate((adr) => Array.from(document.querySelectorAll('input,textarea'))
      .some((e) => (e.value || '').toLowerCase() === adr.toLowerCase()), ADRESSE);
    if (remplie) return true;
    await wait(250);
  }
  return false;
}

async function scenario(browser, titre, options, { observerRedemarrages }) {
  console.log(`\n${titre}`);
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, locale: 'fr-FR' });
  await caméraSimulée(context, options);
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => {
    if (!BENIGN_PATTERNS.some((motif) => String(e.message).includes(motif))) erreurs.push(e.message);
  });
  try {
    await ouvrirScanner(page);

    if (observerRedemarrages) {
      await wait(DUREE_OBSERVATION_MS);
      const appels = await page.evaluate(() => window.__appelsCamera);
      verifier(appels === 1, `caméra démarrée une seule fois en ${DUREE_OBSERVATION_MS / 1000} s d'ouverture (appels à getUserMedia : ${appels})`);
    } else {
      await wait(1500);
    }

    await page.evaluate(() => { window.__montrerQr = true; });
    const t0 = Date.now();
    const scanne = await attendreAdresse(page, 8000);
    verifier(scanne, scanne
      ? `QR décodé et adresse remplie en ${((Date.now() - t0) / 1000).toFixed(1)} s`
      : 'QR décodé et adresse remplie en moins de 8 s');
    verifier(erreurs.length === 0, `aucune erreur JavaScript dans la page${erreurs.length ? ` (${erreurs[0].slice(0, 120)})` : ''}`);
  } catch (e) {
    verifier(false, `scénario interrompu : ${e.message.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

(async () => {
  console.log(`Scanner QR — ${BASE_URL}`);
  const browser = await chromium.launch();
  try {
    await scenario(browser, "1. La caméra ne redémarre pas pendant que l'app se rafraîchit",
      { largeur: 640, hauteur: 480, tailleQr: 0.6 }, { observerRedemarrages: true });
    // Un QR petit dans une image haute définition : ce que filme un vrai
    // téléphone tenu à distance normale devant un écran.
    await scenario(browser, "2. Un QR petit dans une image 1920x1080 est décodé",
      { largeur: 1920, hauteur: 1080, tailleQr: 0.28 }, { observerRedemarrages: false });
  } finally {
    await browser.close();
  }
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert');
  process.exit(echecs ? 1 : 0);
})();
