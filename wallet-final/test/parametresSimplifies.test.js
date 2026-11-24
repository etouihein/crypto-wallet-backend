'use strict';
// Parametres simplifies (24/11/2026) : 5 rubriques repliables, aucun reglage
// perdu ; reseau memorise ; seuils d'alerte gas utiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const debut = app.indexOf('  const renderSettings = () => (');
const fin = app.indexOf('\n  );\n', debut);
const reglages = app.slice(debut, fin);

test('5 rubriques repliables, dans cet ordre', () => {
  const ids = [...reglages.matchAll(/groupeReglages\('([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['securite', 'comptes', 'affichage', 'reseau', 'notifications']);
});

test('aucun reglage perdu : chaque ancienne section est toujours dans les Parametres', () => {
  for (const s of ["🧭 Mode d'affichage", "settings_currency", "settings_network", '⭐ Favoris', 'settings_tokens',
    'settings_accounts', '👁️ Adresses en observation', 'settings_walletconnect', '⚡ Fonctionnalités avancées',
    'settings_security', '⛽ Alerte gas', '👛 Affichage du portefeuille', 'settings_quick_actions',
    'settings_notifications', 'settings_language', 'settings_theme', 'settings_info', 'Code PIN de détresse']) {
    assert.ok(reglages.includes(s), s);
  }
});

test('mode detresse : comptes et securite toujours masques', () => {
  const securite = reglages.slice(reglages.indexOf("groupeReglages('securite'"), reglages.indexOf("groupeReglages('comptes'"));
  assert.match(securite, /\{!!walletSession && !isDuressMode && \(/);
  const comptes = reglages.slice(reglages.indexOf("groupeReglages('comptes'"), reglages.indexOf("groupeReglages('affichage'"));
  assert.match(comptes, /\{!!walletSession && !isDuressMode && \(/);
});

test('reseau memorise entre deux ouvertures (valeur inconnue ignoree)', () => {
  assert.match(app, /const RESEAU_KEY = 'wallet-pro-network-v1';/);
  assert.match(app, /loadReseau\(NETWORK_INFO\)\.then/);
  assert.match(app, /hasOwnProperty\.call\(reseauxValides, raw\)/);
});

test('alerte gas : seuils 1 / 5 / 20 gwei', () => {
  assert.match(reglages, /\[\[null, 'Désactivée'\], \[1, '1 gwei'\], \[5, '5 gwei'\], \[20, '20 gwei'\]\]/);
});
