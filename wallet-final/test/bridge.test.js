'use strict';
// wallet-final/test/bridge.test.js
// ─────────────────────────────────────────────────────────────────
//  Devis de pont (lib/bridge.js) : seuls l'ETH entre Ethereum,
//  Arbitrum, Optimism et Base est autorise ; le devis passe par le
//  serveur NexiaWallet (jamais LI.FI en direct, la commission est
//  ajoutee cote serveur). axios est remplace par un faux en Node.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');

const appels = [];
let reponse = async () => ({ data: { success: true, quote: { id: 'q1' } } });
const fauxAxios = { get: async (url, opts) => { appels.push({ url, opts }); return reponse(url, opts); } };
const cheminAxios = require.resolve('axios');
require.cache[cheminAxios] = { id: cheminAxios, filename: cheminAxios, loaded: true, exports: fauxAxios };

const { getBridgeQuote, CHAIN_IDS } = require('../lib/bridge');

const BASE = { fromAddress: '0x1111111111111111111111111111111111111111', amountWei: '1000000000000000', apiBase: 'https://api.exemple', apiHeaders: { 'x-app': 'nexia' } };

test.beforeEach(() => {
  appels.length = 0;
  reponse = async () => ({ data: { success: true, quote: { id: 'q1' } } });
});

test('pont : seuls Ethereum, Arbitrum, Optimism et Base sont proposes', () => {
  assert.deepEqual(CHAIN_IDS, { ethereum: 1, arbitrum: 42161, optimism: 10, base: 8453 });
});

test('pont : un reseau non supporte est refuse sans appeler le serveur', async () => {
  for (const [fromNetwork, toNetwork] of [['bsc', 'base'], ['ethereum', 'polygon'], ['solana', 'ethereum'], [undefined, 'base'], ['toString', 'base']]) {
    await assert.rejects(getBridgeQuote({ ...BASE, fromNetwork, toNetwork }), /non supporté/);
  }
  assert.equal(appels.length, 0);
});

test('pont : le meme reseau au depart et a l\'arrivee est refuse sans appel', async () => {
  await assert.rejects(getBridgeQuote({ ...BASE, fromNetwork: 'base', toNetwork: 'base' }), /deux réseaux différents/);
  assert.equal(appels.length, 0);
});

test('pont : la demande passe par le serveur NexiaWallet avec les bons parametres', async () => {
  const quote = await getBridgeQuote({ ...BASE, fromNetwork: 'arbitrum', toNetwork: 'optimism' });
  assert.deepEqual(quote, { id: 'q1' });
  assert.equal(appels.length, 1);
  const { url, opts } = appels[0];
  assert.equal(url, 'https://api.exemple/bridge/quote');
  assert.deepEqual(opts.params, { fromChain: 42161, toChain: 10, fromAddress: BASE.fromAddress, fromAmount: BASE.amountWei });
  assert.deepEqual(opts.headers, BASE.apiHeaders);
  assert.ok(opts.timeout > 0, 'un delai maximum est fixe');
  // aucune commission ni cle LI.FI envoyee par l'app : c'est le serveur qui les ajoute
  assert.equal('fee' in opts.params || 'integrator' in opts.params, false);
});

test('pont : une reponse sans devis donne le message du serveur', async () => {
  reponse = async () => ({ data: { success: false, error: 'Aucune route de pont disponible pour ce montant.' } });
  await assert.rejects(getBridgeQuote({ ...BASE, fromNetwork: 'ethereum', toNetwork: 'base' }), /Aucune route de pont disponible/);
});

test('pont : une reponse vide ou "success" sans devis est refusee avec un message clair', async () => {
  for (const data of [undefined, null, {}, { success: true }, { success: true, quote: null }]) {
    reponse = async () => ({ data });
    await assert.rejects(getBridgeQuote({ ...BASE, fromNetwork: 'ethereum', toNetwork: 'base' }), /Impossible de récupérer une route de pont/);
  }
});
