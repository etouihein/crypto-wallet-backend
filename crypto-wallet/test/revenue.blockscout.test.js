'use strict';

// Normalisation Blockscout sur de VRAIES réponses de l'adresse de collecte
// (données publiques on-chain, test/fixtures/). On y voit exactement le bruit
// à écarter : poussière d'empoisonnement, faux jetons, transferts à valeur nulle.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createBlockscoutSource } = require('../src/revenue/sources/blockscout');
const { getChain, NATIVE_TOKEN } = require('../src/revenue/chains');

const FEE = '0xfd749d841fff1f87e81d58e4a186261e62fbcbcc';
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

function source() {
  const fetchImpl = async (url) => {
    const u = String(url);
    let body;
    if (u.includes('action=txlistinternal')) body = fixture('blockscout_eth_txlistinternal.json');
    else if (u.includes('action=txlist')) body = fixture('blockscout_eth_txlist.json');
    else if (u.includes('/api/v2/addresses/')) body = fixture('blockscout_eth_token_transfers_v2.json');
    else throw new Error(`URL inattendue ${u}`);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return createBlockscoutSource({ fetchImpl, sleep: async () => {}, apiKey: '' });
}

test('natif : seuls les envois entrants, réussis et non nuls sont gardés', async () => {
  const raw = fixture('blockscout_eth_txlist.json').result;
  const expected = raw.filter((t) => t.to?.toLowerCase() === FEE && t.value !== '0' && t.isError !== '1' && t.txreceipt_status !== '0');
  const out = await source().fetch('native', getChain(1), FEE, 0, 99999999);
  assert.ok(raw.length > out.length, 'la donnée réelle contient bien du bruit à écarter');
  assert.equal(out.length, expected.length);
  for (const t of out) {
    assert.equal(t.kind, 'native');
    assert.equal(t.sub_index, '0');
    assert.equal(t.token_address, NATIVE_TOKEN);
    assert.match(t.amount_raw, /^[1-9]\d*$/);
  }
});

test('internes : les 13 transferts réels (poussière de 1 gwei) sont gardés avec leur index de trace', async () => {
  const raw = fixture('blockscout_eth_txlistinternal.json').result.filter((t) => t.to?.toLowerCase() === FEE);
  assert.equal(raw.length, 13);
  assert.ok(raw.every((t) => t.value === '1000000000'), 'poussière d\'empoisonnement : exactement 1 gwei chacun');
  const out = await source().fetch('internal', getChain(1), FEE, 0, 99999999);
  assert.equal(out.length, 13);
  for (const t of out) {
    const original = raw.find((r) => r.transactionHash.toLowerCase() === t.tx_hash && String(r.index) === t.sub_index);
    assert.ok(original, `index de trace conservé pour ${t.tx_hash}`);
    assert.equal(t.kind, 'internal');
    assert.equal(t.amount_raw, '1000000000');
  }
});

test('ERC-20 : le logIndex réel sert d\'identifiant unique', async () => {
  const items = fixture('blockscout_eth_token_transfers_v2.json').items;
  const out = await source().fetch('erc20', getChain(1), FEE, 0, 99999999);
  const positive = items.filter((i) => /^[1-9]\d*$/.test(String(i.total?.value)));
  assert.equal(out.length, positive.length);
  const first = out.find((t) => t.tx_hash === String(positive[0].transaction_hash).toLowerCase());
  assert.equal(first.sub_index, String(positive[0].log_index));
  assert.equal(first.token_decimals, Number(positive[0].total.decimals));
  assert.equal(first.amount_raw, String(positive[0].total.value));
  const keys = new Set(out.map((t) => `${t.tx_hash}:${t.sub_index}`));
  assert.equal(keys.size, out.length, 'aucune collision de clé unique');
});

test('ERC-20 : la plage de blocs est respectée', async () => {
  assert.deepEqual(await source().fetch('erc20', getChain(1), FEE, 999999999, 1999999999), []);
});
