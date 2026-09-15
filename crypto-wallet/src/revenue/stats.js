'use strict';

// Chiffres du dashboard, calculés UNIQUEMENT à partir des commissions
// réellement encaissées on-chain (classification swap_fee / bridge_fee).
// Aucun jeu d'exemple : une base vide donne des zéros.
//
// Les journées sont découpées à l'heure de Paris (heure d'été comprise), les
// sommes sont exactes (BigInt, money.js). Une commission encore non valorisée
// (prix introuvable) est comptée dans le nombre de transactions mais pas dans
// les montants, et signalée à part.

const { getChain } = require('./chains');
const { sumFiat, formatUnits, toScaled, fromScaled, FIAT_SCALE } = require('./money');

const TZ = 'Europe/Paris';
const DAY_MS = 24 * 3600 * 1000;
const REVENUE_CLASSES = "('swap_fee', 'bridge_fee')";

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parisParts(ms) {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute), s: Number(p.second) };
}

function parisOffsetMs(ms) {
  const p = parisParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// Minuit (heure de Paris) du jour contenant l'instant ms.
function parisMidnight(ms) {
  const p = parisParts(ms);
  const wall = Date.UTC(p.y, p.m - 1, p.d);
  let t = wall - parisOffsetMs(wall);
  t = wall - parisOffsetMs(t); // second passage : juste en cas de changement d'heure ce jour-là
  return t;
}

// Décale de n jours calendaires à Paris (les jours de changement d'heure font 23 ou 25 h).
function addParisDays(midnightMs, n) {
  return parisMidnight(midnightMs + 12 * 3600 * 1000 + n * DAY_MS);
}

function parisDateKey(ms) {
  const p = parisParts(ms);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

function periods(nowMs) {
  const today = parisMidnight(nowMs);
  return {
    today: { fromMs: today, toMs: nowMs + 1 },
    d7: { fromMs: addParisDays(today, -6), toMs: nowMs + 1 },
    d30: { fromMs: addParisDays(today, -29), toMs: nowMs + 1 },
    all: { fromMs: 0, toMs: nowMs + 1 },
  };
}

function revenueRows(db, fromMs, toMs, extraWhere = '', params = []) {
  return db.prepare(`SELECT * FROM inbound_transfers
    WHERE classification IN ${REVENUE_CLASSES} AND block_time >= ? AND block_time < ? ${extraWhere}`)
    .all(Math.floor(fromMs / 1000), Math.ceil(toMs / 1000), ...params);
}

function summarize(rows) {
  return {
    usd: sumFiat(rows.map((r) => r.value_usd_at_receipt)),
    eur: sumFiat(rows.map((r) => r.value_eur_at_receipt)),
    count: rows.length,
    unpriced: rows.filter((r) => r.value_usd_at_receipt === null || r.value_eur_at_receipt === null).length,
  };
}

function totals(db, nowMs) {
  const p = periods(nowMs);
  return Object.fromEntries(Object.entries(p).map(([k, range]) => [k, summarize(revenueRows(db, range.fromMs, range.toMs))]));
}

// Revenu par jour (heure de Paris) sur les `days` derniers jours, jours vides à zéro.
function revenueByDay(db, nowMs, days = 30) {
  const start = addParisDays(parisMidnight(nowMs), -(days - 1));
  const buckets = new Map();
  let cursor = start;
  for (let i = 0; i < days; i++) {
    buckets.set(parisDateKey(cursor), { usd: 0n, eur: 0n, count: 0 });
    cursor = addParisDays(cursor, 1);
  }
  for (const r of revenueRows(db, start, nowMs + 1)) {
    const bucket = buckets.get(parisDateKey(r.block_time * 1000));
    if (!bucket) continue;
    if (r.value_usd_at_receipt !== null) bucket.usd += toScaled(r.value_usd_at_receipt, FIAT_SCALE);
    if (r.value_eur_at_receipt !== null) bucket.eur += toScaled(r.value_eur_at_receipt, FIAT_SCALE);
    bucket.count += 1;
  }
  return [...buckets.entries()].map(([date, b]) => ({ date, usd: fromScaled(b.usd, FIAT_SCALE), eur: fromScaled(b.eur, FIAT_SCALE), count: b.count }));
}

function breakdown(db, fromMs, toMs) {
  const rows = revenueRows(db, fromMs, toMs);
  const bySource = {
    swap: summarize(rows.filter((r) => r.classification === 'swap_fee')),
    bridge: summarize(rows.filter((r) => r.classification === 'bridge_fee')),
  };
  const chainIds = [...new Set(rows.map((r) => r.chain_id))].sort((a, b) => a - b);
  const byChain = chainIds.map((id) => ({ chainId: id, name: getChain(id)?.name || String(id), ...summarize(rows.filter((r) => r.chain_id === id)) }));
  return { bySource, byChain };
}

const SORTS = {
  date: 'block_time',
  value_usd: 'CAST(value_usd_at_receipt AS REAL)',
  value_eur: 'CAST(value_eur_at_receipt AS REAL)',
  chain: 'chain_id',
  type: 'classification',
  token: 'token_symbol',
};

// Tableau détaillé : une ligne par transaction qui a rapporté de l'argent.
function listRevenue(db, { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER, chainId = null, type = null, sort = 'date', dir = 'desc', page = 1, pageSize = 50 } = {}) {
  const where = [];
  const params = [];
  if (chainId) { where.push('AND chain_id = ?'); params.push(Number(chainId)); }
  if (type === 'swap' || type === 'bridge') { where.push('AND classification = ?'); params.push(`${type}_fee`); }
  const orderBy = SORTS[sort] || SORTS.date;
  const direction = dir === 'asc' ? 'ASC' : 'DESC';
  const size = Math.min(Math.max(Number(pageSize) || 50, 10), 500);
  const fromSec = Math.floor(fromMs / 1000);
  const toSec = Math.ceil(Math.min(toMs, 8.64e15) / 1000);
  const base = `FROM inbound_transfers WHERE classification IN ${REVENUE_CLASSES} AND block_time >= ? AND block_time < ? ${where.join(' ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(fromSec, toSec, ...params).n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Number(page) || 1, 1), pages);
  const rows = db.prepare(`SELECT * ${base} ORDER BY ${orderBy} ${direction} NULLS LAST, id ${direction} LIMIT ? OFFSET ?`)
    .all(fromSec, toSec, ...params, size, (current - 1) * size)
    .map(toRevenueLine);
  return { rows, total, page: current, pages, pageSize: size };
}

function listAllRevenue(db, filters = {}) {
  const first = listRevenue(db, { ...filters, page: 1, pageSize: 500 });
  const rows = [...first.rows];
  for (let page = 2; page <= first.pages; page++) rows.push(...listRevenue(db, { ...filters, page, pageSize: 500 }).rows);
  return rows;
}

function toRevenueLine(r) {
  const chain = getChain(r.chain_id);
  return {
    id: r.id,
    dateMs: r.block_time * 1000,
    type: r.classification === 'bridge_fee' ? 'bridge' : 'swap',
    chainId: r.chain_id,
    chain: chain ? chain.name : String(r.chain_id),
    tokenSymbol: r.token_symbol || (chain ? chain.nativeSymbol : '?'),
    tokenAddress: r.token_address,
    amount: formatUnits(r.amount_raw, r.token_decimals),
    amountRaw: r.amount_raw,
    decimals: r.token_decimals,
    coingeckoId: r.coingecko_id,
    valueUsdAtReceipt: r.value_usd_at_receipt,
    valueEurAtReceipt: r.value_eur_at_receipt,
    txHash: r.tx_hash,
    explorerUrl: chain ? `${chain.explorerTx}${r.tx_hash}` : null,
    matchMethod: r.match_method || null,
  };
}

// Entrées non classées (poussière, faux jetons, virements) : visibles, jamais comptées.
function unclassifiedSummary(db) {
  return db.prepare(`SELECT classification_reason AS reason, COUNT(*) AS n FROM inbound_transfers
    WHERE classification = 'unclassified' GROUP BY classification_reason ORDER BY n DESC`).all();
}

function listUnclassified(db, { page = 1, pageSize = 50 } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || 50, 10), 200);
  const total = db.prepare("SELECT COUNT(*) AS n FROM inbound_transfers WHERE classification = 'unclassified'").get().n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Number(page) || 1, 1), pages);
  const rows = db.prepare(`SELECT * FROM inbound_transfers WHERE classification = 'unclassified'
    ORDER BY block_time DESC, id DESC LIMIT ? OFFSET ?`).all(size, (current - 1) * size)
    .map((r) => ({ ...toRevenueLine(r), reason: r.classification_reason, from: r.from_address }));
  return { rows, total, page: current, pages };
}

// Protège contre l'injection de formules à l'ouverture dans un tableur.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_COLUMNS = [
  ['date_utc', (r) => new Date(r.dateMs).toISOString()],
  ['date_paris', (r) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(r.dateMs))],
  ['type', (r) => r.type],
  ['chaine', (r) => r.chain],
  ['token', (r) => r.tokenSymbol],
  ['adresse_token', (r) => r.tokenAddress],
  ['montant', (r) => r.amount],
  ['valeur_usd_reception', (r) => r.valueUsdAtReceipt],
  ['valeur_eur_reception', (r) => r.valueEurAtReceipt],
  ['valeur_usd_actuelle', (r) => r.valueUsdNow],
  ['valeur_eur_actuelle', (r) => r.valueEurNow],
  ['rapprochement_devis', (r) => r.matchMethod || 'aucun'],
  ['tx_hash', (r) => r.txHash],
  ['explorateur', (r) => r.explorerUrl],
];

function toCsv(rows) {
  const lines = [CSV_COLUMNS.map(([name]) => name).join(',')];
  for (const r of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

module.exports = {
  TZ, parisMidnight, addParisDays, parisDateKey, periods,
  totals, revenueByDay, breakdown, listRevenue, listAllRevenue, unclassifiedSummary, listUnclassified,
  toCsv, csvCell, SORTS,
};
