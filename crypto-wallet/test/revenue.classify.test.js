'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyTransfer } = require('../src/revenue/classify');
const { ZEROX_ALLOWANCE_HOLDER, LIFI_DIAMOND } = require('../src/revenue/chains');

const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const base = { chain_id: 1, tx_hash: '0xaaa', kind: 'erc20', amount_raw: '1000', parent_to: ZEROX_ALLOWANCE_HOLDER };

test('un transfert de valeur nulle (empoisonnement) n\'est jamais un revenu', () => {
  assert.deepEqual(classifyTransfer({ ...base, amount_raw: '0' }), { classification: 'unclassified', reason: 'zero_value' });
});

test('un envoi natif direct n\'est jamais une commission, même depuis un contrat connu', () => {
  assert.equal(classifyTransfer({ ...base, kind: 'native' }).reason, 'direct_transfer');
});

test('un devis rattaché par hash identifie le type de commission', () => {
  const swap = classifyTransfer(base, { quoteByTxHash: () => ({ id: 'q1', type: 'swap' }) });
  assert.deepEqual(swap, { classification: 'swap_fee', reason: 'quote_tx_hash', quoteId: 'q1', matchMethod: 'tx_hash' });
  const bridge = classifyTransfer({ ...base, kind: 'internal' }, { quoteByTxHash: () => ({ id: 'q2', type: 'bridge' }) });
  assert.equal(bridge.classification, 'bridge_fee');
});

test('les contrats officiels 0x et LI.FI sont reconnus', () => {
  assert.equal(classifyTransfer(base).classification, 'swap_fee');
  assert.equal(classifyTransfer({ ...base, kind: 'internal', parent_to: LIFI_DIAMOND }).classification, 'bridge_fee');
});

test('un contrat vu dans nos devis est reconnu, sans tenir compte de la casse', () => {
  const settler = '0x1111111111111111111111111111111111111111';
  const r = classifyTransfer({ ...base, parent_to: settler.toUpperCase().replace('0X', '0x') }, { knownSwapTargets: new Set([settler]) });
  assert.deepEqual(r, { classification: 'swap_fee', reason: 'known_swap_target' });
});

test('un faux jeton (transaction adressée au jeton lui-même) reste non classé', () => {
  assert.deepEqual(classifyTransfer({ ...base, parent_to: USDT }), { classification: 'unclassified', reason: 'unknown_contract' });
});

test('sans transaction parente connue, le transfert reste en attente', () => {
  assert.deepEqual(classifyTransfer({ ...base, parent_to: null }), { classification: 'pending', reason: 'parent_unknown' });
});
