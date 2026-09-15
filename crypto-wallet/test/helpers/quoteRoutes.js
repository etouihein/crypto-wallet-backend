'use strict';

// Outils partagés par les tests de non-régression des routes de devis :
// environnement de test, faux 0x / LI.FI, cas couverts, lancement du serveur.

const fs = require('fs');
const os = require('os');
const path = require('path');

const GOLDEN_FILE = path.join(__dirname, '..', 'golden', 'quote-routes.json');
const API_KEY = 'test-app-key';
const TAKER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE_0X = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// À appeler AVANT de charger src/routes/wallet.js (qui lit l'environnement au chargement).
function prepareEnv({ revenueDbPath } = {}) {
  process.env.APP_API_KEYS = API_KEY;
  process.env.ZEROX_API_KEY = 'zerox-test-key';
  process.env.LIFI_API_KEY = 'lifi-test-key';
  process.env.SENSITIVE_RATE_LIMIT_MAX = '10000';
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-regression-'));
  process.env.REVENUE_DB_PATH = revenueDbPath || path.join(process.env.DATA_DIR, 'revenue.db');
  process.env.ANALYTICS_HASH_SECRET = 'r'.repeat(48);
  delete process.env.FEE_RECIPIENT_ADDRESS;
  delete process.env.SWAP_FEE_BPS;
  delete process.env.LIFI_FEE;
  delete process.env.LIFI_INTEGRATOR;
}

const ZEROX_OK = {
  buyAmount: '420000000000000',
  fees: { integratorFee: { amount: '3165000000000', token: NATIVE_0X, type: 'volume' }, zeroExFee: null },
  issues: { allowance: { actual: '0', spender: '0x0000000000001fF3684f28c67538d4D072C22734' } },
  transaction: { to: '0x0000000000001fF3684f28c67538d4D072C22734', data: '0x2213bc0b000000000000000000000000abcdef', value: '0', gas: '210000' },
};
const LIFI_OK = {
  estimate: { toAmount: '995000000000000', feeCosts: [{ name: 'LIFI Fixed Fee', amount: '5000000000000' }] },
  transactionRequest: { to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', data: '0x4630a0d8000000000000000000000000fedcba', value: '0x38d7ea4c68000', gasLimit: '0x30d40' },
};

const upstreamCalls = [];
const realFetch = global.fetch;

function installFakeUpstreams() {
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.0x.org/')) {
      upstreamCalls.push({ url: u, headers: options.headers || {} });
      if (new URL(u).searchParams.get('sellAmount') === '999') return new Response(JSON.stringify({ reason: 'INSUFFICIENT_LIQUIDITY' }), { status: 400 });
      return new Response(JSON.stringify(ZEROX_OK), { status: 200 });
    }
    if (u.startsWith('https://li.quest/')) {
      upstreamCalls.push({ url: u, headers: options.headers || {} });
      if (new URL(u).searchParams.get('fromAmount') === '999') return new Response(JSON.stringify({ message: 'No available quotes for the requested transfer' }), { status: 404 });
      return new Response(JSON.stringify(LIFI_OK), { status: 200 });
    }
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
    throw new Error(`appel réseau inattendu pendant le test : ${u}`);
  };
}

const CASES = [
  { name: 'swap ok', path: `/wallet/swap/quote?network=ethereum&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=1000000&taker=${TAKER}` },
  { name: 'swap bsc ok', path: `/wallet/swap/quote?network=bsc&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=2000000&taker=${TAKER}` },
  { name: 'swap montant invalide', path: `/wallet/swap/quote?network=ethereum&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=0&taker=${TAKER}` },
  { name: 'swap reseau non supporte', path: `/wallet/swap/quote?network=polygon&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=1000000&taker=${TAKER}` },
  { name: 'swap erreur 0x', path: `/wallet/swap/quote?network=ethereum&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=999&taker=${TAKER}` },
  { name: 'swap sans cle 0x', path: `/wallet/swap/quote?network=ethereum&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=1000000&taker=${TAKER}`, withoutZeroxKey: true },
  { name: 'swap sans cle app', path: `/wallet/swap/quote?network=ethereum&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=1000000&taker=${TAKER}`, noAppKey: true },
  { name: 'bridge ok', path: `/wallet/bridge/quote?fromChain=1&toChain=42161&fromAddress=${TAKER}&fromAmount=1000000000000000` },
  { name: 'bridge chaines invalides', path: `/wallet/bridge/quote?fromChain=1&toChain=1&fromAddress=${TAKER}&fromAmount=1000000000000000` },
  { name: 'bridge adresse invalide', path: '/wallet/bridge/quote?fromChain=1&toChain=10&fromAddress=0x123&fromAmount=1000000000000000' },
  { name: 'bridge erreur lifi', path: `/wallet/bridge/quote?fromChain=8453&toChain=10&fromAddress=${TAKER}&fromAmount=999` },
  { name: 'bridge sans cle app', path: `/wallet/bridge/quote?fromChain=1&toChain=42161&fromAddress=${TAKER}&fromAmount=1000000000000000`, noAppKey: true },
];

async function withServer(router, fn) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/wallet', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function runCases(baseUrl) {
  const results = [];
  for (const c of CASES) {
    upstreamCalls.length = 0;
    const savedZerox = process.env.ZEROX_API_KEY;
    if (c.withoutZeroxKey) delete process.env.ZEROX_API_KEY;
    const res = await realFetch(`${baseUrl}${c.path}`, { headers: c.noAppKey ? {} : { 'x-api-key': API_KEY } });
    if (c.withoutZeroxKey) process.env.ZEROX_API_KEY = savedZerox;
    results.push({
      name: c.name,
      status: res.status,
      contentType: res.headers.get('content-type'),
      body: await res.json(),
      upstream: upstreamCalls.map((call) => ({ url: call.url, headers: call.headers })),
    });
  }
  return results;
}

function loadGolden() {
  return JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
}

module.exports = { GOLDEN_FILE, prepareEnv, installFakeUpstreams, withServer, runCases, loadGolden, CASES };
