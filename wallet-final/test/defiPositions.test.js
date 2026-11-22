'use strict';
// wallet-final/test/defiPositions.test.js : positions DeFi (lib/defiPositions.js).
// Seules les positions avec un solde > 0 s'affichent ; un appel rate ne fait
// pas planter l'ecran. lib/wallet (reseau) est remplace par un faux.
const test = require('node:test');
const assert = require('node:assert/strict');

let reponse = async () => ({ balance: '1.5', symbol: 'stETH' });
const appels = [];
const cheminWallet = require.resolve('../lib/wallet');
require.cache[cheminWallet] = { id: cheminWallet, filename: cheminWallet, loaded: true, exports: {
  getCustomTokenInfo: async (...args) => { appels.push(args); return reponse(...args); },
} };
const { getDefiPositions, KNOWN_POSITIONS } = require('../lib/defiPositions');

test('position Lido stETH : contrat officiel sur Ethereum', () => {
  const lido = KNOWN_POSITIONS.find((p) => p.id === 'lido-steth');
  assert.equal(lido.tokenAddress, '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84');
  assert.equal(lido.network, 'ethereum');
});

test('solde > 0 : la position s affiche avec son solde ; adresse transmise telle quelle', async () => {
  appels.length = 0;
  const r = await getDefiPositions('0xabc');
  assert.equal(r.length, 1);
  assert.equal(r[0].balance, '1.5');
  assert.equal(r[0].symbol, 'stETH');
  assert.deepEqual(appels[0], ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', '0xabc', 'ethereum']);
});

test('solde nul, illisible ou appel rate : rien ne s affiche, sans plantage', async () => {
  for (const r of [async () => ({ balance: '0.0' }), async () => ({ balance: 'abc' }), async () => { throw new Error('RPC'); }]) {
    reponse = r;
    assert.deepEqual(await getDefiPositions('0xabc'), []);
  }
  assert.deepEqual(await getDefiPositions(''), []);
});
