'use strict';
// wallet-final/test/staking.montant.test.js
// ─────────────────────────────────────────────────────────────────
//  Montant d'un stake Solana (lib/wallet.js createAndDelegateStake) :
//  lu au lamport pres, comme les envois. Avant le 24/11/2026,
//  parseFloat("1,5") stakait 1 SOL et parseFloat("0x10") stakait 0 SOL
//  (seule la reserve de loyer partait). Reseau simule.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { Connection, Transaction, SystemInstruction, StakeProgram } = require('@solana/web3.js');
const localWallet = require('../lib/wallet');

const MNEMONIC = 'test test test test test test test test test test test junk';
const VALIDATEUR = '8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p';
const LOYER = 2_282_880;

async function avecReseauSimule(fn) {
  const { getBalance, getLatestBlockhash, getMinimumBalanceForRentExemption } = Connection.prototype;
  Connection.prototype.getBalance = async () => 5_000_000_000; // 5 SOL
  Connection.prototype.getLatestBlockhash = async () => ({ blockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi', lastValidBlockHeight: 1 });
  Connection.prototype.getMinimumBalanceForRentExemption = async () => LOYER;
  try { return await fn(); } finally {
    Connection.prototype.getBalance = getBalance;
    Connection.prototype.getLatestBlockhash = getLatestBlockhash;
    Connection.prototype.getMinimumBalanceForRentExemption = getMinimumBalanceForRentExemption;
  }
}

function lamportsDuStake(rawTx) {
  const tx = Transaction.from(Buffer.from(rawTx, 'base64'));
  const creation = tx.instructions[0];
  return SystemInstruction.decodeCreateWithSeed(creation).lamports;
}

test('stake : montant au lamport pres (montant + reserve de loyer)', async () => {
  await avecReseauSimule(async () => {
    const r1 = await localWallet.createAndDelegateStake({ mnemonic: MNEMONIC, votePubkey: VALIDATEUR, amountSol: '1.5' });
    assert.equal(lamportsDuStake(r1.rawTx), 1_500_000_000 + LOYER);
    const r2 = await localWallet.createAndDelegateStake({ mnemonic: MNEMONIC, votePubkey: VALIDATEUR, amountSol: '0.123456789' });
    assert.equal(lamportsDuStake(r2.rawTx), 123_456_789 + LOYER);
    const tx = Transaction.from(Buffer.from(r2.rawTx, 'base64'));
    assert.ok(tx.instructions[1].programId.equals(StakeProgram.programId), 'delegation presente');
  });
});

test('stake : "1,5", "0x10", "0", "abc" ou trop de decimales sont refuses (plus de stake tronque ou vide)', async () => {
  await avecReseauSimule(async () => {
    for (const mauvais of ['1,5', '0x10', '0', '0.0', 'abc', '', '-1', '1e3', '0.1234567891']) {
      await assert.rejects(
        localWallet.createAndDelegateStake({ mnemonic: MNEMONIC, votePubkey: VALIDATEUR, amountSol: mauvais }),
        /Montant invalide/, JSON.stringify(mauvais));
    }
  });
});

test('stake : solde insuffisant toujours refuse (montant + loyer)', async () => {
  await avecReseauSimule(async () => {
    await assert.rejects(
      localWallet.createAndDelegateStake({ mnemonic: MNEMONIC, votePubkey: VALIDATEUR, amountSol: '5' }),
      /insuffisants/);
  });
});
