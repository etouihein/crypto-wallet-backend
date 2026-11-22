'use strict';
// wallet-final/test/wallet.send-signing.test.js
// ─────────────────────────────────────────────────────────────────
//  Envois d'argent signes localement (lib/wallet.js : signNativeTx,
//  signErc20Tx, estimateSendFee). On decode la transaction signee et on
//  verifie destinataire, montant EXACT (decimales des tokens : 6 sur
//  Ethereum, 18 sur BNB Chain), reseau, et vitesse choisie. Le reseau est
//  simule (aucune requete, rien n'est diffuse). Cle de test PUBLIQUE.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');

const CHAINS = { 'ethereum-rpc': 1, 'bsc-rpc': 56, 'polygon-bor-rpc': 137 };
const etat = { soldeNatif: ethers.utils.parseEther('2'), soldeToken: ethers.BigNumber.from('0') };
const ERC20 = new ethers.utils.Interface(['function balanceOf(address) view returns (uint256)', 'function transfer(address,uint256)']);
ethers.providers.JsonRpcProvider.prototype.send = async function (method, params) {
  const url = this.connection.url;
  const chainId = Object.entries(CHAINS).find(([k]) => url.includes(k))?.[1] || 1;
  switch (method) {
    case 'eth_chainId': return ethers.utils.hexValue(chainId);
    case 'net_version': return String(chainId);
    case 'eth_getBalance': return ethers.utils.hexValue(etat.soldeNatif);
    case 'eth_call': return ERC20.encodeFunctionResult('balanceOf', [etat.soldeToken]);
    case 'eth_getTransactionCount': return '0x5';
    case 'eth_gasPrice': return ethers.utils.hexValue(ethers.utils.parseUnits('20', 'gwei'));
    case 'eth_maxPriorityFeePerGas': return ethers.utils.hexValue(ethers.utils.parseUnits('1', 'gwei'));
    case 'eth_estimateGas': return params[0].data && params[0].data !== '0x' ? '0xfde8' : '0x5208';
    case 'eth_getBlockByNumber': return { number: '0x1', baseFeePerGas: ethers.utils.hexValue(ethers.utils.parseUnits('10', 'gwei')), hash: '0x' + '11'.repeat(32), parentHash: '0x' + '22'.repeat(32), timestamp: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', miner: ethers.constants.AddressZero, extraData: '0x', difficulty: '0x0', transactions: [] };
    default: throw new Error(`methode RPC non simulee : ${method}`);
  }
};

const localWallet = require('../lib/wallet');
const CLE = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const DEST = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const decoder = (raw) => ethers.utils.parseTransaction(raw);

test('envoi natif : bon destinataire, montant exact, bon reseau, depuis notre compte', async () => {
  etat.soldeNatif = ethers.utils.parseEther('2');
  const { rawTx } = await localWallet.signNativeTx({ privateKey: CLE, to: DEST, amount: '0.123456789012345678', network: 'polygon' });
  const tx = decoder(rawTx);
  assert.equal(tx.to, DEST);
  assert.equal(tx.value.toString(), '123456789012345678');
  assert.equal(tx.chainId, 137);
  assert.equal(tx.from, new ethers.Wallet(CLE).address);
});

test('envoi natif : la vitesse choisie (gasPrice) est vraiment appliquee', async () => {
  const gasPrice = ethers.utils.parseUnits('33', 'gwei').toString();
  const { rawTx } = await localWallet.signNativeTx({ privateKey: CLE, to: DEST, amount: '0.1', network: 'ethereum', gasPrice });
  const tx = decoder(rawTx);
  assert.ok(tx.type === 0 || tx.type === null || tx.type === undefined, 'transaction classique (legacy)');
  assert.ok(tx.maxFeePerGas == null, 'pas de frais EIP-1559 qui ignoreraient le choix');
  assert.equal(tx.gasPrice.toString(), gasPrice);
});

test('envoi natif : solde insuffisant, adresse invalide ou montant illisible refuses', async () => {
  etat.soldeNatif = ethers.utils.parseEther('0.05');
  await assert.rejects(localWallet.signNativeTx({ privateKey: CLE, to: DEST, amount: '0.1', network: 'ethereum' }), /insuffisants/);
  await assert.rejects(localWallet.signNativeTx({ privateKey: CLE, to: '0x123', amount: '0.01', network: 'ethereum' }), /pas valide/);
  await assert.rejects(localWallet.signNativeTx({ privateKey: CLE, to: DEST, amount: '1,5', network: 'ethereum' }));
  await assert.rejects(localWallet.signNativeTx({ privateKey: CLE, to: DEST, amount: '0.01', network: 'solana' }), /Réseau inconnu/);
  etat.soldeNatif = ethers.utils.parseEther('2');
});

test('envoi USDT : decimales exactes (6 sur Ethereum, 18 sur BNB Chain) et bon contrat', async () => {
  etat.soldeToken = ethers.BigNumber.from('10').pow(30);
  const cas = [
    ['ethereum', '0xdAC17F958D2ee523a2206206994597C13D831ec7', '10000000', 1],
    ['bsc', '0x55d398326f99059fF775485246999027B3197955', '10000000000000000000', 56],
  ];
  for (const [network, contrat, unites, chainId] of cas) {
    const { rawTx } = await localWallet.signErc20Tx({ privateKey: CLE, to: DEST, amount: '10', symbol: 'usdt', network });
    const tx = decoder(rawTx);
    assert.equal(tx.to, contrat, network);
    assert.equal(tx.chainId, chainId);
    assert.equal(tx.value.toString(), '0', 'aucun ETH/BNB envoye avec un token');
    const [dest, montant] = ERC20.decodeFunctionData('transfer', tx.data);
    assert.equal(dest, DEST);
    assert.equal(montant.toString(), unites, network);
  }
});

test('envoi token : solde insuffisant, token inconnu, trop de decimales refuses', async () => {
  etat.soldeToken = ethers.BigNumber.from('5000000');
  await assert.rejects(localWallet.signErc20Tx({ privateKey: CLE, to: DEST, amount: '10', symbol: 'USDC', network: 'ethereum' }), /insuffisants/);
  await assert.rejects(localWallet.signErc20Tx({ privateKey: CLE, to: DEST, amount: '1', symbol: 'DOGE', network: 'ethereum' }), /non configuré/);
  await assert.rejects(localWallet.signErc20Tx({ privateKey: CLE, to: DEST, amount: '1', symbol: 'USDC', network: 'polygon' }), /non configuré/);
  await assert.rejects(localWallet.signErc20Tx({ privateKey: CLE, to: DEST, amount: '0.0000001', symbol: 'USDC', network: 'ethereum' }));
});

test('estimation des frais : 3 vitesses croissantes, coherentes avec le gas', async () => {
  const e = await localWallet.estimateSendFee({ from: new ethers.Wallet(CLE).address, to: DEST, amount: '0.1', network: 'ethereum' });
  assert.equal(e.nativeSymbol, 'ETH');
  assert.equal(e.gasLimit, '21000');
  assert.equal(e.approximate, false);
  const prix = Object.values(e.tiers).map((t) => Number(t.gasPriceGwei));
  assert.ok(prix.length >= 3);
  assert.deepEqual([...prix].sort((a, b) => a - b), prix, 'du plus lent au plus rapide');
  assert.equal(Number(e.feeNative), 21000 * 20e-9);
});
