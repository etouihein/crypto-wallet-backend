'use strict';
// wallet-final/test/wallet.frais-btc.test.js
// ─────────────────────────────────────────────────────────────────
//  Envoi BTC : les frais affiches dans l'ecran de confirmation doivent etre
//  ceux que la transaction signee paiera vraiment, meme quand le wallet a
//  beaucoup de petites pieces (UTXO). Reseau simule, phrase de test publique.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bitcoin = require('bitcoinjs-lib');
const localWallet = require('../lib/wallet');

const MNEMONIC = 'test test test test test test test test test test test junk';
const DEST = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

async function avecReseau(utxos, frais, fn) {
  const vrai = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/utxo')) return new Response(JSON.stringify(utxos));
    if (u.endsWith('/fee-estimates')) return new Response(JSON.stringify({ 6: frais }));
    throw new Error(`appel inattendu ${u}`);
  };
  try { return await fn(); } finally { global.fetch = vrai; }
}

// Frais reellement payes = somme des pieces depensees - somme des sorties.
function fraisPayes(rawTx, utxos) {
  const tx = bitcoin.Transaction.fromHex(rawTx);
  const parId = new Map(utxos.map(u => [`${u.txid}:${u.vout}`, u.value]));
  const entrees = tx.ins.reduce((s, i) => s + parId.get(`${Buffer.from(i.hash).reverse().toString('hex')}:${i.index}`), 0);
  const sorties = tx.outs.reduce((s, o) => s + Number(o.value), 0);
  return { frais: entrees - sorties, nbEntrees: tx.ins.length };
}

const pieces = (n, valeur) => Array.from({ length: n }, (_, i) => ({ txid: String(i + 1).padStart(2, '0').repeat(32), vout: 0, value: valeur }));


test('5 petites pieces : frais affiches = frais payes (et bien plus que l\'ancienne estimation a 1 piece)', async () => {
  const utxos = pieces(5, 20000);
  await avecReseau(utxos, 10, async () => {
    const est = await localWallet.estimateBitcoinTransferFee({ fromAddress: 'bc1qtest', amountBtc: '0.0009' });
    const { rawTx } = await localWallet.signBitcoinTransferTx({ mnemonic: MNEMONIC, to: DEST, amountBtc: '0.0009' });
    const reel = fraisPayes(rawTx, utxos);
    assert.equal(est.ok, true);
    assert.equal(est.inputs, reel.nbEntrees);
    assert.equal(est.feeSats, reel.frais);
    const ancienneEstimation = Math.ceil((10 + 68 + 2 * 31) * 10);
    assert.ok(reel.frais > 2 * ancienneEstimation, `reel ${reel.frais} vs ancien affichage ${ancienneEstimation}`);
  });
});

test('petite monnaie (<= 546 sats) laissee aux mineurs : comptee dans les frais affiches', async () => {
  const utxos = pieces(1, 100000);
  await avecReseau(utxos, 2, async () => {
    // 100000 - 280 de frais - 99300 envoyes = 420 sats de monnaie : trop peu, laisses en frais.
    const est = await localWallet.estimateBitcoinTransferFee({ fromAddress: 'bc1qtest', amountBtc: '0.000993' });
    const { rawTx } = await localWallet.signBitcoinTransferTx({ mnemonic: MNEMONIC, to: DEST, amountBtc: '0.000993' });
    assert.equal(est.feeSats, fraisPayes(rawTx, utxos).frais);
    assert.equal(est.feeSats, 700);
  });
});

test('une grosse piece suffit : frais d\'une seule entree, monnaie rendue', async () => {
  const utxos = [...pieces(3, 5000), { txid: 'ab'.repeat(32), vout: 2, value: 500000 }];
  await avecReseau(utxos, 7, async () => {
    const est = await localWallet.estimateBitcoinTransferFee({ fromAddress: 'bc1qtest', amountBtc: '0.001' });
    const { rawTx } = await localWallet.signBitcoinTransferTx({ mnemonic: MNEMONIC, to: DEST, amountBtc: '0.001' });
    assert.equal(est.inputs, 1);
    assert.equal(est.feeSats, fraisPayes(rawTx, utxos).frais);
  });
});

test('solde insuffisant -> ok false, sans planter', async () => {
  await avecReseau(pieces(2, 1000), 5, async () => {
    const est = await localWallet.estimateBitcoinTransferFee({ fromAddress: 'bc1qtest', amountBtc: '0.01' });
    assert.equal(est.ok, false);
  });
  await avecReseau([], 5, async () => {
    assert.equal((await localWallet.estimateBitcoinTransferFee({ fromAddress: 'bc1qtest', amountBtc: '0.01' })).ok, false);
  });
});

test('App.js : l\'ecran de confirmation BTC utilise estimateBitcoinTransferFee', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(src, /localWallet\.estimateBitcoinTransferFee\(\{ fromAddress: bitcoinAddr, amountBtc: sendAmount \}\)/);
});
