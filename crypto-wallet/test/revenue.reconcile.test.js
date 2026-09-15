'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openRevenueDb } = require('../src/revenue/db');
const { reconcile, conversionStats, withinTolerance, HEURISTIC_WINDOW_MS } = require('../src/revenue/reconcile');
const { NATIVE_TOKEN } = require('../src/revenue/chains');

const T0 = 1_760_000_000_000; // ms

function addQuote(db, { id, type = 'swap', chain = 1, token = NATIVE_TOKEN, expected = '1000000', createdAt = T0, txHash = null, user = 'u1', tokenIn = '0xin', tokenOut = NATIVE_TOKEN }) {
  db.prepare(`INSERT INTO quote_events (id, created_at, type, chain_id, token_in, token_out, amount_in, expected_fee_amount, expected_fee_token, user_hash, tx_hash)
    VALUES (?, ?, ?, ?, ?, ?, '1', ?, ?, ?, ?)`).run(id, createdAt, type, chain, tokenIn, tokenOut, expected, token, user, txHash);
}

function addTransfer(db, { tx, classification = 'swap_fee', chain = 1, token = NATIVE_TOKEN, amount = '1000000', timeMs = T0 + 60_000, sub = '0' }) {
  return db.prepare(`INSERT INTO inbound_transfers (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_decimals, amount_raw, classification, indexed_at)
    VALUES (?, ?, 'internal', ?, 1, ?, '0xfrom', ?, 18, ?, ?, 0)`).run(chain, tx, sub, Math.floor(timeMs / 1000), token, amount, classification).lastInsertRowid;
}

const linkOf = (db, id) => db.prepare('SELECT quote_id, match_method FROM inbound_transfers WHERE id = ?').get(id);

test('rapprochement exact par hash de transaction', () => {
  const db = openRevenueDb(':memory:');
  addQuote(db, { id: 'q1', txHash: '0xt1' });
  const t = addTransfer(db, { tx: '0xt1', amount: '1' }); // montant sans importance quand le hash correspond
  assert.deepEqual(reconcile(db), { exact: 1, heuristic: 0 });
  assert.deepEqual(linkOf(db, t), { quote_id: 'q1', match_method: 'tx_hash' });
  db.close();
});

test('rapprochement heuristique : même chaîne, token, fenêtre et montant proche', () => {
  const db = openRevenueDb(':memory:');
  addQuote(db, { id: 'q2', type: 'bridge', chain: 10, expected: '2500000000000' });
  const t = addTransfer(db, { tx: '0xt2', classification: 'bridge_fee', chain: 10, amount: '2500000000000', timeMs: T0 + 5 * 60_000 });
  assert.deepEqual(reconcile(db), { exact: 0, heuristic: 1 });
  assert.deepEqual(linkOf(db, t), { quote_id: 'q2', match_method: 'heuristic' });
  db.close();
});

test('pas de rapprochement hors tolérance, hors fenêtre, ou avant le devis', () => {
  const db = openRevenueDb(':memory:');
  addQuote(db, { id: 'q3', expected: '1000000' });
  const tooMuch = addTransfer(db, { tx: '0xa', amount: '1200000' }); // +20 %
  const tooLate = addTransfer(db, { tx: '0xb', timeMs: T0 + HEURISTIC_WINDOW_MS + 1000 });
  const before = addTransfer(db, { tx: '0xc', timeMs: T0 - 60_000 });
  reconcile(db);
  for (const id of [tooMuch, tooLate, before]) assert.equal(linkOf(db, id).quote_id, null);
  db.close();
});

test('un devis n\'explique qu\'une seule réception', () => {
  const db = openRevenueDb(':memory:');
  addQuote(db, { id: 'q4' });
  addTransfer(db, { tx: '0xd1', timeMs: T0 + 60_000 });
  addTransfer(db, { tx: '0xd2', timeMs: T0 + 120_000 });
  assert.deepEqual(reconcile(db), { exact: 0, heuristic: 1 });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM inbound_transfers WHERE quote_id = 'q4'").get().n, 1);
  db.close();
});

test('les transferts non classés ne sont jamais rapprochés', () => {
  const db = openRevenueDb(':memory:');
  addQuote(db, { id: 'q5', txHash: '0xe' });
  const t = addTransfer(db, { tx: '0xe', classification: 'unclassified' });
  assert.deepEqual(reconcile(db), { exact: 0, heuristic: 0 });
  assert.equal(linkOf(db, t).quote_id, null);
  db.close();
});

test('withinTolerance compare exactement en entiers', () => {
  assert.equal(withinTolerance('1050000', '1000000', 500), true);
  assert.equal(withinTolerance('1050001', '1000000', 500), false);
  assert.equal(withinTolerance('1', null, 500), false);
  assert.equal(withinTolerance('1', '0', 500), false);
});

test('le taux de conversion dédoublonne les devis rafraîchis', () => {
  const db = openRevenueDb(':memory:');
  addQuote(db, { id: 'a1', createdAt: T0, user: 'u1' });
  addQuote(db, { id: 'a2', createdAt: T0 + 60_000, user: 'u1', txHash: '0xs1' }); // même intention, rafraîchie
  addQuote(db, { id: 'b1', createdAt: T0 + 10 * 60_000, user: 'u1' }); // plus tard : nouvelle intention
  addQuote(db, { id: 'c1', createdAt: T0, user: 'u2' });
  addTransfer(db, { tx: '0xs1' });
  reconcile(db);
  const stats = conversionStats(db);
  assert.equal(stats.quotes, 4);
  assert.equal(stats.quotesDeduped, 3);
  assert.equal(stats.broadcast, 1);
  assert.equal(stats.settled, 1);
  assert.equal(stats.settledRatePct, 33.3);
  db.close();
});
