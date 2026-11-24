'use strict';
// Regles de la fusion automatique : ce qui part tout seul, ce qui attend Pablo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { decider } = require('./fusion-auto');

const DEPOT = 'etouihein/crypto-wallet-backend';
const vert = (name) => ({ name, status: 'completed', conclusion: 'success' });
const CHECKS = [vert('Serveur (crypto-wallet)'), vert('App et site (wallet-final)'), vert('Cloudflare Pages'), { name: 'Audit des bibliotheques (information)', status: 'completed', conclusion: 'failure' }];
const pr = (x = {}) => ({
  state: 'open', draft: false, mergeable: true, labels: [],
  title: 'Alertes de prix : une liste abimee ne bloque plus l app (PATCH-077)',
  body: 'Risque : Faible',
  head: { ref: 'claude/077-alertes', repo: { full_name: DEPOT }, sha: 'abc' },
  ...x,
});
const fichier = (filename, patch = '@@ -1 +1 @@\n-const a = 1;\n+const a = 2;', n = 2) => ({ filename, patch, additions: n / 2, deletions: n / 2 });
const base = (x = {}) => ({ pr: pr(), depot: DEPOT, fichiers: [fichier('wallet-final/App.js'), fichier('wallet-final/test/alertes.test.js')], checks: CHECKS, mainVert: true, ...x });

test('PR a risque faible, tests au vert -> fusion', () => {
  assert.equal(decider(base()).fusionner, true);
});

test('attend Pablo : risque ELEVE - securite (avec ou sans accents)', () => {
  assert.equal(decider(base({ pr: pr({ body: '**Risque : ÉLEVÉ - sécurité**' }) })).fusionner, false);
  assert.equal(decider(base({ pr: pr({ body: 'Risque : ELEVE - securite' }) })).fusionner, false);
});

test('attend Pablo : fichiers sensibles (cles, signature, verifications, dependances, automatisations)', () => {
  for (const f of ['wallet-final/lib/wallet.js', 'wallet-final/lib/swapSecurity.js', 'wallet-final/lib/addressSafety.js', 'wallet-final/lib/txSimulation.js', 'wallet-final/lib/walletconnect.js', 'wallet-final/lib/dappBrowserProvider.js', 'crypto-wallet/src/revenue/services.js', 'wallet-final/package.json', 'crypto-wallet/package-lock.json', '.github/workflows/tests.yml', 'crypto-wallet/.env.example', 'wallet-final/public/_headers']) {
    const d = decider(base({ fichiers: [fichier('wallet-final/App.js'), fichier(f)] }));
    assert.equal(d.fusionner, false, f);
    assert.match(d.raison, /sensible/);
  }
  // fichier sensible renomme : compte aussi
  assert.equal(decider(base({ fichiers: [{ ...fichier('wallet-final/lib/autre.js'), previous_filename: 'wallet-final/lib/wallet.js' }] })).fusionner, false);
});

test('attend Pablo : une ligne modifiee parle de frais, commission, cle ou phrase', () => {
  for (const ligne of ['+const FEE_BPS = 50;', '-  integrator: LIFI_INTEGRATOR,', '+const fee = 0.0075;', '+  mnemonic: m,', '+ wallet.signTransaction(tx)']) {
    const d = decider(base({ fichiers: [fichier('crypto-wallet/src/routes/wallet.js', `@@ -1 +1 @@\n${ligne}`)] }));
    assert.equal(d.fusionner, false, ligne);
  }
  // dans un fichier de test, ces mots sont normaux
  assert.equal(decider(base({ fichiers: [fichier('wallet-final/App.js'), fichier('wallet-final/test/x.test.js', '@@ -1 +1 @@\n+const fee = 1;')] })).fusionner, true);
});

test('attend : tests en echec, en cours ou manquants ; main pas au vert ; conflit', () => {
  assert.equal(decider(base({ checks: [vert('Serveur (crypto-wallet)'), { name: 'App et site (wallet-final)', status: 'completed', conclusion: 'failure' }] })).fusionner, false);
  assert.equal(decider(base({ checks: [vert('Serveur (crypto-wallet)'), { name: 'App et site (wallet-final)', status: 'in_progress', conclusion: null }] })).fusionner, false);
  assert.equal(decider(base({ checks: [vert('Serveur (crypto-wallet)')] })).fusionner, false);
  // controle fini mais reste affiche "in_progress" (vu sur la PR #80) : accepte
  assert.equal(decider(base({ checks: [...CHECKS, { name: 'Regles de la fusion automatique', status: 'in_progress', conclusion: 'success' }] })).fusionner, true);
  assert.equal(decider(base({ checks: [...CHECKS, { name: 'Cloudflare Pages', status: 'completed', conclusion: 'failure' }] })).fusionner, false);
  assert.equal(decider(base({ mainVert: false })).fusionner, false);
  assert.equal(decider(base({ pr: pr({ mergeable: false }) })).fusionner, false);
  assert.equal(decider(base({ pr: pr({ mergeable: null }) })).fusionner, false);
});

test("attend : PR d'ailleurs (fork, autre branche), brouillon, etiquette attente-pablo, trop grosse, vide", () => {
  assert.equal(decider(base({ pr: pr({ head: { ref: 'claude/x', repo: { full_name: 'pirate/crypto-wallet-backend' }, sha: 'a' } }) })).fusionner, false);
  assert.equal(decider(base({ pr: pr({ head: { ref: 'feature/x', repo: { full_name: DEPOT }, sha: 'a' } }) })).fusionner, false);
  assert.equal(decider(base({ pr: pr({ draft: true }) })).fusionner, false);
  assert.equal(decider(base({ pr: pr({ labels: [{ name: 'attente-pablo' }] }) })).fusionner, false);
  assert.equal(decider(base({ fichiers: [fichier('wallet-final/App.js', '@@ -1 +1 @@\n+a', 900)] })).fusionner, false);
  assert.equal(decider(base({ fichiers: [] })).fusionner, false);
  assert.equal(decider(base({ fichiers: [{ filename: 'wallet-final/assets/logo.png', additions: 0, deletions: 0 }] })).fusionner, false);
});
