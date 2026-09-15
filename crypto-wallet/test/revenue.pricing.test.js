'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openRevenueDb } = require('../src/revenue/db');
const { createPricing } = require('../src/revenue/pricing');
const { getChain } = require('../src/revenue/chains');

const T = 1_757_500_000; // secondes

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(routes) {
  const db = openRevenueDb(':memory:');
  const calls = [];
  let clock = 1_000_000;
  const fetchImpl = async (url) => {
    calls.push(String(url));
    for (const [match, handler] of routes) if (String(url).includes(match)) return handler(String(url));
    return jsonResponse({ error: 'not found' }, 404);
  };
  const pricing = createPricing({ db, fetchImpl, sleep: async () => {}, now: () => clock });
  return { db, calls, pricing, advance: (ms) => { clock += ms; } };
}

test('prix historique : point le plus proche, en USD et en EUR', async () => {
  const { pricing } = setup([
    ['vs_currency=usd', () => jsonResponse({ prices: [[(T - 3600) * 1000, 2300.1], [(T + 600) * 1000, 2313.45], [(T + 3600) * 1000, 2320]] })],
    ['vs_currency=eur', () => jsonResponse({ prices: [[(T + 900) * 1000, 2130.5]] })],
  ]);
  assert.deepEqual(await pricing.historicalPrices('ethereum', T), { usd: '2313.45', eur: '2130.5' });
});

test('le cache évite tout nouvel appel pour la même heure', async () => {
  const { pricing, calls } = setup([
    ['market_chart/range', () => jsonResponse({ prices: [[T * 1000, 1.0001]] })],
  ]);
  await pricing.historicalPrice('usd-coin', 'usd', T);
  const before = calls.length;
  assert.equal(await pricing.historicalPrice('usd-coin', 'usd', T + 1200), '1.0001');
  assert.equal(calls.length, before);
});

test('aucun point à moins de 90 minutes : non valorisé (null), jamais inventé', async () => {
  const { pricing } = setup([
    ['market_chart/range', () => jsonResponse({ prices: [[(T - 3 * 3600) * 1000, 2000]] })],
  ]);
  assert.equal(await pricing.historicalPrice('ethereum', 'usd', T), null);
});

test('identifiant CoinGecko : natif sans appel, contrat mis en cache, inconnu revérifié après 7 jours', async () => {
  const { pricing, calls, advance } = setup([
    ['/contract/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', () => jsonResponse({ id: 'usd-coin' })],
  ]);
  const eth = getChain(1);
  assert.equal(await pricing.resolveCoingeckoId(eth, '0x0000000000000000000000000000000000000000'), 'ethereum');
  assert.equal(calls.length, 0);
  assert.equal(await pricing.resolveCoingeckoId(eth, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), 'usd-coin');
  assert.equal(await pricing.resolveCoingeckoId(eth, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), 'usd-coin');
  assert.equal(calls.length, 1);
  assert.equal(await pricing.resolveCoingeckoId(eth, '0xdead00000000000000000000000000000000beef'), null);
  assert.equal(await pricing.resolveCoingeckoId(eth, '0xdead00000000000000000000000000000000beef'), null);
  assert.equal(calls.length, 2); // pas de nouvel appel pendant 7 jours
  advance(8 * 24 * 3600 * 1000);
  await pricing.resolveCoingeckoId(eth, '0xdead00000000000000000000000000000000beef');
  assert.equal(calls.length, 3);
});

test('prix actuels en USD et EUR, en cache 5 minutes', async () => {
  const { pricing, calls } = setup([
    ['/simple/price', () => jsonResponse({ ethereum: { usd: 2400.5, eur: 2200.25 } })],
  ]);
  assert.deepEqual(await pricing.currentPrices(['ethereum']), { ethereum: { usd: '2400.5', eur: '2200.25' } });
  await pricing.currentPrices(['ethereum']);
  assert.equal(calls.length, 1);
});
