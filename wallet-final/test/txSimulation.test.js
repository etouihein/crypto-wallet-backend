'use strict';
// wallet-final/test/txSimulation.test.js
// ─────────────────────────────────────────────────────────────────
//  Analyse des transactions et signatures AVANT que l'utilisateur
//  signe (lib/txSimulation.js) : c'est ce qui affiche les alertes
//  "approbation illimitee", "signature Permit dangereuse", etc. dans
//  les modales WalletConnect / navigateur dApp.
//
//  getProvider (lib/wallet.js) est remplace par un faux fournisseur :
//  aucun appel reseau, les tests sont deterministes.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { ethers } = require('ethers');

// ── Faux lib/wallet.js (avant de charger txSimulation) ───────────
let estimateGasImpl = async () => ethers.BigNumber.from(21000);
const walletPath = require.resolve(path.join(__dirname, '..', 'lib', 'wallet.js'));
require.cache[walletPath] = {
  id: walletPath, filename: walletPath, loaded: true,
  exports: { getProvider: () => ({ estimateGas: (tx) => estimateGasImpl(tx) }) },
};
const { simulateTransaction, decodeKnownCall, analyzeTypedData } = require('../lib/txSimulation');

const SPENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DEST = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3'; // adresse officielle (docs 0x / Uniswap)
const MAX = ethers.constants.MaxUint256;

const iface = (sig) => new ethers.utils.Interface([sig]);
const calldata = {
  approve: (amount) => iface('function approve(address spender, uint256 amount)').encodeFunctionData('approve', [SPENDER, amount]),
  increaseAllowance: (amount) => iface('function increaseAllowance(address spender, uint256 addedValue)').encodeFunctionData('increaseAllowance', [SPENDER, amount]),
  setApprovalForAll: (ok) => iface('function setApprovalForAll(address operator, bool approved)').encodeFunctionData('setApprovalForAll', [SPENDER, ok]),
  transfer: (amount) => iface('function transfer(address to, uint256 amount)').encodeFunctionData('transfer', [DEST, amount]),
  transferFrom: () => iface('function transferFrom(address from, address to, uint256 amount)').encodeFunctionData('transferFrom', [SPENDER, DEST, 5]),
};

test.beforeEach(() => { estimateGasImpl = async () => ethers.BigNumber.from(21000); });

// ─── decodeKnownCall ─────────────────────────────────────────────

test('decodeKnownCall reconnait approve et donne spender + montant', () => {
  const d = decodeKnownCall(calldata.approve(1000));
  assert.equal(d.name, 'approve');
  assert.equal(d.args[0], SPENDER);
  assert.equal(d.args[1].toString(), '1000');
});

test('decodeKnownCall reconnait transfer, setApprovalForAll, transferFrom, increaseAllowance', () => {
  assert.equal(decodeKnownCall(calldata.transfer(1)).name, 'transfer');
  assert.equal(decodeKnownCall(calldata.setApprovalForAll(true)).name, 'setApprovalForAll');
  assert.equal(decodeKnownCall(calldata.transferFrom()).name, 'transferFrom');
  assert.equal(decodeKnownCall(calldata.increaseAllowance(1)).name, 'increaseAllowance');
});

test('decodeKnownCall : calldata inconnu, vide, tronque ou malforme -> null sans planter', () => {
  assert.equal(decodeKnownCall('0xdeadbeef'), null);
  assert.equal(decodeKnownCall(''), null);
  assert.equal(decodeKnownCall(null), null);
  assert.equal(decodeKnownCall('0x095ea7'), null);
  assert.equal(decodeKnownCall('0x095ea7b3' + '00'.repeat(5)), null);
});

// ─── analyzeTypedData (signatures sans transaction) ──────────────

test('signature Permit (EIP-2612) -> risque ELEVE', () => {
  const r = analyzeTypedData({
    primaryType: 'Permit',
    domain: { name: 'USD Coin', verifyingContract: TOKEN },
    message: { owner: DEST, spender: SPENDER, value: MAX.toString(), nonce: 0, deadline: 9999999999 },
  });
  assert.equal(r.risk, 'high');
  assert.match(r.warnings[0], new RegExp(SPENDER));
});

test('signature Permit2 (contrat officiel, adresse checksum) -> risque ELEVE', () => {
  // Exemple au format renvoye par 0x (Swap API /permit2) : PermitTransferFrom.
  const r = analyzeTypedData({
    primaryType: 'PermitTransferFrom',
    domain: { name: 'Permit2', chainId: 1, verifyingContract: PERMIT2 },
    message: { permitted: { token: TOKEN, amount: '1000000' }, spender: SPENDER, nonce: '1', deadline: '9999999999' },
  });
  assert.equal(r.risk, 'high', 'une signature Permit2 doit etre signalee comme dangereuse');
  assert.match(r.warnings[0], /Permit2/);
});

test('signature Permit2 (adresse en minuscules, PermitSingle avec spender dans details) -> risque ELEVE', () => {
  const r = analyzeTypedData(JSON.stringify({
    primaryType: 'PermitSingle',
    domain: { name: 'Permit2', chainId: 8453, verifyingContract: PERMIT2.toLowerCase() },
    message: { details: { token: TOKEN, amount: MAX.toString(), spender: SPENDER }, sigDeadline: '9999999999' },
  }));
  assert.equal(r.risk, 'high');
  assert.match(r.warnings[0], new RegExp(SPENDER));
});

test('autre signature de type "permit" sur un contrat inconnu -> risque MOYEN', () => {
  const r = analyzeTypedData({ primaryType: 'PermitBatch', domain: { verifyingContract: DEST }, message: {} });
  assert.equal(r.risk, 'medium');
});

test('signature ordinaire (ex. connexion a un site) -> aucun risque signale', () => {
  const r = analyzeTypedData({ primaryType: 'Login', domain: { name: 'Mon site' }, message: { contents: 'Bonjour' } });
  assert.deepEqual(r, { risk: 'none', warnings: [] });
});

test('donnee typee illisible -> aucun plantage', () => {
  assert.deepEqual(analyzeTypedData('{pas du json'), { risk: 'none', warnings: [] });
  assert.deepEqual(analyzeTypedData(null), { risk: 'none', warnings: [] });
});

// ─── simulateTransaction ─────────────────────────────────────────

test('approbation illimitee -> risque ELEVE', async () => {
  const r = await simulateTransaction({ to: TOKEN, data: calldata.approve(MAX) });
  assert.equal(r.risk, 'high');
  assert.equal(r.decodedMethod, 'approve');
});

test('approbation "quasi illimitee" (2^255) -> risque ELEVE aussi', async () => {
  const r = await simulateTransaction({ to: TOKEN, data: calldata.increaseAllowance(ethers.BigNumber.from(2).pow(255)) });
  assert.equal(r.risk, 'high');
});

test('petite approbation -> pas de risque eleve', async () => {
  const r = await simulateTransaction({ to: TOKEN, data: calldata.approve(1000) });
  assert.equal(r.risk, 'none');
});

test('setApprovalForAll(true) -> risque ELEVE (tous les NFT) ; false -> rien', async () => {
  assert.equal((await simulateTransaction({ to: TOKEN, data: calldata.setApprovalForAll(true) })).risk, 'high');
  assert.equal((await simulateTransaction({ to: TOKEN, data: calldata.setApprovalForAll(false) })).risk, 'none');
});

test('transfer -> risque MOYEN, destinataire et montant brut decodes pour la modale', async () => {
  const r = await simulateTransaction({ to: TOKEN, data: calldata.transfer(123456) });
  assert.equal(r.risk, 'medium');
  assert.deepEqual(r.decodedTransfer, { to: DEST, amount: '123456' });
});

test('transferFrom -> risque MOYEN', async () => {
  assert.equal((await simulateTransaction({ to: TOKEN, data: calldata.transferFrom() })).risk, 'medium');
});

test('transaction qui va echouer -> signalee avec la raison', async () => {
  estimateGasImpl = async () => { const e = new Error('execution reverted: solde insuffisant'); e.reason = 'solde insuffisant'; throw e; };
  const r = await simulateTransaction({ to: TOKEN, data: '0x' });
  assert.equal(r.willLikelyRevert, true);
  assert.equal(r.revertReason, 'solde insuffisant');
  assert.equal(r.risk, 'medium');
});

test('un echec previsible ne fait pas baisser un risque ELEVE', async () => {
  estimateGasImpl = async () => { throw new Error('execution reverted'); };
  const r = await simulateTransaction({ to: TOKEN, data: calldata.approve(MAX) });
  assert.equal(r.risk, 'high');
  assert.equal(r.willLikelyRevert, true);
});

test('transaction simple sans calldata qui passe -> aucun risque', async () => {
  const r = await simulateTransaction({ to: DEST, data: '0x', value: '1000' });
  assert.equal(r.risk, 'none');
  assert.equal(r.decodedMethod, null);
});
