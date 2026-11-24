'use strict';

// Validation stricte des entrees de paiement (achat / vente de crypto).
// Avant le correctif (PATCH-091) : un symbole ou un reseau qui n'est pas du
// texte faisait planter la route (erreur 500), « 0.05abc » etait lu comme
// 0,05 par parseFloat, et un achat de 0,01 passait alors que le message
// annonce un minimum de 1. Ici chaque entree piege doit donner un 400 clair,
// sans jamais appeler Coinbase.

const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
process.env.PAYMENT_PROVIDER = 'coinbase';
process.env.COINBASE_CDP_API_KEY_ID = 'cdp-id-test';
process.env.COINBASE_CDP_API_KEY_SECRET = 'cdp-secret-test';
process.env.FRONTEND_URL = 'https://nexiawallet.com';
process.env.NODE_ENV = 'production';

const cheminCdp = require.resolve('@coinbase/cdp-sdk/auth');
require.cache[cheminCdp] = {
  id: cheminCdp, filename: cheminCdp, loaded: true,
  exports: { generateJwt: async () => 'faux-jwt' },
};

const realFetch = global.fetch;
const appelsCoinbase = [];
global.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u.startsWith('https://api.developer.coinbase.com/')) {
    appelsCoinbase.push(u);
    return new Response(JSON.stringify({ token: 'session-123' }), { status: 200 });
  }
  throw new Error(`appel reseau inattendu : ${u}`);
};

const walletRoutes = require('../src/routes/wallet');
const ADRESSE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

async function poster(base, chemin, corps) {
  const res = await realFetch(`${base}/wallet${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-app-key' },
    body: JSON.stringify(corps),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

test('achat : entrees piegees -> 400 clair (jamais 500), sans appel a Coinbase', async () => {
  appelsCoinbase.length = 0;
  const erreurs = console.error;
  console.error = () => {};
  try {
    await helpers.withServer(walletRoutes, async (base) => {
      for (const extra of [
        { tokenSymbol: { a: 1 } },
        { tokenSymbol: ['ETH'] },
        { tokenSymbol: 12 },
        { tokenSymbol: 'ETH<script>' },
        { network: { a: 1 } },
        { network: 42 },
        { amountUsd: '0.05abc' },
        { amountUsd: '20abc' },
        { amountUsd: '1e3' },
        { amountUsd: 0.5 },
        { amountUsd: '0.99' },
        { amountUsd: [50] },
      ]) {
        const corps = { amountUsd: 50, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE, ...extra };
        const r = await poster(base, '/payments/create-checkout-session', corps);
        assert.equal(r.status, 400, JSON.stringify(extra));
        assert.equal(r.body.success, false, JSON.stringify(extra));
      }
      assert.equal(appelsCoinbase.length, 0);
    });
  } finally {
    console.error = erreurs;
  }
});

test('vente : entrees piegees -> 400 clair (jamais 500), sans appel a Coinbase', async () => {
  appelsCoinbase.length = 0;
  const erreurs = console.error;
  console.error = () => {};
  try {
    await helpers.withServer(walletRoutes, async (base) => {
      for (const extra of [
        { tokenSymbol: { a: 1 } },
        { tokenSymbol: 12 },
        { network: { a: 1 } },
        { amountCrypto: '0.05abc' },
        { amountCrypto: '1e3' },
        { amountCrypto: [1] },
      ]) {
        const corps = { amountCrypto: 0.1, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE, ...extra };
        const r = await poster(base, '/payments/create-sell-session', corps);
        assert.equal(r.status, 400, JSON.stringify(extra));
        assert.equal(r.body.success, false, JSON.stringify(extra));
      }
      assert.equal(appelsCoinbase.length, 0);
    });
  } finally {
    console.error = erreurs;
  }
});

test('achat et vente : les montants normaux de l application passent toujours', async () => {
  appelsCoinbase.length = 0;
  await helpers.withServer(walletRoutes, async (base) => {
    for (const amountUsd of [1, 50, '50', '49.99', 5000]) {
      const r = await poster(base, '/payments/create-checkout-session', { amountUsd, tokenSymbol: 'eth', network: 'base', walletAddress: ADRESSE });
      assert.equal(r.status, 200, String(amountUsd));
    }
    for (const amountCrypto of [0.1, '0.000123', 2]) {
      const r = await poster(base, '/payments/create-sell-session', { amountCrypto, tokenSymbol: 'ETH', network: 'base', walletAddress: ADRESSE });
      assert.equal(r.status, 200, String(amountCrypto));
    }
  });
});
