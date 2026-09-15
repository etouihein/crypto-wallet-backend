'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { openRevenueDb } = require('../src/revenue/db');
const { recordSwapQuote, recordBridgeQuote, attachBroadcast, ATTACH_WINDOW_MS } = require('../src/revenue/intents');
const { NATIVE_TOKEN } = require('../src/revenue/chains');

const SECRET = 's'.repeat(40);
// Clé de test fixe, sans aucun fonds : sert uniquement à produire de vraies transactions signées.
const wallet = new ethers.Wallet('0x' + '11'.repeat(32));
const ALLOWANCE_HOLDER = '0x0000000000001fF3684f28c67538d4D072C22734';
const LIFI = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE_0X = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const swapQuote = {
  buyAmount: '420000000000000',
  fees: { integratorFee: { amount: '3165000000000', token: NATIVE_0X } },
  transaction: { to: ALLOWANCE_HOLDER, data: '0xdeadbeef01' },
};

function sign(data, chainId) {
  return wallet.signTransaction({ to: ALLOWANCE_HOLDER, data, value: 0, gasLimit: 210000, gasPrice: 1, nonce: 0, chainId });
}

test('un devis de swap est enregistré sans aucune donnée personnelle en clair', () => {
  const db = openRevenueDb(':memory:');
  const id = recordSwapQuote(db, { chainId: 1, sellToken: USDC, buyToken: NATIVE_0X, sellAmount: '1000000', taker: wallet.address, quote: swapQuote, feeBps: 75, now: 1000, secret: SECRET });
  const row = db.prepare('SELECT * FROM quote_events WHERE id = ?').get(id);
  assert.equal(row.type, 'swap');
  assert.equal(row.token_in, USDC.toLowerCase());
  assert.equal(row.token_out, NATIVE_TOKEN);
  assert.equal(row.expected_fee_amount, '3165000000000');
  assert.equal(row.expected_fee_token, NATIVE_TOKEN);
  assert.equal(row.tx_to, ALLOWANCE_HOLDER.toLowerCase());
  assert.match(row.user_hash, /^[0-9a-f]{64}$/);
  assert.match(row.calldata_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(row).toLowerCase().includes(wallet.address.slice(2).toLowerCase()), "l'adresse ne doit apparaître nulle part");
  db.close();
});

test('sans secret HMAC, rien n\'est enregistré', () => {
  const db = openRevenueDb(':memory:');
  assert.equal(recordSwapQuote(db, { chainId: 1, sellToken: USDC, buyToken: NATIVE_0X, sellAmount: '1', taker: wallet.address, quote: swapQuote, feeBps: 75, secret: '' }), null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM quote_events').get().n, 0);
  db.close();
});

test('la commission attendue d\'un pont vaut exactement 0,25 % du montant envoyé', () => {
  const db = openRevenueDb(':memory:');
  const id = recordBridgeQuote(db, {
    fromChain: 1, toChain: 42161, fromAddress: wallet.address, fromAmount: '1000000000000000',
    quote: { estimate: { toAmount: '995000000000000' }, transactionRequest: { to: LIFI, data: '0xcafe01' } },
    fee: 0.0025, now: 1000, secret: SECRET,
  });
  const row = db.prepare('SELECT * FROM quote_events WHERE id = ?').get(id);
  assert.equal(row.expected_fee_amount, '2500000000000');
  assert.equal(row.expected_fee_token, NATIVE_TOKEN);
  assert.equal(row.fee_bps, 25);
  assert.equal(row.dest_chain_id, 42161);
  assert.equal(row.tx_to, LIFI.toLowerCase());
  db.close();
});

test('la transaction signée diffusée est rattachée au bon devis, une seule fois', async () => {
  const db = openRevenueDb(':memory:');
  const id = recordSwapQuote(db, { chainId: 1, sellToken: USDC, buyToken: NATIVE_0X, sellAmount: '1000000', taker: wallet.address, quote: swapQuote, feeBps: 75, now: 1000, secret: SECRET });
  const raw = await sign('0xdeadbeef01', 1);
  assert.equal(attachBroadcast(db, { rawTx: raw, txHash: '0xABC', now: 61000 }), id);
  assert.equal(db.prepare('SELECT tx_hash FROM quote_events WHERE id = ?').get(id).tx_hash, '0xabc');
  assert.equal(attachBroadcast(db, { rawTx: raw, txHash: '0xDEF', now: 62000 }), null); // déjà rattaché
  db.close();
});

test('pas de rattachement si la chaîne, les données ou la fenêtre de temps ne correspondent pas', async () => {
  const db = openRevenueDb(':memory:');
  recordSwapQuote(db, { chainId: 1, sellToken: USDC, buyToken: NATIVE_0X, sellAmount: '1000000', taker: wallet.address, quote: swapQuote, feeBps: 75, now: 0, secret: SECRET });
  assert.equal(attachBroadcast(db, { rawTx: await sign('0xdeadbeef01', 56), txHash: '0x1', now: 1000 }), null); // autre chaîne
  assert.equal(attachBroadcast(db, { rawTx: await sign('0xdeadbeef02', 1), txHash: '0x2', now: 1000 }), null); // autres données
  assert.equal(attachBroadcast(db, { rawTx: await sign('0xdeadbeef01', 1), txHash: '0x3', now: ATTACH_WINDOW_MS + 1 }), null); // trop tard
  assert.equal(attachBroadcast(db, { rawTx: '0xnot-a-tx', txHash: '0x4', now: 1000 }), null); // illisible
  db.close();
});
