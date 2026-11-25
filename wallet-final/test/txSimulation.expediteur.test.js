'use strict';
// wallet-final/test/txSimulation.expediteur.test.js
// ─────────────────────────────────────────────────────────────────
//  La verification d'une transaction demandee par un site (WalletConnect
//  ou navigateur dApp) doit se faire DEPUIS le compte de l'utilisateur.
//  Avant le 25/11/2026, l'estimation partait de l'adresse 0x000...0 :
//  un swap normal (qui depense les jetons de l'utilisateur) etait annonce
//  "va probablement echouer", et une transaction vouee a l'echec depuis
//  le vrai compte pouvait passer pour correcte.
//
//  Faux noeud : il fait echouer toute transaction qui ne part pas du
//  compte de l'utilisateur (comme un vrai transferFrom de jetons).
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const MOI = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ROUTEUR = '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD';
const vues = [];
const walletPath = require.resolve(path.join(__dirname, '..', 'lib', 'wallet.js'));
require.cache[walletPath] = {
  id: walletPath, filename: walletPath, loaded: true,
  exports: {
    getProvider: () => ({
      estimateGas: async (tx) => {
        vues.push(tx);
        if (!tx.from || tx.from.toLowerCase() !== MOI.toLowerCase()) {
          const e = new Error('execution reverted: TRANSFER_FROM_FAILED'); e.reason = 'TRANSFER_FROM_FAILED'; throw e;
        }
        return ethers.BigNumber.from(150000);
      },
    }),
  },
};
const { simulateTransaction } = require('../lib/txSimulation');

test.beforeEach(() => { vues.length = 0; });

test('un swap normal depuis le compte de l\'utilisateur n\'est pas annonce comme "va echouer"', async () => {
  const r = await simulateTransaction({ to: ROUTEUR, data: '0x3593564c', value: '0x0', from: MOI, network: 'ethereum' });
  assert.equal(vues.length, 1);
  assert.equal(vues[0].from, MOI, 'l\'estimation doit partir du compte qui va signer');
  assert.equal(r.willLikelyRevert, false);
  assert.equal(r.warnings.length, 0);
});

test('adresse expediteur abimee : ignoree, jamais de plantage', async () => {
  const r = await simulateTransaction({ to: ROUTEUR, data: '0x', from: 'pas-une-adresse', network: 'ethereum' });
  assert.equal(vues[0].from, undefined);
  assert.equal(r.willLikelyRevert, true);
});

test('App.js transmet le compte de l\'utilisateur aux deux simulations (WalletConnect et navigateur dApp)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const appels = src.match(/simulateTransaction\(\{[^}]*\}/g) || [];
  assert.equal(appels.length, 2, 'deux appels attendus');
  for (const a of appels) assert.match(a, /from:\s*walletAddr/, a);
});
