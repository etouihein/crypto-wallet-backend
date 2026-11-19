'use strict';

// Délai maximum des appels aux services externes (0x, LI.FI, CoinGecko,
// Alternative.me, Alchemy, Blockstream).
//
// Constat (19/11/2026) : ces appels `fetch` n'avaient AUCUN délai maximum.
// Si un service externe se bloque (il accepte la connexion mais ne répond
// jamais), la requête de l'app restait suspendue plusieurs minutes : écran
// de swap ou de marché qui tourne dans le vide, sans message.
//
// Ici, on remplace les services externes par des faux qui ne répondent
// JAMAIS (sauf si l'appel porte un délai maximum, qui finit par l'annuler)
// et on vérifie que chaque route répond vite, avec un message clair pour les
// devis.

const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
process.env.UPSTREAM_TIMEOUT_MS = '150';
process.env.ALCHEMY_API_KEY = 'alchemy-test-key';

const realFetch = global.fetch;
const appels = [];

// Faux service externe bloqué : ne répond jamais. Si l'appel porte un
// `signal` (délai maximum), il est annulé quand le délai expire, comme le
// ferait le vrai fetch.
global.fetch = (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  appels.push({ url: u, avecDelai: !!options.signal });
  return new Promise((resolve, reject) => {
    if (options.signal) {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }
  });
};

const walletRoutes = require('../src/routes/wallet');

const TAKER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE_0X = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Abandonne la requête de test au bout de 3 s : sans délai côté serveur,
// elle ne reviendrait jamais et le test échoue au lieu de bloquer.
async function appeler(base, chemin, options = {}) {
  const debut = Date.now();
  const res = await realFetch(`${base}${chemin}`, {
    ...options,
    headers: { 'x-api-key': 'test-app-key', ...(options.headers || {}) },
    signal: AbortSignal.timeout(3000),
  }).catch((e) => {
    throw new Error(`la route ${chemin} n'a pas répondu en 3 s (service externe bloqué, pas de délai maximum) : ${e.message}`);
  });
  return { status: res.status, body: await res.json(), duree: Date.now() - debut };
}

const DEVIS = [
  ['devis de swap (0x)', `/wallet/swap/quote?network=ethereum&sellToken=${USDC}&buyToken=${NATIVE_0X}&sellAmount=1000000&taker=${TAKER}`],
  ['devis de pont (LI.FI)', `/wallet/bridge/quote?fromChain=1&toChain=42161&fromAddress=${TAKER}&fromAmount=1000000000000000`],
  ['devis inter-écosystèmes (LI.FI)', `/wallet/swap/cross-quote?fromNetwork=ethereum&toNetwork=solana&fromToken=${NATIVE_0X}&toToken=11111111111111111111111111111111&fromAmount=1000000000000000&fromAddress=${TAKER}&toAddress=8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p`],
];

for (const [nom, chemin] of DEVIS) {
  test(`${nom} : service bloqué -> réponse 504 rapide avec un message clair`, { timeout: 5000 }, async () => {
    appels.length = 0;
    const r = await helpers.withServer(walletRoutes, (base) => appeler(base, chemin));
    assert.equal(r.status, 504);
    assert.equal(r.body.success, false);
    assert.match(r.body.error, /ne répond pas/);
    assert.ok(appels.length >= 1, 'le service externe doit avoir été appelé');
    assert.ok(appels.every((a) => a.avecDelai), 'chaque appel externe doit porter un délai maximum');
  });
}

const AUTRES = [
  ['marché (CoinGecko)', '/wallet/market'],
  ['vue d\'ensemble du marché (CoinGecko + Fear & Greed)', '/wallet/market/overview'],
  ['fiche d\'une crypto (CoinGecko)', '/wallet/coin/bitcoin'],
  ['bougies d\'une crypto (CoinGecko)', '/wallet/coin/bitcoin/candles?timeframe=1J'],
  ['galerie NFT (Alchemy)', `/wallet/nft/owned/${TAKER}?network=ethereum`],
  ['diffusion Bitcoin (Blockstream)', '/wallet/tx/broadcast-bitcoin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rawTx: '0200000001' }) }],
];

for (const [nom, chemin, options] of AUTRES) {
  test(`${nom} : service bloqué -> la route répond quand même`, { timeout: 5000 }, async () => {
    appels.length = 0;
    const r = await helpers.withServer(walletRoutes, (base) => appeler(base, chemin, options));
    assert.ok(r.status < 600, `statut ${r.status}`);
    assert.ok(appels.length >= 1, 'le service externe doit avoir été appelé');
    assert.ok(appels.every((a) => a.avecDelai), `appel sans délai maximum : ${appels.filter((a) => !a.avecDelai).map((a) => a.url).join(', ')}`);
  });
}
