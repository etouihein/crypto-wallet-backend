'use strict';
// wallet-final/test/dapp.selecteur-majuscules.test.js
// ─────────────────────────────────────────────────────────────────
//  Un calldata ecrit en MAJUSCULES ("0x095EA7B3...") est signe
//  exactement comme le meme en minuscules : c'est la meme transaction.
//  Avant : decodeKnownCall ne reconnaissait que les minuscules, donc une
//  dApp pouvait demander une approbation ILLIMITEE sans aucune alerte
//  (risque "none") et sans qu'elle apparaisse dans "Autorisations".
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ethers } = require('ethers');

const walletPath = require.resolve(path.join(__dirname, '..', 'lib', 'wallet.js'));
require.cache[walletPath] = {
  id: walletPath, filename: walletPath, loaded: true,
  exports: { getProvider: () => ({ estimateGas: async () => ethers.BigNumber.from(50000) }) },
};
const { simulateTransaction, decodeKnownCall } = require('../lib/txSimulation');

const SPENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const enMajuscules = (hex) => '0x' + hex.slice(2).toUpperCase();
const approveIllimite = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
  .encodeFunctionData('approve', [SPENDER, ethers.constants.MaxUint256]);
const toutLesNft = new ethers.utils.Interface(['function setApprovalForAll(address operator, bool approved)'])
  .encodeFunctionData('setApprovalForAll', [SPENDER, true]);

test('preuve : ethers signe le calldata en majuscules comme le meme en minuscules', async () => {
  const w = new ethers.Wallet('0x' + '11'.repeat(32));
  const signee = await w.signTransaction({ to: TOKEN, data: enMajuscules(approveIllimite), gasLimit: 60000, gasPrice: 1, nonce: 0, chainId: 1 });
  assert.equal(ethers.utils.parseTransaction(signee).data, approveIllimite);
});

test('approbation illimitee en MAJUSCULES -> reconnue et risque ELEVE', async () => {
  const d = decodeKnownCall(enMajuscules(approveIllimite));
  assert.ok(d, 'le calldata en majuscules doit etre decode');
  assert.equal(d.name, 'approve');
  assert.equal(d.args[0], SPENDER);
  const r = await simulateTransaction({ to: TOKEN, data: enMajuscules(approveIllimite) });
  assert.equal(r.risk, 'high');
});

test('setApprovalForAll en casse melangee -> risque ELEVE', async () => {
  const mixte = '0x' + toutLesNft.slice(2, 6).toUpperCase() + toutLesNft.slice(6);
  const r = await simulateTransaction({ to: TOKEN, data: mixte });
  assert.equal(r.risk, 'high');
});

test('entrees non texte -> null sans planter', () => {
  assert.equal(decodeKnownCall(undefined), null);
  assert.equal(decodeKnownCall(12345), null);
  assert.equal(decodeKnownCall({}), null);
});
