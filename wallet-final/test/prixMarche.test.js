'use strict';

// Prix de secours ecrits en dur dans le serveur (stale:true) : jamais
// utilises pour convertir un montant ou valoriser le portefeuille.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { prixUtilisables } = require('../lib/prixMarche');

test('les prix de secours figes du serveur (stale:true) sont ecartes', () => {
  const reponse = [
    { id: 'bitcoin', current_price: 64000, stale: true },
    { id: 'ethereum', current_price: 3500, stale: true },
  ];
  assert.deepEqual(prixUtilisables(reponse), []);
});

test('les vrais prix CoinGecko sont gardes', () => {
  const reponse = [
    { id: 'bitcoin', current_price: 95123.4 },
    { id: 'ethereum', current_price: 3012.1, stale: false },
    { id: 'tether', current_price: 1, stale: true },
  ];
  assert.deepEqual(prixUtilisables(reponse).map((t) => t.id), ['bitcoin', 'ethereum']);
});

test('un prix absent, nul, negatif ou illisible est ecarte, une reponse abimee ne plante pas', () => {
  const reponse = [
    null,
    { id: 'a' },
    { id: 'b', current_price: 0 },
    { id: 'c', current_price: -5 },
    { id: 'd', current_price: '3500' },
    { id: 'e', current_price: NaN },
    { id: 'f', current_price: Infinity },
  ];
  assert.deepEqual(prixUtilisables(reponse), []);
  assert.deepEqual(prixUtilisables(undefined), []);
  assert.deepEqual(prixUtilisables({ tokens: [] }), []);
});

test('App.js : fetchMarket ne recopie que les prix utilisables dans les soldes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const debut = src.indexOf('const fetchMarket = useCallback(');
  assert.ok(debut > 0, 'fetchMarket introuvable');
  const corps = src.slice(debut, src.indexOf('} catch (err) {', debut));
  assert.match(corps, /prixUtilisables\(tokensData\)/, 'fetchMarket doit filtrer avec prixUtilisables');
  // Les prix des soldes et du graphique viennent de la liste filtree, jamais
  // de la reponse brute (qui peut contenir les prix de secours figes).
  assert.doesNotMatch(corps, /tokensData\.find\(/, 'aucun prix ne doit etre lu dans la reponse brute');
});
