'use strict';

// Alertes de prix abimees (stockage ou import colle) : jamais de page blanche.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { nettoyerAlertes } = require('../lib/alertesPrix');

const bonne = { id: 'BTC-1', symbol: 'BTC', targetPrice: 100000, direction: 'above' };

test('les alertes completes sont gardees telles quelles', () => {
  const b2 = { id: 'ETH-2', symbol: 'ETH', targetPrice: 0.5, direction: 'below' };
  assert.deepEqual(nettoyerAlertes([bonne, b2]), [bonne, b2]);
});

test('une entree abimee est ecartee au lieu de faire planter l ecran', () => {
  const liste = [
    null, 'BTC', 42, [],
    { id: 'x', symbol: null, targetPrice: 5, direction: 'above' },
    { id: 'x', symbol: 'ETH', targetPrice: '3000', direction: 'above' },
    { id: 'x', symbol: 'ETH', targetPrice: NaN, direction: 'above' },
    { id: 'x', symbol: 'ETH', targetPrice: -1, direction: 'above' },
    { id: 'x', symbol: 'ETH', targetPrice: 3000, direction: 'sideways' },
    { symbol: 'ETH', targetPrice: 3000, direction: 'above' },
    bonne,
  ];
  const propre = nettoyerAlertes(liste);
  assert.deepEqual(propre, [bonne]);
  // Ce que fait l'ecran d'accueil sur la liste : ne doit plus lever d'erreur.
  assert.doesNotThrow(() => propre.some((a) => a.symbol === 'BTC'));
});

test('autre chose qu une liste donne une liste vide', () => {
  assert.deepEqual(nettoyerAlertes(undefined), []);
  assert.deepEqual(nettoyerAlertes({ 0: bonne }), []);
  assert.deepEqual(nettoyerAlertes('[]'), []);
});

test('App.js : lecture du stockage et import passent par nettoyerAlertes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const lecture = src.slice(src.indexOf('const loadPriceAlerts'), src.indexOf('const savePriceAlerts'));
  assert.match(lecture, /nettoyerAlertes\(/, 'loadPriceAlerts doit nettoyer la liste lue');
  const imp = src.slice(src.indexOf('const importUserData'), src.indexOf("showToast('✓ Données importées'"));
  assert.match(imp, /nettoyerAlertes\(parsed\.priceAlerts\)/, 'l import doit nettoyer les alertes collees');
  assert.doesNotMatch(imp, /setPriceAlerts\(parsed\.priceAlerts\)/, 'jamais la liste collee brute');
});
