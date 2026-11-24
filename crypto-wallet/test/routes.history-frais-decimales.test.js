'use strict';

// Historique : (1) un jeton a 0 decimale s'affiche avec le bon montant
// (avant : `Number('0') || 18` -> 1 jeton affiche 0,000000000000000001) ;
// (2) les frais d'une transaction ne sont comptes qu'une fois dans
// « Mes stats » (avant : la ligne native ET chaque ligne de jeton du meme
// hash portaient les memes frais, donc 2 a 3 fois trop).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API_KEY = 'test-app-key';
const MOI = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';
const AUTRE = '0x1111111111111111111111111111111111111111';
process.env.APP_API_KEYS = API_KEY;
process.env.ETHERSCAN_API_KEY = 'etherscan-test-key';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-history-frais-'));
process.env.REVENUE_DB_PATH = path.join(process.env.DATA_DIR, 'revenue.db');

const TXLIST = [
  // envoi de USDC (appel de contrat a 0 ETH) : frais 46000 * 1 gwei
  { hash: '0xA1', from: MOI.toLowerCase(), to: '0xa0b8', value: '0', timeStamp: '1787000000', gasUsed: '46000', gasPrice: '1000000000', isError: '0' },
];
const TOKENTX = [
  // la ligne de jeton du meme envoi (hash en minuscules chez l'explorateur)
  { hash: '0xa1', from: MOI.toLowerCase(), to: AUTRE, value: '2500000', timeStamp: '1787000000', gasUsed: '46000', gasPrice: '1000000000', tokenSymbol: 'USDC', tokenDecimal: '6' },
  // un swap : deux lignes de jeton, une seule transaction (absente de la liste native)
  { hash: '0xc1', from: MOI.toLowerCase(), to: AUTRE, value: '1000000', timeStamp: '1787000100', gasUsed: '150000', gasPrice: '2', tokenSymbol: 'USDT', tokenDecimal: '6' },
  { hash: '0xc1', from: MOI.toLowerCase(), to: AUTRE, value: '5', timeStamp: '1787000100', gasUsed: '150000', gasPrice: '2', tokenSymbol: 'ENTIER', tokenDecimal: '0' },
  // decimales absentes -> repli 18
  { hash: '0xd1', from: AUTRE, to: MOI.toLowerCase(), value: '1000000000000000000', timeStamp: '1787000200', gasUsed: '1', gasPrice: '1', tokenSymbol: 'XYZ', tokenDecimal: '' },
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

test('historique : decimales 0 respectees et frais comptes une seule fois par transaction', async () => {
  const express = require('express');
  const app = express(); app.use(express.json()); app.use('/wallet', require('../src/routes/wallet'));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  try {
    const r = await realFetch(`http://127.0.0.1:${server.address().port}/wallet/tx/history?address=${MOI}&network=ethereum`, { headers: { 'x-api-key': API_KEY } });
    assert.equal(r.status, 200);
    const { items } = await r.json();
    const par = (sym) => items.find((i) => i.symbol === sym);
    assert.equal(par('ENTIER').amount, '5.0', 'un jeton a 0 decimale garde son vrai montant');
    assert.equal(par('USDC').amount, '2.5');
    assert.equal(par('XYZ').amount, '1.0', 'decimales absentes : repli sur 18');

    // meme calcul que la page « Mes stats » de l'application
    const total = items.filter((i) => i.direction === 'out' && i.feeWei).reduce((s, i) => s + BigInt(i.feeWei), 0n);
    assert.equal(total, 46000n * 1000000000n + 150000n * 2n, 'chaque transaction payee une seule fois');
  } finally { await new Promise((r) => server.close(r)); }
});
