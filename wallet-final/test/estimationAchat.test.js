'use strict';
// Ecran Acheter : estimation en crypto d'un montant saisi en EUROS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { estimationAchat } = require('../lib/estimationAchat');

test('10 € avec ETH a 1690 $ et 1 $ = 0,9114 € -> environ 0,00649 ETH (pas 0,005917)', () => {
  const est = Number(estimationAchat('10', 1690, 0.9114));
  assert.ok(Math.abs(est - 10 / (1690 * 0.9114)) < 1e-6, String(est));
  assert.ok(est > 0.0064 && est < 0.0066);
});

test('cas limites : montant vide, prix ou taux inconnu -> 0', () => {
  assert.equal(estimationAchat('', 1690, 0.91), '0');
  assert.equal(estimationAchat('10', 0, 0.91), '0');
  assert.equal(estimationAchat('10', 1690, null), '0');
});

test('App.js : l estimation passe par le taux EUR (plus de division euros / prix en dollars)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /estimationAchat\(buyAmount, tokens\[buyToken\]\?\.price, p7FxRates\?\.EUR \|\| CURRENCIES\.EUR\.rate\)/);
  assert.doesNotMatch(app, /const qty = \(parseFloat\(buyAmount\) \|\| 0\) \/ price;/);
});
