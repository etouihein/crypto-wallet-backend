'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openRevenueDb } = require('../src/revenue/db');
const stats = require('../src/revenue/stats');
const { NATIVE_TOKEN } = require('../src/revenue/chains');

const HASH = (n) => '0x' + String(n).padStart(64, '0');
let seq = 0;

function addRow(db, { atUtc, classification = 'swap_fee', chain = 1, usd = '1', eur = '0.9', symbol = 'ETH', token = NATIVE_TOKEN, amount = '1000000000000000', decimals = 18, match = null }) {
  seq += 1;
  db.prepare(`INSERT INTO inbound_transfers (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_symbol,
    token_decimals, amount_raw, classification, value_usd_at_receipt, value_eur_at_receipt, coingecko_id, match_method, indexed_at)
    VALUES (?, ?, 'internal', '0', 1, ?, '0xfrom', ?, ?, ?, ?, ?, ?, ?, 'ethereum', ?, 0)`)
    .run(chain, HASH(seq), Math.floor(Date.parse(atUtc) / 1000), token, symbol, decimals, amount, classification, usd, eur, match);
}

test("minuit à Paris, en heure d'hiver, d'été et le jour du changement d'heure", () => {
  assert.equal(stats.parisMidnight(Date.parse('2026-07-15T10:00:00Z')), Date.parse('2026-07-14T22:00:00Z'));
  assert.equal(stats.parisMidnight(Date.parse('2026-01-15T10:00:00Z')), Date.parse('2026-01-14T23:00:00Z'));
  const midnight29 = stats.parisMidnight(Date.parse('2026-03-29T12:00:00Z'));
  assert.equal(midnight29, Date.parse('2026-03-28T23:00:00Z'));
  assert.equal(stats.addParisDays(midnight29, 1), Date.parse('2026-03-29T22:00:00Z')); // journée de 23 h
  assert.equal(stats.parisDateKey(Date.parse('2026-09-14T22:30:00Z')), '2026-09-15');
});

test('base vide : que des zéros, aucune donnée inventée', () => {
  const db = openRevenueDb(':memory:');
  const now = Date.parse('2026-09-15T12:00:00Z');
  const t = stats.totals(db, now);
  for (const k of ['today', 'd7', 'd30', 'all']) assert.deepEqual(t[k], { usd: '0', eur: '0', count: 0, unpriced: 0 });
  const days = stats.revenueByDay(db, now, 30);
  assert.equal(days.length, 30);
  assert.ok(days.every((d) => d.usd === '0' && d.count === 0));
  assert.equal(days[29].date, '2026-09-15');
  assert.deepEqual(stats.listRevenue(db).rows, []);
  db.close();
});

test('totaux par période : bornes à Paris, sommes exactes, non classés et non valorisés exclus des montants', () => {
  const db = openRevenueDb(':memory:');
  const now = Date.parse('2026-09-15T12:00:00Z');
  addRow(db, { atUtc: '2026-09-14T23:30:00Z', usd: '0.1', eur: '0.09' }); // 15/09 01h30 à Paris : aujourd'hui
  addRow(db, { atUtc: '2026-09-15T08:00:00Z', usd: '0.2', eur: '0.18', classification: 'bridge_fee', chain: 8453 });
  addRow(db, { atUtc: '2026-09-14T21:30:00Z', usd: '5', eur: '4.5' }); // 14/09 23h30 à Paris : pas aujourd'hui
  addRow(db, { atUtc: '2026-08-20T10:00:00Z', usd: '10', eur: '9' }); // dans les 30 jours
  addRow(db, { atUtc: '2026-06-01T10:00:00Z', usd: '100', eur: '90' }); // seulement « depuis le début »
  addRow(db, { atUtc: '2026-09-15T09:00:00Z', usd: null, eur: null }); // commission non valorisée
  addRow(db, { atUtc: '2026-09-15T09:30:00Z', usd: '999', eur: '999', classification: 'unclassified' }); // jamais comptée
  const t = stats.totals(db, now);
  assert.deepEqual(t.today, { usd: '0.3', eur: '0.27', count: 3, unpriced: 1 });
  assert.deepEqual(t.d7, { usd: '5.3', eur: '4.77', count: 4, unpriced: 1 });
  assert.deepEqual(t.d30, { usd: '15.3', eur: '13.77', count: 5, unpriced: 1 });
  assert.deepEqual(t.all, { usd: '115.3', eur: '103.77', count: 6, unpriced: 1 });

  const days = stats.revenueByDay(db, now, 30);
  assert.equal(days.find((d) => d.date === '2026-09-15').usd, '0.3');
  assert.equal(days.find((d) => d.date === '2026-09-14').usd, '5');

  const b = stats.breakdown(db, 0, now + 1);
  assert.equal(b.bySource.swap.usd, '115.1');
  assert.equal(b.bySource.bridge.usd, '0.2');
  assert.deepEqual(b.byChain.map((c) => [c.name, c.usd]), [['Ethereum', '115.1'], ['Base', '0.2']]);
  assert.deepEqual(stats.unclassifiedSummary(db), [{ reason: null, n: 1 }]);
  db.close();
});

test('tableau : filtres, tri (non valorisés en dernier), pagination, lien explorateur', () => {
  const db = openRevenueDb(':memory:');
  for (let i = 0; i < 12; i++) addRow(db, { atUtc: `2026-09-${String(1 + i).padStart(2, '0')}T10:00:00Z`, usd: String(i + 1), eur: String(i) });
  addRow(db, { atUtc: '2026-09-13T10:00:00Z', usd: null, eur: null });
  addRow(db, { atUtc: '2026-09-13T11:00:00Z', classification: 'bridge_fee', chain: 10, usd: '50', eur: '45' });

  const byValue = stats.listRevenue(db, { sort: 'value_usd', dir: 'desc', pageSize: 10 });
  assert.equal(byValue.total, 14);
  assert.equal(byValue.pages, 2);
  assert.equal(byValue.rows[0].valueUsdAtReceipt, '50');
  const lastPage = stats.listRevenue(db, { sort: 'value_usd', dir: 'desc', pageSize: 10, page: 2 });
  assert.equal(lastPage.rows[lastPage.rows.length - 1].valueUsdAtReceipt, null);

  const bridges = stats.listRevenue(db, { type: 'bridge' });
  assert.equal(bridges.total, 1);
  assert.equal(bridges.rows[0].chain, 'Optimism');
  assert.equal(bridges.rows[0].explorerUrl, `https://optimistic.etherscan.io/tx/${bridges.rows[0].txHash}`);
  assert.equal(bridges.rows[0].amount, '0.001');

  const opOnly = stats.listRevenue(db, { chainId: 10, type: 'swap' });
  assert.equal(opOnly.total, 0);

  const period = stats.listRevenue(db, { fromMs: Date.parse('2026-09-10T00:00:00Z'), toMs: Date.parse('2026-09-12T00:00:00Z') });
  assert.equal(period.total, 2);
  assert.equal(stats.listAllRevenue(db, {}).length, 14);
  db.close();
});

test("CSV : BOM, en-têtes, échappement et protection contre l'injection de formules", () => {
  const csv = stats.toCsv([{
    dateMs: Date.parse('2026-09-15T08:00:00Z'), type: 'swap', chain: 'Ethereum', tokenSymbol: '=HYPERLINK("http://x")', tokenAddress: NATIVE_TOKEN,
    amount: '0.0075', valueUsdAtReceipt: '17.35', valueEurAtReceipt: '15.9', valueUsdNow: null, valueEurNow: null, matchMethod: null,
    txHash: HASH(1), explorerUrl: `https://etherscan.io/tx/${HASH(1)}`,
  }]);
  assert.ok(csv.startsWith('﻿date_utc,date_paris,type,chaine,token'));
  const line = csv.split('\r\n')[1];
  assert.ok(line.includes(`"'=HYPERLINK(""http://x"")"`), 'formule neutralisée et guillemets doublés');
  assert.ok(line.includes(',17.35,15.9,,,aucun,'));
  assert.equal(stats.csvCell('-12'), "'-12");
  assert.equal(stats.csvCell('a,b'), '"a,b"');
});
