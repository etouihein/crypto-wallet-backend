'use strict';
// wallet-final/test/swap.zerox-montant.test.js
// ─────────────────────────────────────────────────────────────────
//  Swap 0x : le montant VENDU et la valeur native (ETH/BNB) envoyee par la
//  transaction du devis doivent correspondre a la demande. L'ecran de
//  confirmation affiche « Tu paies » d'apres la saisie, et transaction.value
//  est signe tel quel : un devis qui envoie plus que demande doit etre rejete.
//  Sans reseau : devis simules.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ALLOWANCE_HOLDER, validateZeroXQuote } = require('../lib/swapSecurity');

const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // compte #0 Hardhat
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ROUTER = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF';

const UN_ETH = '1000000000000000000';
const DIX_ETH = '10000000000000000000';

// Vente de 1 ETH contre de l'USDC (pas d'approbation pour le natif).
function devisVenteEth(surcharge = {}, tx = {}) {
  return {
    sellToken: NATIVE, buyToken: USDC, taker: WALLET, sellAmount: UN_ETH, buyAmount: '3500000000',
    transaction: { to: ROUTER, data: '0x', gas: '200000', value: UN_ETH, ...tx },
    ...surcharge,
  };
}
const venteEth = { sellAddress: NATIVE, buyAddress: USDC, taker: WALLET, chainId: 1, slippageBps: 100, sellAmount: UN_ETH };

// Vente de 100 USDC contre de l'ETH (approbation AllowanceHolder).
function devisVenteUsdc(surcharge = {}, tx = {}) {
  return {
    sellToken: USDC, buyToken: NATIVE, taker: WALLET, sellAmount: '100000000', buyAmount: '28000000000000000',
    issues: { allowance: { spender: ALLOWANCE_HOLDER } },
    transaction: { to: ROUTER, data: '0x', gas: '250000', value: '0', ...tx },
    ...surcharge,
  };
}
const venteUsdc = { sellAddress: USDC, buyAddress: NATIVE, taker: WALLET, chainId: 1, slippageBps: 100, sellAmount: '100000000' };

test('vente ETH : devis conforme (value = montant demande) -> accepte', () => {
  const r = validateZeroXQuote({ quote: devisVenteEth(), ...venteEth });
  assert.equal(r.ok, true, r.errors.join(' / '));
});

test('vente ETH : la transaction enverrait 10 ETH au lieu de 1 -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisVenteEth({}, { value: DIX_ETH }), ...venteEth });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /plus que le montant demandé/);
});

test('vente ETH : value en hexadecimal (0x...) superieure -> rejete aussi', () => {
  const r = validateZeroXQuote({ quote: devisVenteEth({}, { value: '0x8ac7230489e80000' }), ...venteEth });
  assert.equal(r.ok, false);
});

test('devis portant sur un autre montant vendu que la demande -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisVenteEth({ sellAmount: DIX_ETH }), ...venteEth });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /autre montant à vendre/);
});

test('vente USDC : devis conforme (value = 0) -> accepte', () => {
  const r = validateZeroXQuote({ quote: devisVenteUsdc(), ...venteUsdc });
  assert.equal(r.ok, true, r.errors.join(' / '));
});

test('vente USDC : la transaction enverrait aussi de l\'ETH -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisVenteUsdc({}, { value: UN_ETH }), ...venteUsdc });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /crypto native/);
});

test('valeur de transaction illisible -> rejete, sans planter', () => {
  const r = validateZeroXQuote({ quote: devisVenteEth({}, { value: 'beaucoup' }), ...venteEth });
  assert.equal(r.ok, false);
});

test('App.js : le montant demande est passe aux deux verifications du devis 0x', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(src, /chainId: activeNetwork\.chainId, slippageBps: swapSlippageBps,\s*sellAmount: sellAmountUnits,/);
  assert.match(src, /chainId: activeNetwork\.chainId, slippageBps: confirm\.slippageBps,\s*sellAmount: confirm\.sellAmountUnits,/);
});
