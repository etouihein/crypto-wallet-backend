'use strict';

// Une alerte de prix ne se declenche jamais sur un prix de secours fige.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { alertesAtteintes } = require('../lib/alertesDeclenchement');

const sousBtc = { id: 'BTC-1', symbol: 'BTC', targetPrice: 70000, direction: 'below' };
const surEth = { id: 'ETH-1', symbol: 'ETH', targetPrice: 3400, direction: 'above' };

test('panne CoinGecko : les prix figes du serveur ne declenchent aucune alerte', () => {
  // Vrais prix du moment (deja filtres) : BTC 95000, ETH 3000.
  const tokens = { BTC: { price: 95000 }, ETH: { price: 3000 } };
  const marche = [
    { id: 'bitcoin', symbol: 'btc', current_price: 64000, stale: true },
    { id: 'ethereum', symbol: 'eth', current_price: 3500, stale: true },
  ];
  assert.deepEqual(alertesAtteintes([sousBtc, surEth], tokens, marche), []);
});

test('un vrai prix atteint declenche bien l alerte', () => {
  const marche = [
    { id: 'bitcoin', symbol: 'btc', current_price: 69000 },
    { id: 'ethereum', symbol: 'eth', current_price: 3400 },
  ];
  assert.deepEqual(alertesAtteintes([sousBtc, surEth], {}, marche).map((a) => a.id), ['BTC-1', 'ETH-1']);
  assert.deepEqual(alertesAtteintes([sousBtc], { BTC: { price: 71000 } }, []), []);
});

test('prix absent ou abime : pas de declenchement, pas de plantage', () => {
  const marche = [null, { symbol: 'btc' }, { symbol: 42, current_price: 1 }, { symbol: 'btc', current_price: NaN }];
  assert.deepEqual(alertesAtteintes([sousBtc, null], { BTC: { price: 0 } }, marche), []);
  assert.deepEqual(alertesAtteintes(undefined, undefined, undefined), []);
});

test('App.js : la verification des alertes passe par alertesAtteintes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const debut = src.indexOf('if (!priceAlertsLoaded || !priceAlerts.length) return;');
  assert.ok(debut > 0, 'verification des alertes introuvable');
  const corps = src.slice(debut, src.indexOf('if (!triggered.length) return;', debut));
  assert.match(corps, /alertesAtteintes\(priceAlerts, tokens, marketCoins\)/);
  assert.doesNotMatch(corps, /c\.current_price/, 'aucun prix lu dans la reponse brute du Marche');
});
