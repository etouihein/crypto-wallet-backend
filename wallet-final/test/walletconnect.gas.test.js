'use strict';
// wallet-final/test/walletconnect.gas.test.js
// ─────────────────────────────────────────────────────────────────
//  Limite de gas d'une transaction demandee par un site (WalletConnect et
//  navigateur dApp, tous deux via executeSessionRequest). Le site ne doit
//  pas pouvoir faire payer a l'utilisateur des frais enormes en imposant
//  sa propre limite de gas : avant le 25/11/2026, "gas: 30 000 000" vers un
//  contrat qui consomme tout son gas etait signe et envoye tel quel.
//  WalletConnect, React Native et le reseau sont remplaces par des faux.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');

function remplacerModule(nom, exportsFaux) {
  const chemin = require.resolve(nom);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: exportsFaux };
}
remplacerModule('@walletconnect/core', { Core: function Core() {} });
remplacerModule('@reown/walletkit', { WalletKit: { init: async () => ({}) } });
remplacerModule('@walletconnect/utils', { buildApprovedNamespaces: () => ({}) });
remplacerModule('react-native', { Linking: { openURL: async () => {} } });

const envoyees = [];
let estimation = async () => ethers.BigNumber.from(50000);
const fauxProvider = {
  _isProvider: true,
  getNetwork: async () => ({ chainId: 1, name: 'homestead' }),
  getTransactionCount: async () => 3,
  estimateGas: (tx) => estimation(tx),
  getFeeData: async () => ({ maxFeePerGas: ethers.BigNumber.from(30e9), maxPriorityFeePerGas: ethers.BigNumber.from(1e9), gasPrice: ethers.BigNumber.from(30e9) }),
  getGasPrice: async () => ethers.BigNumber.from(30e9),
  getBlock: async () => ({ baseFeePerGas: ethers.BigNumber.from(15e9) }),
  resolveName: async (n) => n,
  sendTransaction: async (signed) => { envoyees.push(signed); return { hash: ethers.utils.keccak256(signed) }; },
};
remplacerModule(require.resolve('../lib/wallet'), { getProvider: () => fauxProvider });

const { executeSessionRequest } = require('../lib/walletconnect');

// Cle de test publique (Hardhat n°0) : jamais utilisee pour de vrais fonds.
const CLE = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MOI = new ethers.Wallet(CLE).address;
const CONTRAT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ETH = 'eip155:1';
const demande = (tx) => executeSessionRequest({ chainId: ETH, method: 'eth_sendTransaction', params: [{ from: MOI, to: CONTRAT, data: '0x12345678', ...tx }] }, CLE);
const gasSigne = () => ethers.utils.parseTransaction(envoyees[envoyees.length - 1]).gasLimit.toNumber();

test.beforeEach(() => { envoyees.length = 0; estimation = async () => ethers.BigNumber.from(50000); });

test('contrat qui consommerait tout le gas (estimation en echec) + limite du site : rien n est signe ni envoye', async () => {
  estimation = async () => { const e = new Error('execution reverted'); e.code = 'UNPREDICTABLE_GAS_LIMIT'; throw e; };
  await assert.rejects(demande({ gas: '0x1c9c380' /* 30 000 000 */ }), /échouerait/);
  assert.equal(envoyees.length, 0, 'aucune transaction ne doit partir');
});

test('limite du site demesuree (30 000 000 pour 50 000 estimes) : ramenee a 2 x l estimation', async () => {
  await demande({ gas: '0x1c9c380' });
  assert.equal(envoyees.length, 1);
  assert.equal(gasSigne(), 100000);
});

test('marge normale du site (60 000 pour 50 000 estimes) : gardee', async () => {
  await demande({ gas: 60000 });
  assert.equal(gasSigne(), 60000);
});

test('limite du site trop basse (21 000) : l estimation est utilisee (sinon echec et frais perdus)', async () => {
  await demande({ gas: '0x5208' });
  assert.equal(gasSigne(), 50000);
});

test('sans limite du site, ou limite illisible : estimation du reseau, depuis le compte actif', async () => {
  const vues = [];
  estimation = async (tx) => { vues.push(tx); return ethers.BigNumber.from(50000); };
  await demande({});
  assert.equal(gasSigne(), 50000);
  await demande({ gas: 'pas un nombre' });
  assert.equal(gasSigne(), 50000);
  assert.ok(vues.every((t) => String(t.from).toLowerCase() === MOI.toLowerCase()));
});

test('erreur reseau pendant l estimation : erreur d origine, rien n est envoye', async () => {
  estimation = async () => { const e = new Error('timeout'); e.code = 'TIMEOUT'; throw e; };
  await assert.rejects(demande({ gas: 60000 }), /timeout/);
  assert.equal(envoyees.length, 0);
});
