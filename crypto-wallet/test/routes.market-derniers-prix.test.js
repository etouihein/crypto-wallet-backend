'use strict';

// Marche : si CoinGecko tombe, on garde les DERNIERS PRIX REELS (marques
// « differes ») au lieu des prix codes en dur (ETH 3500, BTC 64000...) qui
// peuvent dater de plusieurs mois. Au-dela de 6 h sans prix reel, repli sur
// la liste codee en dur, toujours marquee stale.

const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();

const realFetch = global.fetch;
let coingeckoEnPanne = false;
global.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u.startsWith('https://api.coingecko.com/api/v3/coins/markets')) {
    if (coingeckoEnPanne) return new Response('rate limited', { status: 429 });
    const ids = new URL(u).searchParams.get('ids');
    const liste = ids ? [] : [
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 4321.5, market_cap: 1, price_change_percentage_24h: 2 },
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 98765, market_cap: 2, price_change_percentage_24h: 1 },
    ];
    return new Response(JSON.stringify(liste), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error(`appel inattendu : ${u}`);
};

const walletRoutes = require('../src/routes/wallet');

async function marche(base) {
  const r = await realFetch(`${base}/wallet/market`, { headers: { 'x-api-key': 'test-app-key' } });
  return { status: r.status, body: await r.json() };
}
const prix = (body, id) => body.tokens.find((t) => t.id === id)?.current_price;

test('panne de CoinGecko : derniers prix reels gardes (marques differes), pas les prix codes en dur', async () => {
  const vraiNow = Date.now;
  let decalage = 0;
  Date.now = () => vraiNow() + decalage;
  const avertissements = console.warn;
  console.warn = () => {};
  try {
    await helpers.withServer(walletRoutes, async (base) => {
      const ok = await marche(base);
      assert.equal(ok.status, 200);
      assert.equal(ok.body.stale, false);
      assert.equal(prix(ok.body, 'ethereum'), 4321.5);

      coingeckoEnPanne = true;
      decalage = 60_000; // cache de 30 s expire
      const panne = await marche(base);
      assert.equal(panne.status, 200);
      assert.equal(panne.body.stale, true, 'les prix sont signales comme differes');
      assert.equal(prix(panne.body, 'ethereum'), 4321.5, 'dernier prix reel, pas 3500 code en dur');
      assert.equal(prix(panne.body, 'bitcoin'), 98765);

      decalage = 7 * 60 * 60 * 1000; // plus de 6 h sans prix reel
      const vieux = await marche(base);
      assert.equal(vieux.body.stale, true);
      assert.notEqual(prix(vieux.body, 'ethereum'), 4321.5, 'au-dela de 6 h : repli sur la liste de secours');
    });
  } finally {
    Date.now = vraiNow;
    console.warn = avertissements;
    coingeckoEnPanne = false;
  }
});
