'use strict';
// wallet-final/e2e/qrScanner.js
// ─────────────────────────────────────────────────────────────────
//  Scanner QR de la version web — test de bout en bout sur le vrai export.
//
//  Né du signalement « le scan QR ne scanne rien du tout ». Deux étapes :
//
//  1. Mesuré avant correction : scanner ouvert 60 s, caméra relancée 10 FOIS.
//     L'effet qui la démarrait dépendait de `onScanned`, recréé à chaque rendu
//     du composant principal, que les rafraîchissements automatiques (gas,
//     marché, portefeuille) redessinent toutes les 25 à 45 s.
//
//  2. Après ce correctif, le scan en direct échouait ENCORE sur l'iPhone de
//     l'utilisateur — et la caméra de Safari ne peut pas être simulée sur ce
//     PC (le WebKit de Playwright sous Windows n'a pas canvas.captureStream).
//     D'où une seconde voie qui ne dépend pas du flux vidéo du navigateur :
//     prendre ou choisir une PHOTO du QR (appareil photo natif sur iPhone),
//     et une ligne d'état qui dit ce que reçoit la caméra, pour qu'une capture
//     d'écran suffise à diagnostiquer un échec du direct.
//
//  La caméra est simulée : getUserMedia renvoie le flux d'un <canvas>.
//
//  USAGE :
//    npm run test:e2e                          (build local + tous les tests)
//    BASE_URL=https://nexiawallet.com node e2e/qrScanner.js
// ─────────────────────────────────────────────────────────────────

const fs = require('fs');
const os = require('os');
const path = require('path');
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
  if (!envoyer) throw new Error("bouton Envoyer introuvable sur l'accueil");
  await wait(2000);
  const scanner = await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Scanner un QR code"]');
    if (b) b.click();
    return !!b;
  });
  if (!scanner) throw new Error('bouton « Scanner un QR code » introuvable');
}

// mode : 'qr' (flux vide puis QR à la demande), 'noire' (images noires),
// 'refus' (l'utilisateur a refusé la caméra).
// `bruit` : amplitude du bruit de capteur ajouté à chaque pixel, comme une
// vidéo filmée en intérieur. Trois images bruitées sont précalculées puis
// alternées, pour garder une caméra simulée fluide.
async function cameraSimulee(context, { mode = 'qr', largeur = 640, hauteur = 480, tailleQr = 0.6, bruit = 0 } = {}) {
  const qr = await QRCode.toDataURL(ADRESSE, { width: 800, margin: 4 });
  await context.addInitScript(({ qr, mode, largeur, hauteur, tailleQr, bruit }) => {
    window.__appelsCamera = 0;
    window.__montrerQr = false;
    const img = new Image();
    img.src = qr;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__appelsCamera += 1;
      if (mode === 'refus') throw new DOMException('Permission denied', 'NotAllowedError');
      const c = document.createElement('canvas');
      c.width = largeur;
      c.height = hauteur;
      const ctx = c.getContext('2d');
      let bruitees = null;
      let n = 0;
      const dessiner = () => {
        ctx.fillStyle = mode === 'noire' ? '#000' : '#b0b0b0';
        ctx.fillRect(0, 0, largeur, hauteur);
        if (mode === 'qr' && window.__montrerQr && img.complete) {
          const cote = Math.round(hauteur * tailleQr);
          ctx.drawImage(img, (largeur - cote) / 2, (hauteur - cote) / 2, cote, cote);
          if (bruit) {
            if (!bruitees) {
              bruitees = [0, 1, 2].map(() => {
                const px = ctx.getImageData(0, 0, largeur, hauteur);
                for (let i = 0; i < px.data.length; i += 4) {
                  const d = (Math.random() - 0.5) * bruit * 2;
                  px.data[i] += d; px.data[i + 1] += d; px.data[i + 2] += d;
                }
                const k = document.createElement('canvas');
                k.width = largeur; k.height = hauteur;
                k.getContext('2d').putImageData(px, 0, 0);
                return k;
              });
            }
            ctx.drawImage(bruitees[n++ % 3], 0, 0);
          }
        }
        requestAnimationFrame(dessiner);
      };
      dessiner();
      return c.captureStream(30);
    };
  }, { qr, mode, largeur, hauteur, tailleQr, bruit });
}

// Une photo de QR comme en prend un téléphone : grande, QR incliné et pas
// centré pile, bruit de capteur, léger flou de mise au point, JPEG compressé.
async function photoRealiste(browser) {
  const qr = await QRCode.toDataURL(ADRESSE, { width: 800, margin: 4 });
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(async (qrUrl) => {
    const img = new Image();
    img.src = qrUrl;
    await img.decode();
    const w = 1512;
    const h = 2016;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const fond = ctx.createLinearGradient(0, 0, w, h);
    fond.addColorStop(0, '#9aa0a6');
    fond.addColorStop(1, '#5f6368');
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w * 0.54, h * 0.47);
    ctx.rotate((11 * Math.PI) / 180);
    ctx.filter = 'blur(1.4px)';
    const cote = w * 0.42;
    ctx.drawImage(img, -cote / 2, -cote / 2, cote, cote);
    ctx.restore();
    const px = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < px.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 38;
      px.data[i] += n; px.data[i + 1] += n; px.data[i + 2] += n;
    }
    ctx.putImageData(px, 0, 0);
    return c.toDataURL('image/jpeg', 0.8);
  }, qr);
  await page.close();
  const fichier = path.join(os.tmpdir(), `qr-photo-${Date.now()}.jpg`);
  fs.writeFileSync(fichier, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return fichier;
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

const texteVisible = (page, texte) => page.evaluate((t) => (document.body.innerText || '').includes(t), texte);

async function scenario(browser, titre, camera, deroule) {
  console.log(`\n${titre}`);
  const context = await browser.newContext({ viewport: { width: 400, height: 860 }, hasTouch: true, locale: 'fr-FR' });
  await cameraSimulee(context, camera);
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => {
    if (!BENIGN_PATTERNS.some((motif) => String(e.message).includes(motif))) erreurs.push(e.message);
  });
  try {
    await ouvrirScanner(page);
    await deroule(page);
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
  const photo = await photoRealiste(browser);
  try {
    await scenario(browser, "1. La caméra ne redémarre pas pendant que l'app se rafraîchit", { mode: 'qr' }, async (page) => {
      await wait(DUREE_OBSERVATION_MS);
      const appels = await page.evaluate(() => window.__appelsCamera);
      verifier(appels === 1, `caméra démarrée une seule fois en ${DUREE_OBSERVATION_MS / 1000} s d'ouverture (appels à getUserMedia : ${appels})`);
      verifier(await texteVisible(page, "Recherche d'un QR code"), "la ligne d'état indique que la recherche est en cours");
      await page.evaluate(() => { window.__montrerQr = true; });
      const t0 = Date.now();
      const ok = await attendreAdresse(page, 8000);
      verifier(ok, ok ? `QR décodé en direct en ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'QR décodé en direct en moins de 8 s');
    });

    // Un QR petit dans une image haute définition : ce que filme un vrai
    // téléphone tenu à distance normale devant un écran.
    await scenario(browser, '2. Un QR petit dans une image 1920x1080 est décodé en direct', { mode: 'qr', largeur: 1920, hauteur: 1080, tailleQr: 0.28 }, async (page) => {
      await wait(1500);
      await page.evaluate(() => { window.__montrerQr = true; });
      const t0 = Date.now();
      const ok = await attendreAdresse(page, 8000);
      verifier(ok, ok ? `QR décodé en ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'QR décodé en moins de 8 s');
    });

    // Configuration mesurée comme fatale avant correction : QR à 35 % de la
    // hauteur, bruit ±19. L'analyse à pleine résolution échouait ; la version
    // réduite, qui moyenne les pixels, réussit.
    await scenario(browser, '2b. QR un peu loin, filmé en basse lumière (bruit de capteur ±19)', { mode: 'qr', largeur: 1280, hauteur: 720, tailleQr: 0.35, bruit: 19 }, async (page) => {
      await wait(1500);
      await page.evaluate(() => { window.__montrerQr = true; });
      const t0 = Date.now();
      const ok = await attendreAdresse(page, 8000);
      verifier(ok, ok ? `QR décodé malgré le bruit en ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'QR décodé malgré le bruit en moins de 8 s');
    });

    await scenario(browser, '3. Une vraie photo de QR (inclinée, bruitée, un peu floue) est décodée', { mode: 'qr' }, async (page) => {
      await wait(1000);
      verifier(await texteVisible(page, 'Prendre ou choisir une photo du QR'), 'le bouton photo est proposé');
      const t0 = Date.now();
      await page.setInputFiles('[data-testid="qr-photo-input"]', photo);
      const ok = await attendreAdresse(page, 10000);
      verifier(ok, ok ? `adresse remplie depuis la photo en ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'adresse remplie depuis la photo en moins de 10 s');
    });

    await scenario(browser, '4. Caméra refusée : message clair, et la photo reste possible', { mode: 'refus' }, async (page) => {
      await wait(1500);
      verifier(await texteVisible(page, 'Accès à la caméra refusé'), 'le refus est expliqué');
      verifier(await texteVisible(page, 'Prendre ou choisir une photo du QR'), 'le bouton photo reste proposé');
      await page.setInputFiles('[data-testid="qr-photo-input"]', photo);
      verifier(await attendreAdresse(page, 10000), 'adresse remplie depuis la photo malgré le refus de la caméra');
    });

    await scenario(browser, "5. Caméra qui renvoie une image noire : la ligne d'état le dit", { mode: 'noire' }, async (page) => {
      await wait(2500);
      verifier(await texteVisible(page, 'La caméra renvoie une image noire'), "l'utilisateur est prévenu et orienté vers la photo");
    });
  } finally {
    fs.rmSync(photo, { force: true });
    await browser.close();
  }
  console.log(echecs ? `\n${echecs} vérification(s) en échec` : '\nTout est vert');
  process.exit(echecs ? 1 : 0);
})();
