const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const crypto = require('crypto');
const Stripe = require('stripe');

const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8083';
const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER || 'demo').toLowerCase();
const APP_API_KEYS = new Set(
  (process.env.APP_API_KEYS || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean)
);

// MoonPay — achat de crypto par carte, livré directement à l'adresse du wallet.
// Le wallet de cette app n'a qu'UNE adresse EVM (0x...) : on ne propose donc
// MoonPay que pour les tokens qui peuvent réellement arriver dessus. Acheter
// du BTC/SOL/ADA vers une adresse 0x perdrait les fonds — pas question.
const MOONPAY_API_KEY = process.env.MOONPAY_API_KEY || '';
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY || '';
const MOONPAY_BASE_URL = process.env.MOONPAY_ENV === 'production'
  ? 'https://buy.moonpay.com'
  : 'https://buy-sandbox.moonpay.com';
const MOONPAY_CURRENCY_CODES = {
  ethereum: { ETH: 'eth', USDT: 'usdt_eth', USDC: 'usdc_eth' },
  bsc:      { BNB: 'bnb_bsc', USDT: 'usdt_bsc', USDC: 'usdc_bsc' },
};

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

const TOKENS = [
  { symbol: 'ETH', cgId: 'ethereum', name: 'Ethereum' },
  { symbol: 'BTC', cgId: 'bitcoin', name: 'Bitcoin' },
  { symbol: 'BNB', cgId: 'binancecoin', name: 'BNB' },
  { symbol: 'SOL', cgId: 'solana', name: 'Solana' },
  { symbol: 'USDT', cgId: 'tether', name: 'Tether' },
  { symbol: 'ADA', cgId: 'cardano', name: 'Cardano' },
  { symbol: 'MATIC', cgId: 'matic-network', name: 'Polygon' },
];

const ERC20_TOKENS = {
  USDC: {
    symbol: 'USDC',
    address: process.env.USDC_CONTRACT_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
  },
  USDT: {
    symbol: 'USDT',
    address: process.env.USDT_CONTRACT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
  },
};

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

async function fetchCoinGeckoMarket() {
  const ids = TOKENS.map(t => t.cgId).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  const headers = {};
  if (process.env.COINGECKO_API_KEY) {
    headers['x-api-key'] = process.env.COINGECKO_API_KEY;
  }
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`CoinGecko error ${response.status}`);
    const data = await response.json();
    return data.map(item => ({
      id: item.id,
      symbol: item.symbol?.toUpperCase(),
      name: item.name,
      current_price: item.current_price,
      market_cap: item.market_cap,
      price_change_percentage_24h: item.price_change_percentage_24h,
      image: item.image,
    }));
  } catch (error) {
    console.warn('CoinGecko unavailable, using fallback market data:', error.message);
    return FALLBACK_MARKET_DATA;
  }
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
  if (req.path === '/' || req.method === 'OPTIONS') return next();
  if (!apiKey || !APP_API_KEYS.has(apiKey)) {
    return res.status(401).json({ success: false, error: 'Clé API invalide ou absente.' });
  }
  next();
});

// 1. ROUTE DE CRÉATION DE WALLET (Génération d'une vraie Seed Phrase à 12 mots)
router.post('/create', async (req, res) => {
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

router.post('/import', async (req, res) => {
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
    const token = ERC20_TOKENS[req.params.symbol?.toUpperCase()];
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

router.post('/erc20/send', requireSession, async (req, res) => {
  const { to, amount, symbol, network = 'ethereum' } = req.body;
  const connectedWallet = getConnectedWallet(req.walletSession.wallet, network);
  if (!to || !amount || !symbol) return res.status(400).json({ success: false, error: 'Paramètres manquants.' });

  const token = ERC20_TOKENS[symbol.toUpperCase()];
  if (!token?.address) {
    return res.status(400).json({ success: false, error: 'Token ERC20 non configuré pour l\'envoi.' });
  }
  if (!ethers.utils.isAddress(to)) {
    return res.status(400).json({ success: false, error: 'Adresse de destination invalide.' });
  }

  try {
    const contract = getErc20Contract(token.address, network).connect(connectedWallet);
    const value = ethers.utils.parseUnits(amount.toString(), token.decimals);
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
    res.status(500).json({ success: false, error: error.message || 'Erreur ERC20.' });
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

router.post('/payments/create-checkout-session', requireSession, async (req, res) => {
  try {
    const { amountUsd, tokenSymbol, network = 'ethereum', returnUrl } = req.body;
    if (!amountUsd || !tokenSymbol) {
      return res.status(400).json({ success: false, error: 'Montant et token requis.' });
    }

    const intAmount = Math.round(parseFloat(amountUsd) * 100);
    if (!Number.isFinite(intAmount) || intAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Montant invalide.' });
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
        walletAddress: req.walletSession.wallet.address,
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

router.post('/send', requireSession, async (req, res) => {
  return sendNative(req, res, 'ethereum');
});

router.post('/bsc/send', requireSession, async (req, res) => {
  return sendNative(req, res, 'bsc');
});

module.exports = router;