'use strict';

// Prix cible d'une alerte : tape dans la devise affichee, compare en dollars.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { prixCibleEnUsd } = require('../lib/prixCible');

const EUR = 0.922;
const JPY = 149.5;

test('100000 tapes en euros = alerte a 100000 EUR, pas a 100000 $', () => {
  const usd = prixCibleEnUsd('100000', EUR);
  assert.ok(Math.abs(usd * EUR - 100000) < 1e-6, `affichage attendu 100000 EUR, obtenu ${usd * EUR}`);
  // BTC a 100000 $ (= 92200 EUR) : l'alerte "au-dessus de 100000 EUR" ne sonne pas.
  assert.ok(100000 < usd);
});

test('en dollars le prix tape est garde tel quel, en yens il est converti', () => {
  assert.equal(prixCibleEnUsd('2500.5', 1), 2500.5);
  assert.ok(Math.abs(prixCibleEnUsd('14950000', JPY) - 100000) < 1e-6);
});

test('saisie invalide ou taux absent : null', () => {
  for (const s of ['', '0', '-5', 'abc', '0x10', '1e5', '12,5', '1.2.3', null, undefined]) {
    assert.equal(prixCibleEnUsd(s, EUR), null, `saisie ${s}`);
  }
  assert.equal(prixCibleEnUsd('10', 0), null);
  assert.equal(prixCibleEnUsd('10', undefined), null);
});

test('App.js : le formulaire d alerte convertit la saisie avec fxRate', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const debut = src.indexOf('const renderPriceAlertSection');
  const corps = src.slice(debut, src.indexOf('addPriceAlert(symbol, v, alertDirection)', debut));
  assert.match(corps, /prixCibleEnUsd\(alertTargetInput, fxRate\)/);
  assert.doesNotMatch(corps, /parseFloat\(alertTargetInput\)/, 'le nombre tape ne doit plus etre pris pour des dollars');
  assert.match(corps, /currentPrice \* fxRate/, 'l exemple du champ doit etre dans la devise affichee');
});
