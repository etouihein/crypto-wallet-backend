// wallet-final/lib/approvals.js
// ─────────────────────────────────────────────────────────────────
//  Suivi + révocation des autorisations de tokens (ERC20 approve/
//  increaseAllowance, ERC721/1155 setApprovalForAll) accordées via cette
//  app — WalletConnect, navigateur dApp intégré, ou le flux de swap
//  interne. Pas d'indexeur/API tierce : on enregistre localement chaque
//  approbation que l'app elle-même a fait signer (AsyncStorage, par
//  adresse de wallet), exactement comme le suivi des comptes de stake
//  Solana (STAKE_REFS_KEY dans App.js) — une approbation accordée
//  ailleurs (site web, autre wallet) avant d'utiliser NexiaWallet
//  n'apparaîtra pas ici, seule limite connue de cette v1.
//
//  Révoquer = signer une NOUVELLE transaction (approve(spender, 0) ou
//  setApprovalForAll(operator, false)) — il n'existe pas d'autre moyen
//  d'annuler une autorisation déjà accordée on-chain.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const { getProvider } = require('./wallet');

const STORAGE_KEY = 'wallet-pro-approvals-v1'; // { [walletAddress]: ApprovalRecord[] }

const REVOKE_ABI = {
  approve: 'function approve(address spender, uint256 amount)',
  setApprovalForAll: 'function setApprovalForAll(address operator, bool approved)',
};

async function loadAll() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveAll(all) {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch { /* rien à faire */ }
}

async function getApprovals(walletAddress) {
  if (!walletAddress) return [];
  const all = await loadAll();
  return all[walletAddress.toLowerCase()] || [];
}

// Enregistre une approbation qu'on vient de faire signer. `amount` doit
// rester une STRING (un uint256 dépasse Number.MAX_SAFE_INTEGER).
async function recordApproval(walletAddress, {
  network, tokenAddress, tokenSymbol, spender, amount, isNft, txHash,
}) {
  if (!walletAddress) return;
  const all = await loadAll();
  const key = walletAddress.toLowerCase();
  const list = all[key] || [];
  const id = `${network}-${tokenAddress}-${spender}`.toLowerCase();
  const entry = {
    id, network, tokenAddress, tokenSymbol: tokenSymbol || '?', spender,
    amount: amount != null ? String(amount) : null, isNft: !!isNft, txHash,
    grantedAt: Date.now(), revoked: false,
  };
  // Une approbation ultérieure sur le même (réseau, token, spender)
  // remplace l'ancienne entrée plutôt que de s'accumuler.
  const next = [entry, ...list.filter(e => e.id !== id)];
  all[key] = next;
  await saveAll(all);
  return entry;
}

async function markRevoked(walletAddress, id) {
  const all = await loadAll();
  const key = walletAddress.toLowerCase();
  const list = all[key] || [];
  all[key] = list.map(e => (e.id === id ? { ...e, revoked: true, revokedAt: Date.now() } : e));
  await saveAll(all);
}

async function removeApproval(walletAddress, id) {
  const all = await loadAll();
  const key = walletAddress.toLowerCase();
  all[key] = (all[key] || []).filter(e => e.id !== id);
  await saveAll(all);
}

// Signe + diffuse la transaction de révocation, retourne le hash. Ne met
// PAS à jour le stockage local (appelant → markRevoked après confirmation).
async function revokeApproval({ privateKey, network, tokenAddress, spender, isNft }) {
  const wallet = new ethers.Wallet(privateKey, getProvider(network));
  const iface = new ethers.utils.Interface([isNft ? REVOKE_ABI.setApprovalForAll : REVOKE_ABI.approve]);
  const data = isNft
    ? iface.encodeFunctionData('setApprovalForAll', [spender, false])
    : iface.encodeFunctionData('approve', [spender, 0]);
  const populated = await wallet.populateTransaction({ to: tokenAddress, data });
  const signed = await wallet.signTransaction(populated);
  const sent = await wallet.provider.sendTransaction(signed);
  return sent.hash;
}

module.exports = { getApprovals, recordApproval, markRevoked, removeApproval, revokeApproval };
