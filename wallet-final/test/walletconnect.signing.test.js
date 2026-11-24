'use strict';
// wallet-final/test/walletconnect.signing.test.js
// ─────────────────────────────────────────────────────────────────
//  Signatures demandees par une dApp (WalletConnect ET navigateur dApp
//  integre, qui passent tous deux par executeSessionRequest dans
//  lib/walletconnect.js). Une signature ne doit partir que pour le compte
//  actif et pour le reseau affiche a l'utilisateur ; eth_sign est refuse.
//  WalletConnect, React Native et le reseau sont remplaces par des faux :
//  rien n'est envoye, les signatures sont verifiees avec ethers.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');

function remplacerModule(nom, exportsFaux, depuis) {
  const chemin = require.resolve(nom, depuis ? { paths: [depuis] } : undefined);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: exportsFaux };
}
remplacerModule('@walletconnect/core', { Core: function Core() {} });
remplacerModule('@reown/walletkit', { WalletKit: { init: async () => ({}) } });
remplacerModule('@walletconnect/utils', { buildApprovedNamespaces: () => ({}) });
remplacerModule('react-native', { Linking: { openURL: async () => {} } });
const envoyees = [];
const fauxProvider = {
  _isProvider: true,
  getNetwork: async () => ({ chainId: 137, name: 'polygon' }),
  getTransactionCount: async () => 7,
  estimateGas: async () => ethers.BigNumber.from(21000),
  getFeeData: async () => ({ maxFeePerGas: ethers.BigNumber.from(2e9), maxPriorityFeePerGas: ethers.BigNumber.from(1e9), gasPrice: ethers.BigNumber.from(2e9) }),
  getGasPrice: async () => ethers.BigNumber.from(2e9),
  getBlock: async () => ({ baseFeePerGas: ethers.BigNumber.from(1e9) }),
  resolveName: async (n) => n,
  sendTransaction: async (signed) => { envoyees.push(signed); return { hash: ethers.utils.keccak256(signed) }; },
};
remplacerModule(require.resolve('../lib/wallet'), { getProvider: () => fauxProvider });

const { executeSessionRequest, SUPPORTED_EVM_CHAINS } = require('../lib/walletconnect');

// Cle de test publique (Hardhat n°0) : jamais utilisee pour de vrais fonds.
const CLE = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MOI = new ethers.Wallet(CLE).address;
const AUTRE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const POLYGON = 'eip155:137';

function typedData(chainId) {
  return {
    domain: { name: 'Jeton Test', version: '1', chainId, verifyingContract: '0x000000000000000000000000000000000000dEaD' },
    types: {
      EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }],
      Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }],
    },
    primaryType: 'Permit',
    message: { owner: MOI, spender: AUTRE, value: '1000' },
  };
}

test('personal_sign : signe pour le compte actif, refuse un autre compte', async () => {
  const msg = ethers.utils.hexlify(ethers.utils.toUtf8Bytes('Connexion a la dApp'));
  const sig = await executeSessionRequest({ chainId: POLYGON, method: 'personal_sign', params: [msg, MOI] }, CLE);
  assert.equal(ethers.utils.verifyMessage(ethers.utils.arrayify(msg), sig), MOI);
  await assert.rejects(executeSessionRequest({ chainId: POLYGON, method: 'personal_sign', params: [msg, AUTRE] }, CLE), /différente du compte actif/);
});

test('eth_signTypedData_v4 : signature valide pour le compte actif et le bon reseau', async () => {
  for (const chainId of [137, '137', '0x89']) {
    const td = typedData(chainId);
    const sig = await executeSessionRequest({ chainId: POLYGON, method: 'eth_signTypedData_v4', params: [MOI, JSON.stringify(td)] }, CLE);
    const types = { ...td.types }; delete types.EIP712Domain;
    assert.equal(ethers.utils.verifyTypedData(td.domain, types, td.message, sig), MOI, String(chainId));
  }
});

test('eth_signTypedData_v4 : refuse si la demande vise un autre compte', async () => {
  await assert.rejects(
    executeSessionRequest({ chainId: POLYGON, method: 'eth_signTypedData_v4', params: [AUTRE, JSON.stringify(typedData(137))] }, CLE),
    /différente du compte actif/,
  );
});

test('eth_signTypedData_v4 : refuse un message prevu pour un AUTRE reseau que celui affiche', async () => {
  // dApp connectee sur Polygon qui fait signer un "Permit" valable sur Ethereum (chainId 1).
  await assert.rejects(
    executeSessionRequest({ chainId: POLYGON, method: 'eth_signTypedData_v4', params: [MOI, JSON.stringify(typedData(1))] }, CLE),
    /autre réseau/,
  );
});

test('eth_signTypedData_v4 : un message sans reseau (chainId absent) reste signable', async () => {
  const td = typedData(undefined);
  delete td.domain.chainId;
  td.types.EIP712Domain = td.types.EIP712Domain.filter((f) => f.name !== 'chainId');
  const sig = await executeSessionRequest({ chainId: POLYGON, method: 'eth_signTypedData_v4', params: [MOI, td] }, CLE);
  const types = { ...td.types }; delete types.EIP712Domain;
  assert.equal(ethers.utils.verifyTypedData(td.domain, types, td.message, sig), MOI);
});

test('eth_sendTransaction : envoie depuis le compte actif, refuse un "from" different', async () => {
  envoyees.length = 0;
  const hash = await executeSessionRequest({ chainId: POLYGON, method: 'eth_sendTransaction', params: [{ from: MOI, to: AUTRE, value: '0x1' }] }, CLE);
  assert.equal(envoyees.length, 1);
  const tx = ethers.utils.parseTransaction(envoyees[0]);
  assert.equal(tx.from, MOI);
  assert.equal(tx.chainId, 137);
  assert.equal(hash, ethers.utils.keccak256(envoyees[0]));
  await assert.rejects(
    executeSessionRequest({ chainId: POLYGON, method: 'eth_sendTransaction', params: [{ from: AUTRE, to: AUTRE, value: '0x1' }] }, CLE),
    /différente du compte actif/,
  );
  assert.equal(envoyees.length, 1, 'rien n est envoye pour un autre compte');
});

test('eth_sign et methodes inconnues refusees ; reseau non supporte refuse', async () => {
  await assert.rejects(executeSessionRequest({ chainId: POLYGON, method: 'eth_sign', params: [MOI, '0x' + '11'.repeat(32)] }, CLE), /non supportée/);
  await assert.rejects(executeSessionRequest({ chainId: POLYGON, method: 'eth_signTransaction', params: [{}] }, CLE), /non supportée/);
  for (const chainId of ['eip155:999', 'solana:mainnet', 'constructor', '__proto__', undefined]) {
    await assert.rejects(executeSessionRequest({ chainId, method: 'personal_sign', params: ['0x00', MOI] }, CLE), /Chaîne non supportée/, String(chainId));
  }
  assert.deepEqual(Object.keys(SUPPORTED_EVM_CHAINS).sort(), ['eip155:1', 'eip155:10', 'eip155:137', 'eip155:42161', 'eip155:56', 'eip155:8453']);
});

test('eth_sendTransaction : refuse une transaction prevue pour un AUTRE reseau que celui affiche', async () => {
  envoyees.length = 0;
  // dApp restee sur Ethereum (0x1) alors que l'app est sur Polygon
  for (const chainId of ['0x1', 1, '0x38', 'n importe quoi']) {
    await assert.rejects(
      executeSessionRequest({ chainId: POLYGON, method: 'eth_sendTransaction', params: [{ from: MOI, to: AUTRE, value: '0x1', chainId }] }, CLE),
      /autre réseau/,
      String(chainId),
    );
  }
  assert.equal(envoyees.length, 0, 'rien n est signe ni envoye');
  // meme reseau (hex ou nombre) : envoye normalement
  await executeSessionRequest({ chainId: POLYGON, method: 'eth_sendTransaction', params: [{ from: MOI, to: AUTRE, value: '0x1', chainId: '0x89' }] }, CLE);
  await executeSessionRequest({ chainId: POLYGON, method: 'eth_sendTransaction', params: [{ from: MOI, to: AUTRE, value: '0x1', chainId: 137 }] }, CLE);
  assert.equal(envoyees.length, 2);
});
