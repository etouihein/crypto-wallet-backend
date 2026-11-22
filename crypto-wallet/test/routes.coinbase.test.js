'use strict';

// Achat et vente via Coinbase (POST /wallet/payments/create-checkout-session
// et /create-sell-session). C'est par la que passe l'argent des utilisateurs :
// on verifie que la crypto est livree a la BONNE adresse sur le BON reseau,
// que les montants absurdes sont refuses, qu'une page de retour piegee
// n'est jamais utilisee, et qu'une erreur de Coinbase ne fuite pas.
// generateJwt (cle CDP) et l'API Coinbase sont remplaces par des faux.

const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
process.env.PAYMENT_PROVIDER = 'coinbase';
process.env.COINBASE_CDP_API_KEY_ID = 'cdp-id-test';
process.env.COINBASE_CDP_API_KEY_SECRET = 'cdp-secret-test';
process.env.FRONTEND_URL = 'https://nexiawallet.com';
process.env.NODE_ENV = 'production'; // origines de confiance strictes, comme en ligne

const jwts = [];
const cheminCdp = require.resolve('@coinbase/cdp-sdk/auth');
require.cache[cheminCdp] = {
  id: cheminCdp, filename: cheminCdp, loaded: true,
  exports: { generateJwt: async (opts) => { jwts.push(opts); return 'faux-jwt'; } },
};

const realFetch = global.fetch;
const appelsCoinbase = [];
let reponseCoinbase = () => new Response(JSON.stringify({ token: 'session-123' }), { status: 200 });
global.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u === 'https://api.developer.coinbase.com/onramp/v1/token') {
    appelsCoinbase.push({ headers: options.headers, body: JSON.parse(options.body) });
    return reponseCoinbase();
  }
  throw new Error(`appel reseau inattendu : ${u}`);
};

const walletRoutes = require('../src/routes/wallet');

const ADRESSE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

async function poster(base, chemin, corps, entetes = {}) {
  const res = await realFetch(`${base}/wallet${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-app-key', ...entetes },
    body: JSON.stringify(corps),
  });
  return { status: res.status, body: await res.json() };
}

function remiseAZero() {
  appelsCoinbase.length = 0;
  jwts.length = 0;
  reponseCoinbase = () => new Response(JSON.stringify({ token: 'session-123' }), { status: 200 });
}

test('achat : session Coinbase vers la bonne adresse et le bon reseau, URL pre-remplie', async () => {
  remiseAZero();
  await helpers.withServer(walletRoutes, async (base) => {
    const r = await poster(base, '/payments/create-checkout-session', { amountUsd: 50, tokenSymbol: 'eth', network: 'base', walletAddress: ADRESSE });
    assert.equal(r.status, 200);
    assert.equal(r.body.provider, 'coinbase');
    const url = new URL(r.body.url);
    assert.equal(url.origin + url.pathname, 'https://pay.coinbase.com/buy/select-asset');
    assert.equal(url.searchParams.get('sessionToken'), 'session-123');
    assert.equal(url.searchParams.get('presetFiatAmount'), '50');
    assert.equal(url.searchParams.get('fiatCurrency'), 'EUR');
    assert.equal(url.searchParams.get('defaultAsset'), 'ETH');
    assert.equal(url.searchParams.get('defaultNetwork'), 'base');
    assert.equal(appelsCoinbase.length, 1);
    assert.deepEqual(appelsCoinbase[0].body.addresses, [{ address: ADRESSE, blockchains: ['base'] }]);
    assert.equal(appelsCoinbase[0].headers.Authorization, 'Bearer faux-jwt');
    assert.equal(jwts[0].requestPath, '/onramp/v1/token');
    assert.equal(jwts[0].requestMethod, 'POST');
  });
});

test('achat : adresse invalide ou montant absurde refuses, sans appeler Coinbase', async () => {
  remiseAZero();
  await helpers.withServer(walletRoutes, async (base) => {
    for (const corps of [
      { amountUsd: 50, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: '0x123' },
      { amountUsd: 50, tokenSymbol: 'ETH', network: 'ethereum' },
      { amountUsd: 50, tokenSymbol: 'SOL', network: 'solana', walletAddress: ADRESSE },
      { amountUsd: -5, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE },
      { amountUsd: 6000, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE },
      { amountUsd: 'abc', tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE },
      { tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE },
    ]) {
      const r = await poster(base, '/payments/create-checkout-session', corps);
      assert.equal(r.status, 400, JSON.stringify(corps));
      assert.equal(r.body.success, false);
    }
    assert.equal(appelsCoinbase.length, 0);
  });
});

test('achat : reseau non pris en charge par Coinbase (y compris noms piege) -> 400 clair, sans appel', async () => {
  remiseAZero();
  await helpers.withServer(walletRoutes, async (base) => {
    for (const network of ['bsc', 'constructor', '__proto__', 'hasOwnProperty']) {
      const r = await poster(base, '/payments/create-checkout-session', { amountUsd: 20, tokenSymbol: 'ETH', network, walletAddress: ADRESSE });
      assert.equal(r.status, 400, network);
      assert.match(r.body.error, /non supporté par Coinbase/, network);
    }
    assert.equal(appelsCoinbase.length, 0);
  });
});

test('achat : erreur de Coinbase -> 502 avec un message generique (rien de Coinbase ne fuite)', async () => {
  remiseAZero();
  reponseCoinbase = () => new Response('detail interne coinbase: cle cdp-id-test refusee', { status: 401 });
  const erreurs = console.error;
  console.error = () => {};
  try {
    await helpers.withServer(walletRoutes, async (base) => {
      const r = await poster(base, '/payments/create-checkout-session', { amountUsd: 20, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE });
      assert.equal(r.status, 502);
      assert.doesNotMatch(JSON.stringify(r.body), /interne|cdp-id-test|401/);
    });
  } finally { console.error = erreurs; }
});

test('vente : retour vers NexiaWallet seulement, jamais vers une page piegee', async () => {
  remiseAZero();
  await helpers.withServer(walletRoutes, async (base) => {
    const ok = await poster(base, '/payments/create-sell-session', { amountCrypto: '0.05', tokenSymbol: 'usdc', network: 'arbitrum', walletAddress: ADRESSE, returnUrl: 'https://www.nexiawallet.com/vente?ok=1' });
    assert.equal(ok.status, 200);
    let url = new URL(ok.body.url);
    assert.equal(url.origin + url.pathname, 'https://pay.coinbase.com/v3/sell/input');
    assert.equal(url.searchParams.get('redirectUrl'), 'https://www.nexiawallet.com');
    assert.equal(url.searchParams.get('presetCryptoAmount'), '0.05');
    assert.equal(url.searchParams.get('defaultAsset'), 'USDC');
    assert.equal(url.searchParams.get('defaultNetwork'), 'arbitrum');
    assert.match(url.searchParams.get('partnerUserRef'), /^nexiawallet-\d+$/);
    assert.deepEqual(appelsCoinbase[0].body.addresses, [{ address: ADRESSE, blockchains: ['arbitrum'] }]);
    assert.deepEqual(appelsCoinbase[0].body.assets, ['USDC']);

    for (const returnUrl of ['https://nexiawallet.com.evil.example/x', 'https://evil.example', 'javascript:alert(1)', 'http://localhost:8083']) {
      const r = await poster(base, '/payments/create-sell-session', { amountCrypto: 1, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE, returnUrl }, { origin: 'https://evil.example' });
      assert.equal(r.status, 200, returnUrl);
      url = new URL(r.body.url);
      assert.equal(url.searchParams.get('redirectUrl'), 'https://nexiawallet.com', returnUrl);
    }
  });
});

test('vente : adresse invalide, montant nul ou reseau non pris en charge refuses, sans appel', async () => {
  remiseAZero();
  await helpers.withServer(walletRoutes, async (base) => {
    for (const corps of [
      { amountCrypto: 1, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: 'pas-une-adresse' },
      { amountCrypto: 0, tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE },
      { amountCrypto: 'x', tokenSymbol: 'ETH', network: 'ethereum', walletAddress: ADRESSE },
      { amountCrypto: 1, tokenSymbol: 'BNB', network: 'bsc', walletAddress: ADRESSE },
      { amountCrypto: 1, tokenSymbol: 'ETH', network: 'constructor', walletAddress: ADRESSE },
    ]) {
      const r = await poster(base, '/payments/create-sell-session', corps);
      assert.equal(r.status, 400, JSON.stringify(corps));
    }
    assert.equal(appelsCoinbase.length, 0);
  });
});
