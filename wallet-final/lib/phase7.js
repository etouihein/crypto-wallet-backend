// wallet-final/lib/phase7.js — Phase 7, étape 1/2 : FONDATIONS (2026-10-26)
// ─────────────────────────────────────────────────────────────────
//  Fonctions pures + clés AsyncStorage pour les ajouts Phase 7, SANS
//  toucher à App.js ni à i18n.js. Ce module ne rend rien à l'écran :
//  l'intégrateur App.js l'importera et branchera chaque export (voir
//  preview7/FOUNDATIONS.md pour le plan de branchement exact).
//
//  Style : identique aux autres lib/ (swapSecurity.js, approvals.js) —
//  'use strict', CommonJS (module.exports), App.js importe via
//  `import * as phase7 from './lib/phase7';`.
//
//  Règles respectées partout ici :
//  - AUCUN taux de change inventé : les conversions multi-devises
//    prennent les taux en paramètre (fournis par l'appelant depuis les
//    prix CoinGecko déjà disponibles) et renvoient null si un taux
//    manque, au lieu d'estimer.
//  - AUCUNE signature : la lecture d'allowance est un appel `view`
//    (eth_call), jamais une transaction.
//  - AUCUN montant codé en dur présenté comme un prix live : les
//    seuils gas sont des indications d'affichage uniquement.
//  - AUCUNE clé privée / phrase mnémonique ne transite ici.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const { minBuyAmount } = require('./swapSecurity');

// ── Clés AsyncStorage (préfixe wallet-pro-, comme PRICE_ALERTS_KEY) ──
const BALANCE_HISTORY_KEY = 'wallet-pro-balance-history-v1';
const ADDRESS_BOOK_KEY = 'wallet-pro-address-book-v1';
const CURRENCY_PREF_KEY = 'wallet-pro-currency-pref-v1'; // 'EUR' | 'USD' | 'CHF'
const MARKET_OVERVIEW_CACHE_KEY = 'wallet-pro-market-overview-v1';
const VERIFIED_TOKENS_KEY = 'wallet-pro-verified-tokens-v1';

const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'CHF'];
const DEFAULT_CURRENCY = 'EUR';

// ── Petits utilitaires ──────────────────────────────────────────────
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// ── 1. Historique de solde ──────────────────────────────────────────
//  Entrées :
//    balances : [{ cgId, amount }] (quantités détenues, nombres ou strings)
//    priceHistory : { [cgId]: [[timestampMs, prixUsd], ...] } triés ou non
//  Sortie : [{ t, totalUsd, perToken: { [cgId]: valeurUsd } }] trié par t.
//  Pour chaque instant, on prend le DERNIER prix connu <= t pour chaque
//  token ; un token sans aucun prix connu à cet instant est ignoré (pas
//  de prix inventé). Les instants sont l'union des instants de tous les
//  tokens, pour que la courbe ne saute pas un token faute de point commun.
function computeBalanceHistory(balances, priceHistory) {
  const held = (Array.isArray(balances) ? balances : [])
    .map((b) => ({ cgId: b && b.cgId, amount: num(b && b.amount) }))
    .filter((b) => isNonEmptyString(b.cgId) && b.amount !== null);
  if (!held.length) return [];
  const series = {};
  const allTimes = new Set();
  for (const { cgId } of held) {
    const pts = (priceHistory && priceHistory[cgId]) || [];
    const sorted = pts
      .map((p) => ({ t: num(p && p[0]), price: num(p && p[1]) }))
      .filter((p) => p.t !== null && p.price !== null)
      .sort((a, b) => a.t - b.t);
    series[cgId] = sorted;
    sorted.forEach((p) => allTimes.add(p.t));
  }
  const times = [...allTimes].sort((a, b) => a - b);
  return times.map((t) => {
    const perToken = {};
    let totalUsd = 0;
    for (const { cgId, amount } of held) {
      const pts = series[cgId];
      let price = null;
      for (const p of pts) { if (p.t <= t) price = p.price; else break; }
      if (price === null) continue;
      const value = amount * price;
      perToken[cgId] = value;
      totalUsd += value;
    }
    return { t, totalUsd, perToken };
  });
}

// Variation entre le premier et le dernier point d'une série (%, null si
// incalculable). Pure, pour l'affichage « +x % sur la période ».
function balanceHistoryChange(history) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const first = num(history[0] && history[0].totalUsd);
  const last = num(history[history.length - 1] && history[history.length - 1].totalUsd);
  if (first === null || last === null || first === 0) return null;
  return ((last - first) / first) * 100;
}

// ── 2. Multi-devises EUR / USD / CHF ────────────────────────────────
//  Convention des taux (fxRates) : { EUR: <EUR pour 1 USD>, CHF: <CHF
//  pour 1 USD> } — USD vaut 1 par définition. Ces taux DOIVENT venir de
//  CoinGecko (prix déjà disponibles côté /market ou /coin) ; si un taux
//  manque, la conversion renvoie null, jamais une valeur approximative.
function convertUsdToFiat(amountUsd, currency, fxRates) {
  const amount = num(amountUsd);
  if (amount === null) return null;
  if (currency === 'USD') return amount;
  if (currency !== 'EUR' && currency !== 'CHF') return null;
  const rate = num(fxRates && fxRates[currency]);
  if (rate === null) return null;
  return amount * rate;
}

function convertFiatToUsd(amountFiat, currency, fxRates) {
  const amount = num(amountFiat);
  if (amount === null) return null;
  if (currency === 'USD') return amount;
  if (currency !== 'EUR' && currency !== 'CHF') return null;
  const rate = num(fxRates && fxRates[currency]);
  if (rate === null || rate === 0) return null;
  return amount / rate;
}

// Montant fiat -> quantité crypto (prix USD du token fourni par /market).
function convertFiatToCrypto(amountFiat, currency, priceUsd, fxRates) {
  const usd = convertFiatToUsd(amountFiat, currency, fxRates);
  const price = num(priceUsd);
  if (usd === null || price === null || price === 0) return null;
  return usd / price;
}

// Quantité crypto -> montant fiat.
function convertCryptoToFiat(amountCrypto, priceUsd, currency, fxRates) {
  const crypto = num(amountCrypto);
  const price = num(priceUsd);
  if (crypto === null || price === null) return null;
  return convertUsdToFiat(crypto * price, currency, fxRates);
}

// Formatage d'affichage. `locale` par défaut 'fr-FR' (app francophone).
// null si le montant ou le taux est indisponible — l'UI affichera '—'.
function formatFiat(amountUsd, currency, fxRates, locale) {
  if (!SUPPORTED_CURRENCIES.includes(currency)) return null;
  const value = convertUsdToFiat(amountUsd, currency, fxRates);
  if (value === null) return null;
  try {
    return new Intl.NumberFormat(locale || 'fr-FR', {
      style: 'currency', currency, maximumFractionDigits: 2,
    }).format(value);
  } catch { return `${value.toFixed(2)} ${currency}`; }
}

function formatCryptoAmount(amount, symbol, maxDecimals) {
  const value = num(amount);
  if (value === null) return null;
  const decimals = Math.max(0, Math.min(8, Number(maxDecimals) || 6));
  return `${value.toFixed(decimals)} ${symbol || ''}`.trim();
}

// ── 3. Vérification token CoinGecko ─────────────────────────────────
//  `verifiedList` = liste d'ids CoinGecko jugés vérifiés, fournie par
//  l'appelant — en pratique les ids renvoyés par la route /market du
//  backend (top N par capitalisation), jamais une liste inventée ici.
//  Sans liste, renvoie false (principe de prudence : non vérifié).
function buildVerifiedSet(verifiedList) {
  if (!Array.isArray(verifiedList)) return new Set();
  return new Set(verifiedList.filter(isNonEmptyString).map((id) => id.toLowerCase()));
}

function isVerifiedToken(cgId, verifiedList) {
  if (!isNonEmptyString(cgId)) return false;
  return buildVerifiedSet(verifiedList).has(cgId.toLowerCase());
}

// Ré-export du calcul existant (swapSecurity.js, Phase 6) : montant
// minimum reçu après slippage, en unités atomiques (string) ou null.
// Ne pas dupliquer la logique ici — une seule source de vérité.
const minBuyAmountReused = minBuyAmount;

// ── 4. Aide au scan d'allowances (lecture seule) ─────────────────────
//  ABI minimale ERC20 : lecture seule, aucun signer, aucune transaction.
const ERC20_ALLOWANCE_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

// Lit UNE allowance on-chain. `provider` = provider ethers (lib/wallet
// getProvider). Ne signe rien. Renvoie null si l'appel échoue (token
// non-ERC20, réseau indisponible) — l'appelant scanne les autres.
async function readAllowance({ provider, tokenAddress, owner, spender }) {
  try {
    if (!provider || !ethers.utils.isAddress(tokenAddress)
      || !ethers.utils.isAddress(owner) || !ethers.utils.isAddress(spender)) {
      return null;
    }
    const contract = new ethers.Contract(tokenAddress, ERC20_ALLOWANCE_ABI, provider);
    const allowance = await contract.allowance(owner, spender);
    return allowance.toString();
  } catch { return null; }
}

// Scanne plusieurs (token, spender) ; chaque échec est isolé (entrée
// { ok: false }) et n'interrompt jamais le reste du scan.
async function scanAllowances({ provider, owner, checks }) {
  const list = Array.isArray(checks) ? checks : [];
  const results = [];
  for (const check of list) {
    const allowance = await readAllowance({
      provider, tokenAddress: check && check.tokenAddress, owner, spender: check && check.spender,
    });
    results.push({
      tokenAddress: check && check.tokenAddress,
      spender: check && check.spender,
      symbol: (check && check.symbol) || '?',
      allowance, ok: allowance !== null,
    });
  }
  return results;
}

// Compare une allowance (string uint256) à un montant requis (string
// uint256). `unlimited` = allowance == 2^256 - 1 (approve infini classique).
function checkAllowanceSufficient(allowance, requiredAmount) {
  try {
    if (allowance === null || allowance === undefined || requiredAmount === null || requiredAmount === undefined) {
      return { ok: false, unlimited: false, reason: 'allowance-inconnue' };
    }
    const a = ethers.BigNumber.from(allowance);
    const r = ethers.BigNumber.from(requiredAmount);
    const unlimited = a.eq(ethers.constants.MaxUint256);
    return { ok: unlimited || a.gte(r), unlimited, reason: unlimited ? 'illimitee' : (a.gte(r) ? 'suffisante' : 'insuffisante') };
  } catch { return { ok: false, unlimited: false, reason: 'montant-invalide' }; }
}

// ── 5. Seuils gas (indications d'affichage uniquement) ───────────────
//  Seuils en gwei, par réseau, pour classer un prix du gas en
//  'bas' | 'normal' | 'élevé'. Ce ne sont PAS des estimations de frais :
//  le frais réel vient de getGasPriceGwei / estimateSendFee (lib/wallet).
//  Valeurs = ordres de grandeur usuels 2026, à réajuster si le réseau
//  change durablement de régime — l'UI ne doit jamais bloquer un envoi
//  sur cette seule classification.
const GAS_THRESHOLDS_GWEI = {
  ethereum: { high: 50 },
  bsc: { high: 5 },
  polygon: { high: 100 },
  arbitrum: { high: 1 },
  optimism: { high: 1 },
  base: { high: 1 },
  default: { high: 50 },
};

function classifyGasPrice(gasPriceGwei, network) {
  const gwei = num(gasPriceGwei);
  if (gwei === null || gwei < 0) return null;
  const threshold = (GAS_THRESHOLDS_GWEI[network] || GAS_THRESHOLDS_GWEI.default).high;
  if (gwei >= threshold * 3) return 'tres-eleve';
  if (gwei >= threshold) return 'eleve';
  return 'normal';
}

// ── 6. Étiquettes d'historique ───────────────────────────────────────
const HISTORY_LABELS = {
  send: 'Envoi',
  receive: 'Réception',
  swap: 'Échange',
  approve: 'Approbation',
  revoke: 'Révocation',
  stake: 'Staking',
  unstake: 'Retrait de staking',
  bridge: 'Pont cross-chain',
  buy: 'Achat',
  sell: 'Vente',
  nft: 'NFT',
  unknown: 'Transaction',
};

function historyLabel(type, fallback) {
  if (isNonEmptyString(type) && HISTORY_LABELS[type]) return HISTORY_LABELS[type];
  return isNonEmptyString(fallback) ? fallback : HISTORY_LABELS.unknown;
}

// ── 7. Carnet d'adresses ─────────────────────────────────────────────
//  Validation : réutilise les validateurs existants de lib/wallet.js
//  (isValidSolanaAddress, isValidBitcoinAddress) quand le module est
//  chargeable, sinon repli simple documenté ci-dessous. EVM via ethers
//  (même règle que le reste de l'app : ethers.utils.isAddress).
let walletValidators = null;
function getWalletValidators() {
  if (walletValidators !== null) return walletValidators;
  try {
    const wallet = require('./wallet');
    walletValidators = {
      isValidSolanaAddress: wallet.isValidSolanaAddress,
      isValidBitcoinAddress: wallet.isValidBitcoinAddress,
    };
  } catch { walletValidators = {}; }
  return walletValidators;
}

function isValidAddressForNetwork(address, network) {
  if (!isNonEmptyString(address)) return false;
  if (network === 'solana') {
    const fn = getWalletValidators().isValidSolanaAddress;
    // Repli simple si lib/wallet inaccessible : base58, 32-44 caractères.
    return typeof fn === 'function' ? fn(address) : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  if (network === 'bitcoin') {
    const fn = getWalletValidators().isValidBitcoinAddress;
    // Repli simple : bc1... ou 1.../3... (pas une preuve de validité).
    return typeof fn === 'function' ? fn(address) : /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address);
  }
  // Par défaut : réseaux EVM (ethereum, bsc, polygon, arbitrum, ...).
  return ethers.utils.isAddress(address);
}

// Fonctions pures sur la liste (l'UI gère le state, le stockage suit).
// Une entrée : { label, address, network }. Déduplication sur
// (network, address en minuscules pour l'EVM) — un doublon remplace.
function addAddressBookEntry(list, entry) {
  const current = Array.isArray(list) ? list : [];
  if (!entry || !isNonEmptyString(entry.label) || !isNonEmptyString(entry.network)) return current;
  if (!isValidAddressForNetwork(entry.address, entry.network)) return current;
  const key = (a, n) => `${n}:${n === 'solana' || n === 'bitcoin' ? a : String(a).toLowerCase()}`;
  const next = current.filter((e) => key(e.address, e.network) !== key(entry.address, entry.network));
  return [...next, { label: entry.label.trim(), address: entry.address.trim(), network: entry.network }];
}

function removeAddressBookEntry(list, address, network) {
  const current = Array.isArray(list) ? list : [];
  const target = `${network}:${network === 'solana' || network === 'bitcoin' ? address : String(address).toLowerCase()}`;
  return current.filter((e) => `${e.network}:${e.network === 'solana' || e.network === 'bitcoin' ? e.address : String(e.address).toLowerCase()}` !== target);
}

function findAddressBookEntry(list, address, network) {
  const current = Array.isArray(list) ? list : [];
  return current.find((e) => e.network === network
    && (network === 'solana' || network === 'bitcoin'
      ? e.address === address
      : String(e.address).toLowerCase() === String(address).toLowerCase())) || null;
}

// ── Persistance (même pattern que approvals.js : try/catch silencieux) ─
async function loadAddressBook() {
  try {
    const raw = await AsyncStorage.getItem(ADDRESS_BOOK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function saveAddressBook(list) {
  try { await AsyncStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch { /* rien à faire */ }
}

async function loadCurrencyPref() {
  try {
    const raw = await AsyncStorage.getItem(CURRENCY_PREF_KEY);
    return SUPPORTED_CURRENCIES.includes(raw) ? raw : DEFAULT_CURRENCY;
  } catch { return DEFAULT_CURRENCY; }
}

async function saveCurrencyPref(currency) {
  if (!SUPPORTED_CURRENCIES.includes(currency)) return;
  try { await AsyncStorage.setItem(CURRENCY_PREF_KEY, currency); } catch { /* rien à faire */ }
}

async function loadMarketOverviewCache() {
  try {
    const raw = await AsyncStorage.getItem(MARKET_OVERVIEW_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveMarketOverviewCache(overview) {
  try { await AsyncStorage.setItem(MARKET_OVERVIEW_CACHE_KEY, JSON.stringify(overview)); } catch { /* rien à faire */ }
}

module.exports = {
  BALANCE_HISTORY_KEY,
  ADDRESS_BOOK_KEY,
  CURRENCY_PREF_KEY,
  MARKET_OVERVIEW_CACHE_KEY,
  VERIFIED_TOKENS_KEY,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
  computeBalanceHistory,
  balanceHistoryChange,
  convertUsdToFiat,
  convertFiatToUsd,
  convertFiatToCrypto,
  convertCryptoToFiat,
  formatFiat,
  formatCryptoAmount,
  buildVerifiedSet,
  isVerifiedToken,
  minBuyAmount: minBuyAmountReused,
  ERC20_ALLOWANCE_ABI,
  readAllowance,
  scanAllowances,
  checkAllowanceSufficient,
  GAS_THRESHOLDS_GWEI,
  classifyGasPrice,
  HISTORY_LABELS,
  historyLabel,
  isValidAddressForNetwork,
  addAddressBookEntry,
  removeAddressBookEntry,
  findAddressBookEntry,
  loadAddressBook,
  saveAddressBook,
  loadCurrencyPref,
  saveCurrencyPref,
  loadMarketOverviewCache,
  saveMarketOverviewCache,
};
