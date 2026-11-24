'use strict';

// /wallet/tx/history : le reseau demande doit etre l'un des 6 reseaux de
// l'app. Avant le 24/11/2026, un autre nom (sepolia, solana, faute de
// frappe...) recevait en silence l'historique d'ETHEREUM (Etherscan retombe
// sur la chaine 1), et chaque nom invente declenchait un nouvel appel
// Etherscan (la cle du cache etait le nom brut, jamais efface).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API_KEY = 'test-app-key';
const ADDRESS = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';

process.env.APP_API_KEYS = API_KEY;
process.env.ETHERSCAN_API_KEY = 'etherscan-test-key';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-history-reseau-'));
process.env.REVENUE_DB_PATH = path.join(process.env.DATA_DIR, 'revenue.db');

const realFetch = global.fetch;
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const TXLIST = [{ hash: '0xe1', from: ADDRESS.toLowerCase(), to: '0xdead', value: '1000000000000000000', timeStamp: '1787000000', gasUsed: '21000', gasPrice: '1000000000', isError: '0' }];

const amont = [];
global.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  amont.push(u);
  if (u.includes('api.etherscan.io')) {
    const action = new URL(u).searchParams.get('action');
    return json({ status: '1', message: 'OK', result: action === 'txlist' ? TXLIST : [] });
  }
  throw new Error(`appel reseau inattendu pendant le test : ${u}`);
};

async function withServer(fn) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/wallet', require('../src/routes/wallet'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const get = (base, query) => realFetch(`${base}/wallet/tx/history?${query}`, { headers: { 'x-api-key': API_KEY } });

test('un reseau sans historique est refuse (400), sans appel a Etherscan ni historique Ethereum', async () => {
  await withServer(async (base) => {
    for (const reseau of ['sepolia', 'solana', 'bitcoin', 'inconnu', 'toString', '__proto__']) {
      amont.length = 0;
      const res = await get(base, `address=${ADDRESS}&network=${reseau}`);
      assert.equal(res.status, 400, `${reseau} : statut`);
      const body = await res.json();
      assert.equal(body.success, false, reseau);
      assert.equal(body.items, undefined, `${reseau} : aucun historique renvoye`);
      assert.deepEqual(amont, [], `${reseau} : aucun appel amont`);
    }
  });
});

test('un reseau envoye en double (tableau) est refuse proprement, pas une erreur 500', async () => {
  await withServer(async (base) => {
    const res = await get(base, `address=${ADDRESS}&network=ethereum&network=bsc`);
    assert.equal(res.status, 400);
    const res2 = await get(base, `address=${ADDRESS}&address=${ADDRESS}`);
    assert.equal(res2.status, 400);
  });
});

test('ETH, eth, Ethereum et ethereum partagent le meme historique en cache (un seul passage par Etherscan)', async () => {
  await withServer(async (base) => {
    amont.length = 0;
    const reponses = [];
    for (const reseau of ['ethereum', 'ETH', 'eth', 'Ethereum', 'mainnet']) {
      const res = await get(base, `address=${ADDRESS}&network=${reseau}`);
      assert.equal(res.status, 200, reseau);
      reponses.push((await res.json()).items);
    }
    for (const items of reponses) assert.deepEqual(items, reponses[0]);
    assert.equal(reponses[0][0].symbol, 'ETH');
    // txlist + tokentx pour la premiere demande seulement.
    assert.equal(amont.length, 2, amont.join(' | '));
  });
});

test('les six reseaux de l\'app restent acceptes (matic = polygon)', async () => {
  await withServer(async (base) => {
    for (const reseau of ['polygon', 'matic', 'arbitrum', 'bnb']) {
      const res = await get(base, `address=${ADDRESS}&network=${reseau}`);
      assert.notEqual(res.status, 400, reseau);
    }
  });
});
