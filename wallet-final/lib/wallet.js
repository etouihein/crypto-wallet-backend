// wallet-final/lib/wallet.js
// ─────────────────────────────────────────────────────────────────
//  Portefeuille NON-CUSTODIAL : tout ce qui touche à une clé privée
//  ou une mnémonique vit ici, en local, et n'est JAMAIS envoyé au
//  backend. Seule une transaction déjà signée (donnée publique dès
//  sa diffusion) part vers /wallet/tx/broadcast pour être relayée.
//
//  Module volontairement libre de tout import React Native/Expo pour
//  rester testable avec de simples scripts `node -e` (voir le plan
//  de migration).
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');

// Mêmes RPC publics que ceux utilisés par défaut côté backend
// (crypto-wallet/src/routes/wallet.js) — gardés synchronisés à la main.
const NETWORKS = {
  ethereum: {
    chainId: 1,
    nativeSymbol: 'ETH',
    rpcUrl: (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL) || 'https://ethereum-rpc.publicnode.com',
  },
  bsc: {
    chainId: 56,
    nativeSymbol: 'BNB',
    rpcUrl: (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BSC_RPC_URL) || 'https://bsc-rpc.publicnode.com',
  },
};

// Adresses vérifiées sur Etherscan/BscScan (voir le plan de migration non-
// custodial). Ne JAMAIS modifier sans revérifier sur l'explorateur officiel
// — une erreur ici fait perdre des fonds aux utilisateurs qui envoient.
const ERC20_TOKENS = {
  ethereum: {
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  },
  bsc: {
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  },
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

function getNetworkConfig(network = 'ethereum') {
  return NETWORKS[network] || NETWORKS.ethereum;
}

function getProvider(network = 'ethereum') {
  return new ethers.providers.JsonRpcProvider(getNetworkConfig(network).rpcUrl);
}

function getErc20Config(symbol, network = 'ethereum') {
  return ERC20_TOKENS[network]?.[symbol?.toUpperCase()] || null;
}

// ── Génération / import — 100% local ────────────────────────────

function createLocalWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase,
    privateKey: wallet.privateKey,
  };
}

function importLocalWallet(value, type) {
  const trimmed = (value || '').trim();
  if (!trimmed) throw new Error('Mnémonique ou clé privée requise.');

  let wallet;
  if (type === 'privateKey') {
    const pk = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
    wallet = new ethers.Wallet(pk);
  } else {
    wallet = ethers.Wallet.fromMnemonic(trimmed.toLowerCase());
  }

  return {
    address: wallet.address,
    mnemonic: type === 'mnemonic' ? trimmed.toLowerCase() : null,
    privateKey: wallet.privateKey,
  };
}

function walletFromPrivateKey(privateKey, network) {
  const wallet = new ethers.Wallet(privateKey);
  return network ? wallet.connect(getProvider(network)) : wallet;
}

// ── Lecture — RPC public direct, aucune clé nécessaire ──────────

async function getNativeBalance(address, network = 'ethereum') {
  const balanceWei = await getProvider(network).getBalance(address);
  return ethers.utils.formatEther(balanceWei);
}

async function getErc20Balance(address, symbol, network = 'ethereum') {
  const token = getErc20Config(symbol, network);
  if (!token) return '0';
  const contract = new ethers.Contract(token.address, ERC20_ABI, getProvider(network));
  const balance = await contract.balanceOf(address);
  return ethers.utils.formatUnits(balance, token.decimals);
}

// ── Signature locale — retourne une tx déjà signée (rawTx), jamais
//    diffusée directement d'ici : App.js l'envoie à
//    POST /wallet/tx/broadcast qui se contente de la relayer. ────

async function signNativeTx({ privateKey, to, amount, network = 'ethereum' }) {
  if (!ethers.utils.isAddress(to)) throw new Error("L'adresse de destination n'est pas valide.");
  const wallet = walletFromPrivateKey(privateKey, network);
  const value = ethers.utils.parseEther(amount.toString());

  const currentBalanceWei = await wallet.provider.getBalance(wallet.address);
  if (currentBalanceWei.lt(value)) throw new Error('Fonds insuffisants sur le wallet.');

  const populated = await wallet.populateTransaction({ to, value });
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

async function signErc20Tx({ privateKey, to, amount, symbol, network = 'ethereum' }) {
  if (!ethers.utils.isAddress(to)) throw new Error("L'adresse de destination n'est pas valide.");
  const token = getErc20Config(symbol, network);
  if (!token) throw new Error(`Token ${symbol} non configuré sur ${network}.`);

  const wallet = walletFromPrivateKey(privateKey, network);
  const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
  const value = ethers.utils.parseUnits(amount.toString(), token.decimals);

  const currentBalance = await contract.balanceOf(wallet.address);
  if (currentBalance.lt(value)) throw new Error(`Fonds ${symbol} insuffisants sur le wallet.`);

  const unsignedTx = await contract.populateTransaction.transfer(to, value);
  const populated = await wallet.populateTransaction(unsignedTx);
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

module.exports = {
  NETWORKS,
  ERC20_TOKENS,
  getNetworkConfig,
  getProvider,
  createLocalWallet,
  importLocalWallet,
  walletFromPrivateKey,
  getNativeBalance,
  getErc20Balance,
  signNativeTx,
  signErc20Tx,
};
