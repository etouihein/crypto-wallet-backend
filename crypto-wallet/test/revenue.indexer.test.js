'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openRevenueDb } = require('../src/revenue/db');
const { createIndexer, REORG_OVERLAP_BLOCKS } = require('../src/revenue/indexer');
const { getChain, ZEROX_ALLOWANCE_HOLDER, LIFI_DIAMOND, NATIVE_TOKEN } = require('../src/revenue/chains');

const FEE = '0xfd749d841fff1f87e81d58e4a186261e62fbcbcc';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const SPAM = '0x5c3fa1f5dddc102b7f734a92bd5a7c6665bd7279';
const T = 1_757_600_000;

const transfer = (o) => ({ chain_id: 1, from_address: '0xsender', token_symbol: null, token_decimals: 18, token_address: NATIVE_TOKEN, sub_index: '0', block_time: T, ...o });

function setup() {
  const db = openRevenueDb(':memory:');
  const chain = { ...getChain(1), confirmations: 12 };
  const state = { head: 212, failKind: null };
  const data = {
    erc20: [
      transfer({ tx_hash: '0xfee1', kind: 'erc20', sub_index: '7', block_number: 150, token_address: USDC, token_symbol: 'USDC', token_decimals: 6, amount_raw: '750000' }),
      transfer({ tx_hash: '0xspam', kind: 'erc20', sub_index: '3', block_number: 160, token_address: SPAM, token_symbol: 'ICP', token_decimals: 18, amount_raw: '5000000000000000000' }),
    ],
    internal: [transfer({ tx_hash: '0xfee2', kind: 'internal', sub_index: '1', block_number: 170, amount_raw: '2500000000000' })],
    native: [transfer({ tx_hash: '0xdust', kind: 'native', block_number: 180, amount_raw: '1000000000' })],
  };
  const parents = { '0xfee1': ZEROX_ALLOWANCE_HOLDER, '0xspam': SPAM, '0xfee2': LIFI_DIAMOND };
  const fetchCalls = [];
  const source = {
    kinds: ['native', 'internal', 'erc20'],
    isConfigured: () => true,
    async fetch(kind, c, address, fromBlock, toBlock) {
      fetchCalls.push({ kind, fromBlock, toBlock });
      if (state.failKind === kind) throw new Error('source indisponible');
      assert.equal(address, FEE);
      return data[kind].filter((t) => t.block_number >= fromBlock && t.block_number <= toBlock);
    },
  };
  const rpc = {
    getBlockNumber: async () => state.head,
    findFirstBlockAtOrAfter: async () => 100,
    getReceipt: async (c, hash) => ({ to: parents[hash] || null }),
  };
  const priceCalls = [];
  const pricing = {
    resolveCoingeckoId: async (c, token) => (token === USDC ? 'usd-coin' : token === NATIVE_TOKEN ? 'ethereum' : null),
    historicalPrices: async (id, ts) => { priceCalls.push([id, ts]); return id === 'usd-coin' ? { usd: '1', eur: '0.9' } : { usd: '2000', eur: '1800' }; },
  };
  const indexer = createIndexer({ db, sources: { blockscout: source }, rpc, pricing, feeAddress: FEE, chains: [chain], now: () => 42, logger: { warn() {} } });
  return { db, state, data, indexer, fetchCalls, priceCalls };
}

const rows = (db) => db.prepare('SELECT tx_hash, classification, classification_reason, value_usd_at_receipt, value_eur_at_receipt FROM inbound_transfers ORDER BY tx_hash').all();

test('premier passage : tout est indexé, classé et valorisé correctement', async () => {
  const { db, indexer, fetchCalls } = setup();
  const result = await indexer.runOnce();
  assert.equal(result.status, 'ok');
  assert.ok(fetchCalls.every((c) => c.fromBlock === 100 && c.toBlock === 200), 'départ au bloc du 10/09, fin au dernier bloc confirmé');
  assert.deepEqual(rows(db), [
    { tx_hash: '0xdust', classification: 'unclassified', classification_reason: 'direct_transfer', value_usd_at_receipt: null, value_eur_at_receipt: null },
    { tx_hash: '0xfee1', classification: 'swap_fee', classification_reason: 'zerox_allowance_holder', value_usd_at_receipt: '0.75', value_eur_at_receipt: '0.675' },
    { tx_hash: '0xfee2', classification: 'bridge_fee', classification_reason: 'lifi_diamond', value_usd_at_receipt: '0.005', value_eur_at_receipt: '0.0045' },
    { tx_hash: '0xspam', classification: 'unclassified', classification_reason: 'unknown_contract', value_usd_at_receipt: null, value_eur_at_receipt: null },
  ]);
  const cursors = db.prepare('SELECT kind, last_block FROM indexer_cursors ORDER BY kind').all();
  assert.deepEqual(cursors, [{ kind: 'erc20', last_block: 200 }, { kind: 'internal', last_block: 200 }, { kind: 'native', last_block: 200 }]);
  db.close();
});

test('relancer ne crée aucun doublon et ne revalorise rien', async () => {
  const { db, indexer, fetchCalls, priceCalls } = setup();
  await indexer.runOnce();
  const pricedOnce = priceCalls.length;
  const second = await indexer.runOnce();
  assert.equal(second.status, 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbound_transfers').get().n, 4);
  assert.equal(priceCalls.length, pricedOnce);
  const lastCalls = fetchCalls.slice(-3);
  assert.ok(lastCalls.every((c) => c.fromBlock === 200 - REORG_OVERLAP_BLOCKS), 'reprise avec relecture de sécurité');
  assert.deepEqual(second.chains[0].inserted, 0);
  db.close();
});

test('reprise : seuls les nouveaux transferts sont ajoutés', async () => {
  const { db, state, data, indexer } = setup();
  await indexer.runOnce();
  state.head = 262;
  data.erc20.push(transfer({ tx_hash: '0xfee3', kind: 'erc20', sub_index: '2', block_number: 240, token_address: USDC, token_decimals: 6, amount_raw: '1500000' }));
  const result = await indexer.runOnce();
  assert.equal(result.chains[0].inserted, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbound_transfers').get().n, 5);
  db.close();
});

test('une source en panne : statut partiel, curseur non avancé, aucun doublon ensuite', async () => {
  const { db, state, indexer } = setup();
  state.failKind = 'erc20';
  const failed = await indexer.runOnce();
  assert.equal(failed.status, 'partial');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM indexer_cursors WHERE kind = 'erc20'").get().n, 0);
  state.failKind = null;
  const recovered = await indexer.runOnce();
  assert.equal(recovered.status, 'ok');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbound_transfers').get().n, 4);
  const runs = db.prepare('SELECT status FROM indexer_runs ORDER BY id').all().map((r) => r.status);
  assert.deepEqual(runs, ['partial', 'ok']);
  db.close();
});
