const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const crypto = require('crypto');
const Stripe = require('stripe');
const rateLimit = require('express-rate-limit');
const { Connection: SolanaConnection, PublicKey: SolanaPublicKey } = require('@solana/web3.js');

const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8083';
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'demo').toLowerCase();
const APP_API_KEYS = new Set(
  (process.env.APP_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
);

// Limite plus stricte sur les routes sensibles (création/import/envoi/paiement) —
// le rate-limit global de server.js (100/15min) est trop permissif pour ces
// actions-là une fois le serveur exposé publiquement (spam de wallets, essais
// répétés de clé privée, abus du flux d'achat).
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.SENSITIVE_RATE_LIMIT_MAX, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Trop de requêtes sensibles depuis cette IP — réessaie dans quelques minutes.' },
});

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
const MOONPAY_CURRENCY_CODES = {
  ethereum: { ETH: 'eth', USDT: 'usdt_eth', USDC: 'usdc_eth' },
  bsc:      { BNB: 'bnb_bsc', USDT: 'usdt_bsc', USDC: 'usdc_bsc' },
  polygon:  { MATIC: 'matic_polygon' },
  solana:   { SOL: 'sol' },
};

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const solanaConnection = new SolanaConnection(SOLANA_RPC_URL, 'confirmed');

function isValidSolanaAddress(address) {
  try { new SolanaPublicKey(address); return true; } catch { return false; }
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
};

const NETWORK_ALIASES = {
  mainnet: 'ethereum',
  eth: 'ethereum',
  ethereum: 'ethereum',
  bnb: 'bsc',
  bsc: 'bsc',
  polygon: 'polygon',
  matic: 'polygon',
  sepolia: 'sepolia',
  solana: 'solana',
  sol: 'solana',
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

// Adresses vérifiées sur Etherscan/BscScan — une seule adresse par (réseau,
// token). Ne jamais modifier sans revérifier sur l'explorateur officiel :
// une erreur ici fait perdre des fonds. Même config que côté client
// (wallet-final/lib/wallet.js), gardée synchronisée à la main.
const ERC20_TOKENS = {
  ethereum: {
    USDC: { symbol: 'USDC', address: process.env.USDC_CONTRACT_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { symbol: 'USDT', address: process.env.USDT_CONTRACT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
  },
  bsc: {
    USDC: { symbol: 'USDC', address: process.env.USDC_BSC_CONTRACT_ADDRESS || '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
    USDT: { symbol: 'USDT', address: process.env.USDT_BSC_CONTRACT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  },
};

function getErc20Token(symbol, network = 'ethereum') {
  return ERC20_TOKENS[normalizeNetwork(network)]?.[symbol?.toUpperCase()] || null;
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];

function getErc20Contract(address, network = 'ethereum') {
  return new ethers.Contract(address, ERC20_ABI, getProvider(network));
}

function getConnectedWallet(wallet, network = 'ethereum') {
  if (!wallet) return null;
  return wallet.connect(getProvider(network));
}

const FALLBACK_MARKET_DATA = [
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', current_price: 3500, market_cap: 420000000000, price_change_percentage_24h: 1.2, image: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', current_price: 64000, market_cap: 1260000000000, price_change_percentage_24h: 0.8, image: 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png' },
  { id: 'binancecoin', symbol: 'BNB', name: 'BNB', current_price: 600, market_cap: 89000000000, price_change_percentage_24h: 1.7, image: 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', current_price: 150, market_cap: 68000000000, price_change_percentage_24h: -0.6, image: 'https://assets.coingecko.com/coins/images/4128/large/solana.png' },
  { id: 'tether', symbol: 'USDT', name: 'Tether', current_price: 1, market_cap: 110000000000, price_change_percentage_24h: 0.1, image: 'https://assets.coingecko.com/coins/images/325/large/Tether.png' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', current_price: 0.65, market_cap: 23000000000, price_change_percentage_24h: -0.4, image: 'https://assets.coingecko.com/coins/images/975/large/cardano.png' },
  { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', current_price: 0.9, market_cap: 8500000000, price_change_percentage_24h: 0.2, image: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png' },
];

function coingeckoHeaders() {
  return process.env.COINGECKO_API_KEY ? { 'x-api-key': process.env.COINGECKO_API_KEY } : {};
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
async function fetchCoinGeckoMarket(limit = 50) {
  return cachedFetch(`market:${limit}`, 30_000, async () => {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
    try {
      const response = await fetch(url, { headers: coingeckoHeaders() });
      if (!response.ok) throw new Error(`CoinGecko error ${response.status}`);
      const data = await response.json();
      return data.map(item => ({
        id: item.id,
        symbol: item.symbol?.toUpperCase(),
        name: item.name,
        current_price: item.current_price,
        market_cap: item.market_cap,
        price_change_percentage_24h: item.price_change_percentage_24h,
        price_change_percentage_7d: item.price_change_percentage_7d_in_currency,
        price_change_percentage_30d: item.price_change_percentage_30d_in_currency,
        image: item.image,
      }));
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

// ── Sessions par wallet ──────────────────────────────────────────
// Chaque wallet créé/importé vit dans SA PROPRE session, indexée par un
// token aléatoire de 256 bits que seul le client qui a créé le wallet
// connaît. Sans ça, un seul wallet en mémoire serait partagé par TOUS
// les appelants du serveur — désastreux dès que le serveur est exposé
// publiquement (n'importe qui pourrait lire/vider le wallet actif d'un
// autre utilisateur).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h d'inactivité max
const MAX_SESSIONS = 5000; // garde-fou anti-épuisement mémoire (exposition publique)
const sessions = new Map(); // token -> { wallet, createdAt }

function createSession(wallet) {
  if (sessions.size >= MAX_SESSIONS) {
    const oldestToken = sessions.keys().next().value;
    sessions.delete(oldestToken);
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { wallet, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const entry = sessions.get(token);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return entry;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of sessions) {
    if (now - entry.createdAt > SESSION_TTL_MS) sessions.delete(token);
  }
}, 60 * 60 * 1000).unref();

function requireSession(req, res, next) {
  const session = getSession(req.header('x-session-token'));
  if (!session) {
    return res.status(401).json({ success: false, error: 'Session wallet invalide ou expirée. Recrée ou réimporte ton wallet.', needCreate: true });
  }
  req.walletSession = session;
  next();
}

router.use((req, res, next) => {
  const apiKey = req.header('x-api-key');
  // MoonPay appelle ce endpoint directement — il ne connaît pas notre clé API,
  // sa légitimité est prouvée par la signature HMAC vérifiée dans le handler.
  if (req.path === '/' || req.path === '/webhooks/moonpay' || req.method === 'OPTIONS') return next();
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

// 1. ROUTE DE CRÉATION DE WALLET (Génération d'une vraie Seed Phrase à 12 mots)
router.post('/create', sensitiveLimiter, async (req, res) => {
  try {
    const { network = 'ethereum' } = req.body;
    const wallet = ethers.Wallet.createRandom();
    const sessionToken = createSession(wallet);

    res.json({
      success: true,
      message: "Nouveau wallet réel généré !",
      sessionToken,
      address: wallet.address,
      mnemonic: wallet.mnemonic.phrase,
      privateKey: wallet.privateKey,
      balance: "0.0",
      network,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/import', sensitiveLimiter, async (req, res) => {
  try {
    const { mnemonic, privateKey, network = 'ethereum' } = req.body;
    if (!mnemonic && !privateKey) {
      return res.status(400).json({ success: false, error: 'Mnemonic ou clé privée requise.' });
    }

    let wallet;
    if (mnemonic) {
      wallet = ethers.Wallet.fromMnemonic(mnemonic.trim());
    } else {
      wallet = new ethers.Wallet(privateKey.trim());
    }

    const sessionToken = createSession(wallet);
    const connectedWallet = getConnectedWallet(wallet, network);
    const balanceWei = await getProvider(network).getBalance(connectedWallet.address);
    const balance = ethers.utils.formatEther(balanceWei);

    res.json({
      success: true,
      sessionToken,
      address: connectedWallet.address,
      balance,
      message: 'Wallet importé avec succès.',
      network,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/erc20/balance/:symbol', requireSession, async (req, res) => {
  try {
    const network = (req.query.network || 'sepolia').toLowerCase();
    const token = getErc20Token(req.params.symbol, network);
    if (!token?.address) {
      return res.status(400).json({ success: false, error: 'Token ERC20 non configuré.' });
    }
    const connectedWallet = getConnectedWallet(req.walletSession.wallet, network);

    const contract = getErc20Contract(token.address, network);
    const balance = await contract.balanceOf(connectedWallet.address);
    const formatted = ethers.utils.formatUnits(balance, token.decimals);

    res.json({ success: true, symbol: token.symbol, balance: formatted, network });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/erc20/send', sensitiveLimiter, requireSession, async (req, res) => {
  const { to, amount, symbol, network = 'ethereum' } = req.body;
  const connectedWallet = getConnectedWallet(req.walletSession.wallet, network);
  if (!to || !amount || !symbol) return res.status(400).json({ success: false, error: 'Paramètres manquants.' });

  const token = getErc20Token(symbol, network);
  if (!token?.address) {
    return res.status(400).json({ success: false, error: 'Token ERC20 non configuré pour l\'envoi.' });
  }
  if (!ethers.utils.isAddress(to)) {
    return res.status(400).json({ success: false, error: 'Adresse de destination invalide.' });
  }

  try {
    const contract = getErc20Contract(token.address, network).connect(connectedWallet);
    const value = ethers.utils.parseUnits(amount.toString(), token.decimals);

    const currentBalance = await contract.balanceOf(connectedWallet.address);
    if (currentBalance.lt(value)) {
      return res.status(400).json({ success: false, error: `Fonds ${token.symbol} insuffisants sur le wallet.` });
    }

    const tx = await contract.transfer(to, value);
    await tx.wait();

    res.json({
      success: true,
      message: `${token.symbol} envoyé avec succès !`,
      txHash: tx.hash,
      network,
    });
  } catch (error) {
    console.error('ERC20 send error:', error);
    res.status(400).json({ success: false, error: 'Transfert ERC20 impossible (fonds insuffisants, gas, ou erreur réseau).' });
  }
});

router.get('/market', async (req, res) => {
  try {
    const tokens = await fetchCoinGeckoMarket();
    res.json({ success: true, tokens });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/coin/:cgId', async (req, res) => {
  try {
    const coin = await fetchCoinDetail(req.params.cgId);
    res.json({ success: true, coin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/coin/:cgId/candles', async (req, res) => {
  try {
    const timeframe = (req.query.timeframe || '1J').toUpperCase();
    const candles = await fetchCoinOhlc(req.params.cgId, timeframe);
    res.json({ success: true, candles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historique des transactions — Etherscan API v2 (une seule clé couvre
// Ethereum ET BSC depuis leur unification multichain). Clé côté serveur
// uniquement : jamais exposée au client, comme pour CoinGecko/MoonPay.
const ETHERSCAN_CHAIN_IDS = { ethereum: 1, bsc: 56 };

async function fetchEtherscan(params) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error('ETHERSCAN_API_KEY manquante dans .env');
  const qs = new URLSearchParams({ ...params, apikey: apiKey }).toString();
  const response = await fetch(`https://api.etherscan.io/v2/api?${qs}`);
  if (!response.ok) throw new Error(`Etherscan error ${response.status}`);
  const data = await response.json();
  // Etherscan répond status="0" + message="No transactions found" pour une
  // adresse neuve — ce n'est pas une erreur, juste une liste vide.
  if (data.status === '0' && data.message !== 'No transactions found') {
    throw new Error(data.result || data.message || 'Erreur Etherscan');
  }
  return Array.isArray(data.result) ? data.result : [];
}

async function fetchTxHistory(address, network = 'ethereum', limit = 25) {
  return cachedFetch(`txhistory:${network}:${address.toLowerCase()}`, 20_000, async () => {
    const chainid = ETHERSCAN_CHAIN_IDS[normalizeNetwork(network)] || ETHERSCAN_CHAIN_IDS.ethereum;
    const base = { chainid, address, startblock: 0, endblock: 99999999, page: 1, offset: limit, sort: 'desc' };

    const [native, tokens] = await Promise.all([
      fetchEtherscan({ ...base, module: 'account', action: 'txlist' }),
      fetchEtherscan({ ...base, module: 'account', action: 'tokentx' }),
    ]);

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
      symbol: normalizeNetwork(network) === 'bsc' ? 'BNB' : 'ETH',
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
    res.status(500).json({ success: false, error: error.message });
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
    const qs = new URLSearchParams({ chainId, sellToken, buyToken, sellAmount, taker }).toString();
    const response = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${qs}`, {
      headers: { '0x-api-key': apiKey, '0x-version': 'v2' },
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(400).json({ success: false, error: data?.reason || data?.validationErrors?.[0]?.reason || data?.message || 'Devis de swap impossible.' });
    }
    res.json({ success: true, quote: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/payments/create-checkout-session', sensitiveLimiter, async (req, res) => {
  try {
    const { amountUsd, tokenSymbol, network = 'ethereum', returnUrl, walletAddress } = req.body;
    if (!amountUsd || !tokenSymbol) {
      return res.status(400).json({ success: false, error: 'Montant et token requis.' });
    }
    const isSolanaPurchase = normalizeNetwork(network) === 'solana';
    const walletAddressValid = isSolanaPurchase
      ? isValidSolanaAddress(walletAddress || '')
      : ethers.utils.isAddress(walletAddress || '');
    if (PAYMENT_PROVIDER === 'moonpay' && !walletAddressValid) {
      return res.status(400).json({ success: false, error: 'Adresse de wallet (walletAddress) invalide ou manquante.' });
    }

    const intAmount = Math.round(parseFloat(amountUsd) * 100);
    if (!Number.isFinite(intAmount) || intAmount <= 0 || intAmount > 5_000_00) {
      return res.status(400).json({ success: false, error: 'Montant invalide (entre 1 et 5000 USD).' });
    }

    const frontendBase = (() => {
      if (returnUrl && typeof returnUrl === 'string' && returnUrl.startsWith('http')) {
        try {
          return new URL(returnUrl).origin;
        } catch (err) {
          // ignore invalid URL
        }
      }
      if (req.headers.origin) {
        try {
          return new URL(req.headers.origin).origin;
        } catch (err) {
          // ignore invalid origin
        }
      }
      return FRONTEND_URL;
    })();

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
        message: 'Flux d’achat prêt en mode test. Branche Stripe/MoonPay pour un paiement réel.',
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
    res.status(500).json({ success: false, error: error.message || 'Erreur de paiement.' });
  }
});

router.get('/info', requireSession, async (req, res) => {
  try {
    const network = normalizeNetwork(req.query.network || 'ethereum');
    const connectedWallet = getConnectedWallet(req.walletSession.wallet, network);

    const balanceWei = await getProvider(network).getBalance(connectedWallet.address);
    const balance = ethers.utils.formatEther(balanceWei);
    const cfg = getNetworkConfig(network);

    res.json({
      success: true,
      address: connectedWallet.address,
      balance,
      network,
      chainId: cfg.chainId,
      nativeSymbol: cfg.nativeSymbol,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/bsc/info', requireSession, async (req, res) => {
  try {
    const connectedWallet = getConnectedWallet(req.walletSession.wallet, 'bsc');

    const balanceWei = await getProvider('bsc').getBalance(connectedWallet.address);
    const balance = ethers.utils.formatEther(balanceWei);
    const cfg = getNetworkConfig('bsc');

    res.json({
      success: true,
      address: connectedWallet.address,
      balance,
      network: 'bsc',
      chainId: cfg.chainId,
      nativeSymbol: cfg.nativeSymbol,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function sendNative(req, res, network = 'ethereum') {
  const { to, amount } = req.body;
  const connectedWallet = getConnectedWallet(req.walletSession.wallet, network);

  try {
    if (!ethers.utils.isAddress(to)) {
      return res.status(400).json({ success: false, error: 'L\'adresse de destination n\'est pas valide !' });
    }

    const provider = getProvider(network);
    const currentBalanceWei = await provider.getBalance(connectedWallet.address);
    const currentBalance = ethers.utils.formatEther(currentBalanceWei);
    if (parseFloat(currentBalance) < parseFloat(amount)) {
      return res.status(400).json({ success: false, error: 'Fonds insuffisants sur le wallet.' });
    }

    const tx = {
      to,
      value: ethers.utils.parseEther(amount),
    };

    const transactionResponse = await connectedWallet.sendTransaction(tx);
    await transactionResponse.wait();

    const newBalanceWei = await provider.getBalance(connectedWallet.address);

    res.json({
      success: true,
      message: 'Le transfert a été validé sur la blockchain !',
      txHash: transactionResponse.hash,
      newBalance: ethers.utils.formatEther(newBalanceWei),
      network,
    });
  } catch (error) {
    console.error('Détail erreur Blockchain :', error);
    res.status(500).json({ success: false, error: error.message || 'Fonds insuffisants ou erreur de communication réseau.' });
  }
}

router.post('/send', sensitiveLimiter, requireSession, async (req, res) => {
  return sendNative(req, res, 'ethereum');
});

router.post('/bsc/send', sensitiveLimiter, requireSession, async (req, res) => {
  return sendNative(req, res, 'bsc');
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

module.exports = router;