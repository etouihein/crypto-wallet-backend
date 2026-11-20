'use strict';
// wallet-final/test/parcours.test.js : parcours anonyme (lib/parcours.js).
// USAGE : npm run test:lib
const test = require('node:test');
const assert = require('node:assert/strict');
const { etape, ETAPES, _reinitialiserPourTests } = require('../lib/parcours');

function fauxUmami() {
  const appels = [];
  return { appels, env: { umami: { track: (...args) => appels.push(args) } } };
}

test('envoie le NOM de l etape, et rien d autre', () => {
  _reinitialiserPourTests();
  const { appels, env } = fauxUmami();
  assert.equal(etape('wallet_cree', env), true);
  assert.deepEqual(appels, [['wallet_cree']], 'un seul argument : aucune donnee jointe');
});

test('un nom hors de la liste fermee est ignore (jamais d adresse ou de montant)', () => {
  _reinitialiserPourTests();
  const { appels, env } = fauxUmami();
  assert.equal(etape('0x1234abcd', env), false);
  assert.equal(etape('swap_envoye 1.5 ETH', env), false);
  assert.equal(etape(undefined, env), false);
  assert.deepEqual(appels, []);
});

test('sans Umami (mobile, bloqueur de pub) : ne fait rien et ne plante pas', () => {
  assert.equal(etape('wallet_cree', {}), false);
  assert.equal(etape('wallet_cree', undefined), false);
  assert.equal(etape('wallet_cree', { umami: { track: () => { throw new Error('bloque'); } } }), false);
});

test('ecran_swap n est compte qu une fois par visite', () => {
  _reinitialiserPourTests();
  const { appels, env } = fauxUmami();
  etape('ecran_swap', env); etape('ecran_swap', env); etape('swap_devis', env); etape('swap_devis', env);
  assert.deepEqual(appels, [['ecran_swap'], ['swap_devis'], ['swap_devis']]);
});

test('la liste des etapes est fermee et sans doublon', () => {
  assert.ok(Object.isFrozen(ETAPES));
  assert.equal(new Set(ETAPES).size, ETAPES.length);
});
