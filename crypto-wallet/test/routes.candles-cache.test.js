'use strict';

// Graphique d'une crypto (/wallet/coin/:id/candles) : la periode demandee
// (timeframe) vient du client. Seules 1H, 1J, 1S et 1M existent ; toute
// autre valeur donne le graphique 1J. Avant le 24/11/2026, la valeur brute
// entrait dans la cle du cache : chaque timeframe invente (?timeframe=a,
// ?timeframe=b...) declenchait un NOUVEL appel a CoinGecko et une nouvelle
// entree en memoire, jamais effacee. Quelques centaines de requetes
// suffisaient a epuiser le quota CoinGecko (429) : tous les utilisateurs
// passaient alors en "prix differes".

const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
const realFetch = global.fetch;
const appelsOhlc = [];
global.fetch = async (url, options) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u.includes('/ohlc?')) {
    appelsOhlc.push(u);
    return new Response(JSON.stringify([[1787000000000, 1, 2, 0.5, 1.5]]), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('indisponible', { status: 503 });
};
const walletRoutes = require('../src/routes/wallet');
const get = async (base, chemin) => (await realFetch(`${base}/wallet${chemin}`, { headers: { 'x-api-key': 'test-app-key' } })).json();

test('un timeframe inconnu reutilise le graphique 1J en cache, sans nouvel appel CoinGecko', async () => {
  await helpers.withServer(walletRoutes, async (base) => {
    const r1 = await get(base, '/coin/bitcoin/candles?timeframe=1J');
    assert.equal(r1.success, true);
    assert.equal(r1.candles.length, 1);
    for (const tf of ['zzz1', 'zzz2', 'xyz', '1j%20', '']) {
      const r = await get(base, `/coin/bitcoin/candles?timeframe=${tf}`);
      assert.equal(r.success, true, tf);
      assert.deepEqual(r.candles, r1.candles, tf);
    }
    assert.equal(appelsOhlc.length, 1, `appels CoinGecko : ${appelsOhlc.join(' | ')}`);
    assert.match(appelsOhlc[0], /days=7$/);
  });
});

test('les quatre periodes connues gardent leur propre graphique (minuscules acceptees)', async () => {
  await helpers.withServer(walletRoutes, async (base) => {
    appelsOhlc.length = 0;
    for (const tf of ['1h', '1S', '1M']) {
      const r = await get(base, `/coin/ethereum/candles?timeframe=${tf}`);
      assert.equal(r.success, true, tf);
    }
    assert.deepEqual(appelsOhlc.map((u) => u.match(/days=(\d+)/)[1]), ['1', '90', '180']);
  });
});
