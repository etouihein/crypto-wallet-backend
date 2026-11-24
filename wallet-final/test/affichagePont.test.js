'use strict';
// Ecran Pont : montants lisibles, frais en francais (constat en ligne 24/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { montantCourt, libelleFraisPont } = require('../lib/affichagePont');

test('montant recu : 6 decimales, tronque (jamais arrondi vers le haut)', () => {
  assert.equal(montantCourt('0.009944484182001425'), '0.009944');
  assert.equal(montantCourt('0.0099999999'), '0.009999');
  assert.equal(montantCourt('1.0'), '1');
  assert.equal(montantCourt('0.000000004'), '<0.000001');
  assert.equal(montantCourt('0'), '0');
  assert.equal(montantCourt('abc'), '?');
  assert.equal(montantCourt('0.000009907459405183', 8), '0.0000099');
});

test('frais LI.FI en francais', () => {
  assert.equal(libelleFraisPont('LIFI Fixed Fee'), 'Frais LI.FI');
  assert.equal(libelleFraisPont('Relayerfee'), 'Frais du relais');
  assert.equal(libelleFraisPont('Relayer gas fee'), 'Gas du relais');
  assert.equal(libelleFraisPont('Integrator Fee'), 'Frais NexiaWallet');
  assert.equal(libelleFraisPont('Autre chose'), 'Autre chose');
});

test('App.js : l ecran Pont utilise ces deux fonctions', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /Tu recevras ≈ \{toAmount \? montantCourt\(ethers\.utils\.formatEther\(toAmount\)\)/);
  assert.match(app, /\{libelleFraisPont\(f\.name\)\} : \{montantCourt\(/);
});
