'use strict';
// Source Alchemy (Base, Polygon) : lecture des transferts recus par l'adresse de commission.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAlchemySource } = require('../src/revenue/sources/alchemy');
const { NATIVE_TOKEN } = require('../src/revenue/chains');

const FEE = '0xfd749d841fff1f87e81d58e4a186261e62fbcbcc';
const BASE = { chainId: 8453, key: 'base', name: 'Base', nativeSymbol: 'ETH', alchemyNetwork: 'base-mainnet' };

function source(pages, appels = []) {
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    appels.push({ url, body });
    if (body.method === 'eth_getTransactionByHash') return new Response(JSON.stringify({ result: { to: '0xABCDEF0000000000000000000000000000000001' } }));
    const page = body.params[0].pageKey ? pages[1] : pages[0];
    return new Response(JSON.stringify({ result: page }));
  };
  return createAlchemySource({ fetchImpl, apiKey: 'cle-test', sleep: async () => {} });
}

const T = (o) => ({ blockNum: '0x10', from: '0xAAA', to: FEE, metadata: { blockTimestamp: '2026-11-20T10:00:00.000Z' }, ...o });

test('natif, interne et ERC-20 recus sont normalises comme les autres sources', async () => {
  const appels = [];
  const src = source([{ transfers: [
    T({ category: 'external', hash: '0xH1', uniqueId: '0xh1:external', rawContract: { value: '0x0de0b6b3a7640000', address: null, decimal: '0x12' } }),
    T({ category: 'internal', hash: '0xH2', uniqueId: '0xh2:internal:0', rawContract: { value: '0x01', address: null, decimal: '0x12' } }),
    T({ category: 'internal', hash: '0xH2', uniqueId: '0xh2:internal:1', rawContract: { value: '0x02', address: null, decimal: '0x12' } }),
    T({ category: 'erc20', hash: '0xH3', uniqueId: '0xh3:log:7', asset: 'USDC', rawContract: { value: '0x0f4240', address: '0xUSDC', decimal: '0x6' } }),
  ] }], appels);
  const out = await src.fetch('all', BASE, FEE, 0, 100);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { chain_id: 8453, tx_hash: '0xh1', kind: 'native', sub_index: '0', block_number: 16, block_time: 1795168800,
    from_address: '0xaaa', token_address: NATIVE_TOKEN, token_symbol: 'ETH', token_decimals: 18, amount_raw: '1000000000000000000' });
  assert.deepEqual(out.slice(1, 3).map((r) => r.sub_index), ['ord-0', 'ord-1'], 'deux internes dans la meme transaction : identifiants distincts');
  assert.equal(out[3].sub_index, '7', 'ERC-20 : logIndex tire de uniqueId');
  assert.equal(out[3].amount_raw, '1000000');
  assert.equal(out[3].token_decimals, 6);
  assert.match(appels[0].url, /^https:\/\/base-mainnet\.g\.alchemy\.com\/v2\/cle-test$/);
  assert.deepEqual(appels[0].body.params[0].category, ['external', 'internal', 'erc20']);
  assert.equal(appels[0].body.params[0].toAddress, FEE);
});

test('pagination par pageKey, et transferts sortants ou nuls ignores', async () => {
  const src = source([
    { transfers: [T({ category: 'external', hash: '0xA', rawContract: { value: '0x05' } })], pageKey: 'suite' },
    { transfers: [
      T({ category: 'external', hash: '0xB', rawContract: { value: '0x06' } }),
      T({ category: 'external', hash: '0xC', to: '0xautre', rawContract: { value: '0x07' } }),
      T({ category: 'external', hash: '0xD', rawContract: { value: '0x0' } }),
    ] },
  ]);
  const out = await src.fetch('all', BASE, FEE, 0, 100);
  assert.deepEqual(out.map((r) => r.tx_hash), ['0xa', '0xb']);
});

test('contrat vise par une transaction (pour reconnaitre une commission LI.FI / 0x)', async () => {
  assert.equal(await source([{ transfers: [] }]).getTransactionTarget(BASE, '0xH'), '0xabcdef0000000000000000000000000000000001');
});

test('non configuree sans cle ou sans reseau Alchemy', () => {
  assert.equal(createAlchemySource({ apiKey: '' }).isConfigured(BASE), false);
  assert.equal(createAlchemySource({ apiKey: 'k' }).isConfigured({ ...BASE, alchemyNetwork: undefined }), false);
  assert.equal(createAlchemySource({ apiKey: 'k' }).isConfigured(BASE), true);
});

test('avec ALCHEMY_API_KEY, Base et Polygon passent par Alchemy ; les autres ne changent pas', () => {
  const chemin = require.resolve('../src/revenue/chains');
  const avant = process.env.ALCHEMY_API_KEY;
  delete require.cache[chemin];
  process.env.ALCHEMY_API_KEY = 'k';
  try {
    const { CHAINS } = require('../src/revenue/chains');
    const s = Object.fromEntries(CHAINS.map((c) => [c.key, c.source]));
    assert.deepEqual(s, { ethereum: 'blockscout', bsc: 'nodereal', polygon: 'alchemy', arbitrum: 'blockscout', optimism: 'blockscout', base: 'alchemy' });
  } finally {
    if (avant === undefined) delete process.env.ALCHEMY_API_KEY; else process.env.ALCHEMY_API_KEY = avant;
    delete require.cache[chemin];
    require('../src/revenue/chains');
  }
});
