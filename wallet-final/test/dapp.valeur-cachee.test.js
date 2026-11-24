'use strict';
// wallet-final/test/dapp.valeur-cachee.test.js
// ─────────────────────────────────────────────────────────────────
//  Demande de transaction d'une dApp (WalletConnect ou navigateur dApp)
//  qui contient un appel de token (transfer, approve...) ET de la
//  monnaie du reseau (ETH, BNB...). Avant : la modale affichait
//  seulement "Tu envoies 1 unites brutes a 0x..." et masquait la ligne
//  "Montant" -> l'utilisateur croyait faire un petit transfert de token
//  alors que ses ETH partaient vers le contrat du site.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const walletPath = require.resolve(path.join(__dirname, '..', 'lib', 'wallet.js'));
require.cache[walletPath] = {
  id: walletPath, filename: walletPath, loaded: true,
  exports: { getProvider: () => ({ estimateGas: async () => ethers.BigNumber.from(50000) }) },
};
const { simulateTransaction } = require('../lib/txSimulation');

const PIEGE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const DEST = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const transfer = new ethers.utils.Interface(['function transfer(address to, uint256 amount)'])
  .encodeFunctionData('transfer', [DEST, 1]);
const approve = new ethers.utils.Interface(['function approve(address spender, uint256 amount)'])
  .encodeFunctionData('approve', [DEST, 1000]);

test('transfer() + 10 ETH joints -> risque ELEVE et montant ETH ecrit en clair', async () => {
  const r = await simulateTransaction({ to: PIEGE, data: transfer, value: '10000000000000000000' });
  assert.equal(r.risk, 'high');
  assert.ok(r.warnings.some((w) => w.includes('10.0') && w.includes(PIEGE)), r.warnings.join(' | '));
  // Le transfert decode reste fourni (la modale l'affiche en plus du montant).
  assert.deepEqual(r.decodedTransfer, { to: DEST, amount: '1' });
});

test('approve() + valeur en hexadecimal -> risque ELEVE aussi', async () => {
  const r = await simulateTransaction({ to: PIEGE, data: approve, value: '0x8ac7230489e80000' });
  assert.equal(r.risk, 'high');
});

test('transfer() sans valeur, ou valeur 0 / 0x0 -> pas d alerte de valeur (risque MOYEN habituel)', async () => {
  for (const value of [undefined, null, '0', '0x0', 0]) {
    const r = await simulateTransaction({ to: PIEGE, data: transfer, value });
    assert.equal(r.risk, 'medium', `value=${value}`);
  }
});

test('valeur illisible -> aucun plantage de l analyse', async () => {
  const r = await simulateTransaction({ to: PIEGE, data: transfer, value: 'pas-un-nombre' });
  assert.ok(r);
});

// ─── Modales WalletConnect et navigateur dApp (App.js) ─────────────

const source = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('App.js : la ligne Montant n est plus masquee par un transfert decode (2 modales)', () => {
  assert.doesNotMatch(source, /decodedTransfer(Dapp)? \? \([\s\S]{0,400}?\) : \(\s*<>\s*<Text style=\{st\.settings_row_sub\}>Montant/,
    'la ligne Montant ne doit pas etre dans la branche "sinon" du transfert decode');
  assert.equal((source.match(/\(!decodedTransfer \|\| valeurNativeNonNulle\(tx\.value\)\) &&/g) || []).length, 1);
  assert.equal((source.match(/\(!decodedTransferDapp \|\| valeurNativeNonNulle\(tx\.value\)\) &&/g) || []).length, 1);
});

test('App.js : valeurNativeNonNulle', () => {
  const m = source.match(/const valeurNativeNonNulle = \(value\) => \{[\s\S]*?\n\};/);
  assert.ok(m, 'fonction valeurNativeNonNulle introuvable');
  const f = new Function('ethers', `${m[0]}\nreturn valeurNativeNonNulle;`)(ethers);
  assert.equal(f(undefined), false);
  assert.equal(f('0'), false);
  assert.equal(f('0x0'), false);
  assert.equal(f('1'), true);
  assert.equal(f('0x8ac7230489e80000'), true);
  assert.equal(f('n importe quoi'), true);
});
