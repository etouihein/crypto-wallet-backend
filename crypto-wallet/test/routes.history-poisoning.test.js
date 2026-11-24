'use strict';

// Historique : les transferts de jeton a MONTANT ZERO (technique de
// l'« adresse piegee ») ne s'affichent plus. Avant le 24/11/2026, un pirate
// pouvait faire apparaitre « Envoye 0 USDT » vers une adresse sosie dans
// l'Activite de n'importe qui.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API_KEY = 'test-app-key';
const MOI = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';
const SOSIE = '0x8894aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2d4e3';
process.env.APP_API_KEYS = API_KEY;
process.env.ETHERSCAN_API_KEY = 'etherscan-test-key';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-history-zero-'));
process.env.REVENUE_DB_PATH = path.join(process.env.DATA_DIR, 'revenue.db');

const TXLIST = [{ hash: '0xa1', from: MOI.toLowerCase(), to: '0xdead', value: '0', timeStamp: '1787000000', gasUsed: '46000', gasPrice: '1000000000', isError: '0' }];
const TOKENTX = [
  { hash: '0xb1', from: '0xbeef', to: MOI.toLowerCase(), value: '2500000', timeStamp: '1787000500', gasUsed: '55000', gasPrice: '1', tokenSymbol: 'USDC', tokenDecimal: '6' },
  // l'appat : transferFrom de 0 « depuis » ma propre adresse vers un sosie
  { hash: '0xb2', from: MOI.toLowerCase(), to: SOSIE, value: '0', timeStamp: '1787000600', gasUsed: '55000', gasPrice: '1', tokenSymbol: 'USDT', tokenDecimal: '6' },
  { hash: '0xb3', from: SOSIE, to: MOI.toLowerCase(), value: '0', timeStamp: '1787000700', gasUsed: '55000', gasPrice: '1', tokenSymbol: 'USDC', tokenDecimal: '6' },
];
const realFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u.includes('api.etherscan.io')) {
    const action = new URL(u).searchParams.get('action');
    return new Response(JSON.stringify({ status: '1', message: 'OK', result: action === 'txlist' ? TXLIST : TOKENTX }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`appel inattendu : ${u}`);
};

test("transferts de jeton a 0 : absents de l'historique ; vrais transferts et appels de contrat gardes", async () => {
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/wallet', require('../src/routes/wallet'));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  try {
    const r = await realFetch(`http://127.0.0.1:${server.address().port}/wallet/tx/history?address=${MOI}&network=ethereum`, { headers: { 'x-api-key': API_KEY } });
    assert.equal(r.status, 200);
    const { items } = await r.json();
    const hashes = items.map((i) => i.hash).sort();
    assert.deepEqual(hashes, ['0xa1', '0xb1'], JSON.stringify(items.map((i) => [i.hash, i.symbol, i.amount])));
    assert.ok(!items.some((i) => String(i.to).toLowerCase() === SOSIE || String(i.from).toLowerCase() === SOSIE), "l'adresse sosie n'apparait nulle part");
  } finally { await new Promise((r) => server.close(r)); }
});
