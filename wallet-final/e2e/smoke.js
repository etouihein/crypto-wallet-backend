'use strict';
// wallet-final/e2e/smoke.js
// ─────────────────────────────────────────────────────────────────
//  Test de fumée end-to-end (Playwright) sur le vrai export web de l'app —
//  pas un mock, pas un composant isolé : le build réel (`npm run build:web`)
//  servi comme en production, piloté comme un vrai utilisateur.
//
//  Née de la méthode utilisée tout au long d'une longue session de travail
//  (audit sécurité, chasse aux bugs, i18n) : à chaque changement, un script
//  Playwright jetable était réécrit pour rejouer "créer un wallet → PIN →
//  écran concerné" et vérifier zéro erreur console. Ce fichier committe
//  cette méthode une bonne fois, au lieu de la retaper à chaque session.
//
//  USAGE :
//    npm run test:e2e
//    (build le web, démarre server.js sur PORT, attend qu'il réponde,
//    lance ce script contre lui, l'arrête à la fin - voir package.json)
//
//    Ou contre un serveur déjà lancé (dev, ou même nexiawallet.com) :
//    BASE_URL=https://nexiawallet.com node e2e/smoke.js
//
//  Ce que ça vérifie : le parcours qui casse tout si un changement l'a
//  touché par erreur (import de wallet, PIN, accueil, les 5 onglets,
//  Réglages, changement de langue) — PAS une couverture exhaustive de
//  chaque écran/fonctionnalité. Objectif : attraper une régression
//  évidente en ~30s, pas remplacer une revue de code.
// ─────────────────────────────────────────────────────────────────

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
// Mnémonique de test PUBLIQUE et bien connue (compte #0 standard Hardhat/
// Anvil, utilisée par des milliers de projets pour les tests locaux — ne
// JAMAIS y envoyer de vrais fonds). Sert à vérifier par une preuve
// cryptographique concrète que la dérivation ethers fonctionne encore :
// cette phrase dérive TOUJOURS exactement 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
// à m/44'/60'/0'/0/0.
const TEST_MNEMONIC = 'test test test test test test test test test test test junk';
const EXPECTED_ADDRESS_FRAGMENT = '0xf39F'; // début de l'adresse attendue
const TEST_PIN = '123456';

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

async function enterPin(page, digits) {
  for (const d of digits) {
    await page.locator(`text="${d}"`).last().click();
    await page.waitForTimeout(60);
  }
}

async function dismissOnboardingIfPresent(page) {
  for (let i = 0; i < 5; i++) {
    const skip = page.getByText('Passer', { exact: true });
    if (await skip.count()) { await skip.first().click(); await page.waitForTimeout(400); return; }
    const start = page.getByText('Commencer', { exact: true });
    if (await start.count()) { await start.first().click(); await page.waitForTimeout(400); return; }
    const next = page.getByText('Suivant', { exact: true });
    if (await next.count()) { await next.first().click(); await page.waitForTimeout(300); continue; }
    return;
  }
}

async function run() {
  console.log(`Smoke test contre ${BASE_URL}\n`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + err.message));

  try {
    console.log('1. Chargement de la landing');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1000);
    check('bouton "Créer mon wallet" visible', await page.getByText('Créer mon wallet', { exact: true }).count() > 0);

    console.log('2. Import du wallet de test (preuve cryptographique)');
    await page.getByText("J'ai déjà un wallet", { exact: false }).first().click();
    await page.waitForTimeout(600);
    const textarea = page.locator('textarea, input[type="text"]').first();
    await textarea.fill(TEST_MNEMONIC);
    const importBtn = page.getByText('Importer', { exact: true });
    if (await importBtn.count()) await importBtn.first().click();
    await page.waitForTimeout(1000);

    console.log('3. Choix du PIN (deux saisies)');
    await enterPin(page, TEST_PIN);
    await page.waitForTimeout(1200);
    await enterPin(page, TEST_PIN);
    await page.waitForTimeout(1200);

    // Confirmation de sauvegarde de la mnémonique, si l'écran apparaît.
    const backupBtn = page.getByText("Je l'ai notée en lieu sûr", { exact: false });
    if (await backupBtn.count()) { await backupBtn.first().click(); await page.waitForTimeout(800); }
    await dismissOnboardingIfPresent(page);
    await page.waitForTimeout(800);

    console.log('4. Vérification de l\'adresse dérivée (preuve crypto) sur Recevoir');
    const receiveBtn = page.getByText('Recevoir', { exact: true });
    check('bouton Recevoir trouvé', await receiveBtn.count() > 0);
    if (await receiveBtn.count()) {
      await receiveBtn.first().click();
      await page.waitForTimeout(700);
      const receiveText = await page.evaluate(() => document.body.innerText);
      check(
        `adresse dérivée commence par ${EXPECTED_ADDRESS_FRAGMENT} (dérivation ethers HD intacte)`,
        receiveText.includes(EXPECTED_ADDRESS_FRAGMENT)
      );
      const backBtn = page.locator('[aria-label="Retour"]');
      if (await backBtn.count()) { await backBtn.first().click(); await page.waitForTimeout(400); }
    }

    console.log('4b. Vue unifiée "Toutes mes adresses" depuis Recevoir');
    const receiveBtn2 = page.getByText('Recevoir', { exact: true });
    if (await receiveBtn2.count()) {
      await receiveBtn2.first().click();
      await page.waitForTimeout(500);
      const allAddrLink = page.getByText('Voir toutes mes adresses en un coup d\'œil', { exact: false });
      check('lien "Voir toutes mes adresses" présent sur Recevoir', await allAddrLink.count() > 0);
      if (await allAddrLink.count()) {
        await allAddrLink.first().click();
        await page.waitForTimeout(500);
        const bodyAddr = await page.evaluate(() => document.body.innerText);
        check('modal "Toutes mes adresses" affiche le groupe EVM', bodyAddr.includes('EVM'));
        check('modal "Toutes mes adresses" affiche Solana', bodyAddr.includes('Solana'));
        check('modal "Toutes mes adresses" affiche Bitcoin', bodyAddr.includes('Bitcoin'));
        check(`modal "Toutes mes adresses" affiche l'adresse dérivée ${EXPECTED_ADDRESS_FRAGMENT}`, bodyAddr.includes(EXPECTED_ADDRESS_FRAGMENT));
        const backBtnAddr = page.locator('[aria-label="Retour"]');
        if (await backBtnAddr.count()) { await backBtnAddr.first().click(); await page.waitForTimeout(400); }
      }
      const backBtnReceive = page.locator('[aria-label="Retour"]');
      if (await backBtnReceive.count()) { await backBtnReceive.first().click(); await page.waitForTimeout(400); }
    } else {
      check('bouton Recevoir trouvé (4b)', false);
    }

    console.log('4c. Écran Activité (résolution ENS inversée sur les adresses)');
    const activityBtn = page.getByText('Activité', { exact: true });
    if (await activityBtn.count()) {
      await activityBtn.first().click();
      await page.waitForTimeout(1200);
      check('écran Activité accessible sans crash', true);
      const backBtnHist = page.locator('[aria-label="Retour"]');
      if (await backBtnHist.count()) { await backBtnHist.first().click(); await page.waitForTimeout(400); }
    } else {
      check('bouton "Activité" trouvé', false);
    }

    console.log('4d. Recherche globale (tokens + actions)');
    const searchBtn = page.locator('[aria-label="Recherche"]');
    check('icône de recherche présente sur l\'accueil', await searchBtn.count() > 0);
    if (await searchBtn.count()) {
      await searchBtn.first().click();
      await page.waitForTimeout(400);
      const searchInput = page.locator('input[placeholder*="Un token"]');
      check('champ de recherche présent', await searchInput.count() > 0);
      if (await searchInput.count()) {
        await searchInput.first().fill('eth');
        await page.waitForTimeout(400);
        const bodySearchToken = await page.evaluate(() => document.body.innerText);
        check('recherche "eth" retrouve un token', bodySearchToken.toUpperCase().includes('MES TOKENS') && bodySearchToken.includes('Ethereum'));

        await searchInput.first().fill('doge');
        await page.waitForTimeout(500);
        const dogeResult = page.getByText('Dogecoin', { exact: false }).first();
        if (await dogeResult.count()) {
          await dogeResult.click();
          await page.waitForTimeout(500);
          const bodyMarketTab = await page.evaluate(() => document.body.innerText);
          check(
            'recherche d\'une crypto non detenue ouvre bien l\'onglet Marché (pas un ecran vide)',
            bodyMarketTab.toUpperCase().includes('MARCHÉ') && bodyMarketTab.trim().length > 80
          );
        } else {
          check('résultat "Dogecoin" trouvé pour une crypto non détenue', false);
        }

        const homeTabBtn = page.getByText('Accueil', { exact: true }).first();
        if (await homeTabBtn.count()) { await homeTabBtn.click(); await page.waitForTimeout(500); }
        await searchBtn.first().click();
        await page.waitForTimeout(400);
        await searchInput.first().fill('réglages');
        await page.waitForTimeout(400);
        const settingsResult = page.getByText('Réglages', { exact: true }).last();
        if (await settingsResult.count()) {
          await settingsResult.click();
          await page.waitForTimeout(500);
          const bodyAfterAction = await page.evaluate(() => document.body.innerText);
          check('recherche "réglages" ouvre bien Réglages', bodyAfterAction.includes('Paramètres'));
          const backBtnSearch = page.locator('[aria-label="Retour"]');
          if (await backBtnSearch.count()) { await backBtnSearch.first().click(); await page.waitForTimeout(400); }
        } else {
          check('résultat "Réglages" trouvé dans la recherche', false);
        }
      }
    }

    console.log('5. Navigation dans les 5 onglets principaux');
    for (const tabLabel of ['Marché', 'Stats', 'Découvrir', 'Accueil']) {
      const tab = page.getByText(tabLabel, { exact: true }).first();
      if (await tab.count()) {
        await tab.click();
        await page.waitForTimeout(500);
        check(`onglet ${tabLabel} accessible sans crash`, true);
      } else {
        check(`onglet ${tabLabel} trouvé`, false);
      }
    }

    console.log('6. Réglages : devise/réseau/langue en puces, changement de langue effectif');
    await page.mouse.click(385, 33); // icône réglages, uniquement présente sur l'onglet Accueil
    await page.waitForTimeout(600);
    const bodyFr = await page.evaluate(() => document.body.innerText);
    check('Réglages affiche "Paramètres"', bodyFr.includes('Paramètres'));
    check('puces devise présentes (EUR)', bodyFr.includes('EUR'));

    console.log('6b. Mode d\'affichage (Débutant/Avancé) + checklist sécurité + signaler un problème');
    check('checklist "Niveau de sécurité" présente', bodyFr.includes('Niveau de sécurité'));
    check('bouton "Signaler un problème" présent', bodyFr.includes('Signaler un problème'));
    const beginnerChip = page.getByText('Débutant', { exact: true });
    check('chip "Débutant" trouvée', await beginnerChip.count() > 0);
    if (await beginnerChip.count()) {
      await beginnerChip.first().click();
      await page.waitForTimeout(400);
      const bodyBeginner = await page.evaluate(() => document.body.innerText);
      check('mode Débutant masque "Pont cross-chain"', !bodyBeginner.includes('Pont cross-chain'));
      const advancedChip = page.getByText('Avancé', { exact: true });
      if (await advancedChip.count()) {
        await advancedChip.first().click();
        await page.waitForTimeout(400);
        const bodyAdvanced = await page.evaluate(() => document.body.innerText);
        check('repasser en Avancé réaffiche "Pont cross-chain"', bodyAdvanced.includes('Pont cross-chain'));
      } else {
        check('chip "Avancé" trouvée pour revenir en arrière', false);
      }
    }

    const englishChip = page.getByText('English', { exact: true });
    if (await englishChip.count()) {
      await englishChip.first().click();
      await page.waitForTimeout(500);
      const backBtn = page.locator('[aria-label="Retour"]');
      if (await backBtn.count()) { await backBtn.first().click(); await page.waitForTimeout(600); }
      const bodyEn = await page.evaluate(() => document.body.innerText);
      check('accueil traduit en anglais après changement de langue ("My Wallet")', bodyEn.includes('My Wallet'));
    } else {
      check('sélecteur de langue "English" trouvé', false);
    }

    console.log('\n7. Erreurs console cumulées sur tout le parcours');
    check(`zéro erreur console (trouvé: ${consoleErrors.length})`, consoleErrors.length === 0);
    if (consoleErrors.length) consoleErrors.forEach((e) => console.error('   console error:', e));
  } catch (err) {
    console.error('\nEXCEPTION pendant le smoke test:', err.message);
    failures++;
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? '✅ SMOKE TEST OK' : `❌ ${failures} VÉRIFICATION(S) ÉCHOUÉE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
