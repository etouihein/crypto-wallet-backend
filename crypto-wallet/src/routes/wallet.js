const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const crypto = require('crypto');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const ipaddr = require('ipaddr.js');
const Stripe = require('stripe');
const rateLimit = require('express-rate-limit');
const { Connection: SolanaConnection, PublicKey: SolanaPublicKey } = require('@solana/web3.js');
const { generateJwt } = require('@coinbase/cdp-sdk/auth');
const { FRONTEND_URL, isTrustedOrigin } = require('../config/allowedOrigins');
// Suivi des revenus : appelé après chaque réponse, sans effet sur elle (voir src/revenue/hooks.js).
const revenueHooks = require('../revenue/hooks');
const { createHistorySources } = require('../history');

const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
// demo | stripe | moonpay | coinbase
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'demo').toLowerCase();
const APP_API_KEYS = new Set(
  (process.env.APP_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
);

// Limite plus stricte sur les routes sensibles (diffusion de transaction,
// paiement, swap, NFT) — le rate-limit global de server.js (100/15min) est
// trop permissif pour ces actions-là une fois le serveur exposé publiquement.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SENSITIVE_RATE_LIMIT_MAX, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de requêtes sensibles depuis cette IP — réessaie dans quelques minutes.' },
});

// Profil léger optionnel (email lié à une adresse de wallet) — pour
// notifications futures et acquisition, PAS un compte : aucune clé, aucun
// mot de passe, le wallet reste 100% non-custodial. DATA_DIR doit pointer
// vers un Volume Railway monté (sinon écrit sur le disque éphémère du
// conteneur, effacé au prochain déploiement — voir .env.example).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const EMAIL_PROFILES_FILE = path.join(DATA_DIR, 'email-profiles.json');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadEmailProfiles() {
  try { return JSON.parse(fs.readFileSync(EMAIL_PROFILES_FILE, 'utf8')); } catch { return {}; }
}

function saveEmailProfile(address, email) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const profiles = loadEmailProfiles();
  profiles[address.toLowerCase()] = { email, updatedAt: new Date().toISOString() };
  fs.writeFileSync(EMAIL_PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

// MoonPay — achat de crypto par carte, livré directement à l'adresse du wallet.
// Le wallet a une adresse EVM (0x...) et, depuis l'ajout du support Solana,
// une adresse Solana dérivée de la même mnémonique (voir getSolanaAddress
// dans wallet-final/lib/wallet.js) : on ne propose MoonPay que pour les
// tokens qui ont réellement une adresse de destination correspondante.
// Acheter du BTC vers une adresse 0x perdrait les fonds — pas question.
// .trim() : un copier-coller depuis le dashboard MoonPay ou l'interface
// Railway peut laisser un espace/retour à la ligne final invisible, qui
// change silencieusement la clé HMAC et fait échouer la vérification de
// signature côté MoonPay ("Signature check failed") sans qu'aucune erreur
// ne remonte ici (la signature calculée est juste... fausse).
const MOONPAY_API_KEY = (process.env.MOONPAY_API_KEY || '').trim();
const MOONPAY_SECRET_KEY = (process.env.MOONPAY_SECRET_KEY || '').trim();
const MOONPAY_BASE_URL = process.env.MOONPAY_ENV === 'production'
  ? 'https://buy.moonpay.com'
  : 'https://buy-sandbox.moonpay.com';
// Widget de VENTE (off-ramp) — chemin /v2/sell, mais TOUJOURS sur le domaine
// buy.moonpay.com (production), jamais buy-sandbox.moonpay.com, contrairement
// à l'achat ci-dessus. Vérifié en chargeant les deux pour de vrai avec la
// clé de test (pk_test_...) : buy-sandbox.moonpay.com/v2/sell plante côté
// MoonPay ("Cannot read properties of undefined (reading 'TenantFeatures')",
// bug/limitation de LEUR bac à sable sur ce produit) alors que
// buy.moonpay.com/v2/sell charge sans erreur avec la MÊME clé de test —
// MoonPay détecte le mode sandbox/production via le préfixe de la clé
// (pk_test_ vs pk_live_), pas via le domaine, pour ce produit précis.
const MOONPAY_SELL_BASE_URL = 'https://buy.moonpay.com/v2/sell';
const MOONPAY_CURRENCY_CODES = {
  ethereum: { ETH: 'eth', USDT: 'usdt_eth', USDC: 'usdc_eth' },
  bsc:      { BNB: 'bnb_bsc', USDT: 'usdt_bsc', USDC: 'usdc_bsc' },
  polygon:  { MATIC: 'matic_polygon' },
  solana:   { SOL: 'sol' },
  bitcoin:  { BTC: 'btc' },
};

// Coinbase Onramp — API non-custodiale, gratuite, aucune verification
// business requise (contrairement a MoonPay/Ramp qui exigent un KYB complet
// avec preuve d'incorporation de societe). Cle CDP recuperee sur
// portal.cdp.coinbase.com > Coinbase APIs > API Keys (Secret API Key).
const COINBASE_CDP_API_KEY_ID = (process.env.COINBASE_CDP_API_KEY_ID || '').trim();
const COINBASE_CDP_API_KEY_SECRET = (process.env.COINBASE_CDP_API_KEY_SECRET || '').trim();

// ── MONÉTISATION ──────────────────────────────────────────────────
// Adresse qui reçoit les commissions (frais de swap 0x, etc.). Ce n'est
// qu'une adresse publique de réception — aucun secret — donc codée en dur
// comme repli, surchargeable par FEE_RECIPIENT_ADDRESS (Railway). Compte
// "Revenus" de NexiaWallet, contrôlé par Pablo. Vérifiée EIP-55.
const FEE_RECIPIENT_ADDRESS = (() => {
  const raw = (process.env.FEE_RECIPIENT_ADDRESS || '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC').trim();
  try { return ethers.utils.getAddress(raw); } catch { return null; }
})();
// Commission prélevée sur chaque swap, en points de base (75 = 0,75 %).
// Repère marché : MetaMask ~87,5 pb, Rabby ~25 pb. 0x prélève en plus sa
// propre part côté protocole, sans réduire la nôtre.
const SWAP_FEE_BPS = Math.min(Math.max(parseInt(process.env.SWAP_FEE_BPS || '75', 10) || 0, 0), 300);

// Pont cross-chain via LI.FI. LIFI_API_KEY est un vrai secret (rate-limit +
// analytics) — il DOIT rester côté serveur, jamais dans le bundle client :
// c'est la raison d'être du proxy /bridge/quote (avant, le client appelait
// li.quest directement, sans clé et sans commission). LIFI_INTEGRATOR est la
// chaîne enregistrée sur portal.li.fi qui route les frais vers l'adresse de
// collecte de Pablo (Default EVM = FEE_RECIPIENT_ADDRESS, couvre toutes les
// chaînes EVM). LIFI_FEE = part intégrateur, float (0.0025 = 0,25 %), doit
// coller au réglage "Fees" de l'intégration ; LI.FI ajoute 0,25 % de service
// par-dessus, sans réduire notre part.
const LIFI_API_KEY = (process.env.LIFI_API_KEY || '').trim();
const LIFI_INTEGRATOR = (process.env.LIFI_INTEGRATOR || 'nexiawallet').trim();
const LIFI_FEE = (() => {
  const n = parseFloat(process.env.LIFI_FEE || '0.0025');
  return Number.isFinite(n) && n >= 0 && n < 0.1 ? n : 0.0025;
})();

// Reseaux dont l'identifiant "blockchains" officiel est confirme dans la doc
// CDP (docs.cdp.coinbase.com/onramp/additional-resources/layer-2-networks).
// BSC et Bitcoin sont volontairement exclus tant que leur identifiant exact
// n'est pas verifie individuellement — un mauvais identifiant ferait
// silencieusement echouer/ignorer l'adresse de destination, meme risque que
// les contrats ERC20 non verifies ailleurs dans ce fichier.
const COINBASE_ONRAMP_NETWORKS = {
  ethereum: 'ethereum',
  base: 'base',
  polygon: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  solana: 'solana',
};

async function buildCoinbaseOnrampUrl({ walletAddress, network, clientIp, amountEur, tokenSymbol }) {
  const chain = COINBASE_ONRAMP_NETWORKS[normalizeNetwork(network)];
  if (!chain) return null;
  const jwt = await generateJwt({
    apiKeyId: COINBASE_CDP_API_KEY_ID,
    apiKeySecret: COINBASE_CDP_API_KEY_SECRET,
    requestMethod: 'POST',
    requestHost: 'api.developer.coinbase.com',
    requestPath: '/onramp/v1/token',
    expiresIn: 120,
  });
  const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      addresses: [{ address: walletAddress, blockchains: [chain] }],
      clientIp,
    }),
  });
  if (!response.ok) {
    throw new Error(`Coinbase Onramp session token error: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const params = new URLSearchParams({ sessionToken: data.token, fiatCurrency: 'EUR' });
  // presetFiatAmount/defaultAsset/defaultNetwork sont juste des presets pour
  // l'ecran d'accueil du widget Coinbase — l'utilisateur reste libre de tout
  // changer sur leur page, contrairement a l'adresse/reseau ci-dessus qui
  // conditionnent ou la crypto est reellement livree.
  if (amountEur > 0) params.set('presetFiatAmount', String(amountEur));
  if (tokenSymbol) params.set('defaultAsset', tokenSymbol.toUpperCase());
  params.set('defaultNetwork', chain);
  return `https://pay.coinbase.com/buy/select-asset?${params.toString()}`;
}

// Coinbase Offramp (VENTE) — meme produit CDP, meme cle API, meme endpoint de
// session token que l'achat ci-dessus ; seule l'URL finale change
// (pay.coinbase.com/v3/sell/input). AUCUNE verification business / KYB /
// preuve d'incorporation requise cote partenaire (au contraire de MoonPay et
// Ramp qui ont refuse le compte auto-entrepreneur de Pablo) — Onramp comme
// Offramp sont actifs par defaut en "trial mode" sur tout projet CDP.
// L'utilisateur final, lui, doit avoir un compte Coinbase + KYC pour
// encaisser en fiat (SEPA en zone euro), il n'y a pas de "guest checkout"
// pour la vente comme il y en a un pour l'achat. Verifie en reel le
// 2026-09-10 : /onramp/v1/token -> 200, l'URL /v3/sell/input se charge avec
// initErrors:{} depuis une IP FR, EUR, sans restriction de pays.
async function buildCoinbaseOfframpUrl({ walletAddress, network, clientIp, amountCrypto, tokenSymbol, redirectURL }) {
  const chain = COINBASE_ONRAMP_NETWORKS[normalizeNetwork(network)];
  if (!chain) return null;
  const jwt = await generateJwt({
    apiKeyId: COINBASE_CDP_API_KEY_ID,
    apiKeySecret: COINBASE_CDP_API_KEY_SECRET,
    requestMethod: 'POST',
    requestHost: 'api.developer.coinbase.com',
    requestPath: '/onramp/v1/token',
    expiresIn: 120,
  });
  const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      addresses: [{ address: walletAddress, blockchains: [chain] }],
      assets: tokenSymbol ? [tokenSymbol.toUpperCase()] : undefined,
      clientIp,
    }),
  });
  if (!response.ok) {
    throw new Error(`Coinbase Offramp session token error: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const params = new URLSearchParams({ sessionToken: data.token, fiatCurrency: 'EUR' });
  // redirectUrl est OBLIGATOIRE pour l'Offramp (sans lui la page renvoie
  // initErrors:{missingParams:["redirectUrl"]}) — c'est la ou Coinbase renvoie
  // l'utilisateur une fois la vente confirmee. partnerUserRef sert au
  // rapprochement cote webhook.
  if (redirectURL) params.set('redirectUrl', redirectURL);
  params.set('partnerUserRef', `nexiawallet-${Date.now()}`);
  if (amountCrypto > 0) params.set('presetCryptoAmount', String(amountCrypto));
  if (tokenSymbol) params.set('defaultAsset', tokenSymbol.toUpperCase());
  params.set('defaultNetwork', chain);
  return `https://pay.coinbase.com/v3/sell/input?${params.toString()}`;
}

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const solanaConnection = new SolanaConnection(SOLANA_RPC_URL, 'confirmed');

const BLOCKSTREAM_API_URL = process.env.BLOCKSTREAM_API_URL || 'https://blockstream.info/api';

function isValidSolanaAddress(address) {
  try { new SolanaPublicKey(address); return true; } catch { return false; }
}

// Vérification par regex (pas de librairie Bitcoin côté backend — la vraie
// validation avec vérification de checksum se fait déjà côté client avant
// signature, voir isValidBitcoinAddress dans wallet-final/lib/wallet.js).
// Couvre legacy (1...), P2SH (3...) et bech32/bech32m natif segwit (bc1...).
function isValidBitcoinAddress(address) {
  return /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address || '');
}

function buildMoonPayUrl({ currencyCode, walletAddress, baseCurrencyAmount, redirectURL }) {
  const fields = {
    apiKey: MOONPAY_API_KEY,
    currencyCode,
    baseCurrencyCode: 'usd',
    baseCurrencyAmount: String(baseCurrencyAmount),
    redirectURL,
  };
  // La signature est obligatoire dès qu'on préremplit walletAddress. Sans clé
  // secrète configurée, on laisse le champ vide : le widget MoonPay marche
  // quand même, l'utilisateur colle juste son adresse à la main.
  if (MOONPAY_SECRET_KEY) fields.walletAddress = walletAddress;

  const params = new URLSearchParams(fields);
  const url = `${MOONPAY_BASE_URL}?${params.toString()}`;
  if (!MOONPAY_SECRET_KEY) return url;

  const signature = crypto
    .createHmac('sha256', MOONPAY_SECRET_KEY)
    .update(new URL(url).search)
    .digest('base64');
  return `${url}&signature=${encodeURIComponent(signature)}`;
}

// Widget de vente : `refundWalletAddress` (où MoonPay renvoie les fonds en
// cas d'échec KYC/mauvais actif envoyé) exige une signature HMAC dès qu'il
// est présent — contrairement à l'achat, on ne peut donc PAS proposer de
// mode "sans clé secrète" ici : la clé secrète MoonPay est obligatoire.
function buildMoonPaySellUrl({ currencyCode, refundWalletAddress, baseCurrencyAmount, redirectURL }) {
  const fields = {
    apiKey: MOONPAY_API_KEY,
    baseCurrencyCode: currencyCode,
    quoteCurrencyCode: 'usd',
    baseCurrencyAmount: String(baseCurrencyAmount),
    refundWalletAddress,
    redirectURL,
  };
  const params = new URLSearchParams(fields);
  const url = `${MOONPAY_SELL_BASE_URL}?${params.toString()}`;
  const signature = crypto
    .createHmac('sha256', MOONPAY_SECRET_KEY)
    .update(new URL(url).search)
    .digest('base64');
  return `${url}&signature=${encodeURIComponent(signature)}`;
}

// Webhook MoonPay — LA vraie confirmation qu'un achat a abouti. MoonPay livre
// la crypto directement on-chain à walletAddress ; ce webhook nous notifie
// côté serveur (utile pour logs/support), le solde réel reste vérifiable sur
// la blockchain via /wallet/info comme pour n'importe quelle transaction.
// Clé distincte de MOONPAY_SECRET_KEY — dashboard.moonpay.com > Developers > Webhooks.
const MOONPAY_WEBHOOK_KEY = (process.env.MOONPAY_WEBHOOK_KEY || '').trim();

function verifyMoonPayWebhook(req) {
  const header = req.header('moonpay-signature-v2');
  const match = header && /t=([^,]+),s=(.+)/.exec(header);
  if (!match) return false;
  const [, timestamp, signature] = match;
  const signedPayload = `${timestamp}.${req.rawBody || ''}`;
  const expected = crypto.createHmac('sha256', MOONPAY_WEBHOOK_KEY).update(signedPayload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

const NETWORKS = {
  ethereum: {
    chainId: 1,
    nativeSymbol: 'ETH',
    rpcUrl: process.env.ETHEREUM_RPC_URL || process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com',
  },
  sepolia: {
    chainId: 11155111,
    nativeSymbol: 'ETH',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  bsc: {
    chainId: 56,
    nativeSymbol: 'BNB',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-rpc.publicnode.com',
  },
  polygon: {
    chainId: 137,
    nativeSymbol: 'MATIC',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
  },
  // Gardé synchronisé à la main avec wallet-final/lib/wallet.js — mêmes
  // endpoints RPC, vérifiés directement (eth_chainId).
  arbitrum: {
    chainId: 42161,
    nativeSymbol: 'ETH',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
  },
  optimism: {
    chainId: 10,
    nativeSymbol: 'ETH',
    rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://optimism-rpc.publicnode.com',
  },
  base: {
    chainId: 8453,
    nativeSymbol: 'ETH',
    rpcUrl: process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com',
  },
};

const NETWORK_ALIASES = {
  mainnet: 'ethereum',
  eth: 'ethereum',
  ethereum: 'ethereum',
  bnb: 'bsc',
  bsc: 'bsc',
  polygon: 'polygon',
  matic: 'polygon',
  arbitrum: 'arbitrum',
  optimism: 'optimism',
  base: 'base',
  sepolia: 'sepolia',
  solana: 'solana',
  sol: 'solana',
  bitcoin: 'bitcoin',
  btc: 'bitcoin',
};

const providers = Object.fromEntries(
  Object.entries(NETWORKS).map(([name, cfg]) => [name, new ethers.providers.JsonRpcProvider(cfg.rpcUrl)])
);

function normalizeNetwork(network = 'ethereum') {
  return NETWORK_ALIASES[network?.toLowerCase()] || network?.toLowerCase() || 'ethereum';
}

function getProvider(network = 'ethereum') {
  return providers[normalizeNetwork(network)] || providers.ethereum;
}

function getNetworkConfig(network = 'ethereum') {
  return NETWORKS[normalizeNetwork(network)] || NETWORKS.ethereum;
}

const FALLBACK_MARKET_DATA = [
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', current_price: 3500, market_cap: 420000000000, price_change_percentage_24h: 1.2, image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', current_price: 64000, market_cap: 1260000000000, price_change_percentage_24h: 0.8, image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', current_price: 600, market_cap: 89000000000, price_change_percentage_24h: 1.7, image: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', current_price: 150, market_cap: 68000000000, price_change_percentage_24h: -0.6, image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'tether', symbol: 'USDT', name: 'Tether', current_price: 1, market_cap: 110000000000, price_change_percentage_24h: 0.1, image: 'https://assets.coingecko.com/coins/images/325/large/Tether.png' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', current_price: 0.65, market_cap: 23000000000, price_change_percentage_24h: -0.4, image: 'https://assets.coingecko.com/coins/images/975/large/cardano.png' },
  { id: 'polygon-ecosystem-token', symbol: 'POL', name: 'POL (ex-MATIC)', current_price: 0.11, market_cap: 1100000000, price_change_percentage_24h: 0.2, image: 'https://coin-images.coingecko.com/coins/images/32440/large/pol.png' },
];

// Ids qui doivent TOUJOURS apparaître dans /market, qu'ils soient ou non
// dans le top ${limit} par capitalisation -- doit rester synchronisé à la
// main avec WALLET_TOKENS dans wallet-final/App.js (mêmes tokens dont le
// wallet a besoin du prix pour calculer les soldes en $). Ajouté après avoir
// découvert en audit que 'polygon-ecosystem-token' (POL, ex-MATIC depuis la
// migration de Polygon en 2024) est classé ~68e par capitalisation -- hors
// du top 50 -- donc silencieusement absent de la réponse générale, ce qui
// gelait le prix affiché de MATIC/POL côté client (jamais mis à jour).
const ALWAYS_INCLUDED_COIN_IDS = [
  'ethereum', 'bitcoin', 'binancecoin', 'solana', 'tether', 'usd-coin', 'cardano', 'polygon-ecosystem-token',
];

// 'x-api-key' n'est PAS le bon nom d'en-tête pour CoinGecko -- vérifié en
// direct : CoinGecko l'ignore silencieusement (200 OK, requête traitée comme
// anonyme, peu importe la valeur envoyée), alors que 'x-cg-demo-api-key'
// (plan Demo gratuit, à récupérer sur coingecko.com/en/api) est bien reconnu
// et validé (401 explicite si la clé est absente/invalide). Avec l'ancien
// nom, une clé configurée dans .env/Railway n'aurait jamais eu d'effet.
function coingeckoHeaders() {
  return process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {};
}

// Cache mémoire partagé entre TOUS les appelants — sans lui, chaque client qui
// rafraîchit sa page (et chaque utilisateur une fois public) déclenche son
// propre appel CoinGecko, ce qui épuise très vite le quota gratuit (429 Too
// Many Requests, déjà observé en test). Un cache de quelques dizaines de
// secondes suffit largement pour des prix crypto affichés côté wallet.
const geckoCache = new Map(); // key -> { data, expiresAt }

async function cachedFetch(key, ttlMs, loader) {
  const hit = geckoCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  const data = await loader();
  geckoCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// Top N cryptos par capitalisation — alimente l'onglet Marché avec un vrai
// marché large (façon Trust Wallet), pas juste les quelques tokens du wallet.
// Les tokens du wallet (WALLET_TOKENS) sont de toute façon dans ce top N,
// donc l'écran d'accueil continue de trouver ses prix dans la même réponse.
function mapCoinGeckoMarketItem(item) {
  return {
    id: item.id,
    symbol: item.symbol?.toUpperCase(),
    name: item.name,
    current_price: item.current_price,
    market_cap: item.market_cap,
    price_change_percentage_24h: item.price_change_percentage_24h,
    price_change_percentage_7d: item.price_change_percentage_7d_in_currency,
    price_change_percentage_30d: item.price_change_percentage_30d_in_currency,
    image: item.image,
  };
}

async function fetchCoinGeckoMarket(limit = 50) {
  return cachedFetch(`market:${limit}`, 30_000, async () => {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
    try {
      const response = await fetch(url, { headers: coingeckoHeaders() });
      if (!response.ok) throw new Error(`CoinGecko error ${response.status}`);
      const data = await response.json();
      const mapped = data.map(mapCoinGeckoMarketItem);

      // Complète avec les ids garantis absents du top N (voir
      // ALWAYS_INCLUDED_COIN_IDS) — un seul appel supplémentaire groupé,
      // jamais un par id manquant.
      const missingIds = ALWAYS_INCLUDED_COIN_IDS.filter(id => !mapped.some(t => t.id === id));
      if (missingIds.length) {
        try {
          const extraUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${missingIds.join(',')}&sparkline=false&price_change_percentage=24h,7d,30d`;
          const extraResponse = await fetch(extraUrl, { headers: coingeckoHeaders() });
          if (extraResponse.ok) {
            const extraData = await extraResponse.json();
            mapped.push(...extraData.map(mapCoinGeckoMarketItem));
          } else {
            console.warn(`CoinGecko: impossible de récupérer les ids manquants (${missingIds.join(',')}), statut ${extraResponse.status}`);
          }
        } catch (extraError) {
          console.warn('CoinGecko: appel complémentaire pour ids manquants échoué:', extraError.message);
        }
      }
      return mapped;
    } catch (error) {
      console.warn('CoinGecko unavailable, using fallback market data:', error.message);
      return FALLBACK_MARKET_DATA;
    }
  });
}

// Jours d'historique demandés à CoinGecko selon le zoom choisi dans l'app —
// la granularité des bougies (30min/4h/4j) est décidée par CoinGecko selon `days`.
const CANDLE_DAYS_BY_TIMEFRAME = { '1H': 1, '1J': 7, '1S': 90, '1M': 180 };

async function fetchCoinOhlc(cgId, timeframe) {
  return cachedFetch(`ohlc:${cgId}:${timeframe}`, 60_000, async () => {
    const days = CANDLE_DAYS_BY_TIMEFRAME[timeframe] || 7;
    const url = `https://api.coingecko.com/api/v3/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`;
    const response = await fetch(url, { headers: coingeckoHeaders() });
    if (!response.ok) throw new Error(`CoinGecko OHLC error ${response.status}`);
    const raw = await response.json(); // [ [time, open, high, low, close], ... ]
    return raw.map(([time, o, h, l, c]) => ({ time, o, h, l, c }));
  });
}

async function fetchCoinDetail(cgId) {
  return cachedFetch(`coin:${cgId}`, 120_000, () => fetchCoinDetailUncached(cgId));
}

async function fetchCoinDetailUncached(cgId) {
  const url = `https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  const response = await fetch(url, { headers: coingeckoHeaders() });
  if (!response.ok) throw new Error(`CoinGecko coin error ${response.status}`);
  const d = await response.json();
  const md = d.market_data || {};
  return {
    id: d.id,
    symbol: d.symbol?.toUpperCase(),
    name: d.name,
    // Première phrase de la description CoinGecko : mentionne en général qui/quelle
    // fondation a créé le projet et son objectif — pas de donnée inventée.
    description: (d.description?.en || '').split(/(?<=\.)\s+/)[0] || '',
    homepage: d.links?.homepage?.find(Boolean) || '',
    genesisDate: d.genesis_date || null,
    categories: (d.categories || []).filter(Boolean),
    marketCapRank: d.market_cap_rank ?? null,
    marketCap: md.market_cap?.usd ?? null,
    fullyDilutedValuation: md.fully_diluted_valuation?.usd ?? null,
    totalVolume: md.total_volume?.usd ?? null,
    circulatingSupply: md.circulating_supply ?? null,
    totalSupply: md.total_supply ?? null,
    maxSupply: md.max_supply ?? null,
    ath: md.ath?.usd ?? null,
    athDate: md.ath_date?.usd ?? null,
    atl: md.atl?.usd ?? null,
    atlDate: md.atl_date?.usd ?? null,
  };
}

router.use((req, res, next) => {
  const apiKey = req.header('x-api-key');
  // MoonPay appelle ce endpoint directement — il ne connaît pas notre clé API,
  // sa légitimité est prouvée par la signature HMAC vérifiée dans le handler.
  // /nft/image-proxy : chargé depuis <Image source={{uri}}> côté client, qui
  // ne peut pas joindre d'en-tête personnalisé sur le web (limite de <img>,
  // pas de cette app) — sa protection vient de ses propres garde-fous SSRF/
  // taille/type de contenu et du rate-limit, pas de cette clé (qui n'est de
  // toute façon pas un vrai secret, voir commentaire sur APP_API_KEYS).
  if (req.path === '/' || req.path === '/webhooks/moonpay' || req.path === '/nft/image-proxy' || req.method === 'OPTIONS') return next();
  if (!apiKey || !APP_API_KEYS.has(apiKey)) {
    return res.status(401).json({ success: false, error: 'Clé API invalide ou absente.' });
  }
  next();
});

router.post('/webhooks/moonpay', (req, res) => {
  if (MOONPAY_WEBHOOK_KEY) {
    if (!verifyMoonPayWebhook(req)) {
      return res.status(401).json({ success: false, error: 'Signature webhook invalide.' });
    }
  } else {
    console.warn('⚠️  Webhook MoonPay reçu sans MOONPAY_WEBHOOK_KEY configurée — signature NON vérifiée, événement ignoré.');
    return res.json({ received: true, verified: false });
  }
  const { type, data } = req.body || {};
  console.log(`💳 MoonPay [${type}] statut=${data?.status} adresse=${data?.walletAddress} montant=${data?.baseCurrencyAmount}${data?.baseCurrencyCode} -> ${data?.quoteCurrencyAmount} ${data?.currency?.code}`);
  res.json({ received: true, verified: true });
});

router.get('/market', async (req, res) => {
  try {
    const tokens = await fetchCoinGeckoMarket();
    res.json({ success: true, tokens });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

router.get('/coin/:cgId', async (req, res) => {
  try {
    const coin = await fetchCoinDetail(req.params.cgId);
    res.json({ success: true, coin });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

router.get('/coin/:cgId/candles', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe || '1J').toUpperCase();
    const candles = await fetchCoinOhlc(req.params.cgId, timeframe);
    res.json({ success: true, candles });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

// News crypto — flux RSS CoinDesk, public et gratuit, pas de clé requise.
async function fetchCryptoNews() {
  return cachedFetch('news', 5 * 60_000, fetchCryptoNewsUncached);
}

async function fetchCryptoNewsUncached() {
  const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/');
  if (!response.ok) throw new Error(`RSS error ${response.status}`);
  const xml = await response.text();
  const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const pick = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
    return m ? decodeEntities(m[1].trim()) : '';
  };
  const pickImage = (block) => decodeEntities(block.match(/<media:content url="([^"]+)"/)?.[1] || '');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 20)
    .map(([, block]) => ({
      title: pick(block, 'title'),
      link: pick(block, 'link'),
      pubDate: pick(block, 'pubDate'),
      description: pick(block, 'description').replace(/<[^>]+>/g, '').slice(0, 220),
      image: pickImage(block),
    }));
}

router.get('/news', async (req, res) => {
  try {
    const items = await fetchCryptoNews();
    res.json({ success: true, items });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

// Historique des transactions. Clés côté serveur uniquement, jamais exposées
// au client, comme pour CoinGecko/MoonPay.
//
// Le choix de la source par réseau vit dans src/history : Etherscan V2 ne
// couvre plus gratuitement BNB Chain, Optimism et Base (« Free API access is
// not supported for this chain »), ces trois réseaux répondaient donc 500 et
// l'écran Activité restait vide. Blockscout et NodeReal prennent le relais là
// où il le faut ; les listes rendues gardent les noms de champs d'Etherscan,
// donc la mise en forme ci-dessous n'a pas changé.
//
// Histoire ancienne, à ne pas refaire : avant l'audit du 28/08/2026, seuls
// ethereum et bsc étaient déclarés. Un utilisateur sur Polygon, Arbitrum,
// Optimism ou Base retombait silencieusement sur chainid=1 et voyait
// l'historique ETHEREUM de son adresse -- même adresse EVM partout, donc
// aucune erreur, juste des données trompeuses. D'où la table explicite,
// réseau par réseau, dans src/history.
const historySources = createHistorySources();

async function fetchTxHistory(address, network = 'ethereum', limit = 25) {
  return cachedFetch(`txhistory:${network}:${address.toLowerCase()}`, 20_000, async () => {
    const { native, tokens } = await historySources.fetchRawHistory({
      network: normalizeNetwork(network),
      address,
      limit,
    });

    // gasUsed * gasPrice (en wei, natif) -- seul l'expéditeur paie le gas,
    // donc n'a de sens que pour les tx sortantes ; utilisé côté client pour
    // la page "Mes stats" (frais totaux payés).
    const feeWei = (tx) => {
      try { return ethers.BigNumber.from(tx.gasUsed || '0').mul(ethers.BigNumber.from(tx.gasPrice || '0')).toString(); }
      catch { return '0'; }
    };

    const addrLower = address.toLowerCase();
    const nativeItems = native.map(tx => ({
      hash: tx.hash,
      type: 'native',
      // Même bug que la table des réseaux ci-dessus : un ternaire bsc/ETH
      // codait en dur "ETH" pour Polygon aussi, alors que son token natif
      // est MATIC/POL -- utilise la config réseau déjà correcte partout
      // ailleurs dans ce fichier plutôt qu'une deuxième liste à maintenir.
      symbol: getNetworkConfig(network).nativeSymbol,
      direction: tx.from?.toLowerCase() === addrLower ? 'out' : 'in',
      amount: ethers.utils.formatEther(tx.value || '0'),
      timestamp: Number(tx.timeStamp) * 1000,
      from: tx.from,
      to: tx.to,
      failed: tx.isError === '1',
      feeWei: feeWei(tx),
    }));
    const tokenItems = tokens.map(tx => ({
      hash: tx.hash,
      type: 'erc20',
      symbol: tx.tokenSymbol,
      direction: tx.from?.toLowerCase() === addrLower ? 'out' : 'in',
      amount: ethers.utils.formatUnits(tx.value || '0', Number(tx.tokenDecimal) || 18),
      timestamp: Number(tx.timeStamp) * 1000,
      from: tx.from,
      to: tx.to,
      failed: false,
      feeWei: feeWei(tx),
    }));

    return [...nativeItems, ...tokenItems]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  });
}

router.get('/tx/history', async (req, res) => {
  try {
    const { address, network = 'ethereum' } = req.query;
    if (!address || !ethers.utils.isAddress(address)) {
      return res.status(400).json({ success: false, error: 'Adresse invalide.' });
    }
    const items = await fetchTxHistory(address, network, 25);
    res.json({ success: true, items });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

// Swap réel — agrégateur DEX 0x, clé côté serveur uniquement. Le backend ne
// fait QUE demander un devis chiffré (prix + transaction à exécuter) ; la
// construction, la signature et la diffusion restent 100% côté client, comme
// n'importe quel envoi (aucune clé privée ne transite jamais par ici).
router.get('/swap/quote', sensitiveLimiter, async (req, res) => {
  try {
    const apiKey = process.env.ZEROX_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'Swap non configuré (ZEROX_API_KEY manquante dans .env).' });
    }
    const { network = 'ethereum', sellToken, buyToken, sellAmount, taker } = req.query;
    const isValidTokenAddress = (addr) => typeof addr === 'string' && ethers.utils.isAddress(addr);
    const isValidAmount = typeof sellAmount === 'string' && /^[1-9][0-9]*$/.test(sellAmount);
    if (
      !isValidTokenAddress(sellToken) ||
      !isValidTokenAddress(buyToken) ||
      !isValidAmount ||
      !ethers.utils.isAddress(taker || '') ||
      !['ethereum', 'bsc'].includes(network)
    ) {
      return res.status(400).json({ success: false, error: 'Paramètres de swap invalides.' });
    }

    const chainId = getNetworkConfig(network).chainId;
    const quoteParams = { chainId, sellToken, buyToken, sellAmount, taker };
    // Commission NexiaWallet : 0x prélève swapFeeBps sur le buyToken et
    // l'envoie directement on-chain à swapFeeRecipient à chaque swap réglé
    // (aucune custody de notre côté). N'est ajouté que si l'adresse de
    // réception est valide et le taux > 0. Divulgué à l'utilisateur côté app.
    if (FEE_RECIPIENT_ADDRESS && SWAP_FEE_BPS > 0) {
      quoteParams.swapFeeRecipient = FEE_RECIPIENT_ADDRESS;
      quoteParams.swapFeeBps = String(SWAP_FEE_BPS);
      quoteParams.swapFeeToken = buyToken;
    }
    const qs = new URLSearchParams(quoteParams).toString();
    const response = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${qs}`, {
      headers: { '0x-api-key': apiKey, '0x-version': 'v2' },
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ success: false, error: data?.reason || data?.validationErrors?.[0]?.reason || data?.message || 'Devis de swap impossible.' });
    }
    res.json({ success: true, quote: data, feeBps: (FEE_RECIPIENT_ADDRESS && SWAP_FEE_BPS > 0) ? SWAP_FEE_BPS : 0 });
    revenueHooks.onSwapQuote({ chainId, sellToken, buyToken, sellAmount, taker, quote: data, feeBps: (FEE_RECIPIENT_ADDRESS && SWAP_FEE_BPS > 0) ? SWAP_FEE_BPS : 0 });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

// Proxy du devis de pont LI.FI — sert deux buts : (1) garder LIFI_API_KEY
// côté serveur, (2) injecter integrator + fee côté serveur pour que la
// commission NexiaWallet soit toujours appliquée (un client ne peut pas la
// retirer). Scope volontairement restreint à l'ETH natif entre Ethereum /
// Arbitrum / Optimism / Base, comme la v1 client (voir wallet-final/lib/
// bridge.js) : bridger un ERC20 imposerait de revérifier son adresse sur
// chaque chaîne de destination. La transaction reste signée + diffusée
// 100 % côté client, LI.FI ne voit jamais la clé privée.
const BRIDGE_CHAIN_IDS = [1, 42161, 10, 8453];
const NATIVE_TOKEN_PLACEHOLDER = '0x0000000000000000000000000000000000000000';

router.get('/bridge/quote', sensitiveLimiter, async (req, res) => {
  try {
    const { fromChain, toChain, fromAddress, fromAmount } = req.query;
    const fc = parseInt(fromChain, 10);
    const tc = parseInt(toChain, 10);
    if (!BRIDGE_CHAIN_IDS.includes(fc) || !BRIDGE_CHAIN_IDS.includes(tc) || fc === tc) {
      return res.status(400).json({ success: false, error: 'Chaînes de pont invalides.' });
    }
    if (!ethers.utils.isAddress(fromAddress || '')) {
      return res.status(400).json({ success: false, error: 'Adresse invalide.' });
    }
    if (typeof fromAmount !== 'string' || !/^[1-9][0-9]*$/.test(fromAmount)) {
      return res.status(400).json({ success: false, error: 'Montant invalide.' });
    }

    const params = new URLSearchParams({
      fromChain: String(fc),
      toChain: String(tc),
      fromToken: NATIVE_TOKEN_PLACEHOLDER,
      toToken: NATIVE_TOKEN_PLACEHOLDER,
      fromAddress,
      fromAmount,
      integrator: LIFI_INTEGRATOR,
    });
    if (LIFI_FEE > 0) params.set('fee', String(LIFI_FEE));

    const response = await fetch(`https://li.quest/v1/quote?${params.toString()}`, {
      headers: LIFI_API_KEY ? { 'x-lifi-api-key': LIFI_API_KEY } : {},
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status === 404 ? 404 : 400).json({
        success: false,
        error: data?.message || 'Aucune route de pont disponible pour ce montant.',
      });
    }
    res.json({ success: true, quote: data, feePct: LIFI_FEE * 100 });
    revenueHooks.onBridgeQuote({ fromChain: fc, toChain: tc, fromAddress, fromAmount, quote: data, fee: LIFI_FEE });
  } catch (error) {
    console.error('Bridge quote error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors du devis de pont.' });
  }
});

// ── ÉCHANGE ENTRE ÉCOSYSTÈMES (EVM ↔ Solana ↔ Bitcoin) ──────────────────
// L'échange « classique » (/swap/quote, agrégateur 0x) ne sait faire que de
// l'EVM, sur une seule chaîne à la fois : impossible d'échanger du BTC ou du
// SOL. LI.FI, déjà utilisé pour le pont, couvre les trois écosystèmes — on
// passe donc par lui, avec des identifiants de chaîne qui lui sont propres.
//
// Ce que l'app doit signer diffère selon l'écosystème de DÉPART, et c'est
// elle qui signe, toujours en local (le backend ne relaie que du signé) :
//   - EVM     : une transaction classique (to / data / value) ;
//   - Solana  : une transaction sérialisée en base64 ;
//   - Bitcoin : un PSBT (transactionRequest.data commence par 70736274ff).
const CROSS_NETWORKS = {
  ethereum: { id: 1,                ecosysteme: 'evm' },
  bsc:      { id: 56,               ecosysteme: 'evm' },
  polygon:  { id: 137,              ecosysteme: 'evm' },
  arbitrum: { id: 42161,            ecosysteme: 'evm' },
  optimism: { id: 10,               ecosysteme: 'evm' },
  base:     { id: 8453,             ecosysteme: 'evm' },
  solana:   { id: 1151111081099710, ecosysteme: 'solana' },
  bitcoin:  { id: 20000000000001,   ecosysteme: 'bitcoin' },
};

const EST_ADRESSE_SOLANA = (v) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v || '');
const EST_ADRESSE_BITCOIN = (v) => /^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(v || '');

function adresseValidePour(ecosysteme, adresse) {
  if (ecosysteme === 'evm') return ethers.utils.isAddress(adresse || '');
  if (ecosysteme === 'solana') return EST_ADRESSE_SOLANA(adresse);
  return EST_ADRESSE_BITCOIN(adresse);
}

// Un jeton se désigne par son symbole (SOL, BTC, USDC…), par une adresse de
// contrat EVM, ou par une adresse de mint Solana.
function jetonValide(v) {
  const s = String(v || '').trim();
  return /^[A-Za-z0-9]{2,12}$/.test(s) || ethers.utils.isAddress(s) || EST_ADRESSE_SOLANA(s);
}

router.get('/swap/cross-quote', sensitiveLimiter, async (req, res) => {
  try {
    const { fromNetwork, toNetwork, fromToken, toToken, fromAmount, fromAddress, toAddress } = req.query;
    const depart = CROSS_NETWORKS[String(fromNetwork || '').toLowerCase()];
    const arrivee = CROSS_NETWORKS[String(toNetwork || '').toLowerCase()];
    if (!depart || !arrivee) {
      return res.status(400).json({ success: false, error: 'Réseaux d\'échange invalides.' });
    }
    if (!jetonValide(fromToken) || !jetonValide(toToken)) {
      return res.status(400).json({ success: false, error: 'Jetons invalides.' });
    }
    if (typeof fromAmount !== 'string' || !/^[1-9][0-9]*$/.test(fromAmount)) {
      return res.status(400).json({ success: false, error: 'Montant invalide.' });
    }
    if (!adresseValidePour(depart.ecosysteme, fromAddress)) {
      return res.status(400).json({ success: false, error: 'Adresse de départ invalide pour ce réseau.' });
    }
    if (!adresseValidePour(arrivee.ecosysteme, toAddress)) {
      return res.status(400).json({ success: false, error: 'Adresse de destination invalide pour ce réseau.' });
    }
    if (depart.id === arrivee.id && String(fromToken).toLowerCase() === String(toToken).toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Choisis deux jetons différents.' });
    }

    const base = {
      fromChain: String(depart.id),
      toChain: String(arrivee.id),
      fromToken: String(fromToken).trim(),
      toToken: String(toToken).trim(),
      fromAddress,
      toAddress,
      fromAmount,
      integrator: LIFI_INTEGRATOR,
    };

    const demander = async (avecCommission) => {
      const params = new URLSearchParams(avecCommission && LIFI_FEE > 0 ? { ...base, fee: String(LIFI_FEE) } : base);
      const reponse = await fetch(`https://li.quest/v1/quote?${params.toString()}`, {
        headers: LIFI_API_KEY ? { 'x-lifi-api-key': LIFI_API_KEY } : {},
      });
      return { reponse, data: await reponse.json().catch(() => null) };
    };

    let commissionAppliquee = LIFI_FEE > 0;
    let { reponse, data } = await demander(commissionAppliquee);

    // LI.FI refuse la commission tant qu'aucune adresse de collecte n'est
    // configurée pour CETTE chaîne sur portal.li.fi (le cas aujourd'hui pour
    // Solana et Bitcoin). Plutôt que de priver l'utilisateur de l'échange, on
    // redemande sans commission — et on le signale dans la réponse.
    if (!reponse.ok && commissionAppliquee && /not configured for collecting fees/i.test(JSON.stringify(data || ''))) {
      console.warn(`LI.FI : commission non collectée sur ${fromNetwork} (adresse de collecte à configurer sur portal.li.fi)`);
      commissionAppliquee = false;
      ({ reponse, data } = await demander(false));
    }

    if (!reponse.ok || !data?.transactionRequest) {
      return res.status(400).json({
        success: false,
        error: data?.message || 'Aucune route disponible pour cet échange.',
      });
    }

    res.json({
      success: true,
      quote: data,
      ecosystemeDepart: depart.ecosysteme,
      feePct: commissionAppliquee ? LIFI_FEE * 100 : 0,
      commissionAppliquee,
    });
    revenueHooks.onBridgeQuote({
      fromChain: depart.id, toChain: arrivee.id, fromAddress, fromAmount,
      quote: data, fee: commissionAppliquee ? LIFI_FEE : 0,
    });
  } catch (error) {
    console.error('Cross swap quote error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur lors du devis d\'échange.' });
  }
});

// Galerie NFT (lecture seule) — clé Alchemy côté serveur uniquement, même
// principe que ZEROX_API_KEY ci-dessus : évite d'exposer une clé liée au
// compte/quota personnel de Pablo dans le bundle client public (visible par
// n'importe qui via les DevTools). L'envoi d'un NFT reste 100% côté client
// (signature locale + POST /tx/broadcast existant, comme un envoi ERC20) —
// cette route ne fait QUE lire les NFT déjà possédés, aucune clé privée ici.
// Sous-domaines Alchemy par réseau — la clé (process.env.ALCHEMY_API_KEY)
// est la MÊME pour tous, mais chaque réseau doit être activé séparément sur
// le tableau de bord Alchemy (Settings > Networks) pour cette clé, sinon
// Alchemy répond 403 "XXX_MAINNET is not enabled for this app". Vérifié en
// direct : seul ethereum est activé sur la clé actuelle (2026-08-18) — les
// autres réseaux fonctionneront dès qu'ils seront activés côté dashboard,
// aucun changement de code nécessaire à ce moment-là.
const ALCHEMY_NFT_SUBDOMAINS = {
  ethereum: 'eth-mainnet',
  polygon: 'polygon-mainnet',
  arbitrum: 'arb-mainnet',
  optimism: 'opt-mainnet',
  base: 'base-mainnet',
};

router.get('/nft/owned/:address', sensitiveLimiter, async (req, res) => {
  try {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ success: false, error: 'NFT non configuré (ALCHEMY_API_KEY manquante dans .env).' });
    }
    const { address } = req.params;
    if (!ethers.utils.isAddress(address)) {
      return res.status(400).json({ success: false, error: 'Adresse invalide.' });
    }
    const requestedNetwork = normalizeNetwork(req.query.network || 'ethereum');
    const subdomain = ALCHEMY_NFT_SUBDOMAINS[requestedNetwork];
    if (!subdomain) {
      return res.status(400).json({ success: false, error: `Galerie NFT non supportée sur ${requestedNetwork}.` });
    }
    const url = `https://${subdomain}.g.alchemy.com/v2/${apiKey}/getNFTs?owner=${address}&withMetadata=true`;
    const response = await fetch(url);
    // Alchemy répond parfois en texte brut (pas du JSON) sur certaines
    // erreurs — ex. 403 "XXX_MAINNET is not enabled for this app" — .json()
    // planterait dessus (vu en vrai : "Unexpected token 'M'..."). Lit le
    // texte d'abord, ne parse en JSON que si ça y ressemble.
    const rawBody = await response.text();
    let data = null;
    try { data = JSON.parse(rawBody); } catch { /* réponse non-JSON, on garde rawBody */ }
    if (!response.ok) {
      const notEnabled = response.status === 403 && /not enabled for this app/i.test(data?.message || rawBody || '');
      return res.status(400).json({
        success: false,
        error: notEnabled
          ? `Réseau ${requestedNetwork} pas encore activé sur le tableau de bord Alchemy pour cette clé.`
          : (data?.message || 'Impossible de récupérer les NFT.'),
      });
    }
    const nfts = (data.ownedNfts || [])
      .filter((n) => (n.id?.tokenMetadata?.tokenType || 'ERC721') === 'ERC721')
      .map((n) => ({
        contract: n.contract?.address,
        tokenId: n.id?.tokenId,
        title: n.title || n.metadata?.name || 'NFT',
        image: (n.media?.[0]?.gateway || n.metadata?.image || '').replace('ipfs://', 'https://ipfs.io/ipfs/'),
      }));
    res.json({ success: true, nfts });
  } catch (error) {
    console.error('Wallet route error:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
  }
});

// Proxy d'image NFT — le client ne charge JAMAIS directement une URL d'image
// tirée des métadonnées d'un NFT. Un NFT peut être envoyé à N'IMPORTE QUELLE
// adresse sans consentement (spam/phishing bien connu : "NFT airdrop"), et son
// champ `image` pointe vers un serveur entièrement contrôlé par l'attaquant —
// le charger directement depuis l'app révélerait l'IP (et l'horodatage précis
// d'ouverture de la galerie) de l'utilisateur à cet attaquant, reliant son
// adresse de wallet à son IP. En relayant l'image depuis ce backend, c'est
// l'IP de Railway que voit l'attaquant, jamais celle de l'utilisateur.
//
// resolvePublicImageHost bloque toute IP privée/loopback/link-local/réservée
// AVANT la requête, pour empêcher qu'une métadonnée malveillante
// (ex. image pointant vers 169.254.169.254 ou un service interne) ne
// transforme ce proxy en SSRF vers le réseau interne de la plateforme
// d'hébergement. maxRedirects désactivé (une redirection pourrait repointer
// vers une IP interne sans revalidation), taille et type de contenu limités.
//
// IMPORTANT : l'IP validée ici est ensuite FIXÉE pour la requête réelle
// (voir fetchImagePinned) — on ne se contente pas de vérifier le nom
// d'hôte puis de laisser une deuxième résolution DNS indépendante avoir
// lieu au moment de la requête. Un attaquant contrôlant le domaine (toute
// métadonnée NFT peut pointer où il veut) pourrait sinon faire répondre
// une IP publique à la vérification puis une IP interne à la requête
// réelle quelques millisecondes plus tard (DNS rebinding / TOCTOU),
// contournant entièrement la protection.
const IMAGE_PROXY_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo — largement suffisant pour une image NFT
const IMAGE_PROXY_TIMEOUT_MS = 8000;

async function resolvePublicImageHost(hostname) {
  const { address } = await dns.promises.lookup(hostname);
  const range = ipaddr.parse(address).range();
  if (range !== 'unicast') throw new Error(`Hôte non autorisé (${range}).`);
  return address;
}

// Se connecte directement à `pinnedIp` (déjà validée) tout en envoyant le
// Host d'origine et, en HTTPS, le bon SNI/`servername` pour que la
// vérification du certificat porte sur le VRAI nom d'hôte — jamais sur
// l'IP. Aucune deuxième résolution DNS n'a lieu : c'est précisément ce qui
// empêche le rebinding.
function fetchImagePinned(parsed, pinnedIp, timeoutMs) {
  return new Promise((resolve, reject) => {
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const req = transport.request({
      host: pinnedIp,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      servername: isHttps ? parsed.hostname : undefined,
      headers: {
        Host: parsed.hostname,
        'User-Agent': 'NexiaWallet-ImageProxy/1.0',
      },
    }, resolve);
    req.on('error', reject);
    const timer = setTimeout(() => req.destroy(new Error('Délai dépassé.')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

router.get('/nft/image-proxy', sensitiveLimiter, async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ success: false, error: 'Paramètre url requis.' });
    }
    let parsed;
    try { parsed = new URL(rawUrl); } catch { return res.status(400).json({ success: false, error: 'URL invalide.' }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ success: false, error: 'Seuls http/https sont autorisés.' });
    }

    let pinnedIp;
    try {
      pinnedIp = await resolvePublicImageHost(parsed.hostname);
    } catch {
      return res.status(400).json({ success: false, error: 'Cette image ne peut pas être chargée.' });
    }

    let upstream;
    try {
      upstream = await fetchImagePinned(parsed, pinnedIp, IMAGE_PROXY_TIMEOUT_MS);
    } catch {
      return res.status(400).json({ success: false, error: 'Impossible de charger cette image.' });
    }

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      upstream.destroy();
      return res.status(400).json({ success: false, error: 'Impossible de charger cette image.' });
    }
    const contentType = upstream.headers['content-type'] || '';
    if (!contentType.startsWith('image/')) {
      upstream.destroy();
      return res.status(400).json({ success: false, error: "Ce contenu n'est pas une image." });
    }
    const declaredLength = parseInt(upstream.headers['content-length'] || '0', 10);
    if (declaredLength > IMAGE_PROXY_MAX_BYTES) {
      upstream.destroy();
      return res.status(400).json({ success: false, error: 'Image trop volumineuse.' });
    }

    // Lecture en flux avec plafond dur — un Content-Length absent ou mensonger
    // ne doit jamais permettre de faire lire au serveur un corps arbitrairement
    // grand (déni de service mémoire).
    const chunks = [];
    let total = 0;
    try {
      for await (const chunk of upstream) {
        total += chunk.length;
        if (total > IMAGE_PROXY_MAX_BYTES) {
          upstream.destroy();
          return res.status(400).json({ success: false, error: 'Image trop volumineuse.' });
        }
        chunks.push(chunk);
      }
    } catch {
      return res.status(400).json({ success: false, error: 'Impossible de charger cette image.' });
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.concat(chunks));
  } catch (error) {
    res.status(400).json({ success: false, error: 'Impossible de charger cette image.' });
  }
});

router.post('/payments/create-checkout-session', sensitiveLimiter, async (req, res) => {
  try {
    const { amountUsd, tokenSymbol, network = 'ethereum', returnUrl, walletAddress } = req.body;
    if (!amountUsd || !tokenSymbol) {
      return res.status(400).json({ success: false, error: 'Montant et token requis.' });
    }
    const normalizedBuyNetwork = normalizeNetwork(network);
    const walletAddressValid = normalizedBuyNetwork === 'solana'
      ? isValidSolanaAddress(walletAddress || '')
      : normalizedBuyNetwork === 'bitcoin'
      ? isValidBitcoinAddress(walletAddress || '')
      : ethers.utils.isAddress(walletAddress || '');
    if ((PAYMENT_PROVIDER === 'moonpay' || PAYMENT_PROVIDER === 'coinbase') && !walletAddressValid) {
      return res.status(400).json({ success: false, error: 'Adresse de wallet (walletAddress) invalide ou manquante.' });
    }

    const intAmount = Math.round(parseFloat(amountUsd) * 100);
    if (!Number.isFinite(intAmount) || intAmount <= 0 || intAmount > 5_000_00) {
      return res.status(400).json({ success: false, error: 'Montant invalide (entre 1 et 5000).' });
    }

    // returnUrl/Origin ne sont acceptés comme cible de redirection QUE s'ils
    // correspondent à une origine de confiance connue (voir
    // src/config/allowedOrigins.js) — sinon on retombe sur FRONTEND_URL.
    // Sans ce garde-fou, n'importe qui peut appeler cette route directement
    // (x-api-key n'est pas un vrai secret, il est dans le bundle public) avec
    // un returnUrl arbitraire et obtenir une URL de paiement MoonPay/Stripe
    // légitime qui redirige ensuite la victime vers un site de phishing.
    const frontendBase = (() => {
      if (returnUrl && typeof returnUrl === 'string' && returnUrl.startsWith('http')) {
        try {
          const candidate = new URL(returnUrl).origin;
          if (isTrustedOrigin(candidate)) return candidate;
        } catch (err) {
          // ignore invalid URL
        }
      }
      if (req.headers.origin && isTrustedOrigin(req.headers.origin)) {
        try {
          return new URL(req.headers.origin).origin;
        } catch (err) {
          // ignore invalid origin
        }
      }
      return FRONTEND_URL;
    })();

    if (PAYMENT_PROVIDER === 'coinbase') {
      if (!COINBASE_CDP_API_KEY_ID || !COINBASE_CDP_API_KEY_SECRET) {
        return res.status(503).json({ success: false, error: 'Coinbase Onramp non configuré (clé CDP manquante dans .env).' });
      }
      let url;
      try {
        url = await buildCoinbaseOnrampUrl({ walletAddress, network, clientIp: req.ip, amountEur: intAmount / 100, tokenSymbol });
      } catch (err) {
        console.error('Coinbase Onramp error:', err);
        return res.status(502).json({ success: false, error: 'Impossible de générer la session Coinbase Onramp.' });
      }
      if (!url) {
        return res.status(400).json({ success: false, error: `Achat sur le réseau "${network}" non supporté par Coinbase Onramp pour l'instant — choisis Ethereum, Base, Polygon, Arbitrum, Optimism ou Solana.` });
      }
      return res.json({ success: true, provider: 'coinbase', url });
    }

    if (PAYMENT_PROVIDER === 'moonpay') {
      if (!MOONPAY_API_KEY) {
        return res.status(503).json({ success: false, error: 'MoonPay non configuré (MOONPAY_API_KEY manquante dans .env).' });
      }
      const currencyCode = MOONPAY_CURRENCY_CODES[normalizeNetwork(network)]?.[tokenSymbol.toUpperCase()];
      if (!currencyCode) {
        return res.status(400).json({ success: false, error: `Achat de ${tokenSymbol} non supporté sur ce wallet (une seule adresse EVM) — choisis ETH, BNB, USDT ou USDC.` });
      }
      const url = buildMoonPayUrl({
        currencyCode,
        walletAddress,
        baseCurrencyAmount: (intAmount / 100).toFixed(2),
        redirectURL: frontendBase,
      });
      return res.json({
        success: true,
        provider: 'moonpay',
        url,
        message: MOONPAY_SECRET_KEY ? undefined : 'Adresse non pré-remplie (clé secrète MoonPay absente) — colle ton adresse dans le widget.',
      });
    }

    if (!stripe || PAYMENT_PROVIDER !== 'stripe') {
      const demoUrl = `${frontendBase}?payment=demo&token=${encodeURIComponent(tokenSymbol)}&amount=${encodeURIComponent(amountUsd)}`;
      return res.json({
        success: true,
        provider: 'demo',
        demo: true,
        url: demoUrl,
        message: 'Flux d’achat prêt en mode test. Configure PAYMENT_PROVIDER (coinbase/moonpay/stripe) pour un paiement réel.',
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Achat ${tokenSymbol} sur Wallet Pro` },
          unit_amount: intAmount,
        },
        quantity: 1,
      }],
      success_url: `${frontendBase}?payment=success&token=${encodeURIComponent(tokenSymbol)}`,
      cancel_url: `${frontendBase}?payment=cancel`,
    });

    res.json({ success: true, provider: 'stripe', url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ success: false, error: 'Erreur de paiement.' });
  }
});

// Vente de crypto (off-ramp) — l'utilisateur envoie lui-même les fonds depuis
// son wallet vers l'adresse de dépôt affichée par le widget (aucun accès à sa
// clé privée requis côté backend, cohérent avec l'architecture non-custodiale).
// Fournisseur : Coinbase Offramp si PAYMENT_PROVIDER=coinbase (aucune KYB
// partenaire requise), sinon repli sur MoonPay (clés sandbox uniquement tant
// que la vérification business MoonPay n'est pas validée).
router.post('/payments/create-sell-session', sensitiveLimiter, async (req, res) => {
  try {
    const { amountCrypto, tokenSymbol, network = 'ethereum', returnUrl, walletAddress } = req.body;
    if (!amountCrypto || !tokenSymbol) {
      return res.status(400).json({ success: false, error: 'Montant et token requis.' });
    }
    const normalizedSellNetwork = normalizeNetwork(network);
    const walletAddressValid = normalizedSellNetwork === 'solana'
      ? isValidSolanaAddress(walletAddress || '')
      : normalizedSellNetwork === 'bitcoin'
      ? isValidBitcoinAddress(walletAddress || '')
      : ethers.utils.isAddress(walletAddress || '');
    if (!walletAddressValid) {
      return res.status(400).json({ success: false, error: 'Adresse de wallet (walletAddress) invalide ou manquante.' });
    }
    const amount = parseFloat(amountCrypto);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide.' });
    }

    // Même garde-fou que create-checkout-session — voir le commentaire
    // au-dessus de son frontendBase.
    const frontendBase = (() => {
      if (returnUrl && typeof returnUrl === 'string' && returnUrl.startsWith('http')) {
        try {
          const candidate = new URL(returnUrl).origin;
          if (isTrustedOrigin(candidate)) return candidate;
        } catch (err) { /* ignore invalid URL */ }
      }
      if (req.headers.origin && isTrustedOrigin(req.headers.origin)) {
        try { return new URL(req.headers.origin).origin; } catch (err) { /* ignore invalid origin */ }
      }
      return FRONTEND_URL;
    })();

    if (PAYMENT_PROVIDER === 'coinbase') {
      if (!COINBASE_CDP_API_KEY_ID || !COINBASE_CDP_API_KEY_SECRET) {
        return res.status(503).json({ success: false, error: 'Coinbase Offramp non configuré (clé CDP manquante dans .env).' });
      }
      let url;
      try {
        url = await buildCoinbaseOfframpUrl({
          walletAddress,
          network,
          clientIp: req.ip,
          amountCrypto: amount,
          tokenSymbol,
          redirectURL: frontendBase,
        });
      } catch (err) {
        console.error('Coinbase Offramp error:', err);
        return res.status(502).json({ success: false, error: 'Impossible de générer la session Coinbase Offramp.' });
      }
      if (!url) {
        return res.status(400).json({ success: false, error: `Vente sur le réseau "${network}" non supportée par Coinbase pour l'instant — choisis Ethereum, Base, Polygon, Arbitrum, Optimism ou Solana.` });
      }
      return res.json({ success: true, provider: 'coinbase', url });
    }

    // Repli MoonPay (clés sandbox uniquement pour l'instant).
    if (!MOONPAY_API_KEY || !MOONPAY_SECRET_KEY) {
      return res.status(503).json({ success: false, error: 'MoonPay non configuré (clé API/secrète manquante dans .env).' });
    }
    const currencyCode = MOONPAY_CURRENCY_CODES[normalizedSellNetwork]?.[tokenSymbol.toUpperCase()];
    if (!currencyCode) {
      return res.status(400).json({ success: false, error: `Vente de ${tokenSymbol} non supportée sur ce wallet.` });
    }
    const url = buildMoonPaySellUrl({
      currencyCode,
      refundWalletAddress: walletAddress,
      baseCurrencyAmount: amount,
      redirectURL: frontendBase,
    });
    res.json({ success: true, provider: 'moonpay', url });
  } catch (error) {
    console.error('Sell session error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la création de la session de vente.' });
  }
});

// Relais de diffusion — wallet non-custodial : reçoit une transaction DÉJÀ
// signée côté client (jamais de clé privée ici) et la relaie telle quelle au
// réseau. Cette route ne construit ni ne signe rien ; une transaction signée
// est de toute façon une donnée publique dès l'instant où elle est diffusée.
router.post('/tx/broadcast', sensitiveLimiter, async (req, res) => {
  try {
    const { rawTx, network = 'ethereum' } = req.body;
    if (!rawTx || typeof rawTx !== 'string') {
      return res.status(400).json({ success: false, error: 'Transaction signée (rawTx) requise.' });
    }
    const transactionResponse = await getProvider(network).sendTransaction(rawTx);
    res.json({ success: true, txHash: transactionResponse.hash, network });
    revenueHooks.onBroadcast({ rawTx, txHash: transactionResponse.hash });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(400).json({ success: false, error: error.message || 'Diffusion de la transaction impossible.' });
  }
});

// Même principe que /tx/broadcast mais pour Solana : la transaction est
// signée en local (client) et sérialisée en base64 (voir signSolanaTransferTx
// dans wallet-final/lib/wallet.js) ; ce backend ne fait que la relayer au
// RPC Solana. Route distincte car le format de transaction (et le client
// RPC) n'a rien à voir avec une rawTx EVM.
router.post('/tx/broadcast-solana', sensitiveLimiter, async (req, res) => {
  try {
    const { rawTx } = req.body;
    if (!rawTx || typeof rawTx !== 'string') {
      return res.status(400).json({ success: false, error: 'Transaction signée (rawTx) requise.' });
    }
    const signature = await solanaConnection.sendRawTransaction(Buffer.from(rawTx, 'base64'));
    res.json({ success: true, txHash: signature, network: 'solana' });
  } catch (error) {
    console.error('Solana broadcast error:', error);
    res.status(400).json({ success: false, error: error.message || 'Diffusion de la transaction Solana impossible.' });
  }
});

// Même principe que /tx/broadcast-solana mais pour Bitcoin : la transaction
// est construite et signée en local (client, format hex — voir
// signBitcoinTransferTx dans wallet-final/lib/wallet.js) ; ce backend relaie
// juste le hex à l'API publique Blockstream, aucune librairie Bitcoin
// nécessaire ici (évite de répéter l'incident uuid/@solana/web3.js sur une
// dépendance backend supplémentaire).
router.post('/tx/broadcast-bitcoin', sensitiveLimiter, async (req, res) => {
  try {
    const { rawTx } = req.body;
    if (!rawTx || typeof rawTx !== 'string') {
      return res.status(400).json({ success: false, error: 'Transaction signée (rawTx) requise.' });
    }
    const response = await fetch(`${BLOCKSTREAM_API_URL}/tx`, { method: 'POST', body: rawTx });
    const text = await response.text();
    if (!response.ok) {
      return res.status(400).json({ success: false, error: text || 'Diffusion de la transaction Bitcoin impossible.' });
    }
    res.json({ success: true, txHash: text.trim(), network: 'bitcoin' });
  } catch (error) {
    console.error('Bitcoin broadcast error:', error);
    res.status(400).json({ success: false, error: error.message || 'Diffusion de la transaction Bitcoin impossible.' });
  }
});

// Profil léger optionnel : associe un email à une adresse de wallet, pour
// notifications futures / acquisition. Pas d'authentification au-delà de la
// clé API app (même modèle que les autres routes) — l'adresse n'est pas un
// secret, et on accepte qu'un tiers puisse en théorie soumettre un email
// pour une adresse qui n'est pas la sienne (impact nul : ni fonds ni accès
// au wallet ne dépendent de ce profil).
router.post('/profile/email', sensitiveLimiter, (req, res) => {
  const { address, email } = req.body || {};
  if (!address || typeof address !== 'string' || address.length > 100) {
    return res.status(400).json({ success: false, error: 'Adresse de wallet requise.' });
  }
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ success: false, error: 'Adresse email invalide.' });
  }
  try {
    saveEmailProfile(address, email.trim().toLowerCase());
    res.json({ success: true });
  } catch (error) {
    console.error('Email profile save error:', error);
    res.status(500).json({ success: false, error: 'Impossible d\'enregistrer l\'email pour le moment.' });
  }
});

module.exports = router;