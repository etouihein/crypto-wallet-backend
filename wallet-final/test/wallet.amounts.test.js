'use strict';
// wallet-final/test/wallet.amounts.test.js
// ─────────────────────────────────────────────────────────────────
//  Montants des envois Bitcoin et Solana (lib/wallet.js). Le montant est
//  lu au satoshi / lamport pres ; tout ce qui n'est pas un nombre propre
//  ("1,5", "0.001abc", "1 000") est REFUSE au lieu d'etre tronque (avant :
//  parseFloat("1,5") = 1, on envoyait 1 BTC au lieu de 1,5). Reseau simule.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const bitcoin = require('bitcoinjs-lib');
const { Connection, Transaction, SystemProgram } = require('@solana/web3.js');
const localWallet = require('../lib/wallet');

const MNEMONIC = 'test test test test test test test test test test test junk';
const DEST_BTC = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const DEST_SOL = '8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p';

test('lecture stricte d un montant : unites exactes, refus de tout le reste', () => {
  const p = localWallet.parseAmountUnits;
  assert.equal(p('0.001', 8), 100000n);
  assert.equal(p(' 1.5 ', 8), 150000000n);
  assert.equal(p('2', 9), 2000000000n);
  assert.equal(p(0.1, 8), 10000000n);
  assert.equal(p('.5', 8), 50000000n);
  assert.equal(p('0.123456789', 9), 123456789n);
  for (const mauvais of ['1,5', '0.001abc', '1 000', 'abc', '', '-1', '1e3', '1.2.3', NaN, Infinity, null, undefined, '0.123456789']) {
    assert.throws(() => p(mauvais, 8), /Montant invalide/, String(mauvais));
  }
});

test('Bitcoin : "1,5" n envoie plus 1 BTC ; montant nul ou sous le minimum du reseau refuse', async () => {
  const vraiFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/utxo')) return new Response(JSON.stringify([{ txid: '11'.repeat(32), vout: 0, value: 300000000 }]));
    if (u.endsWith('/fee-estimates')) return new Response(JSON.stringify({ 6: 5 }));
    throw new Error(`appel inattendu ${u}`);
  };
  try {
    for (const mauvais of ['1,5', '0.001abc', '0', '0.00000100']) {
      await assert.rejects(localWallet.signBitcoinTransferTx({ mnemonic: MNEMONIC, to: DEST_BTC, amountBtc: mauvais }), /Montant/, mauvais);
    }
    const { rawTx } = await localWallet.signBitcoinTransferTx({ mnemonic: MNEMONIC, to: DEST_BTC, amountBtc: '1.5' });
    assert.equal(bitcoin.Transaction.fromHex(rawTx).outs[0].value, 150000000n);
  } finally { global.fetch = vraiFetch; }
});

test('Solana : montant au lamport pres ; "1,5", nul ou illisible refuse', async () => {
  const { getBalance, getLatestBlockhash, getMinimumBalanceForRentExemption } = Connection.prototype;
  Connection.prototype.getBalance = async () => 5_000_000_000;
  Connection.prototype.getMinimumBalanceForRentExemption = async () => 890880;
  Connection.prototype.getLatestBlockhash = async () => ({ blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi', lastValidBlockHeight: 1 });
  try {
    for (const mauvais of ['1,5', 'abc', '0', '-2']) {
      await assert.rejects(localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: mauvais }), /Montant/, mauvais);
    }
    const { rawTx } = await localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: '0.123456789' });
    const tx = Transaction.from(Buffer.from(rawTx, 'base64'));
    const ins = tx.instructions[0];
    assert.ok(ins.programId.equals(SystemProgram.programId));
    // transfert systeme : 4 octets d'index puis lamports en u64 little-endian
    assert.equal(ins.data.readBigUInt64LE(4), 123456789n);
    await assert.rejects(localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: '6' }), /insuffisants/);
  } finally {
    Connection.prototype.getBalance = getBalance;
    Connection.prototype.getLatestBlockhash = getLatestBlockhash;
    Connection.prototype.getMinimumBalanceForRentExemption = getMinimumBalanceForRentExemption;
  }
});

test('Solana : envoi qui laisserait le compte sous son minimum, ou trop petit vers une adresse vide -> refuse AVANT de signer', async () => {
  const { getBalance, getLatestBlockhash, getMinimumBalanceForRentExemption } = Connection.prototype;
  const MOI = localWallet.getSolanaAddress(MNEMONIC);
  let soldeDest = 0;
  Connection.prototype.getBalance = async (cle) => (cle.toBase58() === MOI ? 1_000_000_000 : soldeDest);
  Connection.prototype.getLatestBlockhash = async () => ({ blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi', lastValidBlockHeight: 1 });
  Connection.prototype.getMinimumBalanceForRentExemption = async () => 890880;
  try {
    // ancien MAX : 1 SOL - 0,00001 -> il resterait 5 000 lamports
    soldeDest = 5_000_000_000;
    await assert.rejects(localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: '0.99999' }), /refuse de laisser un compte/);
    // nouveau MAX : tout moins les frais exacts -> accepte
    await localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: '0.999995' });
    // adresse vide, 0,0005 SOL : refuse ; 0,001 SOL : accepte
    soldeDest = 0;
    await assert.rejects(localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: '0.0005' }), /adresse Solana est vide/);
    await localWallet.signSolanaTransferTx({ mnemonic: MNEMONIC, to: DEST_SOL, amountSol: '0.001' });
  } finally {
    Connection.prototype.getBalance = getBalance;
    Connection.prototype.getLatestBlockhash = getLatestBlockhash;
    Connection.prototype.getMinimumBalanceForRentExemption = getMinimumBalanceForRentExemption;
  }
});
