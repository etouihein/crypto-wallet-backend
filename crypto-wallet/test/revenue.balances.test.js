'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBalances } = require('../src/revenue/balances');
const { NATIVE_TOKEN } = require('../src/revenue/chains');

const FEE = '0x1111111111111111111111111111111111111111';
const USDC = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PAS_UN_CONTRAT = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CHAIN = { chainId: 1, name: 'Ethereum', rpcUrl: 'https://rpc.test', nativeSymbol: 'ETH', nativeCoingeckoId: 'ethereum' };

// Fausse base : inbound_transfers donne USDC (connu), quote_events donne une
// adresse qui n'est pas un contrat (decimals inconnus).
function fakeDb() {
  return {
    prepare: (sql) => ({
      all: () => (sql.includes('inbound_transfers')
        ? [{ token_address: USDC, token_symbol: 'USDC', token_decimals: 6 }]
        : [{ token_address: PAS_UN_CONTRAT }]),
    }),
  };
}

// Faux nœud : une adresse sans code répond "0x" à tout eth_call (comme un vrai nœud).
const rpc = {
  call: async (url, method, params) => {
    if (method === 'eth_getBalance') return '0xde0b6b3a7640000'; // 1 ETH
    const { to, data } = params[0];
    if (to === PAS_UN_CONTRAT) return '0x';
    if (data.startsWith('0x70a08231')) return '0x' + (2500000).toString(16).padStart(64, '0'); // 2,5 USDC
    throw new Error('appel inattendu ' + data);
  },
};
const pricing = { resolveCoingeckoId: async () => null, currentPrices: async () => ({}) };

test('un token qui n\'est pas un contrat ("0x") est ignoré sans effacer les autres soldes de la chaîne', async () => {
  const { get } = createBalances({ db: fakeDb(), rpc, pricing, feeAddress: FEE, chains: [CHAIN] });
  const { chains } = await get();
  assert.equal(chains.length, 1);
  assert.equal(chains[0].error, null);
  const tokens = chains[0].lines.map((l) => l.token);
  assert.deepEqual(tokens, [NATIVE_TOKEN, USDC]);
  assert.equal(chains[0].lines[0].amount, '1');
  assert.equal(chains[0].lines[1].amount, '2.5');
});

test('si le solde natif ne peut pas être lu, la chaîne garde son message d\'erreur', async () => {
  const brokenRpc = { call: async () => { throw new Error('noeud indisponible'); } };
  const { get } = createBalances({ db: fakeDb(), rpc: brokenRpc, pricing, feeAddress: FEE, chains: [CHAIN] });
  const { chains } = await get();
  assert.equal(chains[0].error, 'noeud indisponible');
  assert.deepEqual(chains[0].lines, []);
});

test('une vraie panne du nœud sur un token reste une erreur visible (le solde n\'est pas caché en silence)', async () => {
  const flakyRpc = {
    call: async (url, method, params) => {
      if (method === 'eth_getBalance') return '0x0';
      if (params[0].to === USDC) throw new Error('timeout du noeud');
      return '0x';
    },
  };
  const { get } = createBalances({ db: fakeDb(), rpc: flakyRpc, pricing, feeAddress: FEE, chains: [CHAIN] });
  const { chains } = await get();
  assert.equal(chains[0].error, 'timeout du noeud');
});
