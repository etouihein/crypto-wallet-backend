/**
 * Trust Wallet Clone — React Native v4.0
 * ✅ Logos CoinGecko réels
 * ✅ Web3 + Metamask
 * ✅ Transactions Ethereum Mainnet + BSC
 * ✅ Sécurité renforcée (PIN, Biométrie prêt)
 * ✅ Meilleure gestion API
 * ✅ Erreurs et fallbacks robustes
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, SafeAreaView, TouchableOpacity,
  TextInput, ScrollView, Dimensions, ActivityIndicator,
  Modal, Alert, RefreshControl, StatusBar, Image,
  FlatList, Linking, Platform, Animated, Pressable, Easing,
  useWindowDimensions, AppState, Share, Vibration,
} from 'react-native';
import axios from 'axios';
import QRCodeSVG from 'react-native-qrcode-svg';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import jsQR from 'jsqr';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import * as localWallet from './lib/wallet';
import { ethers } from 'ethers';

const { width } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════
//  COULEURS & THÈME
// ═══════════════════════════════════════════════════════════
const T = {
  bg:      '#070A1A',
  card:    '#11182F',
  card2:   '#152444',
  border:  '#27385C',
  green:   '#00E0A5',
  greenBg: '#062F26',
  red:     '#FF6A6A',
  redBg:   '#3A1014',
  blue:    '#5E8CFF',
  blueBg:  '#071430',
  orange:  '#FFAD5A',
  orangeBg:'#312511',
  text:    '#E8F1FF',
  text2:   '#9CB1CF',
  text3:   '#7584A2',
  yellow:  '#FFD166',
  purple:  '#8B5CF6',
  // Palette "Nexia" — utilisée uniquement pour la landing page publique
  // (écran d'accueil avant création/import de wallet).
  deepBg:  '#05030e',
  violet:  '#7c3aed',
  cyan:    '#22d3ee',
  magenta: '#e879f9',
  stroke:  'rgba(139,135,168,0.18)',
};

// ═══════════════════════════════════════════════════════════
//  DEVISES & CRYPTO
// ═══════════════════════════════════════════════════════════
// Taux fixes (non rafraîchis en direct), comme le reste de cette liste —
// une imprécision de quelques % est acceptable pour un affichage indicatif,
// mais ne pas s'y fier pour un calcul exact (à rafraîchir à la main de temps
// en temps, ou brancher sur une vraie API de taux de change plus tard).
const CURRENCIES = {
  USD: { symbol: '$',   name: 'Dollar US',        flag: '🇺🇸', rate: 1      },
  EUR: { symbol: '€',   name: 'Euro',              flag: '🇪🇺', rate: 0.922  },
  GBP: { symbol: '£',   name: 'Livre Sterling',    flag: '🇬🇧', rate: 0.788  },
  CHF: { symbol: 'Fr',  name: 'Franc Suisse',      flag: '🇨🇭', rate: 0.905  },
  JPY: { symbol: '¥',   name: 'Yen Japonais',      flag: '🇯🇵', rate: 149.50 },
  CAD: { symbol: 'C$',  name: 'Dollar Canadien',   flag: '🇨🇦', rate: 1.38   },
  AUD: { symbol: 'A$',  name: 'Dollar Australien', flag: '🇦🇺', rate: 1.52   },
};

// ═══════════════════════════════════════════════════════════
//  DOCUMENTS LÉGAUX — texte affiché tel quel dans Paramètres et le footer de
//  la landing. Gabarit générique pour un wallet non-custodial ; à faire
//  relire par un juriste avant un vrai lancement à grande échelle, mais
//  couvre déjà les points essentiels (pas de garde de fonds, responsabilité
//  utilisateur sur la phrase de récupération, absence de collecte de
//  données personnelles).
// ═══════════════════════════════════════════════════════════
const LEGAL_DOCS = {
  cgu: {
    title: "Conditions Générales d'Utilisation",
    updated: '5 juillet 2026',
    body: `1. Objet
NexiaWallet est une application de portefeuille crypto non-custodial : elle permet de générer, importer et utiliser un portefeuille Ethereum/BNB Smart Chain dont les clés privées sont générées, chiffrées et stockées uniquement sur l'appareil de l'utilisateur.

2. Nature non-custodiale
NexiaWallet ne détient, ne stocke et ne transmet jamais la clé privée ou la phrase de récupération de l'utilisateur. Chaque transaction est signée localement sur l'appareil avant d'être relayée au réseau. En conséquence, NexiaWallet n'a techniquement aucun moyen d'accéder aux fonds, de les bloquer ou de les récupérer en cas de perte des identifiants.

3. Responsabilité de l'utilisateur
L'utilisateur est seul responsable de la conservation de sa phrase de récupération et de son code PIN. Leur perte entraîne la perte définitive et irréversible de l'accès aux fonds. NexiaWallet ne peut en aucun cas restaurer un accès perdu.

4. Transactions
Les transactions sur une blockchain publique sont irréversibles. L'utilisateur doit vérifier l'adresse et le montant avant toute confirmation d'envoi. NexiaWallet n'est pas responsable des transactions envoyées à une adresse erronée.

5. Services tiers
L'achat de crypto par carte bancaire est assuré par un prestataire de paiement tiers (MoonPay), soumis à ses propres conditions et vérifications. Les prix et données de marché proviennent de fournisseurs tiers (CoinGecko, Etherscan) fournis "en l'état", sans garantie d'exactitude en temps réel.

6. Limitation de responsabilité
NexiaWallet est fourni "en l'état", sans garantie d'absence d'erreur ou d'interruption. L'utilisation de cryptomonnaies comporte des risques de marché et de sécurité que l'utilisateur accepte en connaissance de cause.

7. Évolution
Ces conditions peuvent être mises à jour ; la date de dernière mise à jour figure en haut de ce document.`,
  },
  privacy: {
    title: 'Politique de Confidentialité',
    updated: '5 juillet 2026',
    body: `1. Aucune donnée personnelle collectée
NexiaWallet ne demande ni email, ni nom, ni numéro de téléphone pour créer un wallet. Aucun compte utilisateur n'existe côté serveur.

2. Ce qui reste uniquement sur l'appareil
La clé privée, la phrase de récupération, le code PIN (chiffré), les favoris, le carnet d'adresses récentes et les alertes de prix sont stockés localement (stockage sécurisé du système ou stockage du navigateur). Rien de tout cela n'est envoyé à un serveur NexiaWallet.

3. Ce qui transite par le serveur
Le serveur NexiaWallet ne reçoit que des données publiques de blockchain nécessaires au fonctionnement : adresse publique (pour consulter un solde ou un historique), transaction déjà signée (pour la relayer au réseau). Ces données sont publiques par nature sur une blockchain.

4. Fournisseurs tiers
Les prix de marché (CoinGecko), l'historique de transactions (Etherscan) et le paiement par carte (MoonPay) sont fournis par des services tiers ; consulter leurs propres politiques de confidentialité pour le traitement effectué de leur côté.

5. Cookies et tracking
Aucun cookie publicitaire ni outil de suivi tiers n'est utilisé sur ce site.

6. Contact
Pour toute question sur cette politique, contacter l'éditeur via les informations listées dans les Mentions Légales.`,
  },
  mentions: {
    title: 'Mentions Légales',
    updated: '5 juillet 2026',
    body: `Éditeur du site
NexiaWallet — application de portefeuille crypto non-custodial.

Hébergement
Backend applicatif hébergé par Railway (railway.app). Application web hébergée par Cloudflare Pages (pages.dev).

Nature du service
NexiaWallet met à disposition un outil technique de génération et de gestion de portefeuille crypto non-custodial. NexiaWallet n'est ni un établissement de paiement, ni un prestataire de services sur actifs numériques (PSAN) au sens où elle ne détient jamais les fonds des utilisateurs.

Propriété intellectuelle
L'interface, le code et les visuels de NexiaWallet sont la propriété de leur auteur, sauf logos et données de marché appartenant à leurs fournisseurs respectifs (CoinGecko, MoonPay).

Contact
Pour toute question, un formulaire ou une adresse de contact sera ajouté prochainement.`,
  },
};

// Mini-onboarding affiché une seule fois, juste après qu'un NOUVEAU wallet
// (pas un import) a confirmé avoir noté sa phrase de récupération — le
// moment où l'utilisateur vient de tout mettre en place et est le plus
// réceptif avant de découvrir l'app par lui-même.
const ONBOARDING_SLIDES = [
  { icon: '🔐', title: 'Tes clés, tes cryptos', desc: "Ta clé privée est chiffrée uniquement sur cet appareil. Personne d'autre — pas même nous — n'y a accès." },
  { icon: '📤', title: 'Envoie et reçois', desc: 'Utilise ton adresse pour recevoir des fonds, ou envoie en quelques secondes sur Ethereum et BNB Smart Chain.' },
  { icon: '💳', title: 'Achète et échange', desc: "Achète par carte via MoonPay, ou échange directement entre cryptos au meilleur prix, sans jamais quitter l'app." },
];

// FAQ affichée sur la landing — questions réellement posées par les
// premiers testeurs (phrase de récupération, non-custodial, réseaux).
const LANDING_FAQ = [
  {
    q: "C'est quoi une phrase de récupération ?",
    a: "12 mots générés à la création de ton wallet. Ils permettent de reconstruire ta clé privée n'importe où. Si tu les perds ET perds ton appareil, personne — pas même nous — ne peut récupérer tes fonds.",
  },
  {
    q: 'Que veut dire "non-custodial" ?',
    a: "Ta clé privée est générée et chiffrée uniquement sur ton appareil. NexiaWallet ne la voit, ne la stocke et ne la transmet jamais. C'est l'opposé d'un exchange (Binance, Coinbase...) qui garde tes fonds pour toi.",
  },
  {
    q: 'Quels réseaux sont supportés ?',
    a: 'Ethereum Mainnet et BNB Smart Chain pour le moment, avec ETH, BNB, USDT et USDC actifs (solde, envoi, réception). D\'autres tokens peuvent être ajoutés en lecture seule par adresse de contrat.',
  },
  {
    q: "J'ai perdu mon téléphone, comment je récupère mon wallet ?",
    a: 'Installe NexiaWallet sur un nouvel appareil et choisis "J\'ai déjà un wallet", puis entre ta phrase de récupération de 12 mots. Sans elle, la récupération est impossible.',
  },
  {
    q: 'Le swap et l\'achat par carte sont-ils sûrs ?',
    a: "L'achat par carte passe par MoonPay, un prestataire de paiement tiers réglementé. Le swap passe par l'agrégateur DEX 0x pour trouver le meilleur prix, mais la signature de la transaction reste 100% locale sur ton appareil, comme un envoi classique.",
  },
];

// URLs images CoinGecko (logos réels)
const COIN_LOGOS = {
  ethereum:      'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  bitcoin:       'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
  binancecoin:   'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
  solana:        'https://assets.coingecko.com/coins/images/4128/large/solana.png',
  tether:        'https://assets.coingecko.com/coins/images/325/large/Tether.png',
  cardano:       'https://assets.coingecko.com/coins/images/975/large/cardano.png',
  'matic-network':'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png',
  ripple:        'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png',
  'usd-coin':    'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
};

// Tokens affichés dans "Mes Tokens" à l'accueil, avec prix réels CoinGecko.
// ETH/BNB/USDT/USDC sont entièrement actifs (solde réel, envoi, réception,
// achat) — ce wallet n'a qu'une adresse Ethereum/EVM. BTC/SOL/ADA/MATIC sont
// affichés pour la vue d'ensemble (prix réels, style Trust Wallet) mais ne
// sont pas envoyables depuis ce wallet ("Token non supporté" à l'envoi/achat).
const WALLET_TOKENS = {
  ETH:  { name: 'Ethereum', cgId: 'ethereum',      balance: 0,   icon: '🔷', color: '#5B8DEF', logo: COIN_LOGOS.ethereum },
  BTC:  { name: 'Bitcoin',  cgId: 'bitcoin',       balance: 0,   icon: '🟠', color: '#F7931A', logo: COIN_LOGOS.bitcoin, readOnly: true },
  BNB:  { name: 'BNB',      cgId: 'binancecoin',   balance: 0,   icon: '🟡', color: '#F3BA2F', logo: COIN_LOGOS.binancecoin },
  SOL:  { name: 'Solana',   cgId: 'solana',        balance: 0,   icon: '🟣', color: '#9945FF', logo: COIN_LOGOS.solana, readOnly: true },
  USDT: { name: 'Tether',   cgId: 'tether',        balance: 0,   icon: '💚', color: '#26A17B', logo: COIN_LOGOS.tether },
  USDC: { name: 'USD Coin', cgId: 'usd-coin',      balance: 0,   icon: '🟦', color: '#2775CA', logo: COIN_LOGOS['usd-coin'] },
  ADA:  { name: 'Cardano',  cgId: 'cardano',       balance: 0,   icon: '🔵', color: '#0033AD', logo: COIN_LOGOS.cardano, readOnly: true },
  MATIC:{ name: 'Polygon',  cgId: 'matic-network', balance: 0,   icon: '🟪', color: '#8247E5', logo: COIN_LOGOS['matic-network'], readOnly: true },
};

// Le wallet n'a qu'une seule adresse EVM (0x...) : on ne propose l'achat MoonPay
// que pour les tokens qui peuvent réellement y arriver, selon le réseau actif.
const BUYABLE_TOKENS = {
  ethereum: ['ETH', 'USDT', 'USDC'],
  bsc: ['BNB', 'USDT', 'USDC'],
};

// Le swap réel passe par un agrégateur DEX (0x) : on ne propose que les
// tokens pour lesquels le wallet peut réellement signer/diffuser une
// transaction (natif + ERC20/BEP20 configurés dans lib/wallet.js).
const SWAPPABLE_TOKENS = {
  ethereum: ['ETH', 'USDT', 'USDC'],
  bsc: ['BNB', 'USDT', 'USDC'],
};

const TF_CONFIG = {
  '5M':  { bucketMs: 30_000,        numCandles: 12, live: true  },
  '15M': { bucketMs: 90_000,        numCandles: 12, live: true  },
  '1H':  { bucketMs: 360_000,       numCandles: 10, live: false },
  '1J':  { bucketMs: 86_400_000,    numCandles: 7,  live: false },
  '1S':  { bucketMs: 604_800_000,   numCandles: 7,  live: false },
  '1M':  { bucketMs: 2_592_000_000, numCandles: 6,  live: false },
};
const TF_KEYS = ['5M', '15M', '1H', '1J', '1S', '1M'];

// En dev sur le LAN, l'app doit joindre le backend par IP locale. En prod
// (déploiement public), le backend vit sur un vrai domaine HTTPS et cette IP
// n'a plus aucun sens — EXPO_PUBLIC_API_BASE_URL prend le dessus dans ce cas.
const HOST_OVERRIDE = '192.168.1.2';

const getExpoHost = () => {
  if (HOST_OVERRIDE) return HOST_OVERRIDE;
  if (Platform.OS === 'web') return window.location.hostname;
  return '192.168.1.2';
};

const LOCAL_API_HOST = `${getExpoHost()}:3000`;
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || `http://${LOCAL_API_HOST}/wallet`;
const APP_API_KEY = process.env.EXPO_PUBLIC_APP_API_KEY || 'wallet-pro-dev-key-2026-7f3a9b2c';
const API_HEADERS = { 'x-api-key': APP_API_KEY };
const WALLET_STORAGE_KEY = 'wallet-pro-session-v1';

const saveWalletSession = async (session) => {
  try {
    const serialized = JSON.stringify(session);
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(WALLET_STORAGE_KEY, serialized);
    } else {
      await SecureStore.setItemAsync(WALLET_STORAGE_KEY, serialized);
    }
  } catch (error) {
    console.warn('saveWalletSession failed', error);
  }
};

const loadWalletSession = async () => {
  try {
    const raw = Platform.OS === 'web'
      ? await AsyncStorage.getItem(WALLET_STORAGE_KEY)
      : await SecureStore.getItemAsync(WALLET_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('loadWalletSession failed', error);
    return null;
  }
};

const clearWalletSession = async () => {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(WALLET_STORAGE_KEY);
    } else {
      await SecureStore.deleteItemAsync(WALLET_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('clearWalletSession failed', error);
  }
};

// Favoris : juste une liste de symboles, aucune donnée sensible — AsyncStorage
// suffit sur les deux plateformes (pas besoin du stockage chiffré natif).
const FAVORITES_STORAGE_KEY = 'wallet-pro-favorites-v1';

const loadFavorites = async () => {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('loadFavorites failed', error);
    return [];
  }
};

const saveFavorites = async (list) => {
  try {
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn('saveFavorites failed', error);
  }
};

// Déverrouillage biométrique — natif uniquement. Le PIN lui-même (pas la clé
// privée) est mis dans le Keychain/Keystore OS (déjà chiffré au niveau
// matériel par SecureStore) ; Face ID/empreinte ne fait que déclencher sa
// récupération, PUIS le PIN récupéré repasse par le déchiffrement normal du
// keystore (`decryptWalletKeystore`) — aucun raccourci qui contournerait le
// chiffrement. Absent sur web : SecureStore n'y a aucune protection
// matérielle, l'activer donnerait un faux sentiment de sécurité.
const BIOMETRIC_PIN_KEY = 'wallet-pro-biometric-pin-v1';

const saveBiometricPin = async (pin) => {
  if (Platform.OS === 'web') return;
  try { await SecureStore.setItemAsync(BIOMETRIC_PIN_KEY, pin); } catch (error) { console.warn('saveBiometricPin failed', error); }
};

const loadBiometricPin = async () => {
  if (Platform.OS === 'web') return null;
  try { return await SecureStore.getItemAsync(BIOMETRIC_PIN_KEY); } catch { return null; }
};

const clearBiometricPin = async () => {
  if (Platform.OS === 'web') return;
  try { await SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY); } catch { /* rien à faire */ }
};

// Carnet d'adresses léger : juste les dernières adresses utilisées pour
// "Envoyer", aucune donnée sensible — de simples adresses publiques 0x...
const RECENT_ADDRESSES_KEY = 'wallet-pro-recent-addresses-v1';
const MAX_RECENT_ADDRESSES = 8;

// Ancien format : simple tableau de chaînes ("0x..."). Nouveau format :
// tableau d'objets { address, label } pour permettre un nom optionnel
// ("Binance", "Compte perso"...). On normalise à la lecture pour rester
// compatible avec ce qui est déjà sauvegardé sur les appareils existants.
const loadRecentAddresses = async () => {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ADDRESSES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry => typeof entry === 'string' ? { address: entry, label: '' } : entry);
  } catch { return []; }
};

const saveRecentAddresses = async (list) => {
  try { await AsyncStorage.setItem(RECENT_ADDRESSES_KEY, JSON.stringify(list)); } catch { /* rien à faire */ }
};

// Alertes de prix — vérifiées en local à chaque rafraîchissement du marché
// (toutes les 30s pendant que l'app est ouverte). Pas de notification push
// réelle (ça demanderait un serveur dédié) : juste un toast + une alerte
// visible pendant que l'app tourne — d'où "in-app".
const PRICE_ALERTS_KEY = 'wallet-pro-price-alerts-v1';

const loadPriceAlerts = async () => {
  try {
    const raw = await AsyncStorage.getItem(PRICE_ALERTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const savePriceAlerts = async (list) => {
  try { await AsyncStorage.setItem(PRICE_ALERTS_KEY, JSON.stringify(list)); } catch { /* rien à faire */ }
};

// Historique local de la valeur totale du portefeuille — un point ajouté au
// plus toutes les 10 minutes (pas à chaque rafraîchissement de 30s, sinon le
// tableau ne couvrirait que quelques heures). Purement local, jamais envoyé
// au serveur ; se construit au fil de l'usage réel de l'app, pas de données
// rétroactives inventées.
const PORTFOLIO_HISTORY_KEY = 'wallet-pro-portfolio-history-v1';
const PORTFOLIO_HISTORY_MAX_POINTS = 200;
const PORTFOLIO_HISTORY_MIN_GAP_MS = 10 * 60 * 1000;

const loadPortfolioHistory = async () => {
  try {
    const raw = await AsyncStorage.getItem(PORTFOLIO_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const savePortfolioHistory = async (list) => {
  try { await AsyncStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(list)); } catch { /* rien à faire */ }
};

// Étiquettes locales sur les transactions (Perso/Pro/Cadeau) — juste un
// classement personnel affiché et exporté en CSV, aucune donnée envoyée
// nulle part (la transaction elle-même est déjà publique sur la blockchain).
const TX_TAGS_KEY = 'wallet-pro-tx-tags-v1';
const TX_TAG_OPTIONS = ['Perso', 'Pro', 'Cadeau'];

const loadTxTags = async () => {
  try {
    const raw = await AsyncStorage.getItem(TX_TAGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
};

const saveTxTags = async (map) => {
  try { await AsyncStorage.setItem(TX_TAGS_KEY, JSON.stringify(map)); } catch { /* rien à faire */ }
};

// Vibration au déclenchement d'une alerte de prix — activée par défaut,
// désactivable dans Paramètres. `Vibration.vibrate` de react-native-web ne
// fait rien si `navigator.vibrate` est absent (desktop), donc pas besoin de
// vérifier la plateforme avant d'appeler.
const VIBRATION_ENABLED_KEY = 'wallet-pro-vibration-enabled-v1';

const loadVibrationEnabled = async () => {
  try {
    const raw = await AsyncStorage.getItem(VIBRATION_ENABLED_KEY);
    return raw === null ? true : raw === 'true';
  } catch { return true; }
};

const saveVibrationEnabled = async (enabled) => {
  try { await AsyncStorage.setItem(VIBRATION_ENABLED_KEY, String(enabled)); } catch { /* rien à faire */ }
};

// Tokens personnalisés (adresse de contrat saisie à la main) — lecture seule,
// voir getCustomTokenInfo dans lib/wallet.js pour le pourquoi.
const CUSTOM_TOKENS_KEY = 'wallet-pro-custom-tokens-v1';

const loadCustomTokens = async () => {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_TOKENS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const saveCustomTokens = async (list) => {
  try { await AsyncStorage.setItem(CUSTOM_TOKENS_KEY, JSON.stringify(list)); } catch { /* rien à faire */ }
};

// ═══════════════════════════════════════════════════════════
//  CONFIGURATION BLOCKCHAIN RÉELLE
// ═══════════════════════════════════════════════════════════
const BLOCKCHAIN_CONFIG = {
  NETWORK: 'ethereum',
  CHAIN_ID: 1,
  RPC_URL: 'https://eth.llamarpc.com',
  EXPLORER: 'https://etherscan.io',
  GAS_LIMIT: 21000,
};

// ═══════════════════════════════════════════════════════════
//  QR CODE RÉEL
// ═══════════════════════════════════════════════════════════
// Scanner QR pour le web — expo-camera n'a pas de shim web fonctionnel
// (useCameraPermissions/CameraView plantent, voir le commentaire plus bas
// dans le composant principal), donc on pilote directement getUserMedia +
// un <video> DOM inséré à la main dans un View (React Native Web ne permet
// pas d'écrire <video> en JSX), et jsQR décode chaque frame capturée sur un
// <canvas> caché. Le natif continue d'utiliser CameraView normalement.
function WebQrScanner({ onScanned }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let stopped = false;
    let rafId = null;
    let stream = null;
    let videoEl = null;
    const canvas = document.createElement('canvas');

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        videoEl = document.createElement('video');
        videoEl.setAttribute('playsinline', 'true'); // évite le plein écran natif sur iOS Safari
        videoEl.muted = true;
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
        videoEl.srcObject = stream;
        if (containerRef.current) containerRef.current.appendChild(videoEl);
        await videoEl.play();

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (stopped) return;
          if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code?.data) { onScanned(code.data); return; }
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch (e) {
        // Les navigateurs normalisent le `name` des erreurs getUserMedia
        // (contrairement au `message`, souvent vague type "Not supported") —
        // plus fiable pour donner un message clair selon la vraie cause.
        setError(e.name || 'UnknownError');
      }
    })();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (videoEl && videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
    };
  }, [onScanned]);

  if (error) {
    const CAMERA_ERROR_MESSAGES = {
      NotAllowedError: "Accès à la caméra refusé — autorise-le dans les réglages de ton navigateur.",
      NotFoundError: 'Aucune caméra détectée sur cet appareil.',
      NotReadableError: 'La caméra est déjà utilisée par une autre application.',
      SecurityError: 'Le scan caméra nécessite une connexion sécurisée (https).',
    };
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: T.text2, textAlign: 'center' }}>
          {CAMERA_ERROR_MESSAGES[error] || "Impossible d'accéder à la caméra — utilise plutôt le collage depuis le presse-papier."}
        </Text>
      </View>
    );
  }
  return <View ref={containerRef} style={{ flex: 1, backgroundColor: '#000' }} />;
}

function QRCodeMock({ address }) {
  const size = 180;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FFF', borderRadius: 12, padding: 8, justifyContent: 'center', alignItems: 'center' }}>
      {address ? (
        <QRCodeSVG
          value={address}
          size={size - 16}
          backgroundColor="#FFF"
          color="#000"
        />
      ) : (
        <Text style={{ color: T.text2, fontSize: 12 }}>Adresse manquante</Text>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  CANDLESTICK CHART
// ═══════════════════════════════════════════════════════════
function CandlestickChart({ candles }) {
  if (!candles || candles.length === 0) {
    return (
      <View style={cs.area}>
        <ActivityIndicator color={T.green} style={{ marginTop: 60 }} />
        <Text style={{ color: T.text2, fontSize: 12, textAlign: 'center', marginTop: 8 }}>Chargement données…</Text>
      </View>
    );
  }
  const valid = candles.filter(c => c && isFinite(c.h) && isFinite(c.l) && c.h > 0);
  if (!valid.length) return (
    <View style={cs.area}>
      <Text style={{ color: T.text2, fontSize: 12, textAlign: 'center', marginTop: 60 }}>Données en attente…</Text>
    </View>
  );

  const all = valid.flatMap(c => [c.o, c.h, c.l, c.c]).filter(v => isFinite(v) && v > 0);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const dt = hi - lo || lo * 0.01 || 1;
  const pad = dt * 0.05;
  const loP = lo - pad;
  const hiP = hi + pad;
  const dtP = hiP - loP;

  const fmtP = (v) => {
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
    if (v >= 1) return v.toFixed(2);
    if (v >= 0.01) return v.toFixed(4);
    return v.toFixed(6);
  };

  return (
    <View style={cs.area}>
      {[0, 0.25, 0.5, 0.75, 1].map(p => (
        <View key={p} style={[cs.grid, { top: `${p * 100}%` }]} />
      ))}
      {[0, 0.5, 1].map(p => (
        <Text key={p} style={[cs.price_label, { top: `${p * 100}%` }]}>
          {fmtP(hiP - p * dtP)}
        </Text>
      ))}
      <View style={cs.candles_row}>
        {valid.map((c, i) => {
          const bull  = c.c >= c.o;
          const color = bull ? T.green : T.red;
          const bH    = Math.max(c.o, c.c);
          const bL    = Math.min(c.o, c.c);
          const topPct  = ((hiP - bH) / dtP) * 100;
          const hPct    = Math.max(((bH - bL) / dtP) * 100, 1.5);
          const wtPct   = ((hiP - c.h) / dtP) * 100;
          const wtH     = Math.max(((c.h - bH) / dtP) * 100, 0);
          const wbTop   = topPct + hPct;
          const wbH     = Math.max(((bL - c.l) / dtP) * 100, 0);
          return (
            <View key={i} style={cs.candle_slot}>
              <View style={cs.candle_frame}>
                <View style={[cs.wick, { top: `${wtPct}%`, height: `${wtH}%`, backgroundColor: color }]} />
                <View style={[cs.body,  { top: `${topPct}%`, height: `${hPct}%`, backgroundColor: color }]} />
                <View style={[cs.wick, { top: `${wbTop}%`, height: `${wbH}%`, backgroundColor: color }]} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  area:        { height: 190, width: '100%', marginVertical: 14, position: 'relative', overflow: 'hidden' },
  grid:        { position: 'absolute', left: 44, right: 0, height: 1, backgroundColor: T.border, zIndex: 0 },
  price_label: { position: 'absolute', left: 0, width: 42, textAlign: 'right', color: T.text3, fontSize: 9, zIndex: 1, transform: [{ translateY: -5 }] },
  candles_row: { position: 'absolute', top: 0, bottom: 0, left: 46, right: 4, flexDirection: 'row', alignItems: 'stretch', zIndex: 2 },
  candle_slot: { flex: 1, height: '100%', paddingHorizontal: 2 },
  candle_frame:{ position: 'absolute', top: 0, bottom: 0, left: 2, right: 2, alignItems: 'center' },
  wick:        { width: 1.5, position: 'absolute', zIndex: 1 },
  body:        { width: '100%', position: 'absolute', zIndex: 2, borderRadius: 1.5, minHeight: 2 },
});

// ═══════════════════════════════════════════════════════════
//  GÉNÉRATION BOUGIES RÉALISTES
// ═══════════════════════════════════════════════════════════
function generateCandlesFromPrice(symbol, price, timeframe, numCandles) {
  if (!price || !isFinite(price) || price <= 0) return null;

  const VOLATILITY = {
    BTC: 0.012, ETH: 0.015, BNB: 0.018, SOL: 0.022,
    USDT: 0.0002, ADA: 0.025, MATIC: 0.028,
  };
  const vol = VOLATILITY[symbol] || 0.02;

  const seed = (symbol.charCodeAt(0) * 31 + symbol.charCodeAt(1 % symbol.length)) % 1000;
  const candles = [];
  const priceHistory = [price];

  for (let i = 1; i < numCandles; i++) {
    const s = Math.sin(seed * i * 0.7 + i * 1.3) * 0.5 + 0.5;
    const direction = s > 0.52 ? 1 : -1;
    const change = 1 + direction * vol * (0.3 + Math.abs(Math.sin(seed * i * 0.4)) * 0.7);
    priceHistory.unshift(priceHistory[0] / change);
  }

  for (let i = 0; i < numCandles; i++) {
    const base = priceHistory[i];
    const next = priceHistory[i + 1] ?? price;
    const s1 = Math.abs(Math.sin(seed * i * 1.1 + 0.5));
    const s2 = Math.abs(Math.sin(seed * i * 0.9 + 1.2));
    const s3 = Math.abs(Math.sin(seed * i * 1.3 + 0.7));
    const s4 = Math.abs(Math.sin(seed * i * 0.6 + 1.8));

    const o = base;
    const c = next;
    const bodyHigh = Math.max(o, c);
    const bodyLow  = Math.min(o, c);
    const wickUp   = bodyHigh * (1 + s1 * vol * 0.8);
    const wickDown = bodyLow  * (1 - s2 * vol * 0.8);

    candles.push({
      o: parseFloat(o.toFixed(o > 100 ? 2 : 6)),
      h: parseFloat(wickUp.toFixed(wickUp > 100 ? 2 : 6)),
      l: parseFloat(wickDown.toFixed(wickDown > 100 ? 2 : 6)),
      c: parseFloat(c.toFixed(c > 100 ? 2 : 6)),
    });
  }

  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    last.c = price;
    last.h = Math.max(last.h, price);
    last.l = Math.min(last.l, price);
  }

  return candles;
}

// ═══════════════════════════════════════════════════════════
//  COMPOSANT LOGO AVEC FALLBACK
// ═══════════════════════════════════════════════════════════
function CoinLogo({ logo, icon, size = 44 }) {
  const [imageError, setImageError] = useState(false);

  if (imageError || !logo) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.6 }}>{icon}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: logo }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setImageError(true)}
    />
  );
}

// ═══════════════════════════════════════════════════════════
//  ALERTES CROSS-PLATFORM
//  Alert.alert de react-native-web est un no-op total (voir
//  node_modules/react-native-web/dist/exports/Alert) : rien ne s'affiche
//  jamais sur le web. On bascule sur window.alert/confirm dans ce cas.
// ═══════════════════════════════════════════════════════════
function showAlert(title, message, buttons) {
  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    if (Array.isArray(buttons) && buttons.length > 1) {
      const confirmed = window.confirm(text);
      const chosen = buttons.find(b => (confirmed ? b.style !== 'cancel' : b.style === 'cancel'));
      chosen?.onPress?.();
    } else {
      window.alert(text);
      buttons?.[0]?.onPress?.();
    }
    return;
  }
  Alert.alert(title, message, buttons);
}

// ═══════════════════════════════════════════════════════════
//  BOUTON AVEC RETOUR TACTILE (scale au toucher)
// ═══════════════════════════════════════════════════════════
// Pressable animable directement (pas de View imbriquée en plus) : le style
// complet (largeur, flexDirection, padding...) s'applique en une seule fois
// sur le même élément qui reçoit le geste tactile — évite tout problème de
// résolution de largeur en pourcentage (Safari) ET garde la mise en page
// interne (icône | texte | valeur sur une ligne) intacte.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimPressable({ style, onPress, disabled, children, scaleTo = 0.95 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue) => {
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  };
  return (
    <AnimatedPressable
      style={[style, { transform: [{ scale }] }]}
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
    >
      {children}
    </AnimatedPressable>
  );
}

// ═══════════════════════════════════════════════════════════
//  LOGO ANIMÉ (halo qui pulse + badge qui respire) — écran d'accueil
// ═══════════════════════════════════════════════════════════
function AnimatedLogo({ size = 92, icon = '🛡️' }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const glowScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.05] });
  const badgeScale  = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });

  return (
    <View style={{ width: size * 1.9, height: size * 1.9, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: size * 1.9, height: size * 1.9, borderRadius: size,
          backgroundColor: T.cyan, opacity: glowOpacity, transform: [{ scale: glowScale }],
        }}
      />
      <Animated.View style={{ transform: [{ scale: badgeScale }] }}>
        <LinearGradient
          colors={[T.violet, T.card2, T.deepBg]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={{
            width: size, height: size, borderRadius: size / 2,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(124,58,237,0.45)',
            shadowColor: T.violet, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 8,
          }}
        >
          <Text style={{ fontSize: size * 0.42 }}>{icon}</Text>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  WALLET — bloc "skeleton" (placeholder qui respire) affiché tant que les
//  prix n'ont pas encore été chargés, au lieu d'une liste vide ou figée.
// ═══════════════════════════════════════════════════════════
function SkeletonBlock({ style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  return <Animated.View style={[st.skeleton_block, style, { opacity }]} />;
}

function TokenRowSkeleton({ style }) {
  return (
    <View style={[st.token_row, style, { flexDirection: 'row', alignItems: 'center' }]}>
      <SkeletonBlock style={{ width: 44, height: 44, borderRadius: 22 }} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <SkeletonBlock style={{ width: '55%', height: 13, borderRadius: 6, marginBottom: 8 }} />
        <SkeletonBlock style={{ width: '35%', height: 11, borderRadius: 6 }} />
      </View>
      <SkeletonBlock style={{ width: 50, height: 13, borderRadius: 6 }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  WALLET — bandeau toast (confirmations non-bloquantes : copie, succès
//  rapide). Fondu + léger glissement à l'apparition, auto-disparition gérée
//  par l'appelant (showToast) via un minuteur, pas ici.
// ═══════════════════════════════════════════════════════════
function ToastBanner({ toast }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [toast, anim]);
  if (!toast) return null;
  const bg = toast.type === 'success' ? T.greenBg : toast.type === 'error' ? T.redBg : T.card2;
  const fg = toast.type === 'success' ? T.green : toast.type === 'error' ? T.red : T.text;
  return (
    // Modal transparent = même mécanisme d'overlay que les autres popups
    // (Envoyer, Paramètres...) — sans ça, un toast simple sibling passait
    // SOUS les Modal ouverts (portés au-dessus par RN indépendamment de
    // l'ordre dans le JSX).
    <Modal visible transparent animationType="none">
      <View style={st.toast_layer} pointerEvents="none">
        <Animated.View
          style={[
            st.toast_wrap,
            { backgroundColor: bg, borderColor: fg + '55', opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
          ]}
        >
          <Text style={[st.toast_txt, { color: fg }]}>{toast.message}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
//  WALLET — pastille "live" qui pulse (anneau qui s'étend + s'efface en
//  boucle autour du point plein). Anime en continu, contrairement aux
//  FadeInView (qui ne jouent qu'une fois à l'apparition) — utilisé partout
//  où le dashboard affiche "Live" (barre du haut, badge LIVE du graphique).
// ═══════════════════════════════════════════════════════════
function PulseDot({ color = T.green, size = 7 }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity, transform: [{ scale }],
      }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  WALLET — halo qui respire derrière la carte de solde (accueil). Boucle
//  continue, contrairement aux animations d'entrée des tokens.
// ═══════════════════════════════════════════════════════════
// Mini-graphique de la valeur totale du portefeuille dans le temps, construit
// avec de simples View% (même technique que CandlestickChart plus haut) —
// pas besoin d'ajouter une dépendance SVG pour quelques barres.
function PortfolioSparkline({ points }) {
  if (points.length < 2) return null;
  const values = points.map(p => p.v);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || hi * 0.01 || 1;
  const trendUp = values[values.length - 1] >= values[0];
  const color = trendUp ? T.green : T.red;
  return (
    <View style={st.sparkline_row}>
      {points.map((p, i) => (
        <View key={p.t ?? i} style={[st.sparkline_bar, { height: `${Math.max(((p.v - lo) / range) * 100, 6)}%`, backgroundColor: color }]} />
      ))}
    </View>
  );
}

function BalanceGlow() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.32] });
  const scale   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.02] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, {
        borderRadius: 22, backgroundColor: T.green, opacity, transform: [{ scale }],
      }]}
    />
  );
}

// ═══════════════════════════════════════════════════════════
//  LANDING PUBLIQUE — visuel section sécurité (anneaux rotatifs + halo qui
//  pulse). Équivalent RN du torus knot Three.js du fichier de référence,
//  sans WebGL — juste des View/Animated, donc ça tourne aussi sur mobile.
// ═══════════════════════════════════════════════════════════
function SecurityOrb({ size = 220 }) {
  const rot1 = useRef(new Animated.Value(0)).current;
  const rot2 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const l1 = Animated.loop(Animated.timing(rot1, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true }));
    const l2 = Animated.loop(Animated.timing(rot2, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }));
    const l3 = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    l1.start(); l2.start(); l3.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); };
  }, [rot1, rot2, pulse]);

  const spin1 = rot1.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const spin2 = rot2.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.5] });
  const glowScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)', borderStyle: 'dashed',
        transform: [{ rotate: spin1 }],
      }} />
      <Animated.View style={{
        position: 'absolute', width: size * 0.72, height: size * 0.72, borderRadius: (size * 0.72) / 2,
        borderWidth: 1, borderColor: 'rgba(34,211,238,0.4)',
        transform: [{ rotate: spin2 }],
      }} />
      <Animated.View style={{
        position: 'absolute', width: size * 0.5, height: size * 0.5, borderRadius: (size * 0.5) / 2,
        backgroundColor: T.violet, opacity: glowOpacity, transform: [{ scale: glowScale }],
      }} />
      <View style={{
        width: size * 0.34, height: size * 0.34, borderRadius: (size * 0.34) / 2,
        alignItems: 'center', justifyContent: 'center', backgroundColor: T.deepBg,
        borderWidth: 1, borderColor: 'rgba(124,58,237,0.5)',
      }}>
        <Text style={{ fontSize: size * 0.15 }}>🛡️</Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  APPARITION EN FONDU + GLISSEMENT (pour les fiches crypto)
// ═══════════════════════════════════════════════════════════
function FadeInView({ children, style, deps = [] }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ═══════════════════════════════════════════════════════════
//  BARRE D'OFFRE EN CIRCULATION (dégradé animé + petite fusée)
// ═══════════════════════════════════════════════════════════
function SupplyBar({ circulating, max, color }) {
  const pct = max ? Math.min(100, (circulating / max) * 100) : 100;
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 900, useNativeDriver: false }).start();
  }, [pct]);
  const widthPct = width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View style={st.supply_wrap}>
      <View style={st.supply_track}>
        <Animated.View style={{ width: widthPct, height: '100%' }}>
          <LinearGradient
            colors={[color, T.green]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1, borderRadius: 8 }}
          />
        </Animated.View>
      </View>
      <Text style={st.supply_lbl}>
        {max ? `${pct.toFixed(1)}% de l'offre max en circulation 🚀` : 'Offre illimitée ♾️'}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  LANDING PUBLIQUE — pièce en orbite (halo NEXIA)
//  Une pièce tourne autour du logo central : conteneur qui pivote en continu
//  + enfant contre-pivoté à la même vitesse pour que l'icône reste droite
//  (équivalent RN de l'orbite Three.js de la page vitrine, sans WebGL).
// ═══════════════════════════════════════════════════════════
function OrbitCoin({ angle, radius, size, duration, icon, bg }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [rot, duration]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: [`${angle}deg`, `${angle + 360}deg`] });
  const counterRotate = rot.interpolate({ inputRange: [0, 1], outputRange: [`${-angle}deg`, `${-angle - 360}deg`] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ rotate }] }]}
    >
      <Animated.View style={{ transform: [{ translateX: radius }, { rotate: counterRotate }] }}>
        <View
          style={{
            width: size, height: size, borderRadius: size / 2, backgroundColor: bg,
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
            shadowColor: bg, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4,
          }}
        >
          <Text style={{ fontSize: size * 0.46, color: '#fff', fontWeight: 'bold' }}>{icon}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

function OrbitHero() {
  return (
    <View style={st.land_orbit_wrap}>
      <View style={st.land_orbit_center}><AnimatedLogo size={78} /></View>
      <OrbitCoin angle={0}   radius={118} size={40} duration={9000}  icon="₿" bg="#F7931A" />
      <OrbitCoin angle={140} radius={98}  size={34} duration={12500} icon="Ξ" bg="#627EEA" />
      <OrbitCoin angle={250} radius={128} size={30} duration={16000} icon="◎" bg="#9945FF" />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  LANDING PUBLIQUE — bandeau de prix défilant (marquee)
//  Utilise les vraies données `tokens` (déjà chargées via fetchMarket au
//  montage, même avant création du wallet) plutôt que des chiffres inventés.
// ═══════════════════════════════════════════════════════════
function PriceMarquee({ tokens }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const items = Object.entries(tokens).filter(([, t]) => t.price > 0);

  useEffect(() => {
    if (!trackWidth) return undefined;
    translateX.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translateX, { toValue: -trackWidth / 2, duration: 16000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [trackWidth, translateX]);

  if (!items.length) return null;
  const doubled = [...items, ...items];

  return (
    <View style={st.land_marquee}>
      <Animated.View
        style={[st.land_marquee_track, { transform: [{ translateX }] }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {doubled.map(([sym, t], i) => {
          const up = (t.change24h || 0) >= 0;
          return (
            <View key={`${sym}-${i}`} style={st.land_marquee_item}>
              <Text style={st.land_marquee_icon}>{t.icon}</Text>
              <Text style={st.land_marquee_sym}>{sym}</Text>
              <Text style={[st.land_marquee_chg, { color: up ? T.green : T.red }]}>
                {up ? '+' : ''}{(t.change24h || 0).toFixed(1)}%
              </Text>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  LANDING PUBLIQUE — compteur animé (stats)
// ═══════════════════════════════════════════════════════════
function CountStat({ value, suffix = '', label, decimals = 0, style }) {
  const [display, setDisplay] = useState(decimals ? (0).toFixed(decimals) : '0');
  useEffect(() => {
    let raf;
    const t0 = Date.now();
    const dur = 1200;
    const tick = () => {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const v = value * ease;
      setDisplay(decimals ? v.toFixed(decimals) : Math.round(v).toString());
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => raf && cancelAnimationFrame(raf);
  }, [value, decimals]);

  return (
    <View style={[st.land_stat, style]}>
      <Text style={st.land_stat_num}>{display}{suffix}</Text>
      <Text style={st.land_stat_lbl}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  LANDING PUBLIQUE — carte fonctionnalité (bascule 3D + lueur au survol,
//  web uniquement — équivalent léger de l'effet "tilt" du fichier de
//  référence, sans dépendre de Three.js/WebGL qui ne tourne pas sur mobile).
// ═══════════════════════════════════════════════════════════
function FeatureCard({ icon, title, desc, style }) {
  const [hover, setHover] = useState(null);
  const webHoverProps = Platform.OS === 'web' ? {
    onMouseMove: (e) => {
      const rect = e.currentTarget.getBoundingClientRect?.();
      if (!rect) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setHover({ x, y });
    },
    onMouseLeave: () => setHover(null),
  } : {};

  const tiltStyle = hover ? {
    transform: [
      { perspective: 900 },
      { rotateX: `${(0.5 - hover.y) * 8}deg` },
      { rotateY: `${(hover.x - 0.5) * 8}deg` },
    ],
    borderColor: 'rgba(34,211,238,0.45)',
  } : null;

  return (
    <View style={[st.land_feature_card, style, tiltStyle]} {...webHoverProps}>
      {hover && (
        <View
          pointerEvents="none"
          style={[st.land_feature_glare, { left: `${hover.x * 100}%`, top: `${hover.y * 100}%` }]}
        />
      )}
      <View style={st.land_feature_icon}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
      <Text style={st.land_feature_title}>{title}</Text>
      <Text style={st.land_feature_desc}>{desc}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  LANDING PUBLIQUE — fond de particules flottantes (équivalent léger du
//  champ de points Three.js du fichier de référence, en pur RN Animated).
// ═══════════════════════════════════════════════════════════
function StarField({ count = 30 }) {
  const stars = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: 1.5 + Math.random() * 2.5,
    delay: Math.random() * 2500,
    duration: 2600 + Math.random() * 2600,
    color: [T.cyan, T.violet, T.magenta][i % 3],
  })), [count]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map(s => <Star key={s.id} {...s} />)}
    </View>
  );
}

function Star({ left, top, size, delay, duration, color }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay, duration]);

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.85] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] });

  return (
    <Animated.View
      style={{
        position: 'absolute', left: `${left}%`, top: `${top}%`,
        width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        opacity, transform: [{ scale }],
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════
//  APP PRINCIPALE
// ═══════════════════════════════════════════════════════════
export default function App() {
  // ── HOOKS - ORDRE STRICT ──
  // Mode "bureau" sur le web : au-delà de ce seuil, l'app quitte la mise en
  // page mobile (colonne unique, plein écran) pour une mise en page de site
  // desktop (sidebar, grilles multi-colonnes, dialogues centrés).
  // `useWindowDimensions` (contrairement à `Dimensions.get('window')`, figé
  // au chargement) se met à jour quand la fenêtre est redimensionnée.
  const { width: winWidth } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && winWidth >= 860;
  const [pinCode, setPinCode]         = useState('');
  const [isUnlocked, setIsUnlocked]   = useState(false);
  const [tab, setTab]                 = useState('home');
  const [currency, setCurrency]       = useState('USD');

  const [tokens, setTokens] = useState(() =>
    Object.fromEntries(
      Object.entries(WALLET_TOKENS).map(([sym, t]) => [
        sym, { ...t, price: 0, change24h: 0, marketCap: 0 },
      ])
    )
  );

  const [marketCoins, setMarketCoins]   = useState([]);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketSort, setMarketSort]           = useState('market_cap'); // market_cap | gainers | losers | alpha
  const [marketFavOnly, setMarketFavOnly]     = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedToken, setSelectedToken] = useState(null);
  const [detailTf, setDetailTf]           = useState('1J');
  const [showSend, setShowSend]           = useState(false);
  const [showBuy, setShowBuy]             = useState(false);
  const [showReceive, setShowReceive]     = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [showStats, setShowStats]         = useState(false);
  const [showImportData, setShowImportData] = useState(false);
  const [importDataText, setImportDataText] = useState('');
  const [historyItems, setHistoryItems]   = useState(null); // null = pas encore chargé, [] = chargé et vide
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilterSymbol, setHistoryFilterSymbol] = useState('ALL');
  const HISTORY_PAGE_SIZE = 15;
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [showSettings, setShowSettings]   = useState(false);
  const [legalDoc, setLegalDoc]           = useState(null); // 'cgu' | 'privacy' | 'mentions' | null
  const [openFaq, setOpenFaq]             = useState(null); // index de la question dépliée sur la landing, ou null
  const [sendToken, setSendToken]         = useState('ETH');
  const [sendAddress, setSendAddress]     = useState('');
  const [sendAmount, setSendAmount]       = useState('');
  const [sendAmountMode, setSendAmountMode] = useState('crypto'); // 'crypto' | 'fiat' — sendAmount (en crypto) reste la seule source de vérité pour l'envoi
  const [sendAmountFiatInput, setSendAmountFiatInput] = useState('');
  const [receiveAmount, setReceiveAmount]       = useState(''); // demande de paiement (en token natif) sur l'écran Recevoir
  const [txTags, setTxTags]                     = useState({}); // { [hash]: 'Perso' | 'Pro' | 'Cadeau' }
  const [sendLoading, setSendLoading]     = useState(false);
  const [swapFrom, setSwapFrom]           = useState('ETH');
  const [swapTo, setSwapTo]               = useState('USDT');
  const [swapAmt, setSwapAmt]             = useState('');
  const [swapRes, setSwapRes]             = useState('0');
  const [swapLoading, setSwapLoading]     = useState(false);
  const [buyToken, setBuyToken]           = useState('ETH');
  const [buyAmount, setBuyAmount]         = useState('10');
  const [buyLoading, setBuyLoading]       = useState(false);
  const [walletAddr, setWalletAddr]       = useState('');
  const [walletBalance, setWalletBalance] = useState('0');
  const [backendReady, setBackendReady]   = useState(false);
  const [backendError, setBackendError]   = useState(null);
  const [walletCreated, setWalletCreated] = useState(false);
  const [importMode, setImportMode]       = useState(false);
  const [importValue, setImportValue]     = useState('');
  const [importType, setImportType]       = useState('mnemonic');
  const [importError, setImportError]     = useState(null);
  const [network, setNetwork]             = useState('ethereum');
  const [walletSession, setWalletSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  // Sécurité PIN réel : la clé privée n'est JAMAIS stockée en clair — seul un
  // keystore chiffré (ethers, scrypt+AES) est persisté. `unlockedPrivateKey`/
  // `unlockedMnemonic` ne vivent qu'en mémoire, jamais sur disque, et
  // disparaissent à la déconnexion ou à la fermeture de l'app.
  const [pinStage, setPinStage]                 = useState(null); // null | 'choose' | 'confirm'
  const [pendingWalletForPin, setPendingWalletForPin] = useState(null);
  const [pendingPinDigits, setPendingPinDigits] = useState('');
  const [pinError, setPinError]                 = useState(null);
  const [isVerifyingPin, setIsVerifyingPin]     = useState(false);
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState(null);
  const [unlockedMnemonic, setUnlockedMnemonic]     = useState(null);
  const [biometricEnabled, setBiometricEnabled]     = useState(false);
  // Écran de confirmation avant envoi : 'form' (saisie) -> 'confirm' (relire
  // adresse/montant/frais avant de signer). Adresses récentes = carnet léger,
  // rempli au fil des envois réussis.
  const [sendStep, setSendStep]                 = useState('form');
  const [sendFeeEstimate, setSendFeeEstimate]   = useState(null);
  const [sendFeeLoading, setSendFeeLoading]     = useState(false);
  const [sendGasTier, setSendGasTier]           = useState('normal'); // 'slow' | 'normal' | 'fast'
  const [recentAddresses, setRecentAddresses]   = useState([]);
  const [labelEditFor, setLabelEditFor]         = useState(null); // adresse en cours de renommage, ou null
  const [labelInput, setLabelInput]             = useState('');
  const [calcAmount, setCalcAmount]             = useState(''); // calculatrice rapide sur la fiche Marché
  const [simAmount, setSimAmount]               = useState('100'); // simulateur "et si le prix x2/x5/x10" sur la landing
  const [simCoin, setSimCoin]                   = useState('BTC');
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [portfolioHistoryLoaded, setPortfolioHistoryLoaded] = useState(false);
  const [showOnboarding, setShowOnboarding]     = useState(false);
  const [onboardingStep, setOnboardingStep]     = useState(0);
  const [isFirstTimeMnemonicBackup, setIsFirstTimeMnemonicBackup] = useState(false);
  // Scan QR : natif uniquement (caméra). Sur web, on propose "Coller" à la
  // place — pas de scan caméra web ici (getUserMedia + décodage QR en JS
  // pur serait un chantier à part, hors scope de ce passage).
  const [showQrScanner, setShowQrScanner]       = useState(false);
  // `useCameraPermissions` n'existe pas dans le shim web d'expo-camera (crash
  // immédiat au montage) — Platform.OS ne change jamais en cours de vie de
  // l'app, donc cet appel conditionnel reste stable d'un render à l'autre.
  const [cameraPermission, requestCameraPermission] = Platform.OS === 'web'
    ? [null, () => {}]
    : useCameraPermissions();
  // Toast léger pour les confirmations non-bloquantes (copie, succès rapide)
  // — les vraies décisions (déconnexion, désactiver la biométrie...) restent
  // sur showAlert, qui bloque vraiment et demande un choix explicite.
  const [toast, setToast] = useState(null); // { message, type: 'success' | 'error' | 'info' }
  const toastTimerRef = useRef(null);
  const showToast = useCallback((message, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const copyToClipboard = useCallback(async (value, label = 'Copié') => {
    try {
      await Clipboard.setStringAsync(value);
      showToast(`✓ ${label}`, 'success');
    } catch {
      showToast('Impossible de copier', 'error');
    }
  }, [showToast]);
  // `Share.share` échoue sur desktop web (pas de `navigator.share`) — plutôt
  // que de laisser planter silencieusement, on retombe sur un copier-coller
  // du lien, avec un toast pour confirmer que quelque chose s'est bien passé.
  const shareApp = useCallback(async () => {
    const shareUrl = 'https://nexiawallet.pages.dev';
    const message = `NexiaWallet — portefeuille crypto non-custodial. Tes clés, tes cryptos. ${shareUrl}`;
    try {
      await Share.share({ title: 'NexiaWallet', message, url: shareUrl });
    } catch {
      await copyToClipboard(shareUrl, 'Lien copié dans le presse-papiers');
    }
  }, [copyToClipboard]);

  // Bip succès/échec via Web Audio API — web uniquement. Sur natif, la
  // vibration déjà en place (voir toggle "Sons et vibrations" dans
  // Paramètres) sert le même rôle de feedback ; ajouter une vraie lib audio
  // (expo-av) juste pour deux bips serait disproportionné. Reste silencieux
  // sans lever d'erreur si l'API n'existe pas (vieux navigateur, SSR...).
  const playTone = useCallback((type) => {
    if (!vibrationEnabled || Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      if (type === 'success') {
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
      } else {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.25);
      }
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (type === 'success' ? 0.25 : 0.35));
      osc.start(now);
      osc.stop(now + (type === 'success' ? 0.26 : 0.36));
      osc.onended = () => ctx.close();
    } catch { /* pas grave, retour silencieux */ }
  }, [vibrationEnabled]);
  const [chartTick, setChartTick]         = useState(0);
  const [candleHistory, setCandleHistory] = useState({});
  const [apiError, setApiError]           = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now()); // mis à jour par fetchMarket ; jamais affiché mais reste actif ailleurs dans l'app
  const [realCandles, setRealCandles]     = useState({}); // `${symbol}_${timeframe}` -> vraies bougies CoinGecko
  const [coinDetails, setCoinDetails]     = useState({}); // symbol -> fiche crypto réelle (CoinGecko)
  const [newsItems, setNewsItems]         = useState([]);
  // Phrase de récupération à faire sauvegarder par l'utilisateur juste après
  // la création d'un wallet — sans ça, il n'a AUCUN moyen de récupérer ses
  // fonds s'il perd son appareil ou vide son navigateur.
  const [pendingMnemonic, setPendingMnemonic] = useState(null);

  // Favoris : liste de symboles (ex. "DOGE") marqués depuis le Marché ou
  // l'accueil — persistée localement, pas de compte ni de backend impliqué.
  const [favorites, setFavorites]         = useState([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  // Alertes de prix : { id, symbol, targetPrice, direction: 'above'|'below' }
  const [priceAlerts, setPriceAlerts]     = useState([]);
  const [priceAlertsLoaded, setPriceAlertsLoaded] = useState(false);
  const [alertFormFor, setAlertFormFor]   = useState(null); // symbole en cours d'édition, ou null
  const [alertTargetInput, setAlertTargetInput] = useState('');
  const [alertDirection, setAlertDirection]     = useState('above');
  // Tokens personnalisés : lecture seule (nom/symbole/décimales/solde), voir
  // getCustomTokenInfo. Rechargés à chaque refreshPortfolio pour rester à jour.
  const [customTokens, setCustomTokens]         = useState([]);
  const [customTokensLoaded, setCustomTokensLoaded] = useState(false);
  const [showAddCustomToken, setShowAddCustomToken] = useState(false);
  const [customTokenAddrInput, setCustomTokenAddrInput] = useState('');
  const [customTokenLoading, setCustomTokenLoading]     = useState(false);
  // Fiche "info seule" pour une crypto du Marché qui n'est PAS dans le
  // wallet (pas de solde/envoi possible — juste prix, capitalisation, desc).
  const [selectedMarketCoin, setSelectedMarketCoin] = useState(null);
  const [marketCoinInfo, setMarketCoinInfo]       = useState({}); // id -> fiche CoinGecko
  const [marketCoinCandles, setMarketCoinCandles] = useState({}); // id -> bougies 1J

  const fxRate = CURRENCIES[currency]?.rate || 1;
  const symC   = CURRENCIES[currency]?.symbol || '$';
  const activeNetwork = network === 'bsc'
    ? { label: 'BNB Smart Chain', network: 'bsc', chainId: 56, explorer: 'https://bscscan.com' }
    : { label: 'Ethereum Mainnet', network: 'ethereum', chainId: 1, explorer: 'https://etherscan.io' };
  // Symbole du token natif du réseau actif — recalculé souvent ailleurs
  // avant cette factorisation (envoi, swap, achat, affichage du solde) ;
  // une seule source évite un oubli si BSC/Ethereum est un jour remplacé.
  const nativeSymbol = network === 'bsc' ? 'BNB' : 'ETH';

  // ── FORMATAGE DEVISE ──
  const fmt = useCallback((usdVal, dec = 2) => {
    const v = (usdVal || 0) * fxRate;
    if (!isFinite(v)) return `${symC}0.00`;
    if (v >= 1_000_000_000) return `${symC}${(v / 1_000_000_000).toFixed(2)}Md`;
    if (v >= 1_000_000)     return `${symC}${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000)         return `${symC}${v.toLocaleString('fr-FR', { maximumFractionDigits: dec })}`;
    if (v < 0.001 && v > 0) return `${symC}${v.toFixed(6)}`;
    return `${symC}${v.toFixed(dec)}`;
  }, [fxRate, symC]);

  // ── FETCH MARCHÉ COINGECKO ──
  const fetchMarket = useCallback(async () => {
    try {
      setApiError(null);
      setRefreshing(true);

      const res = await axios.get(`${API_BASE}/market`, { headers: API_HEADERS, timeout: 12000 });
      if (!res.data?.success || !Array.isArray(res.data.tokens)) {
        throw new Error(res.data?.error || 'Backend market failed');
      }

      const tokensData = res.data.tokens;
      setMarketCoins(tokensData);
      setTokens(prev => {
        const next = { ...prev };
        Object.entries(WALLET_TOKENS).forEach(([sym, t]) => {
          const token = tokensData.find(item => item.id === t.cgId);
          if (!token) return;
          next[sym] = {
            ...next[sym],
            price:     token.current_price ?? next[sym].price,
            change24h: token.price_change_percentage_24h ?? next[sym].change24h,
            marketCap: token.market_cap ?? next[sym].marketCap,
          };
        });
        return next;
      });

      const snapshot = { time: Date.now() };
      Object.entries(WALLET_TOKENS).forEach(([sym, t]) => {
        const token = tokensData.find(item => item.id === t.cgId);
        if (token?.current_price) snapshot[sym] = token.current_price;
      });
      setCandleHistory(prev => {
        const next = { ...prev };
        Object.keys(WALLET_TOKENS).forEach(sym => {
          if (!snapshot[sym]) return;
          const arr = [...(next[sym] || []), { time: snapshot.time, price: snapshot[sym] }];
          next[sym] = arr.slice(-500);
        });
        return next;
      });

      setChartTick(t => t + 1);
      setLastUpdateTime(Date.now());
    } catch (err) {
      console.error('API Error:', err.message);
      setApiError('Erreur API backend ou CoinGecko. Données en cache utilisées.');

      try {
        const cgIds = Object.values(WALLET_TOKENS).map(t => t.cgId).join(',');
        const priceRes = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
          { timeout: 12000 }
        );
        setTokens(prev => {
          const next = { ...prev };
          Object.entries(WALLET_TOKENS).forEach(([sym, t]) => {
            const d = priceRes.data?.[t.cgId];
            if (!d) return;
            next[sym] = {
              ...next[sym],
              price:     d.usd            ?? next[sym].price,
              change24h: d.usd_24h_change ?? next[sym].change24h,
              marketCap: d.usd_market_cap ?? next[sym].marketCap,
            };
          });
          return next;
        });

        // Même en secours, on alimente la grille Marché (sinon "0 cryptos" affiché
        // indéfiniment alors qu'on a bien des prix à montrer).
        const fallbackCoins = Object.entries(WALLET_TOKENS)
          .map(([sym, t]) => {
            const d = priceRes.data?.[t.cgId];
            if (!d) return null;
            return {
              id: t.cgId, symbol: sym, name: t.name,
              current_price: d.usd, market_cap: d.usd_market_cap,
              price_change_percentage_24h: d.usd_24h_change, image: t.logo,
            };
          })
          .filter(Boolean);
        if (fallbackCoins.length) setMarketCoins(fallbackCoins);
      } catch (fallbackErr) {
        console.error('Fallback market error:', fallbackErr.message);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Lecture directe des RPC publics — aucune clé nécessaire pour consulter un
  // solde (donnée publique de la blockchain), donc aucun appel backend ici.
  const refreshPortfolio = useCallback(async (selectedNetwork = network) => {
    if (!walletAddr) return;
    try {
      const nativeSymbol = selectedNetwork === 'bsc' ? 'BNB' : 'ETH';
      const nativeBalance = await localWallet.getNativeBalance(walletAddr, selectedNetwork);
      setWalletBalance(nativeBalance);
      setTokens(prev => ({
        ...prev,
        [nativeSymbol]: { ...prev[nativeSymbol], balance: parseFloat(nativeBalance) },
      }));

      const tokenSymbols = ['USDT', 'USDC'];
      await Promise.all(tokenSymbols.map(async (sym) => {
        try {
          const balance = await localWallet.getErc20Balance(walletAddr, sym, selectedNetwork);
          setTokens(prev => ({
            ...prev,
            [sym]: { ...prev[sym], balance: parseFloat(balance) },
          }));
        } catch (err) {
          console.warn(`Balance ${sym} failed`, err.message);
        }
      }));
    } catch (err) {
      console.warn('refreshPortfolio error', err.message);
    }
  }, [network, walletAddr]);

  // Historique — données publiques de la blockchain (Etherscan), aucune clé
  // impliquée. Chargé à la demande, à l'ouverture de la modale "Activité".
  const fetchHistory = useCallback(async () => {
    if (!walletAddr) return;
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/tx/history`, {
        params: { address: walletAddr, network },
        headers: API_HEADERS,
        timeout: 20000,
      });
      setHistoryItems(res.data?.success ? res.data.items : []);
    } catch (err) {
      console.warn('fetchHistory error', err.message);
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [walletAddr, network]);

  useEffect(() => {
    if (showHistory) {
      setHistoryFilterSymbol('ALL');
      setHistoryVisibleCount(HISTORY_PAGE_SIZE);
      fetchHistory();
    }
  }, [showHistory, fetchHistory]);

  useEffect(() => {
    if (showStats && historyItems === null) fetchHistory();
  }, [showStats, historyItems, fetchHistory]);

  // Export CSV via presse-papier plutôt qu'un vrai fichier — expo-file-system
  // n'est pas installé et rajouter une dépendance juste pour ça serait
  // disproportionné ; coller dans Excel/Sheets marche très bien avec du texte
  // brut copié.
  const exportHistoryCsv = useCallback(async (items) => {
    if (!items.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Date', 'Type', 'Direction', 'Montant', 'Symbole', 'De', 'Vers', 'Hash', 'Statut', 'Catégorie'].map(esc).join(',');
    const rows = items.map(item => [
      new Date(item.timestamp).toISOString(),
      item.type,
      item.direction === 'out' ? 'Envoyé' : 'Reçu',
      item.amount,
      item.symbol,
      item.from,
      item.to,
      item.hash,
      item.failed ? 'Échoué' : 'Réussi',
      txTags[item.hash] || '',
    ].map(esc).join(','));
    await copyToClipboard([header, ...rows].join('\n'), `${items.length} transaction(s) copiées en CSV`);
  }, [copyToClipboard, txTags]);

  // Migration entre appareils : favoris, carnet d'adresses, alertes de prix
  // et étiquettes -- rien de sensible (aucune clé, aucune donnée privée),
  // copié en JSON via le presse-papier plutôt qu'un vrai fichier (même choix
  // que l'export CSV, pas de expo-file-system installé).
  const exportUserData = useCallback(async () => {
    const payload = { version: 1, favorites, recentAddresses, priceAlerts, txTags };
    await copyToClipboard(JSON.stringify(payload), 'Données copiées — colle-les sur le nouvel appareil');
  }, [favorites, recentAddresses, priceAlerts, txTags, copyToClipboard]);

  const importUserData = useCallback((text) => {
    let parsed;
    try { parsed = JSON.parse(text); } catch { showToast('JSON invalide', 'error'); return false; }
    if (!parsed || typeof parsed !== 'object') { showToast('JSON invalide', 'error'); return false; }
    if (Array.isArray(parsed.favorites)) { setFavorites(parsed.favorites); saveFavorites(parsed.favorites); }
    if (Array.isArray(parsed.recentAddresses)) { setRecentAddresses(parsed.recentAddresses); saveRecentAddresses(parsed.recentAddresses); }
    if (Array.isArray(parsed.priceAlerts)) { setPriceAlerts(parsed.priceAlerts); savePriceAlerts(parsed.priceAlerts); }
    if (parsed.txTags && typeof parsed.txTags === 'object') { setTxTags(parsed.txTags); saveTxTags(parsed.txTags); }
    showToast('✓ Données importées', 'success');
    return true;
  }, [showToast]);

  // Cycle Perso -> Pro -> Cadeau -> (aucune) à chaque tap, pour rester une
  // interaction en un geste plutôt qu'un picker à ouvrir/fermer.
  const cycleTxTag = useCallback((hash) => {
    setTxTags(prev => {
      const idx = TX_TAG_OPTIONS.indexOf(prev[hash]);
      const next = idx === -1 ? TX_TAG_OPTIONS[0] : (idx === TX_TAG_OPTIONS.length - 1 ? null : TX_TAG_OPTIONS[idx + 1]);
      const updated = { ...prev };
      if (next) updated[hash] = next; else delete updated[hash];
      saveTxTags(updated);
      return updated;
    });
  }, []);

  // Wallet 100% non-custodial : génération/import/restauration se font en
  // local avec `lib/wallet.js` — la clé privée et la mnémonique ne quittent
  // jamais l'appareil, aucun appel réseau vers le backend n'est nécessaire ici.
  // Ni l'une ni l'autre ne sont écrites sur disque en clair : la création/
  // l'import ne fait que préparer `pendingWalletForPin` — c'est
  // `finalizePinSetup` (déclenché une fois le PIN choisi et confirmé) qui
  // chiffre et persiste réellement la session.
  const createWallet = useCallback(async () => {
    try {
      setBackendError(null);
      const created = localWallet.createLocalWallet();
      setPendingWalletForPin({ address: created.address, privateKey: created.privateKey, mnemonic: created.mnemonic, isImport: false, isMigration: false });
      setPinCode(''); setPendingPinDigits(''); setPinError(null);
      setPinStage('choose');
      return true;
    } catch (err) {
      console.error('Création wallet locale échouée:', err.message);
      setBackendError('Impossible de créer le wallet.');
      return false;
    }
  }, []);

  const importWallet = useCallback(async () => {
    try {
      setImportError(null);
      if (!importValue.trim()) {
        setImportError('Entrer une phrase mnémonique ou une clé privée.');
        return false;
      }

      const imported = localWallet.importLocalWallet(importValue, importType);
      setPendingWalletForPin({ address: imported.address, privateKey: imported.privateKey, mnemonic: imported.mnemonic, isImport: true, isMigration: false });
      setPinCode(''); setPendingPinDigits(''); setPinError(null);
      setPinStage('choose');
      return true;
    } catch (err) {
      console.error('Import local échoué:', err.message);
      setImportError(err.message || 'Mnémonique ou clé privée invalide.');
      return false;
    }
  }, [importType, importValue]);

  // Une fois le PIN choisi ET confirmé (deux saisies identiques), chiffre la
  // clé (+ mnémonique si dispo) avec ce PIN et persiste le résultat — c'est
  // le SEUL moment où quelque chose touche le disque pour un nouveau wallet.
  const finalizePinSetup = useCallback(async (pin) => {
    if (!pendingWalletForPin) return;
    setIsVerifyingPin(true);
    try {
      const encryptedKeystore = await localWallet.encryptWalletKeystore(pendingWalletForPin, pin);
      const nextSession = {
        address: pendingWalletForPin.address,
        encryptedKeystore,
        network,
        createdAt: Date.now(),
      };
      await saveWalletSession(nextSession);
      setWalletSession(nextSession);
      setWalletAddr(pendingWalletForPin.address);
      setUnlockedPrivateKey(pendingWalletForPin.privateKey);
      setUnlockedMnemonic(pendingWalletForPin.mnemonic || null);
      setWalletBalance('0');
      setWalletCreated(true);
      setBackendReady(true);
      setIsUnlocked(true);
      if (!pendingWalletForPin.isImport && !pendingWalletForPin.isMigration) {
        setPendingMnemonic(pendingWalletForPin.mnemonic);
        setIsFirstTimeMnemonicBackup(true);
      }
      if (pendingWalletForPin.isImport) { setImportMode(false); setImportValue(''); }
      await refreshPortfolio(network);
      setPinStage(null);
      setPendingWalletForPin(null);
      setPendingPinDigits('');
      setPinCode('');
      setPinError(null);
      // eslint-disable-next-line no-use-before-define -- défini plus bas dans
      // ce composant, mais l'appel n'a lieu qu'à l'exécution (post-render).
      offerBiometricEnroll(pin);
    } catch (err) {
      console.error('Sécurisation du wallet échouée:', err.message);
      setPinError('Impossible de sécuriser le wallet — réessaie.');
      setPinCode('');
      setPendingPinDigits('');
      setPinStage('choose');
    } finally {
      setIsVerifyingPin(false);
    }
  }, [pendingWalletForPin, network, refreshPortfolio]);

  // Déverrouillage : déchiffre le keystore stocké avec le PIN saisi. Un
  // mauvais PIN fait simplement échouer le déchiffrement (aucune comparaison
  // de code en clair nulle part) — la seule "vérité" est cryptographique.
  const attemptUnlock = useCallback(async (pin) => {
    if (!walletSession?.encryptedKeystore) return;
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      const result = await localWallet.decryptWalletKeystore(walletSession.encryptedKeystore, pin);
      if (result.address.toLowerCase() !== walletSession.address.toLowerCase()) {
        throw new Error('Adresse incohérente après déchiffrement.');
      }
      setUnlockedPrivateKey(result.privateKey);
      setUnlockedMnemonic(result.mnemonic);
      setIsUnlocked(true);
      setPinCode('');
      setPinError(null);
      await refreshPortfolio(network);
    } catch (err) {
      setPinError('Code incorrect');
      setPinCode('');
    } finally {
      setIsVerifyingPin(false);
    }
  }, [walletSession, network, refreshPortfolio]);

  const initWallet = useCallback(async () => {
    try {
      setBackendError(null);
      const saved = await loadWalletSession();

      if (saved?.address && saved.encryptedKeystore) {
        // Format sécurisé : on ne déchiffre rien tant que l'utilisateur n'a
        // pas saisi son PIN sur l'écran de déverrouillage.
        setWalletSession(saved);
        setWalletAddr(saved.address);
        setWalletBalance(saved.balance || '0');
        setWalletCreated(true);
        setBackendReady(true);
        return;
      }

      if (saved?.address && saved.privateKey) {
        // Ancien format (clé en clair, d'avant l'ajout du PIN réel) : sanity
        // check puis migration — on redemande un PIN pour re-chiffrer cette
        // session existante, sans rien perdre (pas de recréation forcée).
        const wallet = localWallet.walletFromPrivateKey(saved.privateKey);
        if (wallet.address !== saved.address) {
          throw new Error('Session locale corrompue (adresse incohérente).');
        }
        setPendingWalletForPin({ address: saved.address, privateKey: saved.privateKey, mnemonic: saved.mnemonic || null, isImport: true, isMigration: true });
        setPinCode(''); setPendingPinDigits(''); setPinError(null);
        setPinStage('choose');
        setWalletCreated(true);
        setBackendReady(true);
        return;
      }

      // Aucun wallet sauvegardé : on ne crée plus rien automatiquement — c'est
      // à l'utilisateur de choisir "Créer" ou "Importer" sur l'écran d'accueil.
      setBackendReady(true);
    } catch (err) {
      console.error('Init wallet échouée:', err.message);
      setBackendError('Impossible de charger le wallet local.');
    } finally {
      setSessionLoaded(true);
    }
  }, [network, refreshPortfolio]);

  // Efface le wallet de cet appareil (clé privée comprise). Irréversible sans
  // la phrase de récupération — d'où la double confirmation appuyée.
  const handleLogout = useCallback(() => {
    showAlert(
      '⚠️ Déconnexion',
      'Ça efface le wallet de cet appareil. Sans ta phrase de récupération notée ailleurs, tu ne pourras PAS le récupérer.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          onPress: async () => {
            await clearWalletSession();
            await clearBiometricPin();
            setBiometricEnabled(false);
            setWalletSession(null);
            setWalletAddr('');
            setWalletBalance('0');
            setWalletCreated(false);
            setBackendReady(false);
            setIsUnlocked(false);
            setShowSettings(false);
            setUnlockedPrivateKey(null);
            setUnlockedMnemonic(null);
            setPinStage(null);
            setPendingWalletForPin(null);
            setPendingPinDigits('');
            setPinError(null);
            setTokens(prev => Object.fromEntries(Object.entries(prev).map(([sym, t]) => [sym, { ...t, balance: 0 }])));
          },
        },
      ]
    );
  }, []);

  // Sur le web, l'app est limitée à 480px de large (webFrame) et centrée —
  // sans ça, les marges de chaque côté restent d'un blanc par défaut du
  // navigateur au lieu de suivre le thème sombre.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = T.deepBg;
      document.body.style.backgroundColor = T.deepBg;
    }
  }, []);

  useEffect(() => {
    initWallet();
    fetchMarket();
    const id = setInterval(fetchMarket, 30000);
    return () => clearInterval(id);
  }, [fetchMarket, initWallet]);

  useEffect(() => {
    loadFavorites().then(list => { setFavorites(list); setFavoritesLoaded(true); });
    loadRecentAddresses().then(setRecentAddresses);
    loadPriceAlerts().then(list => { setPriceAlerts(list); setPriceAlertsLoaded(true); });
    loadVibrationEnabled().then(setVibrationEnabled);
    loadPortfolioHistory().then(list => { setPortfolioHistory(list); setPortfolioHistoryLoaded(true); });
    loadTxTags().then(setTxTags);
    loadCustomTokens().then(list => { setCustomTokens(list); setCustomTokensLoaded(true); });
  }, []);

  useEffect(() => {
    if (customTokensLoaded) saveCustomTokens(customTokens.map(({ balance, ...rest }) => rest));
    // Le solde n'est pas persisté (il serait périmé au prochain lancement) —
    // seuls l'adresse du contrat et les métadonnées le sont.
  }, [customTokens, customTokensLoaded]);

  const refreshCustomTokenBalances = useCallback(async () => {
    if (!walletAddr || !customTokens.length) return;
    const updated = await Promise.all(customTokens.map(async (t) => {
      try {
        const info = await localWallet.getCustomTokenInfo(t.address, walletAddr, t.network);
        return { ...t, balance: info.balance };
      } catch {
        return t;
      }
    }));
    setCustomTokens(updated);
  }, [walletAddr, customTokens]);

  const addCustomToken = useCallback(async (contractAddress) => {
    if (customTokens.some(t => t.address.toLowerCase() === contractAddress.toLowerCase() && t.network === network)) {
      showToast('Ce token est déjà ajouté', 'error');
      return;
    }
    setCustomTokenLoading(true);
    try {
      const info = await localWallet.getCustomTokenInfo(contractAddress, walletAddr, network);
      setCustomTokens(prev => [...prev, info]);
      showToast(`✓ ${info.symbol} ajouté`, 'success');
      setShowAddCustomToken(false);
      setCustomTokenAddrInput('');
    } catch (err) {
      showToast(err.message || 'Impossible de lire ce contrat', 'error');
    } finally {
      setCustomTokenLoading(false);
    }
  }, [customTokens, walletAddr, network, showToast]);

  const removeCustomToken = useCallback((address) => {
    setCustomTokens(prev => prev.filter(t => t.address !== address));
  }, []);

  useEffect(() => {
    if (priceAlertsLoaded) savePriceAlerts(priceAlerts);
  }, [priceAlerts, priceAlertsLoaded]);

  const addPriceAlert = useCallback((symbol, targetPrice, direction) => {
    setPriceAlerts(prev => [
      ...prev.filter(a => a.symbol !== symbol), // une seule alerte active par crypto à la fois
      { id: `${symbol}-${Date.now()}`, symbol, targetPrice, direction },
    ]);
    showToast(`🔔 Alerte créée pour ${symbol}`, 'success');
  }, [showToast]);

  const removePriceAlert = useCallback((id) => {
    setPriceAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  // Vérifie les alertes à chaque nouveau prix reçu (tokens du wallet + toutes
  // les cryptos du Marché) — déclenche une seule fois puis se retire toute
  // seule (sinon on serait spammé à chaque rafraîchissement de 30s).
  useEffect(() => {
    if (!priceAlertsLoaded || !priceAlerts.length) return;
    const priceBySymbol = {};
    Object.entries(tokens).forEach(([sym, t]) => { if (t.price) priceBySymbol[sym] = t.price; });
    marketCoins.forEach(c => {
      const sym = c.symbol?.toUpperCase();
      if (sym && c.current_price) priceBySymbol[sym] = c.current_price;
    });

    const triggered = priceAlerts.filter(a => {
      const price = priceBySymbol[a.symbol];
      if (!price) return false;
      return a.direction === 'above' ? price >= a.targetPrice : price <= a.targetPrice;
    });
    if (!triggered.length) return;

    if (vibrationEnabled) Vibration.vibrate(200);
    triggered.forEach(a => {
      showAlert(
        '🔔 Alerte de prix',
        `${a.symbol} a ${a.direction === 'above' ? 'dépassé' : 'chuté sous'} ${fmt(a.targetPrice)}.`
      );
    });
    setPriceAlerts(prev => prev.filter(a => !triggered.some(t => t.id === a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se déclenche sur
    // les prix, pas sur `fmt`/`showAlert` (stables) ni `priceAlerts` lui-même
    // (mis à jour à l'intérieur, dépendre de lui reboucleraît inutilement).
  }, [tokens, marketCoins, priceAlertsLoaded, vibrationEnabled]);

  const handleQrScanned = useCallback(({ data }) => {
    if (!data) return;
    // Gère une adresse brute 0x... ou un URI "ethereum:0x...".
    const match = data.match(/0x[a-fA-F0-9]{40}/);
    if (match) {
      setSendAddress(match[0]);
      setShowQrScanner(false);
    } else {
      showToast('QR non reconnu', 'error');
    }
  }, [showToast]);

  const pasteAddressFromClipboard = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const match = (text || '').match(/0x[a-fA-F0-9]{40}/);
      if (match) {
        setSendAddress(match[0]);
        showToast('✓ Adresse collée', 'success');
      } else {
        showToast('Aucune adresse valide dans le presse-papier', 'error');
      }
    } catch {
      showToast('Impossible de lire le presse-papier', 'error');
    }
  }, [showToast]);

  const addRecentAddress = useCallback((address) => {
    setRecentAddresses(prev => {
      const existing = prev.find(a => a.address.toLowerCase() === address.toLowerCase());
      const entry = { address, label: existing?.label || '' };
      const next = [entry, ...prev.filter(a => a.address.toLowerCase() !== address.toLowerCase())].slice(0, MAX_RECENT_ADDRESSES);
      saveRecentAddresses(next);
      return next;
    });
  }, []);

  const setAddressLabel = useCallback((address, label) => {
    setRecentAddresses(prev => {
      const next = prev.map(a => a.address.toLowerCase() === address.toLowerCase() ? { ...a, label: label.trim() } : a);
      saveRecentAddresses(next);
      return next;
    });
  }, []);

  // Ne persiste qu'après le chargement initial, sinon le premier render
  // (liste vide) écraserait les favoris déjà sauvegardés sur le disque.
  useEffect(() => {
    if (favoritesLoaded) saveFavorites(favorites);
  }, [favorites, favoritesLoaded]);

  const toggleFavorite = useCallback((symbol) => {
    const sym = symbol.toUpperCase();
    setFavorites(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);
  }, []);

  const clearAllFavorites = useCallback(() => setFavorites([]), []);

  // Vérifie une seule fois au montage si un PIN biométrique est déjà
  // enregistré sur cet appareil (natif uniquement).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    loadBiometricPin().then(pin => setBiometricEnabled(!!pin));
  }, []);

  // Propose l'activation juste après avoir choisi/confirmé un PIN — c'est le
  // seul moment où on a le PIN en clair sous la main (jamais gardé en
  // mémoire au-delà de cet instant précis).
  const offerBiometricEnroll = useCallback(async (pin) => {
    if (Platform.OS === 'web') return;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) return;
      showAlert(
        '🔓 Déverrouillage rapide',
        'Activer Face ID / empreinte pour déverrouiller NexiaWallet sans retaper ton code ?',
        [
          { text: 'Non merci', style: 'cancel' },
          { text: 'Activer', onPress: async () => { await saveBiometricPin(pin); setBiometricEnabled(true); } },
        ]
      );
    } catch (err) {
      console.warn('offerBiometricEnroll failed', err.message);
    }
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Déverrouille NexiaWallet',
        cancelLabel: 'Annuler',
      });
      if (!result.success) return;
      const pin = await loadBiometricPin();
      if (!pin) return;
      await attemptUnlock(pin);
    } catch (err) {
      console.warn('Déverrouillage biométrique échoué:', err.message);
    }
  }, [attemptUnlock]);

  const disableBiometric = useCallback(async () => {
    await clearBiometricPin();
    setBiometricEnabled(false);
  }, []);

  // ── VERROUILLAGE AUTOMATIQUE APRÈS INACTIVITÉ ──
  // La clé déchiffrée ne reste en mémoire que pendant que l'app est
  // effectivement utilisée : au-delà du seuil sans interaction (ou dès que
  // l'app repasse en arrière-plan sur mobile), on revient à l'écran PIN —
  // il faudra rechiffrer... déchiffrer à nouveau pour continuer.
  const AUTO_LOCK_MS = 2 * 60 * 1000;
  const lastActivityRef = useRef(Date.now());

  const lockWallet = useCallback(() => {
    setIsUnlocked(false);
    setUnlockedPrivateKey(null);
    setUnlockedMnemonic(null);
    setPinCode('');
    setPinError(null);
  }, []);

  useEffect(() => {
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
      events.forEach(e => document.addEventListener(e, markActivity, { passive: true }));
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          if (isUnlocked && Date.now() - lastActivityRef.current > AUTO_LOCK_MS) lockWallet();
          markActivity();
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        events.forEach(e => document.removeEventListener(e, markActivity));
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }
    // Natif : le passage en arrière-plan verrouille immédiatement (pas
    // d'attente du seuil — l'app quitte l'écran, donc le risque est immédiat).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && isUnlocked) lockWallet();
      if (state === 'active') markActivity();
    });
    return () => sub.remove();
  }, [isUnlocked, lockWallet]);

  useEffect(() => {
    if (!isUnlocked) return undefined;
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > AUTO_LOCK_MS) lockWallet();
    }, 10000);
    return () => clearInterval(id);
  }, [isUnlocked, lockWallet]);

  useEffect(() => {
    if (walletAddr) {
      refreshPortfolio(network);
    }
  }, [network, walletAddr, refreshPortfolio]);

  useEffect(() => {
    if (walletAddr && customTokensLoaded) refreshCustomTokenBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se déclenche sur
    // wallet/réseau, pas sur customTokens (sinon boucle : le refresh met à
    // jour customTokens, qui redéclencherait l'effet indéfiniment).
  }, [walletAddr, network, customTokensLoaded]);

  // Retour depuis MoonPay/Stripe : confirme l'achat et revérifie le solde
  // plusieurs fois (la crypto arrive on-chain, pas instantanément).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get('transactionStatus');
    const isDemo = params.get('payment') === 'demo';
    if (!status && !isDemo) return;

    if (status) {
      const label = { completed: '✅ Achat confirmé', pending: '⏳ Achat en cours', failed: '❌ Achat échoué' }[status] || `Statut MoonPay : ${status}`;
      showAlert(label, status === 'failed'
        ? 'La transaction MoonPay n\'a pas abouti.'
        : 'Ton solde se met à jour dès que la transaction est confirmée sur la blockchain — vérification automatique en cours.');
    } else {
      showAlert('✅ Achat (mode démo)', 'Aucun vrai paiement effectué — configure MoonPay pour un achat réel.');
    }

    window.history.replaceState({}, '', window.location.pathname);

    if (status === 'completed' || status === 'pending') {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts += 1;
        refreshPortfolio();
        if (attempts >= 6) clearInterval(poll);
      }, 15000);
      return () => clearInterval(poll);
    }
    // Ne doit s'exécuter qu'une fois au chargement de la page de retour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSendToken(nativeSymbol);
    setSwapFrom(nativeSymbol);
    setSwapTo('USDT');
    setBuyToken(nativeSymbol);
  }, [network, nativeSymbol]);

  // ── CALCUL SWAP ──
  useEffect(() => {
    if (!swapAmt || isNaN(Number(swapAmt))) { setSwapRes('0'); return; }
    const fp = tokens[swapFrom]?.price || 1;
    const tp = tokens[swapTo]?.price   || 1;
    const result = (parseFloat(swapAmt) * fp) / tp;
    setSwapRes(isFinite(result) ? result.toFixed(8) : '0');
  }, [swapAmt, swapFrom, swapTo, tokens]);

  // ── BOUGIES ──
  const getCandles = useCallback((symbol) => {
    const cfg = TF_CONFIG[detailTf];
    const price = tokens[symbol]?.price;
    if (!price || !isFinite(price) || price <= 0) return [];

    const history = candleHistory[symbol] || [];

    if (cfg?.live && history.length >= 3) {
      const now    = Date.now();
      const bucket = cfg.bucketMs;
      const base   = now - (now % bucket);
      const candles = [];
      for (let i = cfg.numCandles - 1; i >= 0; i--) {
        const tStart = base - i * bucket;
        const tEnd   = tStart + bucket;
        const pts    = history
          .filter(p => p.time >= tStart && p.time < tEnd)
          .map(p => p.price)
          .filter(v => v && isFinite(v));
        const lastClose = candles[candles.length - 1]?.c || price;
        if (!pts.length) {
          candles.push({ o: lastClose, h: lastClose, l: lastClose, c: lastClose });
        } else {
          candles.push({ o: pts[0], h: Math.max(...pts), l: Math.min(...pts), c: pts[pts.length - 1] });
        }
      }
      return candles;
    }

    // Vraies bougies (CoinGecko) pour les vues plus longues — remplace la
    // simulation tant qu'elles n'ont pas encore été récupérées (fetchCoinCandles).
    const real = realCandles[`${symbol}_${detailTf}`];
    const numCandles = cfg?.numCandles || 8;
    if (real && real.length) return real.slice(-numCandles);

    return generateCandlesFromPrice(symbol, price, detailTf, numCandles) || [];
  }, [detailTf, tokens, candleHistory, chartTick, realCandles]);

  // Récupère les vraies bougies + la fiche crypto (CoinGecko) dès qu'on ouvre
  // le détail d'un token ou qu'on change de zoom — avec cache pour ne pas
  // re-télécharger à chaque re-render.
  useEffect(() => {
    if (!selectedToken) return;
    const cfg = TF_CONFIG[detailTf];
    if (cfg?.live) return; // 5M/15M restent sur l'agrégation live locale (déjà réelle)
    const cgId = WALLET_TOKENS[selectedToken]?.cgId;
    if (!cgId) return;
    const key = `${selectedToken}_${detailTf}`;
    if (realCandles[key]) return;
    axios.get(`${API_BASE}/coin/${cgId}/candles`, {
      params: { timeframe: detailTf }, headers: API_HEADERS, timeout: 15000,
    }).then(res => {
      if (res.data?.success) setRealCandles(prev => ({ ...prev, [key]: res.data.candles }));
    }).catch(err => console.warn('candles CoinGecko indisponibles:', err.message));
  }, [selectedToken, detailTf, realCandles]);

  useEffect(() => {
    if (!selectedToken || coinDetails[selectedToken]) return;
    const cgId = WALLET_TOKENS[selectedToken]?.cgId;
    if (!cgId) return;
    axios.get(`${API_BASE}/coin/${cgId}`, { headers: API_HEADERS, timeout: 15000 })
      .then(res => {
        if (res.data?.success) setCoinDetails(prev => ({ ...prev, [selectedToken]: res.data.coin }));
      })
      .catch(err => console.warn('fiche crypto indisponible:', err.message));
  }, [selectedToken, coinDetails]);

  // Fiche + bougies pour une crypto du Marché qui n'est PAS dans le wallet —
  // même endpoints que ci-dessus, mais indexés par id CoinGecko (pas de
  // symbole wallet connu pour ces cryptos-là).
  useEffect(() => {
    if (!selectedMarketCoin) return;
    const id = selectedMarketCoin.id;
    if (!id || marketCoinInfo[id]) return;
    axios.get(`${API_BASE}/coin/${id}`, { headers: API_HEADERS, timeout: 15000 })
      .then(res => {
        if (res.data?.success) setMarketCoinInfo(prev => ({ ...prev, [id]: res.data.coin }));
      })
      .catch(err => console.warn('fiche crypto (marché) indisponible:', err.message));
  }, [selectedMarketCoin, marketCoinInfo]);

  useEffect(() => {
    if (!selectedMarketCoin) return;
    const id = selectedMarketCoin.id;
    if (!id || marketCoinCandles[id]) return;
    axios.get(`${API_BASE}/coin/${id}/candles`, {
      params: { timeframe: '1J' }, headers: API_HEADERS, timeout: 15000,
    }).then(res => {
      if (res.data?.success) setMarketCoinCandles(prev => ({ ...prev, [id]: res.data.candles }));
    }).catch(err => console.warn('bougies (marché) indisponibles:', err.message));
  }, [selectedMarketCoin, marketCoinCandles]);

  const fetchNews = useCallback(() => {
    return axios.get(`${API_BASE}/news`, { headers: API_HEADERS, timeout: 15000 })
      .then(res => { if (res.data?.success) setNewsItems(res.data.items); })
      .catch(err => console.warn('news indisponibles:', err.message));
  }, []);

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const fmtCompactNumber = useCallback((n) => {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'Md';
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3)  return (n / 1e3).toFixed(2) + 'k';
    return n.toFixed(2);
  }, []);

  // Générique : sert à la fois pour un token du wallet (info via coinDetails)
  // et pour une crypto du Marché qui n'y est pas (info via marketCoinInfo) —
  // seule la source de `info` et la couleur d'accent changent chez l'appelant.
  const renderCoinAbout = (info, keyId, accentColor = T.blue) => {
    if (!info) {
      return (
        <View style={[st.about_box, { alignItems: 'center' }]}>
          <ActivityIndicator color={T.green} />
          <Text style={{ color: T.text2, fontSize: 12, marginTop: 8 }}>Chargement des infos réelles (CoinGecko)…</Text>
        </View>
      );
    }
    return (
      <FadeInView style={st.about_box} deps={[keyId]}>
        <Text style={st.about_title}>À propos de {info.name}</Text>
        {!!info.description && <Text style={st.about_text}>{info.description}</Text>}
        {!!info.categories?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
            {info.categories.slice(0, 4).map(c => (
              <View key={c} style={st.about_tag}><Text style={st.about_tag_txt}>{c}</Text></View>
            ))}
          </View>
        )}

        {(info.circulatingSupply != null) && (
          <SupplyBar circulating={info.circulatingSupply} max={info.maxSupply} color={accentColor} />
        )}

        <View style={st.detail_grid}>
          {[
            { label: 'Rang marché',       val: info.marketCapRank ? `#${info.marketCapRank}` : '—' },
            { label: 'Capitalisation',    val: info.marketCap ? `$${fmtCompactNumber(info.marketCap)}` : '—' },
            { label: 'Volume 24h',        val: info.totalVolume ? `$${fmtCompactNumber(info.totalVolume)}` : '—' },
            { label: 'Valo. diluée',      val: info.fullyDilutedValuation ? `$${fmtCompactNumber(info.fullyDilutedValuation)}` : '—' },
            { label: 'Offre en circulation', val: info.circulatingSupply ? fmtCompactNumber(info.circulatingSupply) : '—' },
            { label: 'Offre max',         val: info.maxSupply ? fmtCompactNumber(info.maxSupply) : 'Illimitée' },
            { label: '🏆 Plus haut historique', val: info.ath ? `$${fmtCompactNumber(info.ath)}` : '—' },
            { label: '📅 Création',       val: info.genesisDate || '—' },
          ].map((item, i) => (
            <FadeInView key={item.label} style={st.detail_stat} deps={[keyId]}>
              <Text style={st.detail_stat_lbl}>{item.label}</Text>
              <Text style={st.detail_stat_val}>{item.val}</Text>
            </FadeInView>
          ))}
        </View>
        {!!info.homepage && (
          <AnimPressable style={st.about_link_btn} onPress={() => Linking.openURL(info.homepage)}>
            <Text style={st.about_link_txt}>🔗 Site officiel</Text>
          </AnimPressable>
        )}
      </FadeInView>
    );
  };

  // ── TOTAUX ──
  const totalUSD = useMemo(() =>
    Object.values(tokens).reduce((s, t) => s + (t.balance || 0) * (t.price || 0), 0),
  [tokens, chartTick]);

  const todayChange = useMemo(() =>
    Object.values(tokens).reduce((total, t) => {
      const val = (t.balance || 0) * (t.price || 0);
      return total + val * ((t.change24h || 0) / 100);
    }, 0),
  [tokens, chartTick]);

  // Score de diversification : signale seulement une forte concentration
  // (≥70% sur un seul actif) — en dessous, pas la peine d'alerter.
  const diversification = useMemo(() => {
    if (totalUSD <= 0) return null;
    const entries = Object.entries(tokens)
      .map(([sym, t]) => ({ sym, value: (t.balance || 0) * (t.price || 0) }))
      .filter(e => e.value > 0);
    if (!entries.length) return null;
    entries.sort((a, b) => b.value - a.value);
    const top = entries[0];
    const topPct = (top.value / totalUSD) * 100;
    return { topSymbol: top.sym, topPct };
  }, [tokens, totalUSD]);

  // Enregistre un point d'historique de valeur totale au plus toutes les
  // PORTFOLIO_HISTORY_MIN_GAP_MS -- pas à chaque rafraîchissement de prix
  // (30s), sinon l'historique ne couvrirait que quelques heures.
  useEffect(() => {
    if (!portfolioHistoryLoaded || totalUSD <= 0) return;
    const last = portfolioHistory[portfolioHistory.length - 1];
    if (last && Date.now() - last.t < PORTFOLIO_HISTORY_MIN_GAP_MS) return;
    const next = [...portfolioHistory, { t: Date.now(), v: totalUSD }].slice(-PORTFOLIO_HISTORY_MAX_POINTS);
    setPortfolioHistory(next);
    savePortfolioHistory(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se déclenche
    // sur totalUSD ; dépendre de portfolioHistory reboucleraît sur son
    // propre setState.
  }, [totalUSD, portfolioHistoryLoaded]);

  // ── FILTRES ──
  const filteredCoins = useMemo(() => {
    let list = marketCoins;
    if (marketSearch) {
      const q = marketSearch.toLowerCase();
      list = list.filter(c => c.name?.toLowerCase().includes(q) || c.symbol?.toLowerCase().includes(q));
    }
    if (marketFavOnly) {
      list = list.filter(c => favorites.includes(c.symbol?.toUpperCase()));
    }
    const sorted = [...list];
    if (marketSort === 'gainers') {
      sorted.sort((a, b) => (b.price_change_percentage_24h || -Infinity) - (a.price_change_percentage_24h || -Infinity));
    } else if (marketSort === 'losers') {
      sorted.sort((a, b) => (a.price_change_percentage_24h ?? Infinity) - (b.price_change_percentage_24h ?? Infinity));
    } else if (marketSort === 'alpha') {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      sorted.sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
    }
    return sorted;
  }, [marketCoins, marketSearch, marketSort, marketFavOnly, favorites]);

  const historySymbols = useMemo(() => {
    const set = new Set((historyItems || []).map(i => i.symbol).filter(Boolean));
    return Array.from(set);
  }, [historyItems]);

  const filteredHistoryItems = useMemo(() => {
    if (!historyItems) return [];
    if (historyFilterSymbol === 'ALL') return historyItems;
    return historyItems.filter(i => i.symbol === historyFilterSymbol);
  }, [historyItems, historyFilterSymbol]);

  // Favoris affichés sur l'accueil : uniquement les cryptos du Marché qui ne
  // sont PAS déjà dans "Mes Tokens" (sinon doublon avec la liste du wallet).
  const favoriteMarketCoins = useMemo(() =>
    marketCoins.filter(c => {
      const sym = c.symbol?.toUpperCase();
      return sym && favorites.includes(sym) && !WALLET_TOKENS[sym];
    }),
  [marketCoins, favorites]);

  // ── PIN HANDLER ──
  const handlePin = (d) => {
    if (isVerifyingPin || pinCode.length >= 6) return;
    const n = pinCode + d;
    setPinCode(n);
    if (n.length < 6) return;

    if (pinStage === 'choose') {
      setPendingPinDigits(n);
      setPinCode('');
      setPinError(null);
      setPinStage('confirm');
      return;
    }
    if (pinStage === 'confirm') {
      if (n === pendingPinDigits) {
        finalizePinSetup(n);
      } else {
        setPinError('Les deux codes ne correspondent pas — recommence.');
        setPinCode('');
        setPendingPinDigits('');
        setPinStage('choose');
      }
      return;
    }
    // Sinon : écran de déverrouillage d'un wallet déjà existant sur l'appareil.
    attemptUnlock(n);
  };

  // ── ACHAT / PAIEMENT STRIPE ──
  const handleBuyNow = async () => {
    if (!buyAmount || isNaN(Number(buyAmount)) || Number(buyAmount) <= 0) {
      showAlert('Montant invalide', 'Entre un montant en USD.');
      return;
    }
    setBuyLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/payments/create-checkout-session`, {
        amountUsd: Number(buyAmount),
        tokenSymbol: buyToken,
        network,
        walletAddress: walletAddr,
        returnUrl: Platform.OS === 'web' ? window.location.origin : `exp://${HOST_OVERRIDE}:8087`,
      }, { timeout: 20000, headers: API_HEADERS });

      if (!res.data?.success || !res.data.url) {
        throw new Error(res.data?.error || 'Impossible de créer la session de paiement.');
      }

      setShowBuy(false);
      if (res.data?.demo) {
        showAlert('✅ Achat prêt', res.data?.message || 'Le flux d’achat est lancé en mode test.');
      } else if (Platform.OS === 'web') {
        // window.open() est bloqué par les navigateurs quand il arrive après un
        // appel réseau (hors du geste de clic direct) — on navigue dans le même
        // onglet à la place, comme le fait un vrai flux de paiement (Stripe/MoonPay).
        window.location.href = res.data.url;
      } else {
        await Linking.openURL(res.data.url);
      }
    } catch (err) {
      showAlert('Erreur paiement', err.message || 'Impossible de lancer le paiement.');
    } finally {
      setBuyLoading(false);
    }
  };

  // ── ENVOI SÉCURISÉ (Validation sur réseau réel) ──
  // Étape 1 : valide et bascule vers l'écran "relis avant d'envoyer" — rien
  // n'est signé ni diffusé ici, juste une estimation des frais pour que
  // l'utilisateur voie tout (adresse, montant, frais) avant de confirmer.
  const prepareSend = async () => {
    if (!sendAddress || !sendAmount) { showAlert('Champs manquants', 'Renseigne une adresse de destination et un montant.'); return; }

    if (!sendAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      showAlert('Adresse invalide', 'Doit commencer par 0x et contenir 40 caractères hexadécimaux.');
      return;
    }

    const amt = parseFloat(sendAmount);
    if (isNaN(amt) || amt <= 0) { showAlert('Montant invalide'); return; }
    const bal = (sendToken === nativeSymbol) ? parseFloat(walletBalance || '0') : (tokens[sendToken]?.balance || 0);
    if (amt > bal) { showAlert('Solde insuffisant', `Tu as ${bal.toFixed(6)} ${sendToken}`); return; }

    const isErc20 = sendToken === 'USDC' || sendToken === 'USDT';
    const isNative = sendToken === nativeSymbol;
    if (!isNative && !isErc20) {
      showAlert('Token non supporté', `L'envoi de ${sendToken} n'est pas encore supporté.`);
      return;
    }

    setSendStep('confirm');
    setSendFeeLoading(true);
    setSendFeeEstimate(null);
    setSendGasTier('normal');
    try {
      const est = await localWallet.estimateSendFee({
        from: walletAddr, to: sendAddress, amount: sendAmount,
        symbol: isNative ? null : sendToken, network,
      });
      setSendFeeEstimate(est);
    } catch (err) {
      console.warn('Estimation des frais indisponible:', err.message);
    } finally {
      setSendFeeLoading(false);
    }
  };

  // Étape 2 : déclenchée depuis l'écran de confirmation — c'est ici, et
  // seulement ici, que la transaction est vraiment signée et diffusée.
  const confirmAndSend = async () => {
    const isNative = sendToken === nativeSymbol;
    // Prix du gas du niveau choisi (Lent/Normal/Rapide) — absent si
    // l'estimation a échoué ou pour le niveau 'normal' (comportement par
    // défaut d'ethers, inchangé). `sendFeeEstimate.tiers` vient de
    // estimateSendFee (voir lib/wallet.js).
    const chosenGasPrice = sendFeeEstimate?.tiers?.[sendGasTier]?.gasPriceWei;

    setSendLoading(true);
    try {
      // Signature 100% locale — la clé privée ne quitte jamais l'appareil.
      // Le backend ne reçoit que la transaction déjà signée pour la relayer
      // au réseau (voir POST /wallet/tx/broadcast), même chemin quel que
      // soit le réseau (corrige l'ancien bug où USDT/USDC sur BSC étaient
      // silencieusement envoyés comme du BNB natif).
      const { rawTx } = isNative
        ? await localWallet.signNativeTx({ privateKey: unlockedPrivateKey, to: sendAddress, amount: sendAmount, network, gasPrice: chosenGasPrice })
        : await localWallet.signErc20Tx({ privateKey: unlockedPrivateKey, to: sendAddress, amount: sendAmount, symbol: sendToken, network, gasPrice: chosenGasPrice });

      const response = await axios.post(`${API_BASE}/tx/broadcast`, { rawTx, network }, { timeout: 25000, headers: API_HEADERS });
      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Échec du transfert');
      }

      const txHash = response.data.txHash;
      playTone('success');
      showAlert(
        '✅ Transaction Soumise!',
        `${sendToken} envoyé avec succès !\nHash: ${txHash?.slice(0, 10)}...\nRéseau: ${activeNetwork.label} (Chain ${activeNetwork.chainId})`,
        [
          { text: 'Copier Hash', onPress: () => copyToClipboard(txHash, 'Hash copié'), style: 'default' },
          { text: 'OK' }
        ]
      );

      addRecentAddress(sendAddress);
      await refreshPortfolio(network);
      setShowSend(false);
      setSendStep('form');
      setSendAddress('');
      setSendAmount('');
      setSendFeeEstimate(null);
      fetchMarket();
    } catch (e) {
      playTone('error');
      showAlert('❌ Erreur', e.message || 'Transaction échouée');
    }
    setSendLoading(false);
  };

  const handleSwapConfirm = async () => {
    if (!swapAmt || parseFloat(swapAmt) <= 0) { showAlert('Montant invalide'); return; }
    if (swapFrom === swapTo) { showAlert('Tokens identiques', 'Choisis deux tokens différents.'); return; }

    const available = swapFrom === nativeSymbol ? parseFloat(walletBalance || '0') : (tokens[swapFrom]?.balance || 0);
    if (parseFloat(swapAmt) > available) {
      showAlert('Solde insuffisant', `Tu n'as pas assez de ${swapFrom} pour cette opération.`);
      return;
    }

    const resolveTokenAddress = (symbol) => {
      if (symbol === nativeSymbol) return localWallet.NATIVE_PLACEHOLDER;
      const cfg = localWallet.ERC20_TOKENS[network]?.[symbol];
      return cfg?.address || null;
    };
    const resolveDecimals = (symbol) => {
      if (symbol === nativeSymbol) return 18;
      return localWallet.ERC20_TOKENS[network]?.[symbol]?.decimals ?? 18;
    };

    const sellAddress = resolveTokenAddress(swapFrom);
    const buyAddress = resolveTokenAddress(swapTo);
    if (!sellAddress || !buyAddress) {
      showAlert('Token non supporté', `Le swap ${swapFrom} → ${swapTo} n'est pas encore supporté sur ${activeNetwork.label}.`);
      return;
    }

    setSwapLoading(true);
    try {
      const sellAmountUnits = ethers.utils.parseUnits(
        parseFloat(swapAmt).toFixed(resolveDecimals(swapFrom)),
        resolveDecimals(swapFrom)
      ).toString();

      const quoteRes = await axios.get(`${API_BASE}/swap/quote`, {
        params: {
          network,
          sellToken: sellAddress,
          buyToken: buyAddress,
          sellAmount: sellAmountUnits,
          taker: walletAddr,
        },
        headers: API_HEADERS,
        timeout: 20000,
      });
      if (!quoteRes.data?.success) {
        throw new Error(quoteRes.data?.error || 'Devis de swap impossible.');
      }
      const quote = quoteRes.data.quote;

      // Si le contrat du swap n'a pas encore l'autorisation de dépenser ce
      // token ERC20, on signe et diffuse d'abord une approbation, puis on
      // attend sa confirmation on-chain avant de tenter le swap lui-même.
      const spender = quote.issues?.allowance?.spender;
      if (spender) {
        const { rawTx: approveRawTx } = await localWallet.signApproveTx({
          privateKey: unlockedPrivateKey,
          tokenAddress: sellAddress,
          spender,
          amount: ethers.constants.MaxUint256,
          network,
        });
        const approveResp = await axios.post(`${API_BASE}/tx/broadcast`, { rawTx: approveRawTx, network }, { timeout: 25000, headers: API_HEADERS });
        if (!approveResp.data?.success) {
          throw new Error(approveResp.data?.error || "Échec de l'approbation du token.");
        }
        await localWallet.waitForTx(approveResp.data.txHash, network);
      }

      const { rawTx: swapRawTx } = await localWallet.signRawTx({
        privateKey: unlockedPrivateKey,
        to: quote.transaction.to,
        data: quote.transaction.data,
        value: quote.transaction.value || '0',
        gasLimit: quote.transaction.gas,
        network,
      });

      const swapResp = await axios.post(`${API_BASE}/tx/broadcast`, { rawTx: swapRawTx, network }, { timeout: 25000, headers: API_HEADERS });
      if (!swapResp.data?.success) {
        throw new Error(swapResp.data?.error || 'Échec du swap.');
      }

      const txHash = swapResp.data.txHash;
      playTone('success');
      showAlert(
        '✅ Swap Soumis !',
        `${swapAmt} ${swapFrom} → ${swapTo}\nHash: ${txHash?.slice(0, 10)}...\nRéseau: ${activeNetwork.label} (Chain ${activeNetwork.chainId})`,
        [{ text: 'OK' }]
      );

      await refreshPortfolio(network);
      setSwapAmt('');
      fetchMarket();
    } catch (e) {
      playTone('error');
      showAlert('❌ Erreur', e.message || 'Swap échoué');
    }
    setSwapLoading(false);
  };

  // ════════════════════════════════════════════════════════
  //  SAUVEGARDE OBLIGATOIRE DE LA PHRASE DE RÉCUPÉRATION
  // ════════════════════════════════════════════════════════
  const renderMnemonicBackup = () => {
    if (!pendingMnemonic) return null;
    const words = pendingMnemonic.trim().split(/\s+/);
    return (
      <Modal visible animationType="fade" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: 8 }}>🔑</Text>
            <Text style={st.modal_title_lg}>Ta phrase de récupération</Text>
            <View style={st.warning_box}>
              <Text style={st.warning_txt}>
                ⚠️ Ces 12 mots sont les SEULS moyens de récupérer ton wallet. Note-les sur papier,
                jamais dans une capture d'écran ou un email. Personne ne pourra te les redonner.
              </Text>
            </View>
            <View style={st.mnemonic_grid}>
              {words.map((w, i) => (
                <View key={i} style={st.mnemonic_chip}>
                  <Text style={st.mnemonic_idx}>{i + 1}</Text>
                  <Text style={st.mnemonic_word}>{w}</Text>
                </View>
              ))}
            </View>
            <AnimPressable
              style={[st.green_btn, { marginTop: 24 }]}
              onPress={() => {
                setPendingMnemonic(null);
                if (isFirstTimeMnemonicBackup) {
                  setIsFirstTimeMnemonicBackup(false);
                  setOnboardingStep(0);
                  setShowOnboarding(true);
                }
              }}
            >
              <Text style={st.green_btn_txt}>✅ Je l'ai notée en lieu sûr</Text>
            </AnimPressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  CHARGEMENT INITIAL (le temps de lire le stockage local)
  // ════════════════════════════════════════════════════════
  if (!sessionLoaded) {
    return (
      <SafeAreaView style={[st.pin_screen, { justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={T.green} size="large" />
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  CHOISIR / CONFIRMER LE PIN — juste après création, import, ou migration
  //  d'une session pré-existante (ancien format non chiffré). Prioritaire sur
  //  tout le reste : tant que ce n'est pas fini, rien n'est encore persisté.
  // ════════════════════════════════════════════════════════
  if (pinStage === 'choose' || pinStage === 'confirm') {
    const isConfirmStage = pinStage === 'confirm';
    const subtitle = isConfirmStage
      ? 'Ressaisis le même code pour confirmer'
      : (pendingWalletForPin?.isMigration ? 'Choisis un code pour sécuriser ce wallet' : 'Choisis un code PIN à 6 chiffres');
    return (
      <SafeAreaView style={st.pin_screen}>
        <StatusBar barStyle="light-content" />
        <View style={st.pin_logo_wrap}>
          <View style={st.pin_logo_circle}>
            <Text style={{ fontSize: 48 }}>🔐</Text>
          </View>
          <Text style={st.pin_app_name}>NexiaWallet</Text>
          <Text style={st.pin_sub}>{subtitle}</Text>
        </View>

        <View style={st.pin_dots}>
          {[...Array(6)].map((_, i) => (
            <View key={i} style={[st.pin_dot, pinCode.length > i && st.pin_dot_on]} />
          ))}
        </View>

        {pinError ? <Text style={st.auth_error}>{pinError}</Text> : null}

        {isVerifyingPin ? (
          <ActivityIndicator color={T.green} style={{ marginTop: 20 }} />
        ) : (
          <View style={st.pin_pad}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <TouchableOpacity key={n} style={st.pin_key} onPress={() => handlePin(n.toString())}>
                <Text style={st.pin_key_txt}>{n}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={st.pin_key} onPress={() => setPinCode(p => p.slice(0, -1))}>
              <Text style={[st.pin_key_txt, { color: T.red }]}>⌫</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.pin_key} onPress={() => handlePin('0')}>
              <Text style={st.pin_key_txt}>0</Text>
            </TouchableOpacity>
            <View style={st.pin_key} />
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  ACCUEIL PUBLIC (pas encore de wallet sur cet appareil)
  // ════════════════════════════════════════════════════════
  if (!walletCreated) {
    const supportedCount = Object.keys(WALLET_TOKENS).length;
    const heroEyebrow = (
      <View style={st.land_eyebrow}>
        <View style={st.land_eyebrow_dot} />
        <Text style={st.land_eyebrow_txt}>WALLET NOUVELLE GÉNÉRATION</Text>
      </View>
    );
    const heroTitle = (
      <Text style={[st.land_title, isWideWeb && st.land_title_wide]}>
        Ta crypto,{'\n'}
        <Text style={st.land_title_grad}>en orbite totale.</Text>
      </Text>
    );
    const heroSubtitle = (
      <Text style={[st.land_subtitle, isWideWeb && st.land_subtitle_wide]}>
        NexiaWallet réunit tes actifs dans une interface pensée pour la vitesse : reçois,
        envoie et échange en quelques secondes, avec tes clés sous ton seul contrôle.
      </Text>
    );
    return (
      <SafeAreaView style={[st.land_screen, isWideWeb && st.land_screen_wide]}>
        <StatusBar barStyle="light-content" />
        <StarField />
        <ScrollView style={st.land_scroll_flex} contentContainerStyle={st.land_scroll} showsVerticalScrollIndicator={false}>

          {/* ── HERO ── */}
          <FadeInView style={[st.land_hero, isWideWeb && st.land_hero_wide]} deps={[]}>
            {isWideWeb ? (
              <View style={st.land_hero_row}>
                <View style={st.land_hero_col_text}>
                  {heroEyebrow}
                  {heroTitle}
                  {heroSubtitle}
                </View>
                <View style={st.land_hero_col_visual}>
                  <OrbitHero />
                </View>
              </View>
            ) : (
              <>
                {heroEyebrow}
                <OrbitHero />
                {heroTitle}
                {heroSubtitle}
              </>
            )}
          </FadeInView>

          <PriceMarquee tokens={tokens} />

          {/* ── FONCTIONNALITÉS ── */}
          <View style={st.land_section}>
            <Text style={st.land_section_eyebrow}>FONCTIONNALITÉS</Text>
            <Text style={st.land_section_title}>Tout ton univers crypto,{'\n'}un seul wallet.</Text>
            <View style={[st.land_features_grid, isWideWeb && st.land_features_grid_wide]}>
              <FeatureCard
                icon="⚡"
                title="Échanges instantanés"
                desc="Swap ETH, BNB, USDT et USDC directement dans l'app, au meilleur taux, sans quitter ton wallet."
                style={isWideWeb && st.land_feature_card_wide}
              />
              <FeatureCard
                icon="🛡️"
                title="Tes clés, tes cryptos"
                desc="Wallet non-custodial : ta clé privée est chiffrée sur ton appareil. Personne d'autre n'y a accès, pas même nous."
                style={isWideWeb && st.land_feature_card_wide}
              />
              <FeatureCard
                icon="📈"
                title="Suivi en temps réel"
                desc="Visualise ton portefeuille en direct : graphiques, prix à jour et historique complet de tes transactions."
                style={isWideWeb && st.land_feature_card_wide}
              />
            </View>
          </View>

          {/* ── SÉCURITÉ ── */}
          <View style={st.land_section}>
            <Text style={st.land_section_eyebrow}>SÉCURITÉ</Text>
            <Text style={st.land_section_title}>Un coffre-fort{'\n'}à toute épreuve.</Text>
            {(() => {
              const checklist = (
                <View style={[st.land_checklist, !isWideWeb && st.land_narrow_wide, isWideWeb && { flex: 1 }]}>
                  {[
                    ['Aucune clé transmise', "Ta clé privée et ta phrase de récupération ne quittent jamais cet appareil."],
                    ['Code PIN à chaque ouverture', 'Chaque déverrouillage et chaque transaction sensible demande ta validation.'],
                    ['Phrase de récupération', "Restaure ton wallet n'importe où grâce à tes mots secrets — à noter hors ligne."],
                    ['Aucune donnée collectée', 'Pas de tracking, pas de compte obligatoire, pas de compromis.'],
                  ].map(([title, desc]) => (
                    <View key={title} style={st.land_check_row}>
                      <View style={st.land_check_bullet}><Text style={{ color: T.cyan, fontSize: 12, fontWeight: 'bold' }}>✓</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.land_check_title}>{title}</Text>
                        <Text style={st.land_check_desc}>{desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
              return isWideWeb ? (
                <View style={st.land_security_split}>
                  {checklist}
                  <View style={st.land_security_visual}><SecurityOrb size={240} /></View>
                </View>
              ) : (
                <>
                  <View style={{ alignItems: 'center', marginBottom: 24 }}><SecurityOrb size={160} /></View>
                  {checklist}
                </>
              );
            })()}
          </View>

          {/* ── STATS ── */}
          <View style={st.land_stats_wrap}>
            <CountStat value={supportedCount} label="Cryptos suivies" style={isWideWeb && st.land_stat_wide} />
            <CountStat value={2} label="Réseaux (ETH + BSC)" style={isWideWeb && st.land_stat_wide} />
            <CountStat value={100} suffix="%" label="Non-custodial" style={isWideWeb && st.land_stat_wide} />
            <CountStat value={0} label="Donnée revendue" style={isWideWeb && st.land_stat_wide} />
          </View>

          {/* ── COMPARATIF ── */}
          <View style={[st.land_section, isWideWeb && st.land_narrow_wide]}>
            <Text style={st.land_section_eyebrow}>LA DIFFÉRENCE</Text>
            <Text style={st.land_section_title}>Pas un exchange{'\n'}comme les autres.</Text>
            <View style={st.compare_table}>
              <View style={st.compare_row}>
                <View style={{ flex: 1.4 }} />
                <Text style={[st.compare_head, { flex: 1 }]}>NexiaWallet</Text>
                <Text style={[st.compare_head, { flex: 1, color: T.text3 }]}>Exchange classique</Text>
              </View>
              {[
                ['Qui détient tes clés ?', 'Toi, uniquement', "La plateforme"],
                ['Compte / KYC obligatoire', 'Non', 'Souvent oui'],
                ['Risque si la plateforme est piratée', 'Aucun — rien à voler ici', 'Tes fonds peuvent être perdus'],
                ['Accès à tes fonds', '24/7, sans autorisation', 'Peut être gelé ou limité'],
              ].map(([label, us, them]) => (
                <View key={label} style={st.compare_row}>
                  <Text style={[st.compare_label, { flex: 1.4 }]}>{label}</Text>
                  <Text style={[st.compare_cell, st.compare_cell_us, { flex: 1 }]}>✓ {us}</Text>
                  <Text style={[st.compare_cell, { flex: 1, color: T.text3 }]}>{them}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── DÉMARRAGE ── */}
          <View style={st.land_section}>
            <Text style={st.land_section_eyebrow}>DÉMARRAGE</Text>
            <Text style={st.land_section_title}>Prête en 3 étapes.</Text>
            <View style={isWideWeb && st.land_steps_row_wide}>
              {[
                ['01', 'Crée ton wallet', "Génère ton wallet en moins d'une minute. Note ta phrase de récupération et garde-la en lieu sûr."],
                ['02', 'Ajoute tes cryptos', 'Reçois des fonds via ton adresse ou importe un wallet existant avec tes mots secrets.'],
                ['03', 'Envoie, échange', 'Transfère et swap tes actifs en quelques secondes, où que tu sois.'],
              ].map(([num, title, desc]) => (
                <View key={num} style={[st.land_step, isWideWeb && st.land_step_wide]}>
                  <Text style={st.land_step_num}>{num}</Text>
                  <Text style={st.land_step_title}>{title}</Text>
                  <Text style={st.land_step_desc}>{desc}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── SIMULATEUR ── */}
          <View style={[st.land_section, isWideWeb && st.land_narrow_wide]}>
            <Text style={st.land_section_eyebrow}>PROJECTION</Text>
            <Text style={st.land_section_title}>Et si ça{'\n'}décollait ?</Text>
            {(() => {
              const coin = marketCoins.find(c => c.symbol?.toUpperCase() === simCoin);
              const price = coin?.current_price;
              const amt = parseFloat(simAmount) || 0;
              const qty = price ? amt / price : 0;
              return (
                <View style={st.sim_card}>
                  <View style={{ flexDirection: 'row', marginBottom: 14 }}>
                    {['BTC', 'ETH'].map(sym => (
                      <TouchableOpacity
                        key={sym}
                        style={[st.chain_tab_sm, simCoin === sym && st.chain_tab_sm_on, { marginRight: 8 }]}
                        onPress={() => setSimCoin(sym)}
                      >
                        <Text style={[st.chain_tab_sm_txt, simCoin === sym && st.chain_tab_sm_txt_on]}>{sym}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={st.form_label}>Si j'avais investi</Text>
                  <TextInput
                    style={st.form_input}
                    value={simAmount}
                    onChangeText={setSimAmount}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor={T.text3}
                  />
                  {price ? (
                    <>
                      {[2, 5, 10].map(mult => (
                        <View key={mult} style={st.sim_row}>
                          <Text style={st.sim_row_lbl}>Si {simCoin} fait x{mult}</Text>
                          <Text style={st.sim_row_val}>≈ {(amt * mult).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} $</Text>
                        </View>
                      ))}
                      <Text style={{ color: T.text3, fontSize: 10, marginTop: 10, textAlign: 'center' }}>
                        ≈ {qty.toFixed(6)} {simCoin} au prix actuel ({fmt(price)}). Simulation illustrative, ne constitue pas un conseil d'investissement.
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center', marginTop: 10 }}>Chargement des prix…</Text>
                  )}
                </View>
              );
            })()}
          </View>

          {/* ── FAQ ── */}
          <View style={[st.land_section, isWideWeb && st.land_narrow_wide]}>
            <Text style={st.land_section_eyebrow}>QUESTIONS FRÉQUENTES</Text>
            <Text style={st.land_section_title}>On répond{'\n'}avant que tu demandes.</Text>
            <View style={{ marginTop: 8 }}>
              {LANDING_FAQ.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <TouchableOpacity key={i} style={st.faq_item} onPress={() => setOpenFaq(isOpen ? null : i)} activeOpacity={0.8}>
                    <View style={st.faq_q_row}>
                      <Text style={st.faq_q_txt}>{item.q}</Text>
                      <Text style={st.faq_chevron}>{isOpen ? '−' : '+'}</Text>
                    </View>
                    {isOpen && <Text style={st.faq_a_txt}>{item.a}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ── CTA ── */}
          <View style={[st.land_cta, isWideWeb && st.land_narrow_wide]}>
            <Text style={st.land_section_eyebrow}>REJOINS NEXIA</Text>
            <Text style={st.land_section_title}>Passe à la{'\n'}vitesse lumière.</Text>

            {backendError ? <Text style={st.auth_error}>{backendError}</Text> : null}

            <View style={st.land_network_switch}>
              <TouchableOpacity style={[st.network_chip, network === 'ethereum' && st.network_chip_on]} onPress={() => setNetwork('ethereum')}>
                <Text style={[st.network_chip_txt, network === 'ethereum' && { color: T.text }]}>Ethereum</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.network_chip, network === 'bsc' && st.network_chip_on]} onPress={() => setNetwork('bsc')}>
                <Text style={[st.network_chip_txt, network === 'bsc' && { color: T.text }]}>BNB Smart Chain</Text>
              </TouchableOpacity>
            </View>

            {Platform.OS === 'web' && (
              <View style={[st.warning_box, { marginTop: 14, width: '100%' }]}>
                <Text style={st.warning_txt}>
                  ⚠️ Sur navigateur web, le stockage n'est pas protégé par le matériel comme sur mobile.
                  Pratique pour découvrir — préfère l'app native pour de vrais fonds.
                </Text>
              </View>
            )}

            <View style={st.land_cta_actions}>
              <AnimPressable style={st.land_cta_btn_primary} onPress={createWallet}>
                <Text style={st.land_cta_btn_primary_txt}>Créer mon wallet</Text>
              </AnimPressable>
              <AnimPressable style={st.land_cta_btn_ghost} onPress={() => { setImportMode(true); setImportError(null); }}>
                <Text style={st.land_cta_btn_ghost_txt}>J'ai déjà un wallet</Text>
              </AnimPressable>
            </View>

            {importMode && (
              <View style={st.import_card}>
                <View style={st.import_switch}>
                  <TouchableOpacity style={[st.import_type_btn, importType === 'mnemonic' && st.import_type_btn_on]} onPress={() => setImportType('mnemonic')}>
                    <Text style={[st.import_type_txt, importType === 'mnemonic' && { color: T.text }]}>{'Mnémotechnique'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[st.import_type_btn, importType === 'privateKey' && st.import_type_btn_on]} onPress={() => setImportType('privateKey')}>
                    <Text style={[st.import_type_txt, importType === 'privateKey' && { color: T.text }]}>{'Clé privée'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={st.import_input}
                  value={importValue}
                  onChangeText={setImportValue}
                  placeholder={importType === 'mnemonic' ? 'Entrer 12 mots...' : '0x... clé privée'}
                  placeholderTextColor={T.text3}
                  multiline={importType === 'mnemonic'}
                  autoCapitalize="none"
                />
                {importError ? <Text style={st.import_error}>{importError}</Text> : null}
                <AnimPressable style={st.import_confirm_btn} onPress={importWallet}>
                  <Text style={st.green_btn_txt}>Importer maintenant</Text>
                </AnimPressable>
              </View>
            )}
          </View>

          <View style={st.land_footer_wrap}>
            <View style={[st.warning_box, { width: '100%' }]}>
              <Text style={st.warning_txt}>
                🛡️ NexiaWallet ne te demandera JAMAIS ta phrase de récupération par email, chat ou support. Si on te la demande, c'est une arnaque.
              </Text>
            </View>
            <View style={st.land_footer_links}>
              {Object.entries(LEGAL_DOCS).map(([key, doc]) => (
                <TouchableOpacity key={key} onPress={() => setLegalDoc(key)}>
                  <Text style={st.land_footer_link}>{doc.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={st.land_footer}>NEXIA WALLET · Tes clés, tes cryptos.</Text>
          </View>
        </ScrollView>
        {renderMnemonicBackup()}
        {renderLegal()}
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  ÉCRAN PIN (le wallet existe déjà sur cet appareil)
  // ════════════════════════════════════════════════════════
  if (!isUnlocked) {
    return (
      <SafeAreaView style={st.pin_screen}>
        <StatusBar barStyle="light-content" />
        <View style={st.pin_logo_wrap}>
          <View style={st.pin_logo_circle}>
            <Text style={{ fontSize: 48 }}>🔐</Text>
          </View>
          <Text style={st.pin_app_name}>NexiaWallet</Text>
          <Text style={st.pin_sub}>Déverrouille ton wallet</Text>
        </View>

        <View style={st.pin_dots}>
          {[...Array(6)].map((_, i) => (
            <View key={i} style={[st.pin_dot, pinCode.length > i && st.pin_dot_on]} />
          ))}
        </View>
        {pinError ? <Text style={st.auth_error}>{pinError}</Text> : null}
        {isVerifyingPin ? (
          <ActivityIndicator color={T.green} style={{ marginTop: 20 }} />
        ) : (
          <View style={st.pin_pad}>
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <TouchableOpacity key={n} style={st.pin_key} onPress={() => handlePin(n.toString())}>
                <Text style={st.pin_key_txt}>{n}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={st.pin_key} onPress={() => setPinCode(p => p.slice(0, -1))}>
              <Text style={[st.pin_key_txt, { color: T.red }]}>⌫</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.pin_key} onPress={() => handlePin('0')}>
              <Text style={st.pin_key_txt}>0</Text>
            </TouchableOpacity>
            <View style={st.pin_key} />
          </View>
        )}
        {biometricEnabled && Platform.OS !== 'web' && !isVerifyingPin && (
          <AnimPressable style={st.biometric_btn} onPress={handleBiometricUnlock}>
            <Text style={st.biometric_btn_txt}>👆 Face ID / Empreinte</Text>
          </AnimPressable>
        )}
        {renderMnemonicBackup()}
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  MODAL: DÉTAIL TOKEN
  // ════════════════════════════════════════════════════════
  const renderTokenDetail = () => {
    if (!selectedToken || !tokens[selectedToken]) return null;
    const tk      = tokens[selectedToken];
    const candles = getCandles(selectedToken);
    const positive = (tk.change24h || 0) >= 0;
    const isLive   = TF_CONFIG[detailTf]?.live;
    return (
      <Modal visible animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => setSelectedToken(null)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={st.modal_title}>{tk.name}</Text>
              <Text style={st.modal_sub}>{selectedToken} / USD</Text>
            </View>
            <TouchableOpacity onPress={() => toggleFavorite(selectedToken)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Ajouter ou retirer des favoris">
              <Text style={{ fontSize: 20 }}>{favorites.includes(selectedToken) ? '⭐' : '☆'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={st.detail_price_wrap}>
              <Text style={st.detail_price}>{fmt(tk.price, tk.price < 1 ? 6 : 2)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <View style={[st.change_badge, { backgroundColor: positive ? T.greenBg : T.redBg }]}>
                  <Text style={{ color: positive ? T.green : T.red, fontWeight: 'bold', fontSize: 13 }}>
                    {positive ? '▲ +' : '▼ '}{Math.abs(tk.change24h || 0).toFixed(2)}% (24h)
                  </Text>
                </View>
                {isLive && (
                  <View style={st.live_badge}>
                    <PulseDot color={T.green} size={7} />
                    <Text style={st.live_txt}>LIVE</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              <CandlestickChart candles={candles} />
            </View>
            {renderPriceAlertSection(selectedToken, tk.price)}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <View style={st.tf_row}>
                {TF_KEYS.map(tf => (
                  <TouchableOpacity key={tf} style={[st.tf_btn, detailTf === tf && st.tf_btn_on]} onPress={() => setDetailTf(tf)}>
                    <Text style={[st.tf_txt, detailTf === tf && { color: T.green }]}>{tf}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={st.detail_grid}>
              {[
                { label: 'Solde',      val: `${(tk.balance || 0).toFixed(6)} ${selectedToken}` },
                { label: 'Valeur',     val: fmt((tk.balance || 0) * (tk.price || 0)) },
                { label: 'Prix',       val: fmt(tk.price, 4) },
                { label: 'Market Cap', val: fmt(tk.marketCap) },
              ].map(item => (
                <View key={item.label} style={st.detail_stat}>
                  <Text style={st.detail_stat_lbl}>{item.label}</Text>
                  <Text style={st.detail_stat_val}>{item.val}</Text>
                </View>
              ))}
            </View>
            <View style={st.detail_actions}>
              {[
                { icon: '↑', label: 'Envoyer',  onPress: () => { setSelectedToken(null); setSendToken(selectedToken); setShowSend(true); } },
                { icon: '↓', label: 'Recevoir', onPress: () => { setSelectedToken(null); setShowReceive(true); } },
                { icon: '⇄', label: 'Swap',     onPress: () => { setSelectedToken(null); setSwapFrom(selectedToken); setTab('swap'); } },
              ].map(a => (
                <AnimPressable key={a.label} style={st.detail_action_btn} onPress={a.onPress}>
                  <View style={st.detail_action_icon}>
                    <Text style={{ color: T.green, fontSize: 20 }}>{a.icon}</Text>
                  </View>
                  <Text style={st.detail_action_lbl}>{a.label}</Text>
                </AnimPressable>
              ))}
            </View>

            {renderCoinAbout(coinDetails[selectedToken], selectedToken, tokens[selectedToken]?.color)}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  MODAL: FICHE INFO — crypto du Marché absente du wallet (lecture seule :
  //  prix, capitalisation, description — pas de solde/envoi possible puisque
  //  ce wallet n'a pas d'adresse pour cette chaîne/ce token).
  // ════════════════════════════════════════════════════════
  const renderMarketCoinDetail = () => {
    if (!selectedMarketCoin) return null;
    const coin = selectedMarketCoin;
    const sym = coin.symbol?.toUpperCase() || '';
    const positive = (coin.price_change_percentage_24h || 0) >= 0;
    const candles = marketCoinCandles[coin.id] || [];
    const info = marketCoinInfo[coin.id];
    return (
      <Modal visible animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => setSelectedMarketCoin(null)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={st.modal_title}>{coin.name}</Text>
              <Text style={st.modal_sub}>{sym} / USD</Text>
            </View>
            <TouchableOpacity onPress={() => toggleFavorite(sym)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Ajouter ou retirer des favoris">
              <Text style={{ fontSize: 20 }}>{favorites.includes(sym) ? '⭐' : '☆'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={st.detail_price_wrap}>
              <Text style={st.detail_price}>{fmt(coin.current_price, coin.current_price < 1 ? 6 : 2)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <View style={[st.change_badge, { backgroundColor: positive ? T.greenBg : T.redBg }]}>
                  <Text style={{ color: positive ? T.green : T.red, fontWeight: 'bold', fontSize: 13 }}>
                    {positive ? '▲ +' : '▼ '}{Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}% (24h)
                  </Text>
                </View>
              </View>
            </View>

            {candles.length > 0 && (
              <View style={{ paddingHorizontal: 16 }}>
                <CandlestickChart candles={candles} />
              </View>
            )}

            <View style={[st.calc_card, { marginHorizontal: 16 }]}>
              <Text style={st.form_label}>Calculatrice rapide</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[st.form_input, { flex: 1, marginBottom: 0 }]}
                  value={calcAmount}
                  onChangeText={setCalcAmount}
                  placeholder={`Montant en ${sym}`}
                  placeholderTextColor={T.text3}
                  keyboardType="numeric"
                />
                <Text style={st.calc_sym}>{sym}</Text>
              </View>
              <Text style={st.calc_result}>
                ≈ {fmt((parseFloat(calcAmount) || 0) * (coin.current_price || 0))}
              </Text>
            </View>

            {renderPriceAlertSection(sym, coin.current_price)}

            <View style={st.detail_grid}>
              {[
                { label: 'Prix',       val: fmt(coin.current_price, 4) },
                { label: 'Market Cap', val: fmt(coin.market_cap) },
              ].map(item => (
                <View key={item.label} style={st.detail_stat}>
                  <Text style={st.detail_stat_lbl}>{item.label}</Text>
                  <Text style={st.detail_stat_val}>{item.val}</Text>
                </View>
              ))}
            </View>

            <View style={[st.warning_box, { marginHorizontal: 16 }]}>
              <Text style={st.warning_txt}>
                ℹ️ Cette crypto n'est pas gérée par ce wallet (pas d'adresse dédiée pour cette chaîne) —
                lecture seule : prix et infos uniquement, pas d'envoi ni d'achat direct.
              </Text>
            </View>

            {renderCoinAbout(info, coin.id, T.violet)}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  MODAL: ENVOYER (VALIDATION MAINNET / BSC)
  // ════════════════════════════════════════════════════════
  // Réutilisé dans la fiche détail d'un token du wallet ET dans la fiche
  // "lecture seule" d'une crypto du Marché — d'où une fonction plutôt qu'un
  // doublon de JSX dans les deux écrans.
  const renderPriceAlertSection = (symbol, currentPrice) => {
    const existing = priceAlerts.filter(a => a.symbol === symbol);
    const isEditing = alertFormFor === symbol;
    return (
      <View style={st.alert_section}>
        {existing.map(a => (
          <View key={a.id} style={st.alert_chip}>
            <Text style={st.alert_chip_txt}>
              🔔 Prix {a.direction === 'above' ? '≥' : '≤'} {fmt(a.targetPrice, a.targetPrice < 1 ? 4 : 2)}
            </Text>
            <TouchableOpacity onPress={() => removePriceAlert(a.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: T.red, fontSize: 13 }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {isEditing ? (
          <View style={st.alert_form}>
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <TouchableOpacity
                style={[st.chain_tab_sm, alertDirection === 'above' && st.chain_tab_sm_on]}
                onPress={() => setAlertDirection('above')}
              >
                <Text style={[st.chain_tab_sm_txt, alertDirection === 'above' && st.chain_tab_sm_txt_on]}>Au-dessus de</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.chain_tab_sm, alertDirection === 'below' && st.chain_tab_sm_on]}
                onPress={() => setAlertDirection('below')}
              >
                <Text style={[st.chain_tab_sm_txt, alertDirection === 'below' && st.chain_tab_sm_txt_on]}>En dessous de</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                style={[st.form_input, { flex: 1, marginBottom: 0 }]}
                value={alertTargetInput}
                onChangeText={setAlertTargetInput}
                keyboardType="numeric"
                placeholder={currentPrice ? currentPrice.toString() : '0.00'}
                placeholderTextColor={T.text3}
              />
              <TouchableOpacity
                style={[st.max_btn, { marginBottom: 0 }]}
                onPress={() => {
                  const v = parseFloat(alertTargetInput);
                  if (!v || v <= 0) { showToast('Prix cible invalide', 'error'); return; }
                  // Retour immédiat si la condition est déjà vraie, plutôt que
                  // de créer une alerte qui n'attendrait que le prochain
                  // rafraîchissement (jusqu'à 30s) pour se déclencher.
                  const alreadyMet = currentPrice && (alertDirection === 'above' ? currentPrice >= v : currentPrice <= v);
                  if (alreadyMet) {
                    showAlert('🔔 Déjà atteint', `${symbol} est déjà ${alertDirection === 'above' ? 'au-dessus' : 'en dessous'} de ${fmt(v, v < 1 ? 4 : 2)}.`);
                  } else {
                    addPriceAlert(symbol, v, alertDirection);
                  }
                  setAlertFormFor(null);
                  setAlertTargetInput('');
                }}
              >
                <Text style={st.max_btn_txt}>Créer</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setAlertFormFor(null)} style={{ marginTop: 10 }}>
              <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => { setAlertFormFor(symbol); setAlertTargetInput(''); setAlertDirection('above'); }}>
            <Text style={st.alert_add_txt}>🔔 Créer une alerte de prix</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const closeSend = () => { setShowSend(false); setSendStep('form'); setSendFeeEstimate(null); setSendAmountMode('crypto'); setSendAmountFiatInput(''); };

  // `sendAmount` (en crypto) reste la seule valeur utilisée par prepareSend/
  // confirmAndSend — le mode "devise" n'est qu'un affichage alternatif de
  // saisie qui reconvertit immédiatement vers la crypto sous-jacente.
  const setSendCryptoAmount = (cryptoStr) => {
    setSendAmount(cryptoStr);
    if (sendAmountMode === 'fiat') {
      const price = tokens[sendToken]?.price || 0;
      const fiatVal = (parseFloat(cryptoStr) || 0) * price * fxRate;
      setSendAmountFiatInput(fiatVal ? fiatVal.toFixed(2) : '');
    }
  };
  const setSendFiatAmount = (fiatStr) => {
    setSendAmountFiatInput(fiatStr);
    const price = tokens[sendToken]?.price || 0;
    const fiatNum = parseFloat(fiatStr) || 0;
    const cryptoVal = (price > 0 && fxRate > 0) ? (fiatNum / fxRate) / price : 0;
    setSendAmount(cryptoVal ? String(cryptoVal) : '');
  };
  const toggleSendAmountMode = () => {
    if (sendAmountMode === 'crypto') {
      const price = tokens[sendToken]?.price || 0;
      const fiatVal = (parseFloat(sendAmount) || 0) * price * fxRate;
      setSendAmountFiatInput(fiatVal ? fiatVal.toFixed(2) : '');
      setSendAmountMode('fiat');
    } else {
      setSendAmountMode('crypto');
    }
  };

  const renderQrScanner = () => (
    <Modal visible={showQrScanner} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowQrScanner(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Scanner un QR code</Text>
          <View style={{ width: 40 }} />
        </View>
        {Platform.OS === 'web' ? (
          showQrScanner && <WebQrScanner onScanned={(data) => handleQrScanned({ data })} />
        ) : cameraPermission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={showQrScanner ? handleQrScanned : undefined}
          />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: T.text2, textAlign: 'center', marginBottom: 16 }}>
              Accès à la caméra nécessaire pour scanner un QR code.
            </Text>
            <AnimPressable style={st.green_btn} onPress={requestCameraPermission}>
              <Text style={st.green_btn_txt}>Autoriser la caméra</Text>
            </AnimPressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );

  const renderSend = () => (
    <Modal visible={showSend} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => (sendStep === 'confirm' ? setSendStep('form') : closeSend())} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>{sendStep === 'confirm' ? 'Vérifie et confirme' : 'Envoyer'}</Text>
          <View style={{ width: 40 }} />
        </View>

        {sendStep === 'confirm' ? (
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <View style={st.confirm_box}>
              <Text style={st.confirm_label}>Tu envoies</Text>
              <Text style={st.confirm_amount}>{sendAmount} {sendToken}</Text>
              <Text style={st.confirm_sub}>≈ {fmt((parseFloat(sendAmount) || 0) * (tokens[sendToken]?.price || 0))}</Text>
            </View>

            <Text style={st.form_label}>À l'adresse</Text>
            <View style={st.confirm_addr_box}>
              <Text style={st.confirm_addr_txt} selectable>{sendAddress}</Text>
            </View>

            <Text style={st.form_label}>Frais de réseau</Text>
            {sendFeeLoading ? (
              <View style={st.send_info_box}><ActivityIndicator color={T.green} /></View>
            ) : sendFeeEstimate?.tiers && !sendFeeEstimate.approximate ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { key: 'slow', label: 'Lent' },
                    { key: 'normal', label: 'Normal' },
                    { key: 'fast', label: 'Rapide' },
                  ].map(({ key, label }) => {
                    const tier = sendFeeEstimate.tiers[key];
                    const isSelected = sendGasTier === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[st.gas_tier_btn, isSelected && st.gas_tier_btn_on]}
                        onPress={() => setSendGasTier(key)}
                      >
                        <Text style={[st.gas_tier_lbl, isSelected && st.gas_tier_lbl_on]}>{label}</Text>
                        <Text style={[st.gas_tier_fee, isSelected && st.gas_tier_lbl_on]}>
                          {parseFloat(tier.feeNative).toFixed(6)} {sendFeeEstimate.nativeSymbol}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ color: T.text3, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                  Pas d'estimation de délai précise — "Rapide" paie plus cher pour tendre vers une confirmation plus rapide, sans garantie.
                </Text>
              </>
            ) : (
              <View style={st.send_info_box}>
                <Text style={[st.send_info_line, { color: T.text3 }]}>
                  {sendFeeEstimate ? `≈ ${parseFloat(sendFeeEstimate.feeNative).toFixed(6)} ${sendFeeEstimate.nativeSymbol} (estimation approximative)` : "Indisponible — le montant réel sera calculé à l'envoi."}
                </Text>
              </View>
            )}

            <View style={st.warning_box}>
              <Text style={st.warning_txt}>
                ⚠️ Vérifie bien l'adresse — une transaction envoyée à la mauvaise adresse est irrécupérable.
              </Text>
            </View>

            <AnimPressable style={[st.green_btn, { opacity: sendLoading ? 0.7 : 1, marginTop: 8 }]}
              onPress={confirmAndSend} disabled={sendLoading}>
              {sendLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>✅ Confirmer l'envoi</Text>}
            </AnimPressable>
          </ScrollView>
        ) : (
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <View style={st.network_badge}>
              <Text style={{ color: T.orange, fontSize: 12, fontWeight: 'bold' }}>⛓️ {activeNetwork.label.toUpperCase()} • SOLDE RÉEL</Text>
            </View>

            <Text style={st.form_label}>Token</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
              {Object.entries(tokens).map(([sym, t]) => (
                <TouchableOpacity key={sym} style={[st.tok_chip, sendToken === sym && st.tok_chip_on]} onPress={() => setSendToken(sym)}>
                  <CoinLogo logo={t.logo} icon={t.icon} size={24} />
                  <Text style={[st.tok_chip_txt, sendToken === sym && { color: T.text }]}>{sym}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={st.form_label}>Adresse (0x...)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput style={[st.form_input, { flex: 1, marginBottom: 0 }]} value={sendAddress} onChangeText={setSendAddress}
                placeholder="0x123...abc" placeholderTextColor={T.text3} autoCapitalize="none" />
              {Platform.OS === 'web' && (
                <TouchableOpacity style={st.addr_action_btn} onPress={pasteAddressFromClipboard} accessibilityRole="button" accessibilityLabel="Coller l'adresse depuis le presse-papier">
                  <Text style={{ fontSize: 18 }}>📋</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={st.addr_action_btn} onPress={() => setShowQrScanner(true)} accessibilityRole="button" accessibilityLabel="Scanner un QR code">
                <Text style={{ fontSize: 18 }}>📷</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 16 }} />

            {!!recentAddresses.length && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[st.form_label, { marginBottom: 8 }]}>Adresses récentes</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {recentAddresses.map(({ address, label }) => (
                    <View key={address} style={st.recent_addr_chip}>
                      <TouchableOpacity onPress={() => setSendAddress(address)}>
                        <Text style={st.recent_addr_txt}>
                          {label ? label : `${address.slice(0, 6)}…${address.slice(-4)}`}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => { setLabelEditFor(address); setLabelInput(label || ''); }}
                      >
                        <Text style={st.recent_addr_edit}>✏️</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
                {!!labelEditFor && (
                  <View style={[st.alert_form, { marginTop: 10 }]}>
                    <Text style={{ color: T.text3, fontSize: 11, marginBottom: 8 }}>
                      {labelEditFor.slice(0, 8)}…{labelEditFor.slice(-6)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        style={[st.form_input, { flex: 1, marginBottom: 0 }]}
                        value={labelInput}
                        onChangeText={setLabelInput}
                        placeholder="Ex: Binance, Compte perso..."
                        placeholderTextColor={T.text3}
                        maxLength={24}
                      />
                      <TouchableOpacity
                        style={[st.max_btn, { marginBottom: 0 }]}
                        onPress={() => { setAddressLabel(labelEditFor, labelInput); setLabelEditFor(null); }}
                      >
                        <Text style={st.max_btn_txt}>OK</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setLabelEditFor(null)} style={{ marginTop: 10 }}>
                      <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={st.form_label}>Montant</Text>
              <TouchableOpacity onPress={toggleSendAmountMode} accessibilityRole="button" accessibilityLabel="Basculer entre montant en crypto et en devise">
                <Text style={st.amount_mode_toggle}>
                  {sendAmountMode === 'crypto' ? `Saisir en ${currency} ⇄` : `Saisir en ${sendToken} ⇄`}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {sendAmountMode === 'fiat' ? (
                <TextInput style={[st.form_input, { flex: 1 }]} value={sendAmountFiatInput} onChangeText={setSendFiatAmount}
                  placeholder={`0.00 ${symC}`} placeholderTextColor={T.text3} keyboardType="numeric" />
              ) : (
                <TextInput style={[st.form_input, { flex: 1 }]} value={sendAmount} onChangeText={setSendCryptoAmount}
                  placeholder="0.00" placeholderTextColor={T.text3} keyboardType="numeric" />
              )}
              <TouchableOpacity style={st.max_btn} onPress={() => setSendCryptoAmount(String(tokens[sendToken]?.balance || 0))}>
                <Text style={st.max_btn_txt}>MAX</Text>
              </TouchableOpacity>
            </View>
            {sendAmountMode === 'fiat' && !!sendAmount && (
              <Text style={{ color: T.text3, fontSize: 11, marginTop: 6 }}>≈ {sendAmount} {sendToken}</Text>
            )}
            {(() => {
              const sendableBalance = (sendToken === nativeSymbol)
                ? parseFloat(walletBalance || '0')
                : (tokens[sendToken]?.balance || 0);
              if (!sendableBalance) return null;
              return (
                <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                  {[0.25, 0.5, 0.75].map(pct => (
                    <TouchableOpacity
                      key={pct}
                      style={st.quick_pct_btn}
                      onPress={() => setSendCryptoAmount(String(sendableBalance * pct))}
                    >
                      <Text style={st.quick_pct_txt}>{pct * 100}%</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}

            {!!sendAddress && sendAddress.length === 42 && !recentAddresses.some(a => a.address.toLowerCase() === sendAddress.toLowerCase()) && (
              <View style={[st.warning_box, { marginTop: 12 }]}>
                <Text style={st.warning_txt}>
                  🆕 Nouvelle adresse — tu ne lui as jamais envoyé de fonds ici. Vérifie-la bien avant de continuer.
                </Text>
              </View>
            )}

            <View style={st.send_info_box}>
              <Text style={st.send_info_line}>≈ {fmt((parseFloat(sendAmount) || 0) * (tokens[sendToken]?.price || 0))}</Text>
              <Text style={st.send_info_line}>Solde réel: {((sendToken === nativeSymbol) ? parseFloat(walletBalance || '0') : (tokens[sendToken]?.balance || 0)).toFixed(6)} {sendToken}</Text>
              <Text style={st.send_info_line}>Réseau: {activeNetwork.label} • validation directe</Text>
            </View>

            <AnimPressable style={[st.green_btn, { marginTop: 24 }]} onPress={prepareSend}>
              <Text style={st.green_btn_txt}>Continuer</Text>
            </AnimPressable>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );

  // ════════════════════════════════════════════════════════
  //  MODAL: RECEVOIR
  // ════════════════════════════════════════════════════════
  const renderReceive = () => {
    // Format EIP-681 (largement reconnu par les wallets Ethereum) : encoder
    // un montant dans le QR quand renseigné, pour une vraie "demande de
    // paiement" plutôt que juste l'adresse brute. Montant en token natif
    // uniquement (ETH/BNB) — encoder un montant de token ERC20 demanderait
    // un URI beaucoup plus complexe (appel de contrat transfer()).
    const amt = parseFloat(receiveAmount);
    let qrValue = walletAddr;
    let paymentUri = null;
    if (walletAddr && amt > 0) {
      try {
        const wei = ethers.utils.parseEther(receiveAmount).toString();
        paymentUri = `ethereum:${walletAddr}@${activeNetwork.chainId}?value=${wei}`;
        qrValue = paymentUri;
      } catch { /* montant invalide, on garde juste l'adresse */ }
    }
    return (
    <Modal visible={showReceive} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowReceive(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Recevoir</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', padding: 24 }}>
          <View style={st.network_badge}>
            <Text style={{ color: T.blue, fontSize: 11 }}>EVM Compatible • Ethereum, Polygon, BNB…</Text>
          </View>
          <View style={st.qr_wrap}><QRCodeMock address={qrValue} /></View>
          <Text style={st.receive_title}>Adresse Publique</Text>
          <View style={st.receive_addr_box}>
            <Text style={st.receive_addr} selectable>{walletAddr}</Text>
          </View>
          <AnimPressable style={st.green_btn} onPress={() => copyToClipboard(walletAddr, 'Adresse copiée')}>
            <Text style={st.green_btn_txt}>📋 Copier</Text>
          </AnimPressable>

          <View style={{ width: '100%', marginTop: 20 }}>
            <Text style={st.form_label}>Demander un montant précis (optionnel)</Text>
            <TextInput
              style={st.form_input}
              value={receiveAmount}
              onChangeText={setReceiveAmount}
              placeholder={`0.00 ${nativeSymbol}`}
              placeholderTextColor={T.text3}
              keyboardType="numeric"
            />
            {!!paymentUri && (
              <>
                <Text style={{ color: T.text3, fontSize: 11, marginBottom: 10 }}>
                  Le QR ci-dessus encode maintenant {receiveAmount} {nativeSymbol} — un wallet compatible (dont NexiaWallet) pré-remplira le montant en scannant.
                </Text>
                <AnimPressable style={[st.green_btn, { backgroundColor: T.card2 }]} onPress={() => copyToClipboard(paymentUri, 'Lien de demande copié')}>
                  <Text style={[st.green_btn_txt, { color: T.text }]}>🔗 Copier le lien de demande</Text>
                </AnimPressable>
              </>
            )}
          </View>

          <View style={st.warning_box}>
            <Text style={st.warning_txt}>⚠️ Réseau réel principal. Les transactions sont diffusées sur la blockchain.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  MODAL: ACTIVITÉ (historique — données publiques Etherscan)
  // ════════════════════════════════════════════════════════
  const renderHistory = () => (
    <Modal visible={showHistory} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowHistory(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Activité</Text>
          <TouchableOpacity onPress={() => { setHistoryVisibleCount(HISTORY_PAGE_SIZE); fetchHistory(); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Actualiser l'historique">
            <Text style={{ color: T.text, fontSize: 18 }}>↻</Text>
          </TouchableOpacity>
        </View>

        {!!historySymbols.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.market_filter_row}>
            {['ALL', ...historySymbols].map(sym => (
              <TouchableOpacity
                key={sym}
                style={[st.chain_tab_sm, historyFilterSymbol === sym && st.chain_tab_sm_on]}
                onPress={() => { setHistoryFilterSymbol(sym); setHistoryVisibleCount(HISTORY_PAGE_SIZE); }}
              >
                <Text style={[st.chain_tab_sm_txt, historyFilterSymbol === sym && st.chain_tab_sm_txt_on]}>
                  {sym === 'ALL' ? 'Tous' : sym}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <ScrollView style={{ flex: 1, padding: 16 }}>
          {historyLoading && (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <ActivityIndicator color={T.green} size="large" />
              <Text style={{ color: T.text2, fontSize: 12, marginTop: 10 }}>Chargement depuis {activeNetwork.explorer}…</Text>
            </View>
          )}

          {!historyLoading && !!filteredHistoryItems.length && (
            <TouchableOpacity
              onPress={() => exportHistoryCsv(filteredHistoryItems)}
              style={{ alignSelf: 'flex-end', marginBottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Exporter l'historique en CSV"
            >
              <Text style={{ color: T.cyan, fontSize: 12, fontWeight: '600' }}>⇩ Exporter en CSV</Text>
            </TouchableOpacity>
          )}

          {!historyLoading && filteredHistoryItems.length === 0 && (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Text style={{ fontSize: 40, marginBottom: 10 }}>🕐</Text>
              <Text style={{ color: T.text2, fontSize: 13, textAlign: 'center' }}>
                {historyFilterSymbol === 'ALL'
                  ? `Aucune transaction pour l'instant sur ${activeNetwork.label}.`
                  : `Aucune transaction ${historyFilterSymbol} pour l'instant.`}
              </Text>
            </View>
          )}

          {!historyLoading && filteredHistoryItems.slice(0, historyVisibleCount).map((item, i) => {
            const isOut = item.direction === 'out';
            return (
              <FadeInView key={item.hash + i} deps={[item.hash]}>
                <AnimPressable
                  style={st.history_row}
                  scaleTo={0.98}
                  onPress={() => Linking.openURL(`${activeNetwork.explorer}/tx/${item.hash}`)}
                >
                  <View style={[st.history_icon, { backgroundColor: isOut ? T.redBg : T.greenBg }]}>
                    <Text style={{ fontSize: 18, color: isOut ? T.red : T.green }}>{isOut ? '↑' : '↓'}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={st.history_title}>
                      {isOut ? 'Envoyé' : 'Reçu'} {item.failed ? '(échoué)' : ''}
                    </Text>
                    <Text style={st.history_sub}>
                      {new Date(item.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' • '}{(isOut ? item.to : item.from)?.slice(0, 6)}…{(isOut ? item.to : item.from)?.slice(-4)}
                    </Text>
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation?.(); cycleTxTag(item.hash); }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={{ alignSelf: 'flex-start', marginTop: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel="Changer la catégorie de cette transaction"
                    >
                      <Text style={st.tx_tag_chip}>🏷️ {txTags[item.hash] || 'Étiqueter'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[st.history_amount, { color: item.failed ? T.text3 : (isOut ? T.red : T.green) }]}>
                    {isOut ? '-' : '+'}{parseFloat(item.amount).toFixed(5)} {item.symbol}
                  </Text>
                </AnimPressable>
              </FadeInView>
            );
          })}
          {!historyLoading && filteredHistoryItems.length > historyVisibleCount && (
            <AnimPressable style={st.load_more_btn} onPress={() => setHistoryVisibleCount(c => c + HISTORY_PAGE_SIZE)}>
              <Text style={st.load_more_txt}>Charger plus ({filteredHistoryItems.length - historyVisibleCount} restantes)</Text>
            </AnimPressable>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // ════════════════════════════════════════════════════════
  //  MODAL: MES STATS
  // ════════════════════════════════════════════════════════
  // Calculées à partir des mêmes données que l'écran Activité (dernières
  // transactions renvoyées par Etherscan pour le réseau actif) — pas un vrai
  // total "depuis toujours" toutes chaînes confondues, on le dit clairement
  // pour ne pas laisser croire à une exhaustivité qu'on n'a pas.
  const renderStats = () => {
    const items = historyItems || [];
    const sentCount = items.filter(i => i.direction === 'out').length;
    const receivedCount = items.length - sentCount;
    const totalFeesWei = items
      .filter(i => i.direction === 'out' && i.feeWei)
      .reduce((sum, i) => sum + BigInt(i.feeWei), BigInt(0));
    const totalFeesNative = ethers.utils.formatEther(totalFeesWei.toString());
    const memberSince = walletSession?.createdAt
      ? new Date(walletSession.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return (
      <Modal visible={showStats} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => setShowStats(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Mes stats</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            {!!memberSince && (
              <View style={st.stats_card}>
                <Text style={st.stats_card_lbl}>Wallet créé le</Text>
                <Text style={st.stats_card_val}>{memberSince}</Text>
              </View>
            )}

            {historyLoading ? (
              <View style={{ alignItems: 'center', marginTop: 30 }}><ActivityIndicator color={T.green} /></View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                  <View style={[st.stats_card, { flex: 1 }]}>
                    <Text style={st.stats_card_lbl}>Envoyées</Text>
                    <Text style={st.stats_card_val}>{sentCount}</Text>
                  </View>
                  <View style={[st.stats_card, { flex: 1 }]}>
                    <Text style={st.stats_card_lbl}>Reçues</Text>
                    <Text style={st.stats_card_val}>{receivedCount}</Text>
                  </View>
                </View>
                <View style={[st.stats_card, { marginTop: 12 }]}>
                  <Text style={st.stats_card_lbl}>Frais de réseau payés</Text>
                  <Text style={st.stats_card_val}>{parseFloat(totalFeesNative).toFixed(6)} {nativeSymbol}</Text>
                </View>
                <Text style={{ color: T.text3, fontSize: 11, marginTop: 16, textAlign: 'center' }}>
                  Basé sur les {items.length} dernières transactions sur {activeNetwork.label} — pas un historique complet toutes chaînes confondues.
                </Text>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  MODAL: DOCUMENT LÉGAL (CGU / Confidentialité / Mentions légales)
  // ════════════════════════════════════════════════════════
  // Déclaration `function` (pas `const ... =>`) et volontairement : elle est
  // appelée à la fois depuis la landing (avant que l'exécution du corps du
  // composant n'atteigne cette ligne) et depuis la pile de modales plus bas.
  // Une `const` n'aurait pas été hissée et aurait plané tant qu'aucun wallet
  // n'existe (ReferenceError "Cannot access before initialization" -> écran
  // noir). Une déclaration `function` est hissée entièrement, donc utilisable
  // avant sa position dans le fichier.
  function renderLegal() {
    if (!legalDoc) return null;
    const doc = LEGAL_DOCS[legalDoc];
    return (
      <Modal visible transparent animationType="slide">
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => setLegalDoc(null)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>{doc.title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: T.text3, fontSize: 12, marginBottom: 16 }}>Dernière mise à jour : {doc.updated}</Text>
            <Text style={{ color: T.text2, fontSize: 13, lineHeight: 21 }}>{doc.body}</Text>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  // ════════════════════════════════════════════════════════
  //  MODAL: ONBOARDING (3 écrans, une seule fois après création)
  // ════════════════════════════════════════════════════════
  const renderOnboarding = () => {
    if (!showOnboarding) return null;
    const slide = ONBOARDING_SLIDES[onboardingStep];
    const isLast = onboardingStep === ONBOARDING_SLIDES.length - 1;
    return (
      <Modal visible transparent animationType="fade">
        <View style={st.onboarding_overlay}>
          <View style={st.onboarding_card}>
            <Text style={st.onboarding_icon}>{slide.icon}</Text>
            <Text style={st.onboarding_title}>{slide.title}</Text>
            <Text style={st.onboarding_desc}>{slide.desc}</Text>
            <View style={st.onboarding_dots}>
              {ONBOARDING_SLIDES.map((_, i) => (
                <View key={i} style={[st.onboarding_dot, i === onboardingStep && st.onboarding_dot_on]} />
              ))}
            </View>
            <AnimPressable
              style={[st.green_btn, { marginTop: 20, width: '100%' }]}
              onPress={() => (isLast ? setShowOnboarding(false) : setOnboardingStep(s => s + 1))}
            >
              <Text style={st.green_btn_txt}>{isLast ? 'Commencer' : 'Suivant'}</Text>
            </AnimPressable>
            {!isLast && (
              <TouchableOpacity onPress={() => setShowOnboarding(false)} style={{ marginTop: 14 }}>
                <Text style={{ color: T.text3, fontSize: 13 }}>Passer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  MODAL: PARAMÈTRES
  // ════════════════════════════════════════════════════════
  const renderSettings = () => (
    <Modal visible={showSettings} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowSettings(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Paramètres</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={st.settings_section}>💱 Devise</Text>
          {Object.entries(CURRENCIES).map(([code, cur]) => (
            <TouchableOpacity key={code} style={[st.settings_row, currency === code && st.settings_row_on]} onPress={() => setCurrency(code)}>
              <Text style={{ fontSize: 22 }}>{cur.flag}</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>{code}</Text>
                <Text style={st.settings_row_sub}>{cur.name}</Text>
              </View>
              {currency === code && <Text style={{ color: T.green }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <Text style={[st.settings_section, { marginTop: 24 }]}>🌐 Réseau</Text>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('ethereum')}>
            <Text style={{ fontSize: 22 }}>⛓️</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Ethereum Mainnet</Text>
              <Text style={st.settings_row_sub}>Chain ID: 1 • Réseau réel</Text>
            </View>
            {network === 'ethereum' && <View style={[st.status_dot, { backgroundColor: T.green }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('bsc')}>
            <Text style={{ fontSize: 22 }}>🟡</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>BNB Smart Chain</Text>
              <Text style={st.settings_row_sub}>Chain ID: 56 • Mainnet</Text>
            </View>
            {network === 'bsc' && <View style={[st.status_dot, { backgroundColor: T.green }]} />}
          </TouchableOpacity>

          {!!favorites.length && (
            <>
              <Text style={[st.settings_section, { marginTop: 24 }]}>⭐ Favoris</Text>
              <AnimPressable
                style={st.settings_row}
                onPress={() => showAlert(
                  'Vider les favoris ?',
                  `Retire ${favorites.length} crypto${favorites.length > 1 ? 's' : ''} de tes favoris.`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Vider', style: 'destructive', onPress: clearAllFavorites },
                  ]
                )}
              >
                <Text style={{ fontSize: 22 }}>🗑️</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Vider mes favoris</Text>
                  <Text style={st.settings_row_sub}>{favorites.length} crypto{favorites.length > 1 ? 's' : ''} épinglée{favorites.length > 1 ? 's' : ''}</Text>
                </View>
              </AnimPressable>
            </>
          )}

          <Text style={[st.settings_section, { marginTop: 24 }]}>🧩 Tokens</Text>
          {customTokens.filter(t => t.network === network).map(t => (
            <View key={t.address} style={[st.settings_row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.settings_row_title}>{t.symbol} — {t.name}</Text>
                <Text style={st.settings_row_sub}>{parseFloat(t.balance || 0).toFixed(4)} • {t.address.slice(0, 6)}…{t.address.slice(-4)}</Text>
              </View>
              <TouchableOpacity onPress={() => removeCustomToken(t.address)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ color: T.red, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {showAddCustomToken ? (
            <View style={st.alert_form}>
              <Text style={[st.form_label, { marginBottom: 8 }]}>Adresse du contrat ({activeNetwork.label})</Text>
              <TextInput
                style={[st.form_input, { marginBottom: 10 }]}
                value={customTokenAddrInput}
                onChangeText={setCustomTokenAddrInput}
                placeholder="0x..."
                placeholderTextColor={T.text3}
                autoCapitalize="none"
              />
              <View style={{ flexDirection: 'row' }}>
                <AnimPressable
                  style={[st.green_btn, { flex: 1, opacity: customTokenLoading ? 0.7 : 1 }]}
                  disabled={customTokenLoading}
                  onPress={() => addCustomToken(customTokenAddrInput.trim())}
                >
                  {customTokenLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Ajouter</Text>}
                </AnimPressable>
              </View>
              <TouchableOpacity onPress={() => { setShowAddCustomToken(false); setCustomTokenAddrInput(''); }} style={{ marginTop: 10 }}>
                <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <AnimPressable style={st.settings_row} onPress={() => setShowAddCustomToken(true)}>
              <Text style={{ fontSize: 22 }}>➕</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>Ajouter un token personnalisé</Text>
                <Text style={st.settings_row_sub}>Par adresse de contrat — lecture seule</Text>
              </View>
            </AnimPressable>
          )}

          {!!walletSession && (
            <>
              <Text style={[st.settings_section, { marginTop: 24 }]}>🔐 Sécurité</Text>
              {!!unlockedMnemonic && (
                <AnimPressable
                  style={st.settings_row}
                  onPress={() => showAlert(
                    '⚠️ Attention',
                    'Ta phrase de récupération va s\'afficher. Assure-toi que personne ne regarde ton écran.',
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Afficher', onPress: () => { setIsFirstTimeMnemonicBackup(false); setPendingMnemonic(unlockedMnemonic); } },
                    ]
                  )}
                >
                  <Text style={{ fontSize: 22 }}>🔑</Text>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={st.settings_row_title}>Afficher ma phrase de récupération</Text>
                    <Text style={st.settings_row_sub}>À ne montrer à personne d'autre que toi</Text>
                  </View>
                </AnimPressable>
              )}
              {Platform.OS !== 'web' && biometricEnabled && (
                <AnimPressable
                  style={st.settings_row}
                  onPress={() => showAlert(
                    'Désactiver Face ID / empreinte ?',
                    'Tu devras retaper ton code PIN pour déverrouiller.',
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Désactiver', style: 'destructive', onPress: disableBiometric },
                    ]
                  )}
                >
                  <Text style={{ fontSize: 22 }}>👆</Text>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={st.settings_row_title}>Face ID / Empreinte</Text>
                    <Text style={st.settings_row_sub}>Activé — appuie pour désactiver</Text>
                  </View>
                </AnimPressable>
              )}
              <AnimPressable style={st.settings_row} onPress={handleLogout}>
                <Text style={{ fontSize: 22 }}>🚪</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[st.settings_row_title, { color: T.red }]}>Déconnexion</Text>
                  <Text style={st.settings_row_sub}>Efface le wallet de cet appareil</Text>
                </View>
              </AnimPressable>
            </>
          )}

          <Text style={[st.settings_section, { marginTop: 24 }]}>🔔 Notifications</Text>
          <AnimPressable
            style={st.settings_row}
            onPress={() => { const next = !vibrationEnabled; setVibrationEnabled(next); saveVibrationEnabled(next); }}
          >
            <Text style={{ fontSize: 22 }}>📳</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Sons et vibrations</Text>
              <Text style={st.settings_row_sub}>Alertes de prix, envois et swaps · {vibrationEnabled ? 'Activés' : 'Désactivés'}</Text>
            </View>
            <View style={[st.status_dot, { backgroundColor: vibrationEnabled ? T.green : T.text3 }]} />
          </AnimPressable>

          <View style={[st.warning_box, { marginTop: 24 }]}>
            <Text style={st.warning_txt}>
              🛡️ NexiaWallet ne te demandera JAMAIS ta phrase de récupération ou ton code PIN par email, chat ou support. Si on te la demande, c'est une arnaque.
            </Text>
          </View>

          <Text style={[st.settings_section, { marginTop: 24 }]}>📋 Info</Text>
          <View style={st.settings_row}>
            <Text style={{ fontSize: 22 }}>📱</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>NexiaWallet</Text>
              <Text style={st.settings_row_sub}>Non-custodial • CoinGecko Live • Ethereum + BSC</Text>
            </View>
          </View>
          <AnimPressable style={st.settings_row} onPress={shareApp}>
            <Text style={{ fontSize: 22 }}>📤</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Partager NexiaWallet</Text>
              <Text style={st.settings_row_sub}>Envoie le lien à quelqu'un</Text>
            </View>
          </AnimPressable>
          <AnimPressable style={st.settings_row} onPress={() => setShowStats(true)}>
            <Text style={{ fontSize: 22 }}>📊</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Mes stats</Text>
              <Text style={st.settings_row_sub}>Transactions, frais payés, ancienneté</Text>
            </View>
          </AnimPressable>
          <AnimPressable style={st.settings_row} onPress={exportUserData}>
            <Text style={{ fontSize: 22 }}>📦</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Exporter mes données</Text>
              <Text style={st.settings_row_sub}>Favoris, carnet d'adresses, alertes — copiés en JSON</Text>
            </View>
          </AnimPressable>
          {showImportData ? (
            <View style={st.alert_form}>
              <Text style={[st.form_label, { marginBottom: 8 }]}>Colle le JSON exporté depuis l'autre appareil</Text>
              <TextInput
                style={[st.form_input, { minHeight: 80 }]}
                value={importDataText}
                onChangeText={setImportDataText}
                placeholder='{"version":1,"favorites":[...]}'
                placeholderTextColor={T.text3}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <AnimPressable
                  style={[st.green_btn, { flex: 1 }]}
                  onPress={() => { if (importUserData(importDataText)) { setShowImportData(false); setImportDataText(''); } }}
                >
                  <Text style={st.green_btn_txt}>Importer</Text>
                </AnimPressable>
              </View>
              <TouchableOpacity onPress={() => { setShowImportData(false); setImportDataText(''); }} style={{ marginTop: 10 }}>
                <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <AnimPressable style={st.settings_row} onPress={() => setShowImportData(true)}>
              <Text style={{ fontSize: 22 }}>📥</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>Importer mes données</Text>
                <Text style={st.settings_row_sub}>Depuis un JSON exporté sur un autre appareil</Text>
              </View>
            </AnimPressable>
          )}
          {Object.entries(LEGAL_DOCS).map(([key, doc]) => (
            <AnimPressable key={key} style={st.settings_row} onPress={() => setLegalDoc(key)}>
              <Text style={{ fontSize: 22 }}>📄</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>{doc.title}</Text>
              </View>
              <Text style={{ color: T.text3, fontSize: 18 }}>›</Text>
            </AnimPressable>
          ))}

          {(apiError || backendError) && (
            <View style={st.error_box}>
              <Text style={{ color: T.red, fontSize: 12 }}>{apiError || backendError}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // ════════════════════════════════════════════════════════
  //  TAB: ACCUEIL
  // ════════════════════════════════════════════════════════
  const renderHome = () => (
    <ScrollView
      style={{ flex: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMarket(); }} tintColor={T.green} />
      }
    >
      <View style={st.home_hdr}>
        <View>
          <Text style={st.home_account}>Mon Wallet</Text>
          <TouchableOpacity
            onPress={() => walletAddr && copyToClipboard(walletAddr, 'Adresse copiée')}
            disabled={!walletAddr}
            accessibilityRole="button"
            accessibilityLabel="Copier l'adresse du wallet"
          >
            <Text style={st.home_addr}>{walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)} 📋` : 'Adresse en attente...'}</Text>
          </TouchableOpacity>
          <Text style={[st.home_addr, { fontSize: 12, color: T.text3, marginTop: 4 }]}>Solde {activeNetwork.label}: {parseFloat(walletBalance || '0').toFixed(6)} {nativeSymbol}</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={st.icon_btn} accessibilityRole="button" accessibilityLabel="Paramètres">
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <View style={{ position: 'relative', marginHorizontal: 14 }}>
        <BalanceGlow />
        <LinearGradient
          colors={[T.card2, T.card, T.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[st.balance_wrap, { marginHorizontal: 0 }]}
        >
          <Text style={st.balance_amount}>{fmt(totalUSD)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: todayChange >= 0 ? T.green : T.red, fontSize: 14, fontWeight: '600' }}>
              {todayChange >= 0 ? '+' : ''}{fmt(todayChange)} ({((todayChange / Math.max(totalUSD - todayChange, 1)) * 100).toFixed(2)}%)
            </Text>
            <Text style={{ color: T.text2, fontSize: 12, marginLeft: 6 }}>24h</Text>
          </View>
        </LinearGradient>
      </View>

      {portfolioHistory.length >= 2 && (
        <View style={st.sparkline_wrap}>
          <PortfolioSparkline points={portfolioHistory} />
          <Text style={st.sparkline_caption}>
            Évolution depuis le {new Date(portfolioHistory[0].t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      )}

      <View style={st.quick_actions}>
        {[
          { icon: '↑', label: 'Envoyer', bg: T.card2, onPress: () => setShowSend(true) },
          { icon: '💳', label: 'Acheter', bg: T.green, onPress: () => setShowBuy(true) },
          { icon: '+', label: 'Recevoir',bg: T.card2, onPress: () => setShowReceive(true) },
          { icon: '🕐', label: 'Activité', bg: T.card2, onPress: () => setShowHistory(true) },
          { icon: '📊',label: 'Marché', bg: T.card2, onPress: () => setTab('markets') },
        ].map(a => (
          <AnimPressable key={a.label} style={st.quick_btn} onPress={a.onPress}>
            <View style={[st.quick_icon_wrap, { backgroundColor: a.bg }]}>
              <Text style={[st.quick_icon_txt, { color: a.bg === T.green ? '#000' : T.text }]}>{a.icon}</Text>
            </View>
            <Text style={st.quick_lbl}>{a.label}</Text>
          </AnimPressable>
        ))}
      </View>

      {!!diversification && diversification.topPct >= 70 && (
        <View style={st.diversif_card}>
          <Text style={st.diversif_txt}>
            ⚖️ {diversification.topPct.toFixed(0)}% de ton portefeuille est en {diversification.topSymbol}. Diversifier réduit le risque si cette crypto chute.
          </Text>
        </View>
      )}

      {favoritesLoaded && !favorites.length && (
        <TouchableOpacity style={st.favorites_hint} onPress={() => setTab('markets')} activeOpacity={0.8}>
          <Text style={st.favorites_hint_icon}>⭐</Text>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={st.favorites_hint_title}>Épingle tes cryptos préférées</Text>
            <Text style={st.favorites_hint_desc}>Va dans Marché et appuie sur l'étoile pour les retrouver ici.</Text>
          </View>
        </TouchableOpacity>
      )}

      {!!favoriteMarketCoins.length && (
        <>
          <View style={st.section_hdr}>
            <Text style={st.section_title}>⭐ Favoris</Text>
          </View>
          <View style={isWideWeb && st.token_grid}>
            {favoriteMarketCoins.map((coin, i) => {
              const sym = coin.symbol?.toUpperCase() || '';
              const pos = (coin.price_change_percentage_24h || 0) >= 0;
              return (
                <FadeInView key={coin.id} deps={[coin.id]} style={[st.token_row, isWideWeb && st.token_row_wide, { position: 'relative' }]}>
                  <AnimPressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} scaleTo={0.98} onPress={() => setSelectedMarketCoin(coin)}>
                    <CoinLogo logo={coin.image} icon="🪙" size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.token_name}>{coin.name}</Text>
                      <Text style={st.token_price_txt}>
                        {fmt(coin.current_price, coin.current_price < 1 ? 4 : 2)}
                        <Text style={{ color: pos ? T.green : T.red, fontWeight: '600' }}>
                          {' '}{pos ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(2)}%
                        </Text>
                      </Text>
                    </View>
                  </AnimPressable>
                  <TouchableOpacity
                    style={st.market_card_fav}
                    onPress={() => toggleFavorite(sym)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 16 }}>⭐</Text>
                  </TouchableOpacity>
                </FadeInView>
              );
            })}
          </View>
        </>
      )}

      <View style={st.section_hdr}>
        <Text style={st.section_title}>Mes Tokens</Text>
      </View>

      <View style={isWideWeb && st.token_grid}>
        {Object.values(tokens).every(t => !t.price) ? (
          Object.keys(tokens).map(sym => (
            <TokenRowSkeleton key={sym} style={[isWideWeb && st.token_row_wide]} />
          ))
        ) : Object.entries(tokens).map(([sym, t], i) => {
          const val = (t.balance || 0) * (t.price || 0);
          const pos = (t.change24h || 0) >= 0;
          const isFav = favorites.includes(sym);
          return (
            <FadeInView key={sym} deps={[sym]} style={[st.token_row, isWideWeb && st.token_row_wide, { position: 'relative' }]}>
              <AnimPressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} scaleTo={0.98} onPress={() => setSelectedToken(sym)}>
                <CoinLogo logo={t.logo} icon={t.icon} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={st.token_name}>{t.name}</Text>
                    {t.readOnly && (
                      <View style={st.readonly_badge}><Text style={st.readonly_badge_txt}>Lecture seule</Text></View>
                    )}
                  </View>
                  <Text style={st.token_price_txt}>
                    {fmt(t.price, t.price < 1 ? 4 : 2)}
                    <Text style={{ color: pos ? T.green : T.red, fontWeight: '600' }}>
                      {' '}{pos ? '+' : ''}{(t.change24h || 0).toFixed(2)}%
                    </Text>
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.token_val}>{fmt(val)}</Text>
                  <Text style={st.token_bal}>{(t.balance || 0).toFixed(4)} {sym}</Text>
                </View>
              </AnimPressable>
              <TouchableOpacity
                style={st.market_card_fav}
                onPress={() => toggleFavorite(sym)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ fontSize: 16 }}>{isFav ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            </FadeInView>
          );
        })}
      </View>

      {customTokens.filter(t => t.network === network).length > 0 && (
        <>
          <View style={st.section_hdr}>
            <Text style={st.section_title}>🧩 Tokens personnalisés</Text>
          </View>
          <View style={isWideWeb && st.token_grid}>
            {customTokens.filter(t => t.network === network).map(t => (
              <View key={t.address} style={[st.token_row, isWideWeb && st.token_row_wide]}>
                <CoinLogo icon="🧩" size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={st.token_name}>{t.name}</Text>
                  <Text style={st.token_price_txt}>{t.address.slice(0, 6)}…{t.address.slice(-4)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.token_val}>{parseFloat(t.balance || 0).toFixed(4)}</Text>
                  <Text style={st.token_bal}>{t.symbol}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ height: 90 }} />
    </ScrollView>
  );

  // ════════════════════════════════════════════════════════
  //  TAB: MARCHÉ
  // ════════════════════════════════════════════════════════
  const renderMarkets = () => (
    <View style={{ flex: 1 }}>
      <View style={st.search_wrap}>
        <TextInput style={st.search_input} value={marketSearch} onChangeText={setMarketSearch}
          placeholder="🔍 Bitcoin, Ethereum…" placeholderTextColor={T.text3} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.market_filter_row}>
        <TouchableOpacity style={[st.chain_tab_sm, marketFavOnly && st.chain_tab_sm_on]} onPress={() => setMarketFavOnly(v => !v)}>
          <Text style={[st.chain_tab_sm_txt, marketFavOnly && st.chain_tab_sm_txt_on]}>
            ⭐ Favoris{favorites.length ? ` (${favorites.length})` : ''}
          </Text>
        </TouchableOpacity>
        <View style={st.market_filter_sep} />
        {[
          ['market_cap', 'Capitalisation'],
          ['gainers', '↑ Hausse'],
          ['losers', '↓ Baisse'],
          ['alpha', 'A–Z'],
        ].map(([key, label]) => (
          <TouchableOpacity key={key} style={[st.chain_tab_sm, marketSort === key && st.chain_tab_sm_on]} onPress={() => setMarketSort(key)}>
            <Text style={[st.chain_tab_sm_txt, marketSort === key && st.chain_tab_sm_txt_on]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); Promise.all([fetchMarket(), fetchNews()]).finally(() => setRefreshing(false)); }}
            tintColor={T.green}
          />
        }
      >
        {!!newsItems.length && (
          <View style={{ marginBottom: 20 }}>
            <View style={st.section_hdr}>
              <Text style={st.section_title}>📰 Actu crypto en direct</Text>
              <Text style={st.section_sub}>MAJ / 5 min</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 14, paddingRight: 4 }}>
              {newsItems.slice(0, 10).map((item, i) => (
                <AnimPressable key={i} style={st.news_card} scaleTo={0.97} onPress={() => item.link && Linking.openURL(item.link)}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={st.news_img} />
                  ) : (
                    <View style={[st.news_img, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ fontSize: 30 }}>📰</Text>
                    </View>
                  )}
                  <Text style={st.news_title} numberOfLines={2}>{item.title}</Text>
                  <Text style={st.news_date}>
                    {item.pubDate ? new Date(item.pubDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </AnimPressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={st.section_hdr}>
          <Text style={st.section_title}>💹 Tous les cours</Text>
          <Text style={st.section_sub}>{filteredCoins.length} cryptos • live</Text>
        </View>
        <View style={st.market_grid}>
          {marketCoins.length === 0 ? (
            Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={[st.market_card_slot, isWideWeb && st.market_card_slot_wide]}>
                <SkeletonBlock style={{ height: 96, borderRadius: 16 }} />
              </View>
            ))
          ) : filteredCoins.map((coin, i) => {
            const pos = (coin.price_change_percentage_24h || 0) >= 0;
            const p = coin.current_price || 0;
            const sym = coin.symbol?.toUpperCase() || '';
            const known = WALLET_TOKENS[sym];
            const isFav = favorites.includes(sym);
            return (
              <FadeInView key={coin.id} deps={[coin.id]} style={[st.market_card_slot, isWideWeb && st.market_card_slot_wide]}>
                <AnimPressable
                  style={st.market_card}
                  scaleTo={0.95}
                  onPress={() => known ? setSelectedToken(sym) : setSelectedMarketCoin(coin)}
                >
                  <TouchableOpacity
                    style={st.market_card_fav}
                    onPress={(e) => { e.stopPropagation?.(); toggleFavorite(sym); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 14 }}>{isFav ? '⭐' : '☆'}</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <CoinLogo logo={coin.image} icon="🪙" size={30} />
                    <View style={{ marginLeft: 8, flex: 1 }}>
                      <Text style={st.market_card_sym} numberOfLines={1}>{sym}</Text>
                      <Text style={st.market_card_name} numberOfLines={1}>{coin.name}</Text>
                    </View>
                  </View>
                  <Text style={st.market_card_price} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {fmt(p, p < 0.01 ? 6 : p < 1 ? 4 : 2)}
                  </Text>
                  <View style={[st.market_card_badge, { backgroundColor: pos ? T.greenBg : T.redBg }]}>
                    <Text style={{ color: pos ? T.green : T.red, fontSize: 11, fontWeight: 'bold' }}>
                      {Math.abs(coin.price_change_percentage_24h || 0) >= 10 ? '🔥 ' : (pos ? '▲ ' : '▼ ')}
                      {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
                    </Text>
                  </View>
                </AnimPressable>
              </FadeInView>
            );
          })}
        </View>
        <View style={{ height: 90 }} />
      </ScrollView>
    </View>
  );

  // ════════════════════════════════════════════════════════
  //  TAB: SWAP
  // ════════════════════════════════════════════════════════
  const renderSwap = () => {
    const ft = tokens[swapFrom];
    const tt = tokens[swapTo];
    const fprice = ft?.price || 1;
    const tprice = tt?.price || 1;
    const rate = tprice > 0 ? fprice / tprice : 0;
    return (
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        contentContainerStyle={isWideWeb ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : undefined}
      >
        <Text style={st.tab_title}>⇄ Achat / Vente live</Text>
        <View style={st.swap_card}>
          <Text style={st.swap_lbl}>Tu paies</Text>
          <TextInput style={st.swap_big_input} value={swapAmt} onChangeText={setSwapAmt}
            placeholder="0" placeholderTextColor={T.text3} keyboardType="numeric" />
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 10 }}>≈ {fmt((parseFloat(swapAmt) || 0) * fprice)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(SWAPPABLE_TOKENS[network] || []).map((sym) => {
              const t = tokens[sym];
              if (!t) return null;
              return (
                <TouchableOpacity key={sym}
                  style={[st.swap_tok_btn, swapFrom === sym && st.swap_tok_btn_on]}
                  onPress={() => setSwapFrom(sym)}
                >
                  <CoinLogo logo={t.logo} icon={t.icon} size={20} />
                  <Text style={[{ color: T.text2, fontWeight: 'bold', fontSize: 11, marginLeft: 4 }, swapFrom === sym && { color: T.text }]}>{sym}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <TouchableOpacity style={st.swap_invert_btn} onPress={() => { const tmp = swapFrom; setSwapFrom(swapTo); setSwapTo(tmp); }}>
          <Text style={{ color: T.green, fontSize: 22 }}>⇅</Text>
        </TouchableOpacity>

        <View style={st.swap_card}>
          <Text style={st.swap_lbl}>Tu reçois</Text>
          <Text style={[st.swap_big_input, { color: T.green }]}>
            {parseFloat(swapRes) > 0 ? parseFloat(swapRes).toFixed(8) : '0'}
          </Text>
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 10 }}>≈ {fmt((parseFloat(swapRes) || 0) * tprice)}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(SWAPPABLE_TOKENS[network] || []).map((sym) => {
              const t = tokens[sym];
              if (!t) return null;
              return (
                <TouchableOpacity key={sym}
                  style={[st.swap_tok_btn, swapTo === sym && st.swap_tok_btn_green]}
                  onPress={() => setSwapTo(sym)}
                >
                  <CoinLogo logo={t.logo} icon={t.icon} size={20} />
                  <Text style={[{ color: T.text2, fontWeight: 'bold', fontSize: 11, marginLeft: 4 }, swapTo === sym && { color: T.text }]}>{sym}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Text style={{ color: T.text3, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
          Swap réel via agrégateur DEX (0x) — la meilleure route est cherchée automatiquement.
        </Text>

        <AnimPressable style={[st.green_btn, { marginTop: 16 }, swapLoading && { opacity: 0.6 }]}
          disabled={swapLoading}
          onPress={handleSwapConfirm}
        >
          {swapLoading
            ? <ActivityIndicator color="#fff" />
            : <Text style={st.green_btn_txt}>Confirmer</Text>}
        </AnimPressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderBuy = () => (
    <Modal visible={showBuy} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowBuy(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Acheter des crypto</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={st.form_label}>Token ({activeNetwork.label})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            {(BUYABLE_TOKENS[network] || []).map((sym) => {
              const t = tokens[sym];
              if (!t) return null;
              return (
                <TouchableOpacity key={sym} style={[st.tok_chip, buyToken === sym && st.tok_chip_on]} onPress={() => setBuyToken(sym)}>
                  <CoinLogo logo={t.logo} icon={t.icon} size={24} />
                  <Text style={[st.tok_chip_txt, buyToken === sym && { color: T.text }]}>{sym}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={st.form_label}>Montant USD</Text>
          <TextInput style={st.form_input} value={buyAmount} onChangeText={setBuyAmount}
            placeholder="10" placeholderTextColor={T.text3} keyboardType="numeric" />

          <View style={st.send_info_box}>
            <Text style={st.send_info_line}>≈ {fmt((parseFloat(buyAmount) || 0) / (tokens[buyToken]?.price || 1))} {buyToken}</Text>
            <Text style={st.send_info_line}>Réseau: {activeNetwork.label}</Text>
            <Text style={st.send_info_line}>Paiement sécurisé par carte (MoonPay)</Text>
          </View>

          <AnimPressable style={[st.green_btn, { opacity: buyLoading ? 0.7 : 1, marginTop: 24 }]}
            onPress={handleBuyNow} disabled={buyLoading}>
            {buyLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Payer avec carte</Text>}
          </AnimPressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  // ════════════════════════════════════════════════════════
  //  RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════
  const navItems = [
    { id: 'home',     icon: '🏡', label: 'Accueil'  },
    { id: 'markets',  icon: '💹', label: 'Marché'   },
    { id: 'swap',     icon: '⇄',  label: 'Swap', big: true },
  ];

  const liveBar = (
    <View style={st.live_bar}>
      <PulseDot color={T.green} size={7} />
      <Text style={st.live_bar_txt}>Live • CoinGecko • {currency}</Text>
    </View>
  );

  // `key={tab}` force un nouveau montage à chaque changement d'onglet, donc
  // FadeInView rejoue son fondu — transition douce plutôt qu'un changement sec.
  const tabContent = (
    <FadeInView key={tab} style={{ flex: 1 }} deps={[tab]}>
      {tab === 'home'     && renderHome()}
      {tab === 'markets'  && renderMarkets()}
      {tab === 'swap'     && renderSwap()}
    </FadeInView>
  );

  return (
    <SafeAreaView style={[st.container, isWideWeb && st.container_wide]}>
      <StatusBar barStyle="light-content" backgroundColor={T.bg} />
      {isWideWeb ? (
        <View style={st.desktop_shell}>
          <View style={st.sidebar}>
            <Text style={st.sidebar_logo}>⬡ NexiaWallet</Text>
            <View style={{ marginTop: 34, gap: 4 }}>
              {navItems.map(n => (
                <AnimPressable key={n.id} style={[st.sidebar_item, tab === n.id && st.sidebar_item_on]} scaleTo={0.97} onPress={() => setTab(n.id)}>
                  <Text style={st.sidebar_icon}>{n.icon}</Text>
                  <Text style={[st.sidebar_lbl, tab === n.id && st.sidebar_lbl_on]}>{n.label}</Text>
                </AnimPressable>
              ))}
            </View>
            <AnimPressable style={[st.sidebar_item, { marginTop: 'auto' }]} scaleTo={0.97} onPress={() => setShowSettings(true)}>
              <Text style={st.sidebar_icon}>⚙️</Text>
              <Text style={st.sidebar_lbl}>Paramètres</Text>
            </AnimPressable>
          </View>
          <View style={{ flex: 1 }}>
            {liveBar}
            {tabContent}
          </View>
        </View>
      ) : (
        <>
          {liveBar}
          {tabContent}
          <View style={st.bottom_nav}>
            {navItems.map(n => (
              <AnimPressable key={n.id} style={[st.nav_item, n.big && st.nav_item_big]} scaleTo={0.92} onPress={() => setTab(n.id)}>
                {n.big ? (
                  <View style={[st.nav_big_btn, { backgroundColor: tab === n.id ? T.green : T.card2 }]}>
                    <Text style={{ fontSize: 20, color: tab === n.id ? '#000' : T.text2 }}>{n.icon}</Text>
                  </View>
                ) : (
                  <>
                    <View style={[st.nav_icon_wrap, tab === n.id && st.nav_icon_wrap_on]}>
                      <Text style={{ fontSize: 18 }}>{n.icon}</Text>
                    </View>
                    <Text style={[st.nav_lbl, tab === n.id && st.nav_lbl_on]}>{n.label}</Text>
                  </>
                )}
              </AnimPressable>
            ))}
          </View>
        </>
      )}
      {renderBuy()}
      {!!selectedToken && renderTokenDetail()}
      {!!selectedMarketCoin && renderMarketCoinDetail()}
      {renderSend()}
      {showQrScanner && renderQrScanner()}
      {renderReceive()}
      {renderHistory()}
      {renderSettings()}
      {renderStats()}
      {renderLegal()}
      {renderMnemonicBackup()}
      {renderOnboarding()}
      <ToastBanner toast={toast} />
    </SafeAreaView>
  );
}

// ════════════════════════════════════════════════════════
//  STYLES
// ════════════════════════════════════════════════════════
// Sur navigateur desktop, une largeur illimitée étire tout de façon absurde
// (boutons pleine largeur, PIN géant...) — l'app a été pensée pour un écran
// de téléphone. On plafonne donc la largeur et on centre sur le web ; aucun
// effet sur natif (Platform.OS !== 'web' → objet vide).
// `height:'100vh'` est nécessaire ici : le #root d'Expo web est en
// `flex-direction:row`, ce qui empêche le "stretch" habituel de borner la
// hauteur de cet écran — sans ça, une ScrollView à l'intérieur grandit à la
// taille de son contenu au lieu de scroller (le contenu déborde, figé).
// Pour la même raison (row, pas column), `alignSelf:'center'` centre ici
// verticalement et non horizontalement — les marges auto restent le seul
// moyen fiable de centrer horizontalement quel que soit le sens du parent.
const webFrame = Platform.OS === 'web'
  ? { maxWidth: 480, width: '100%', marginLeft: 'auto', marginRight: 'auto', height: '100vh' }
  : {};

const st = StyleSheet.create({
  container:    { flex: 1, backgroundColor: T.bg, ...webFrame },
  // Mode bureau : le shell mobile (480px) laisse place à une vraie mise en
  // page de site — sidebar fixe + contenu large, plus de bottom nav.
  container_wide: { maxWidth: 1180 },
  desktop_shell:  { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 232, borderRightWidth: 1, borderRightColor: T.border,
    paddingHorizontal: 18, paddingVertical: 28,
  },
  sidebar_logo:   { color: T.text, fontSize: 18, fontWeight: 'bold' },
  sidebar_item:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12 },
  sidebar_item_on:{ backgroundColor: T.greenBg },
  sidebar_icon:   { fontSize: 18, marginRight: 12, width: 22, textAlign: 'center' },
  sidebar_lbl:    { color: T.text2, fontSize: 14, fontWeight: '600' },
  sidebar_lbl_on: { color: T.green },
  live_bar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  live_bar_txt: { color: T.text2, fontSize: 11, marginLeft: 6 },
  live_dot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: T.green },

  pin_screen:      { flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center', ...webFrame },
  pin_logo_wrap:   { alignItems: 'center', marginBottom: 50 },
  pin_logo_circle: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.greenBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  pin_app_name:    { color: T.text, fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  pin_sub:         { color: T.text2, fontSize: 13 },
  pin_dots:        { flexDirection: 'row', marginBottom: 50 },
  pin_dot:         { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: T.border, marginHorizontal: 10 },
  pin_dot_on:      { backgroundColor: T.green, borderColor: T.green },
  pin_pad:         { width: '76%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  pin_key:         { width: '28%', height: 62, justifyContent: 'center', alignItems: 'center', marginVertical: 6, backgroundColor: T.card, borderRadius: 31, borderWidth: 1, borderColor: T.border },
  pin_key_txt:     { color: T.text, fontSize: 24, fontWeight: '500' },
  biometric_btn:     { marginTop: 24, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1, borderColor: T.border },
  biometric_btn_txt: { color: T.text2, fontSize: 13, fontWeight: '600' },
  toast_layer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 90, paddingHorizontal: 20 },
  toast_wrap: {
    width: '100%', maxWidth: 440, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  toast_txt: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  network_switch:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  network_chip:    { backgroundColor: T.card2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: T.border, marginRight: 6 },
  network_chip_on: { backgroundColor: T.blueBg, borderColor: T.blue },
  network_chip_txt:{ color: T.text2, fontSize: 11, fontWeight: '700' },
  auth_error:      { color: T.red, fontSize: 12, marginBottom: 16, textAlign: 'center', width: '84%' },
  import_card:     { width: '86%', backgroundColor: T.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: T.border, marginBottom: 20 },
  import_switch:   { flexDirection: 'row', marginBottom: 12, borderRadius: 14, backgroundColor: T.card2, borderWidth: 1, borderColor: T.border },
  import_type_btn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14 },
  import_type_btn_on: { backgroundColor: T.blueBg },
  import_type_txt:  { color: T.text2, fontSize: 12, fontWeight: '700' },
  import_input:    { backgroundColor: T.bg, color: T.text, borderRadius: 14, padding: 14, minHeight: 80, borderWidth: 1, borderColor: T.border, textAlignVertical: 'top', marginBottom: 10 },
  import_error:    { color: T.red, fontSize: 12, marginBottom: 10 },
  import_confirm_btn:{ backgroundColor: T.green, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },

  modal_bg:    { flex: 1, backgroundColor: T.bg, ...webFrame },
  // Sur grand écran, une fenêtre (Envoyer/Recevoir/Paramètres...) en pleine
  // largeur (1180px) serait absurde — on la resserre façon dialogue, centrée,
  // avec une bordure pour la détacher visuellement du fond.
  modal_bg_wide: { maxWidth: 560, marginLeft: 'auto', marginRight: 'auto', borderLeftWidth: 1, borderRightWidth: 1, borderColor: T.border },
  modal_hdr:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
  modal_title: { color: T.text, fontSize: 18, fontWeight: 'bold' },
  modal_title_lg: { color: T.text, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  modal_sub:   { color: T.text2, fontSize: 12, marginTop: 2 },

  mnemonic_grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 20 },
  mnemonic_chip: { width: '31%', flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 10, borderWidth: 1, borderColor: T.border, paddingHorizontal: 8, paddingVertical: 10, marginBottom: 10 },
  mnemonic_idx:  { color: T.text3, fontSize: 10, width: 16 },
  mnemonic_word: { color: T.text, fontSize: 13, fontWeight: '600' },
  back_btn:    { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  live_badge:  { flexDirection: 'row', alignItems: 'center', backgroundColor: T.greenBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 10 },
  live_txt:    { color: T.green, fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
  change_badge:{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  detail_price_wrap: { alignItems: 'center', paddingVertical: 20 },
  detail_price:      { color: T.text, fontSize: 36, fontWeight: 'bold' },
  detail_grid:       { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 16 },
  detail_stat:       { width: '50%', paddingVertical: 12, paddingHorizontal: 16 },
  detail_stat_lbl:   { color: T.text2, fontSize: 11, marginBottom: 4 },
  detail_stat_val:   { color: T.text, fontSize: 15, fontWeight: '600' },
  detail_actions:    { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginBottom: 24 },
  detail_action_btn: { alignItems: 'center' },
  detail_action_icon:{ width: 52, height: 52, borderRadius: 26, backgroundColor: T.greenBg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  detail_action_lbl: { color: T.text2, fontSize: 12 },

  about_box:      { marginHorizontal: 16, backgroundColor: T.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: T.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  about_title:    { color: T.text, fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
  about_text:     { color: T.text2, fontSize: 13, lineHeight: 19 },
  about_tag:      { backgroundColor: T.blueBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  about_tag_txt:  { color: T.blue, fontSize: 10, fontWeight: '600' },
  about_link_btn: { alignSelf: 'center', marginTop: 4, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 12, backgroundColor: T.card2, borderWidth: 1, borderColor: T.border },
  about_link_txt: { color: T.text, fontSize: 13, fontWeight: '600' },

  supply_wrap:  { marginTop: 14, marginBottom: 4 },
  supply_track: { height: 10, borderRadius: 8, backgroundColor: T.card2, overflow: 'hidden' },
  supply_lbl:   { color: T.text2, fontSize: 11, marginTop: 6, textAlign: 'center' },

  tf_row:    { flexDirection: 'row', backgroundColor: T.card, borderRadius: 10, padding: 3, marginBottom: 4 },
  tf_btn:    { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  tf_btn_on: { backgroundColor: T.card2 },
  tf_txt:    { color: T.text2, fontSize: 11, fontWeight: 'bold' },

  home_hdr:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  home_account:  { color: T.text, fontSize: 16, fontWeight: 'bold' },
  home_addr:     { color: T.text2, fontSize: 12, marginTop: 2 },
  icon_btn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  balance_wrap:  { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 16, marginHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: T.border },
  balance_amount:{ color: T.text, fontSize: 40, fontWeight: 'bold' },

  quick_actions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, paddingVertical: 14, marginTop: 16, marginBottom: 16 },
  quick_btn:     { alignItems: 'center', minWidth: 54 },
  quick_icon_wrap:{
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  quick_icon_txt:{ fontSize: 18, fontWeight: 'bold' },
  quick_lbl:     { color: T.text2, fontSize: 11 },

  section_hdr:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  section_title: { color: T.text, fontSize: 15, fontWeight: 'bold' },
  token_row:     {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14,
    marginHorizontal: 14, marginBottom: 10, backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3,
  },
  token_grid:     { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6 },
  skeleton_block: { backgroundColor: T.card2 },
  token_row_wide: { width: '32%', marginHorizontal: '0.66%' },
  token_name:    { color: T.text, fontSize: 14, fontWeight: '600' },
  token_price_txt:{ color: T.text2, fontSize: 12, marginTop: 2 },
  token_val:     { color: T.text, fontSize: 14, fontWeight: '600' },
  token_bal:     { color: T.text2, fontSize: 11, marginTop: 2 },
  readonly_badge:    { marginLeft: 8, backgroundColor: T.card2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  readonly_badge_txt:{ color: T.text3, fontSize: 9, fontWeight: '600' },

  search_wrap:    { margin: 14, backgroundColor: T.card, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: T.border },
  search_input:   { flex: 1, color: T.text, fontSize: 14, paddingVertical: 12 },
  section_sub:    { color: T.text3, fontSize: 11 },
  market_filter_row: { paddingHorizontal: 14, paddingBottom: 14, alignItems: 'center' },
  market_filter_sep: { width: 1, height: 20, backgroundColor: T.border, marginHorizontal: 4 },
  chain_tab_sm:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: T.border, marginRight: 8 },
  chain_tab_sm_on:   { backgroundColor: T.greenBg, borderColor: T.green },
  chain_tab_sm_txt:  { color: T.text2, fontSize: 12, fontWeight: '600' },
  chain_tab_sm_txt_on: { color: T.green },
  load_more_btn: { alignItems: 'center', paddingVertical: 14, marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  load_more_txt: { color: T.text2, fontSize: 13, fontWeight: '600' },
  alert_section:  { marginHorizontal: 16, marginBottom: 16 },
  alert_chip:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.greenBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: T.green + '44' },
  alert_chip_txt: { color: T.green, fontSize: 12, fontWeight: '600' },
  alert_form:     { backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border },
  alert_add_txt:  { color: T.blue, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 10 },

  news_card:  { width: 220, marginRight: 12, backgroundColor: T.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: T.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
  news_img:   { width: '100%', height: 100, borderRadius: 10, marginBottom: 8, backgroundColor: T.card2 },
  news_title: { color: T.text, fontSize: 13, fontWeight: '700', marginBottom: 4, minHeight: 34 },
  news_desc:  { color: T.text2, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  news_date:  { color: T.text3, fontSize: 10 },

  market_grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 14 },
  // La largeur (part de grille) vit sur le wrapper FadeInView ; `market_card`
  // ne porte que l'habillage visuel et remplit ce wrapper (stretch par défaut).
  market_card_slot:      { width: '48%', marginBottom: 12 },
  market_card_slot_wide: { width: '23.5%' },
  market_card: {
    backgroundColor: T.card, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: T.border, position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3,
  },
  market_card_fav: { position: 'absolute', top: 8, right: 8, zIndex: 1, padding: 2 },
  market_card_sym:  { color: T.text, fontSize: 13, fontWeight: '700' },
  market_card_name: { color: T.text2, fontSize: 10, marginTop: 1 },
  market_card_price:{ color: T.text, fontSize: 16, fontWeight: 'bold', marginTop: 10 },
  market_card_badge:{ alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, marginTop: 6 },

  tab_title:          { color: T.text, fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  swap_card:          { backgroundColor: T.card, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: T.border },
  swap_lbl:           { color: T.text2, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  swap_big_input:     { color: T.text, fontSize: 32, fontWeight: 'bold', marginBottom: 4 },
  swap_tok_btn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: T.border },
  swap_tok_btn_on:    { backgroundColor: T.blueBg, borderColor: T.blue },
  swap_tok_btn_green: { backgroundColor: T.greenBg, borderColor: T.green },
  swap_invert_btn:    { alignSelf: 'center', width: 44, height: 44, borderRadius: 22, backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center', marginVertical: 8, borderWidth: 1, borderColor: T.border },

  form_label:    { color: T.text2, fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  form_input:    { backgroundColor: T.card, color: T.text, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  max_btn:       { backgroundColor: T.greenBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 8, marginBottom: 16, borderWidth: 1, borderColor: T.green + '55' },
  addr_action_btn: { width: 48, height: 48, borderRadius: 12, backgroundColor: T.card2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  max_btn_txt:   { color: T.green, fontWeight: 'bold', fontSize: 13 },
  quick_pct_btn: { flex: 1, backgroundColor: T.card2, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  quick_pct_txt: { color: T.text2, fontWeight: '600', fontSize: 12 },
  amount_mode_toggle: { color: T.cyan, fontSize: 12, fontWeight: '600' },
  tx_tag_chip: { color: T.text3, fontSize: 10, backgroundColor: T.card2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  stats_card:    { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16 },
  stats_card_lbl:{ color: T.text2, fontSize: 12 },
  stats_card_val:{ color: T.text, fontSize: 20, fontWeight: 'bold', marginTop: 6 },
  gas_tier_btn:   { flex: 1, backgroundColor: T.card, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  gas_tier_btn_on:{ backgroundColor: T.greenBg, borderColor: T.green },
  gas_tier_lbl:   { color: T.text2, fontWeight: 'bold', fontSize: 13 },
  gas_tier_lbl_on:{ color: T.green },
  gas_tier_fee:   { color: T.text3, fontSize: 10, marginTop: 4 },
  tok_chip:      { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: T.border },
  tok_chip_on:   { backgroundColor: T.blueBg, borderColor: T.blue },
  tok_chip_txt:  { color: T.text2, fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  send_info_box: { backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  send_info_line:{ color: T.text2, fontSize: 12, marginBottom: 4 },
  confirm_box:      { alignItems: 'center', backgroundColor: T.card, borderRadius: 16, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: T.border },
  confirm_label:    { color: T.text2, fontSize: 12, marginBottom: 6 },
  confirm_amount:   { color: T.text, fontSize: 30, fontWeight: 'bold' },
  confirm_sub:      { color: T.text2, fontSize: 13, marginTop: 4 },
  confirm_addr_box: { backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  confirm_addr_txt: { color: T.green, fontFamily: 'monospace', fontSize: 13 },
  recent_addr_chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: T.border, gap: 8 },
  recent_addr_txt:  { color: T.text2, fontSize: 12, fontWeight: '600' },
  recent_addr_edit: { fontSize: 12, opacity: 0.7 },
  green_btn:     {
    backgroundColor: T.green, borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: T.green, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  green_btn_txt: { color: '#000', fontWeight: 'bold', fontSize: 15 },

  qr_wrap:         { backgroundColor: T.card, padding: 20, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: T.border },
  receive_title:   { color: T.text, fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  receive_addr_box:{ backgroundColor: T.card, borderRadius: 12, padding: 14, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: T.border },
  receive_addr:    { color: T.green, fontSize: 12, fontFamily: 'monospace', textAlign: 'center' },
  warning_box:     { backgroundColor: T.redBg, borderRadius: 12, padding: 14, marginTop: 20, width: '100%', borderWidth: 1, borderColor: T.red + '44' },
  warning_txt:     { color: T.text2, fontSize: 12, lineHeight: 18 },
  diversif_card:   { backgroundColor: T.orangeBg, borderRadius: 12, padding: 14, marginHorizontal: 14, marginTop: 16, borderWidth: 1, borderColor: T.orange + '44' },
  sparkline_wrap:  { marginHorizontal: 14, marginTop: 12 },
  sparkline_row:   { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 2 },
  sparkline_bar:   { flex: 1, borderRadius: 2, opacity: 0.85, minWidth: 2 },
  sparkline_caption: { color: T.text3, fontSize: 11, marginTop: 6, textAlign: 'center' },
  favorites_hint:      { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 14, padding: 16, marginHorizontal: 14, marginTop: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: T.border },
  favorites_hint_icon: { fontSize: 26 },
  favorites_hint_title:{ color: T.text, fontSize: 13, fontWeight: '700' },
  favorites_hint_desc: { color: T.text2, fontSize: 12, marginTop: 3 },
  diversif_txt:    { color: T.text2, fontSize: 12, lineHeight: 18 },

  history_row:    { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: T.border },
  history_icon:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  history_title:  { color: T.text, fontSize: 13, fontWeight: '700' },
  history_sub:    { color: T.text3, fontSize: 11, marginTop: 2 },
  history_amount: { fontSize: 13, fontWeight: '700' },

  error_box:       { backgroundColor: T.redBg, borderRadius: 12, padding: 12, marginTop: 16, borderWidth: 1, borderColor: T.red + '44' },
  network_badge:   { backgroundColor: T.orangeBg, borderRadius: 8, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: T.orange + '44' },

  settings_section:   { color: T.text2, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  settings_row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: T.border },
  settings_row_on:    { borderColor: T.green, backgroundColor: T.greenBg },
  settings_row_title: { color: T.text, fontSize: 14, fontWeight: '600' },
  settings_row_sub:   { color: T.text2, fontSize: 11, marginTop: 2 },
  status_dot:         { width: 10, height: 10, borderRadius: 5 },

  bottom_nav:  { flexDirection: 'row', height: 64, backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border, alignItems: 'center', justifyContent: 'space-around', paddingBottom: 4 },
  nav_item:    { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  nav_item_big:{ flex: 1.2 },
  nav_big_btn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6,
  },
  nav_lbl:     { color: T.text2, fontSize: 10, marginTop: 3 },
  nav_lbl_on:  { color: T.green, fontWeight: 'bold' },
  nav_icon_wrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nav_icon_wrap_on: {
    backgroundColor: T.greenBg,
    shadowColor: T.green, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 5, elevation: 3,
  },

  // ── LANDING PUBLIQUE (écran d'accueil, style "Nexia") ──
  land_screen: { flex: 1, backgroundColor: T.deepBg, ...webFrame },
  land_screen_wide: { maxWidth: 1180 },
  land_scroll_flex: { flex: 1 },
  land_scroll: { paddingBottom: 48 },

  land_hero:      { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 },
  land_hero_wide: { paddingHorizontal: 48, paddingTop: 56, paddingBottom: 24 },
  land_hero_row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 40 },
  land_hero_col_text:  { flex: 1, alignItems: 'flex-start' },
  land_hero_col_visual:{ width: 340, alignItems: 'center' },
  land_title_wide:    { textAlign: 'left', fontSize: 44, lineHeight: 52 },
  land_subtitle_wide: { textAlign: 'left', maxWidth: 440, marginLeft: 0 },
  land_eyebrow:   {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: T.stroke, backgroundColor: 'rgba(124,58,237,0.10)', marginBottom: 6,
  },
  land_eyebrow_dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.cyan },
  land_eyebrow_txt: { color: T.cyan, fontSize: 10, letterSpacing: 1.4, fontWeight: '700' },

  land_orbit_wrap:   { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  land_orbit_center: { alignItems: 'center', justifyContent: 'center' },

  land_title:      { color: T.text, fontSize: 30, fontWeight: '800', textAlign: 'center', lineHeight: 36, marginTop: 8 },
  land_title_grad: { color: T.cyan },
  land_subtitle:   { color: T.text2, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 14, maxWidth: 340 },

  land_marquee:       { borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.stroke, paddingVertical: 12, marginTop: 26, overflow: 'hidden' },
  land_marquee_track: { flexDirection: 'row' },
  land_marquee_item:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  land_marquee_icon:  { fontSize: 15 },
  land_marquee_sym:   { color: T.text, fontSize: 13, fontWeight: '700' },
  land_marquee_chg:   { fontSize: 12, fontWeight: '700' },

  land_section:         { paddingHorizontal: 20, paddingTop: 34 },
  land_section_eyebrow: { color: T.cyan, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  land_section_title:   { color: T.text, fontSize: 21, fontWeight: '700', textAlign: 'center', lineHeight: 27, marginBottom: 20 },

  land_features_grid: { gap: 14 },
  land_features_grid_wide: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 0 },
  land_feature_card_wide: { width: '31.5%' },
  land_feature_card:  {
    borderRadius: 18, padding: 18, borderWidth: 1, borderColor: T.stroke,
    backgroundColor: 'rgba(124,58,237,0.06)', overflow: 'hidden',
  },
  land_feature_glare: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    marginLeft: -110, marginTop: -110, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  land_feature_icon: {
    width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    backgroundColor: 'rgba(34,211,238,0.12)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.3)',
  },
  land_feature_title: { color: T.text, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  land_feature_desc:  { color: T.text2, fontSize: 13, lineHeight: 19 },

  land_checklist: { gap: 16 },
  land_narrow_wide: { maxWidth: 560, alignSelf: 'center', width: '100%' },
  land_security_split:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 40 },
  land_security_visual: { width: 280, alignItems: 'center' },
  land_check_row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  land_check_bullet: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 2,
    backgroundColor: 'rgba(34,211,238,0.08)', borderWidth: 1, borderColor: 'rgba(34,211,238,0.4)',
  },
  land_check_title: { color: T.text, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  land_check_desc:  { color: T.text2, fontSize: 12.5, lineHeight: 18 },

  land_stats_wrap: {
    flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 20, marginTop: 34,
    borderRadius: 20, borderWidth: 1, borderColor: T.stroke, backgroundColor: 'rgba(124,58,237,0.06)',
    paddingVertical: 22,
  },
  land_stat:     { width: '50%', alignItems: 'center', marginBottom: 14 },
  land_stat_wide:{ width: '25%', marginBottom: 0 },
  land_stat_num: { color: T.cyan, fontSize: 24, fontWeight: '800' },
  land_stat_lbl: { color: T.text2, fontSize: 11, marginTop: 4, textAlign: 'center' },

  land_steps_row_wide: { flexDirection: 'row', gap: 16 },
  land_step: {
    borderRadius: 18, borderWidth: 1, borderColor: T.stroke, padding: 20, marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  land_step_wide: { flex: 1, marginBottom: 0 },
  land_step_num:   { color: T.violet, fontSize: 28, fontWeight: '800', marginBottom: 8 },
  land_step_title: { color: T.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  land_step_desc:  { color: T.text2, fontSize: 13, lineHeight: 19 },

  land_cta: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 34 },
  land_network_switch: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 4 },
  land_cta_actions: { width: '100%', gap: 12, marginTop: 18 },
  land_cta_btn_primary: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center', backgroundColor: T.violet,
    shadowColor: T.violet, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 14, elevation: 6,
  },
  land_cta_btn_primary_txt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  land_cta_btn_ghost: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: T.stroke },
  land_cta_btn_ghost_txt: { color: T.text, fontSize: 15, fontWeight: '700' },

  onboarding_overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  onboarding_card:    { backgroundColor: T.card, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 28, width: '100%', maxWidth: 380, alignItems: 'center' },
  onboarding_icon:    { fontSize: 48, marginBottom: 16 },
  onboarding_title:   { color: T.text, fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  onboarding_desc:    { color: T.text2, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  onboarding_dots:    { flexDirection: 'row', marginTop: 20, gap: 6 },
  onboarding_dot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: T.border },
  onboarding_dot_on:  { backgroundColor: T.green, width: 18 },
  calc_card:      { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16, marginBottom: 20 },
  sim_card:       { backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 18, marginTop: 8 },
  sim_row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  sim_row_lbl:    { color: T.text2, fontSize: 13 },
  sim_row_val:    { color: T.green, fontSize: 15, fontWeight: 'bold' },
  calc_sym:       { color: T.text2, fontWeight: 'bold', fontSize: 13, marginLeft: 10 },
  calc_result:    { color: T.green, fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  compare_table:  { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginTop: 8, overflow: 'hidden' },
  compare_row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  compare_head:   { color: T.green, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  compare_label:  { color: T.text2, fontSize: 12 },
  compare_cell:   { fontSize: 12, textAlign: 'center' },
  compare_cell_us:{ color: T.green, fontWeight: '600' },
  faq_item: { backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 16, marginBottom: 10 },
  faq_q_row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faq_q_txt: { color: T.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  faq_chevron: { color: T.cyan, fontSize: 18, fontWeight: 'bold' },
  faq_a_txt: { color: T.text2, fontSize: 13, lineHeight: 20, marginTop: 10 },
  land_footer: { color: T.text3, fontSize: 11, textAlign: 'center', marginTop: 16, letterSpacing: 0.5 },
  land_footer_wrap: { marginTop: 40, alignItems: 'center' },
  land_footer_links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 18, gap: 16 },
  land_footer_link: { color: T.text2, fontSize: 12, textDecorationLine: 'underline' },
});