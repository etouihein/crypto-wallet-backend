'use strict';
// wallet-final/test/walletconnect.envoi-incertain.test.js
// ─────────────────────────────────────────────────────────────────
//  Transaction demandee par un site (WalletConnect / navigateur dApp) :
//  si le noeud ne repond pas apres l'avoir peut-etre recue, l'app ne doit
//  JAMAIS dire « réessaie » (une seconde signature = un second paiement).
//  Elle annonce un envoi incertain avec la reference de la transaction.
//  Un refus explicite du noeud (solde insuffisant...) reste une erreur normale.
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

let diffusion = async (signed) => ({ hash: ethers.utils.keccak256(signed) });
let dernierSigne = null;
const fauxProvider = {
  _isProvider: true,
  getNetwork: async () => ({ chainId: 137, name: 'polygon' }),
  getTransactionCount: async () => 7,
  estimateGas: async () => ethers.BigNumber.from(21000),
  getFeeData: async () => ({ maxFeePerGas: ethers.BigNumber.from(2e9), maxPriorityFeePerGas: ethers.BigNumber.from(1e9), gasPrice: ethers.BigNumber.from(2e9) }),
  getGasPrice: async () => ethers.BigNumber.from(2e9),
  getBlock: async () => ({ baseFeePerGas: ethers.BigNumber.from(1e9) }),
  resolveName: async (n) => n,
  sendTransaction: async (signed) => { dernierSigne = signed; return diffusion(signed); },
};
remplacerModule(require.resolve('../lib/wallet'), { getProvider: () => fauxProvider });

const { executeSessionRequest } = require('../lib/walletconnect');
const { humanizeTxError } = require('../lib/txErrors');

// Cle de test publique (Hardhat n°0) : jamais utilisee pour de vrais fonds.
const CLE = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MOI = new ethers.Wallet(CLE).address;
const AUTRE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const envoyer = () => executeSessionRequest({ chainId: 'eip155:137', method: 'eth_sendTransaction', params: [{ from: MOI, to: AUTRE, value: '0x1' }] }, CLE);

function erreur(message, champs) { return Object.assign(new Error(message), champs); }

test.beforeEach(() => { diffusion = async (signed) => ({ hash: ethers.utils.keccak256(signed) }); dernierSigne = null; });

test('noeud muet (delai depasse) : envoi annonce incertain, avec la reference, sans « réessaie »', async () => {
  diffusion = async () => { throw erreur('timeout', { code: 'TIMEOUT' }); };
  let err = null;
  try { await envoyer(); } catch (e) { err = e; }
  assert.ok(err, 'une erreur est attendue');
  const affiche = humanizeTxError(err) || '';
  assert.doesNotMatch(affiche, /réessaie|reessaie/i, `message affiche : ${affiche}`);
  assert.match(affiche, /peut-être partie/);
  assert.ok(affiche.includes(ethers.utils.keccak256(dernierSigne)), 'la reference de la transaction est donnee');
});

test('connexion coupee / passerelle 502 : aussi incertain', async () => {
  for (const e of [erreur('missing response', { code: 'SERVER_ERROR' }), erreur('bad response', { code: 'SERVER_ERROR', status: 502 }), erreur('network error')]) {
    diffusion = async () => { throw e; };
    await assert.rejects(envoyer(), (x) => x.code === 'ENVOI_INCERTAIN' && /peut-être partie/.test(x.message), e.message);
  }
});

test('noeud qui dit l avoir deja (« already known ») : incertain, jamais « recommence »', async () => {
  diffusion = async () => { throw erreur('processing response error', { code: 'SERVER_ERROR', error: { code: -32000, message: 'already known' } }); };
  await assert.rejects(envoyer(), (x) => x.code === 'ENVOI_INCERTAIN');
});

test('refus explicite du noeud (solde insuffisant, erreur JSON-RPC) : erreur d origine conservee', async () => {
  diffusion = async () => { throw erreur('insufficient funds for intrinsic transaction cost', { code: 'INSUFFICIENT_FUNDS' }); };
  await assert.rejects(envoyer(), (x) => x.code === 'INSUFFICIENT_FUNDS');
  diffusion = async () => { throw erreur('processing response error', { code: 'SERVER_ERROR', error: { code: -32000, message: 'max fee per gas less than block base fee' } }); };
  await assert.rejects(envoyer(), (x) => x.code === 'SERVER_ERROR');
});

test('envoi normal : le hash est renvoye au site', async () => {
  const hash = await envoyer();
  assert.equal(hash, ethers.utils.keccak256(dernierSigne));
});
