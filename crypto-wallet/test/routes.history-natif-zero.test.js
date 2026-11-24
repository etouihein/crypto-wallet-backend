'use strict';

// Historique : une transaction native RECUE a 0 (n'importe qui peut appeler
// ton adresse avec 0 ETH depuis une adresse sosie) ne s'affiche plus ; tes
// propres transactions a 0 (approbations, appels de contrat) restent.

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
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-history-natif-'));
process.env.REVENUE_DB_PATH = path.join(process.env.DATA_DIR, 'revenue.db');

const TXLIST = [
  { hash: '0xa1', from: MOI.toLowerCase(), to: '0xdead', value: '0', timeStamp: '1787000000', gasUsed: '46000', gasPrice: '1', isError: '0' },
  { hash: '0xa2', from: SOSIE, to: MOI.toLowerCase(), value: '0', timeStamp: '1787000100', gasUsed: '21000', gasPrice: '1', isError: '0' },
  { hash: '0xa3', from: '0xbeef', to: MOI.toLowerCase(), value: '2000000000000000', timeStamp: '1787000200', gasUsed: '21000', gasPrice: '1', isError: '0' },
];
const realFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u.includes('api.etherscan.io')) {
    const action = new URL(u).searchParams.get('action');
    return new Response(JSON.stringify({ status: '1', message: 'OK', result: action === 'txlist' ? TXLIST : [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`appel inattendu : ${u}`);
};

test('transactions natives recues a 0 : absentes ; mes appels a 0 et les vrais recus gardes', async () => {
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/wallet', require('../src/routes/wallet'));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  try {
    const r = await realFetch(`http://127.0.0.1:${server.address().port}/wallet/tx/history?address=${MOI}&network=ethereum`, { headers: { 'x-api-key': API_KEY } });
    assert.equal(r.status, 200);
    const { items } = await r.json();
    assert.deepEqual(items.map((i) => i.hash).sort(), ['0xa1', '0xa3']);
  } finally { await new Promise((r) => server.close(r)); }
});
