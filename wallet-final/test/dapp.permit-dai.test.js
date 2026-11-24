'use strict';
// wallet-final/test/dapp.permit-dai.test.js
// ─────────────────────────────────────────────────────────────────
//  Signature "Permit" au format DAI (champs holder, spender, nonce,
//  expiry, allowed) : allowed=true donne au "spender" le droit de
//  depenser TOUS les DAI du wallet, sans transaction visible. C'est une
//  arnaque courante ("verifie ton wallet", "reclame ton airdrop").
//  Avant : comme il n'y a pas de champ "value", la signature n'etait
//  signalee qu'en risque MOYEN au lieu d'ELEVE.
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
  exports: { getProvider: () => ({ estimateGas: async () => ethers.BigNumber.from(21000) }) },
};
const { analyzeTypedData } = require('../lib/txSimulation');

const PIRATE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const MOI = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
// Contrat DAI officiel sur Ethereum (domaine "Dai Stablecoin", version "1").
const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const permitDai = (allowed) => ({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'holder', type: 'address' }, { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' }, { name: 'expiry', type: 'uint256' },
      { name: 'allowed', type: 'bool' },
    ],
  },
  primaryType: 'Permit',
  domain: { name: 'Dai Stablecoin', version: '1', chainId: 1, verifyingContract: DAI },
  message: { holder: MOI, spender: PIRATE, nonce: 0, expiry: 0, allowed },
});

test('Permit DAI allowed=true -> risque ELEVE avec l adresse du beneficiaire', () => {
  const r = analyzeTypedData(permitDai(true));
  assert.equal(r.risk, 'high');
  assert.match(r.warnings[0], new RegExp(PIRATE));
});

test('Permit DAI envoye en texte JSON (comme eth_signTypedData_v4) -> risque ELEVE', () => {
  assert.equal(analyzeTypedData(JSON.stringify(permitDai(true))).risk, 'high');
  assert.equal(analyzeTypedData(permitDai('true')).risk, 'high');
});

test('Permit DAI allowed=false (retrait d autorisation) -> pas ELEVE', () => {
  assert.notEqual(analyzeTypedData(permitDai(false)).risk, 'high');
});
