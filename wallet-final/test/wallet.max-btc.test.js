'use strict';
// wallet-final/test/wallet.max-btc.test.js : bouton MAX en Bitcoin. Le maximum
// calcule doit pouvoir etre envoye TEL QUEL (frais deduits), sans "Fonds BTC
// insuffisants" ; trop peu de BTC = 0. Reseau simule, phrase de test publique.
const test = require('node:test');
const assert = require('node:assert/strict');
const bitcoin = require('bitcoinjs-lib');
const localWallet = require('../lib/wallet');
const { montantVersTexte } = require('../lib/saisie');

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

test('MAX BTC : envoyable tel quel, tout le solde part moins les frais', async () => {
  const utxos = [{ txid: '11'.repeat(32), vout: 0, value: 150000 }, { txid: '22'.repeat(32), vout: 1, value: 50000 }];
  await avecReseau(utxos, 5, async () => {
    const max = await localWallet.getBitcoinMaxSendable(MNEMONIC);
    const fraisMax = Math.ceil((10 + 2 * 68 + 2 * 31) * 6);
    assert.equal(Math.round(max * 1e8), 200000 - fraisMax);
    const { rawTx } = await localWallet.signBitcoinTransferTx({ mnemonic: MNEMONIC, to: DEST, amountBtc: montantVersTexte(max, 8) });
    const tx = bitcoin.Transaction.fromHex(rawTx);
    assert.equal(tx.ins.length, 2, 'toutes les pieces sont depensees');
    assert.equal(tx.outs.length, 1, 'pas de monnaie rendue : tout part');
    assert.equal(tx.outs[0].value, BigInt(200000 - fraisMax));
  });
});

test('MAX BTC : solde trop faible pour les frais, ou aucun BTC -> 0', async () => {
  await avecReseau([{ txid: '11'.repeat(32), vout: 0, value: 1200 }], 5, async () => {
    assert.equal(await localWallet.getBitcoinMaxSendable(MNEMONIC), 0);
  });
  await avecReseau([], 5, async () => {
    assert.equal(await localWallet.getBitcoinMaxSendable(MNEMONIC), 0);
  });
});
