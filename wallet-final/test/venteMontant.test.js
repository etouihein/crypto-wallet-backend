'use strict';

// Ecran Vendre : les boutons rapides donnent un montant qu'on peut vraiment
// envoyer a l'adresse de depot Coinbase (frais compris), ecrit proprement.

const test = require('node:test');
const assert = require('node:assert/strict');
const { montantRapideVente } = require('../lib/venteMontant');

const base = { nativeSymbol: 'ETH', reserveNative: 0.004, reserveSol: 0.00001 };

test('"Tout" sur SOL garde de quoi payer les frais Solana', () => {
  assert.equal(montantRapideVente({ ...base, pct: 1, symbole: 'SOL', solde: 2.5 }), '2.49999');
  assert.equal(montantRapideVente({ ...base, pct: 1, symbole: 'SOL', solde: 0.000005 }), '0');
});

test('"Tout" sur le natif EVM garde la reserve de gas, pas sur un token', () => {
  assert.equal(montantRapideVente({ ...base, pct: 1, symbole: 'ETH', solde: 1 }), '0.996');
  assert.equal(montantRapideVente({ ...base, pct: 1, symbole: 'USDC', solde: 12.345678 }), '12.345678');
});

test('montant ecrit proprement : pas de bruit flottant, pas de "1e-7", decimales du jeton', () => {
  assert.equal(montantRapideVente({ ...base, pct: 0.5, symbole: 'USDC', solde: 0.6 }), '0.3');
  assert.equal(montantRapideVente({ ...base, pct: 0.25, symbole: 'USDC', solde: 1.2 }), '0.3');
  assert.equal(montantRapideVente({ ...base, pct: 0.25, symbole: 'SOL', solde: 0.0000004 }), '0.0000001');
  assert.equal(montantRapideVente({ ...base, pct: 0.5, symbole: 'USDT', solde: 1.0000001 }), '0.5');
  assert.equal(montantRapideVente({ ...base, pct: 0.5, symbole: 'ETH', solde: 0 }), '0');
  assert.equal(montantRapideVente({ ...base, pct: 0.5, symbole: 'ETH', solde: NaN }), '0');
});
