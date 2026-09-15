'use strict';

// /wallet/tx/history de bout en bout, sur de vraies réponses capturées.
//
// Avant ce correctif, BNB Chain, Optimism et Base répondaient 500 (« Free API
// access is not supported for this chain » chez Etherscan) et l'écran Activité
// de l'app restait vide. Ces tests vérifient que les six réseaux rendent
// désormais la même structure, celle que l'app consomme :
//   { hash, type, symbol, direction, amount, timestamp, from, to, failed, feeWei }

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const API_KEY = 'test-app-key';
const ADDRESS = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';

process.env.APP_API_KEYS = API_KEY;
process.env.ETHERSCAN_API_KEY = 'etherscan-test-key';
process.env.NODEREAL_API_KEY = 'nodereal-test-key';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-history-'));
process.env.REVENUE_DB_PATH = path.join(process.env.DATA_DIR, 'revenue.db');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `history-${name}.json`), 'utf8'));
const realFetch = global.fetch;
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// Faux amont : Blockscout pour Optimism/Base, NodeReal pour BNB Chain,
// Etherscan pour les trois autres (réponses de forme identique à la vraie).
const ETHERSCAN_TXLIST = [{ hash: '0xe1', from: ADDRESS.toLowerCase(), to: '0xdead', value: '1000000000000000000', timeStamp: '1787000000', gasUsed: '21000', gasPrice: '1000000000', isError: '0' }];
const ETHERSCAN_TOKENTX = [{ hash: '0xe2', from: '0xbeef', to: ADDRESS.toLowerCase(), value: '2500000', timeStamp: '1787000500', gasUsed: '55000', gasPrice: '1000000000', tokenSymbol: 'USDC', tokenDecimal: '6' }];

const upstream = [];
function installUpstreams() {
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
    upstream.push(u);
    if (u.includes('api.etherscan.io')) {
      const action = new URL(u).searchParams.get('action');
      return json({ status: '1', message: 'OK', result: action === 'txlist' ? ETHERSCAN_TXLIST : ETHERSCAN_TOKENTX });
    }
    if (u.includes('blockscout.com') || u.includes('explorer.optimism.io')) {
      const action = new URL(u).searchParams.get('action');
      const which = u.includes('base.blockscout.com') ? 'base' : 'optimism';
      return json(fixture(`blockscout-${which}-${action}`));
    }
    if (u.includes('nodereal.io')) {
      const params = JSON.parse(options.body).params[0];
      return json(fixture(params.fromAddress ? 'nodereal-token-from' : 'nodereal-token-to'));
    }
    throw new Error(`appel réseau inattendu pendant le test : ${u}`);
  };
}

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

const get = (base, network, address = ADDRESS) =>
  realFetch(`${base}/wallet/tx/history?address=${address}&network=${network}`, { headers: { 'x-api-key': API_KEY } });

test('les six réseaux répondent 200 avec la structure attendue par l\'app', async () => {
  installUpstreams();
  await withServer(async (base) => {
    for (const network of ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base', 'bsc']) {
      // Une adresse différente par réseau : le cache de la route est par
      // (réseau, adresse), on veut un vrai appel à chaque fois.
      const res = await get(base, network, ADDRESS);
      assert.equal(res.status, 200, `${network} : statut`);
      const body = await res.json();
      assert.equal(body.success, true, `${network} : succès`);
      assert.ok(Array.isArray(body.items), `${network} : items est un tableau`);
      assert.ok(body.items.length > 0, `${network} : au moins une transaction`);
      for (const item of body.items) {
        assert.deepEqual(
          Object.keys(item).sort(),
          ['amount', 'direction', 'failed', 'feeWei', 'from', 'hash', 'symbol', 'timestamp', 'to', 'type'],
          `${network} : champs de l'élément`
        );
        assert.ok(['native', 'erc20'].includes(item.type), `${network} : type`);
        assert.ok(['in', 'out'].includes(item.direction), `${network} : sens`);
        assert.equal(typeof item.failed, 'boolean', `${network} : échec booléen`);
        assert.match(item.feeWei, /^\d+$/, `${network} : frais en wei entiers`);
        assert.match(String(item.amount), /^\d+(\.\d+)?$/, `${network} : montant décimal lisible`);
        assert.ok(Number.isFinite(item.timestamp) && item.timestamp > 1_600_000_000_000, `${network} : horodatage en millisecondes`);
      }
      // Trié du plus récent au plus ancien, comme avant.
      const times = body.items.map((i) => i.timestamp);
      assert.deepEqual(times, [...times].sort((a, b) => b - a), `${network} : tri décroissant`);
    }
  });
});

test('BNB Chain passe par NodeReal, Optimism et Base par Blockscout, jamais par Etherscan', async () => {
  installUpstreams();
  await withServer(async (base) => {
    for (const [network, expected] of [['bsc', 'nodereal.io'], ['optimism', 'explorer.optimism.io'], ['base', 'base.blockscout.com']]) {
      upstream.length = 0;
      // Adresse unique pour contourner le cache de 20 s de la route.
      const address = `0x${network.padEnd(40, '0').slice(0, 40)}`.replace(/[^0-9a-fx]/g, '0');
      await get(base, network, ADDRESS.slice(0, 2) + address.slice(2));
      assert.ok(upstream.length > 0, `${network} : un appel amont a eu lieu`);
      assert.ok(upstream.every((u) => u.includes(expected)), `${network} : tout passe par ${expected} (${upstream.join(', ')})`);
      assert.ok(upstream.every((u) => !u.includes('etherscan.io')), `${network} : aucun appel à Etherscan`);
    }
  });
});

test('le sens, les frais et le symbole sont justes sur une donnée réelle BNB Chain', async () => {
  installUpstreams();
  await withServer(async (base) => {
    const res = await get(base, 'bsc', '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
    const body = await res.json();
    const sent = body.items.find((i) => i.direction === 'out');
    assert.ok(sent, 'au moins une transaction sortante');
    assert.equal(sent.type, 'erc20');
    assert.equal(sent.symbol, 'mWBNB', "le symbole vient du champ asset de NodeReal");
    // value 0x6a94d74f430000 sur 18 décimales = 0,03
    assert.equal(sent.amount, '0.03');
    // gasUsed 143106 * gasPrice 50000000 = 7155300000000
    assert.equal(sent.feeWei, '7155300000000');
    assert.equal(sent.failed, false);
  });
});

test('une panne de la source remonte en 500, elle n\'affiche pas un historique vide trompeur', async () => {
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
    return new Response('passerelle indisponible', { status: 502 });
  };
  await withServer(async (base) => {
    const res = await get(base, 'base', '0x1111111111111111111111111111111111111111');
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.ok(!('items' in body), 'aucune liste vide qui ferait croire à un compte sans activité');
  });
});

test.after(() => { global.fetch = realFetch; });
