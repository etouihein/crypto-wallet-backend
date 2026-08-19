/**
 * Trust Wallet Clone — React Native v4.0
 * ✅ Logos CoinGecko réels
 * ✅ Web3 + Metamask
 * ✅ Transactions Ethereum Mainnet + BSC
 * ✅ Sécurité renforcée (PIN, Biométrie prêt)
 * ✅ Meilleure gestion API
 * ✅ Erreurs et fallbacks robustes
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext } from 'react';
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
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as localWallet from './lib/wallet';
import * as walletConnect from './lib/walletconnect';
import { buildInjectedProvider } from './lib/dappBrowserProvider';
import { simulateTransaction, decodeKnownCall } from './lib/txSimulation';
import * as approvals from './lib/approvals';
import { looksLikePoisonedAddress } from './lib/addressSafety';
import * as recurringBuy from './lib/recurringBuy';
import * as bridge from './lib/bridge';
import * as defiPositions from './lib/defiPositions';
import * as Notifications from 'expo-notifications';
import { translate as i18nTranslate, SUPPORTED_LOCALES } from './lib/i18n';
import { ethers } from 'ethers';
import { pbkdf2 } from '@ethersproject/pbkdf2';
// react-native-webview n'a pas d'implémentation web (pas de fichier .web.*
// dans le paquet) — l'importer statiquement ferait planter le bundle web au
// rendu. Chargé dynamiquement, natif uniquement (voir renderDappBrowser).
const WebView = Platform.OS === 'web' ? null : require('react-native-webview').WebView;

const { width } = Dimensions.get('window');

// ═══════════════════════════════════════════════════════════
//  COULEURS & THÈME
// ═══════════════════════════════════════════════════════════
// Refonte graphique "banque privée" (voir nexiawallet-redesign fourni par
// Pablo) : encre profonde, un seul accent champagne, variations de prix
// désaturées distinctes de l'accent de marque (avant : le même vert servait
// aux deux, ce qui empêchait d'avoir un accent de marque différent du vert
// "hausse" conventionnel). `gold` remplace l'ancien rôle de `green` pour
// tout ce qui est bouton/onglet actif/coche — `up`/`down` sont réservés aux
// variations de prix et au sens des transactions (reçu/envoyé).
const DARK_THEME = {
  bg:      '#0a0d13',
  card:    '#0f131b',
  card2:   '#151b26',
  border:  '#232b3a',
  borderSoft: '#1a2130',
  gold:    '#cdb37e',
  goldBg:  'rgba(205, 179, 126, 0.12)',
  goldLine:'rgba(205, 179, 126, 0.35)',
  up:      '#7fb69a',
  upBg:    'rgba(127, 182, 154, 0.12)',
  down:    '#c98a8a',
  
  downBg:  'rgba(201, 138, 138, 0.12)',
  red:     '#c9605f',
  redBg:   'rgba(201, 96, 95, 0.12)',
  blue:    '#5E8CFF',
  blueBg:  '#071430',
  orange:  '#FFAD5A',
  orangeBg:'#312511',
  text:    '#e9ecf2',
  text2:   '#9aa3b5',
  text3:   '#626c80',

  yellow:  '#FFD166',
  purple:  '#8B5CF6',
  // Palette "Nexia" — utilisée uniquement pour la landing page publique
  // (écran d'accueil avant création/import de wallet). Volontairement fixe
  // dans les deux thèmes : effet vitrine dramatique assumé, indépendant du
  // thème clair/sombre choisi pour le reste de l'app.
  deepBg:  '#05030e',
  violet:  '#7c3aed',
  cyan:    '#22d3ee',
  magenta: '#e879f9',
  stroke:  'rgba(139,135,168,0.18)',

  fontDisplay: Platform.select({ web: '"Instrument Serif", Georgia, serif' }),
  fontBody:    Platform.select({ web: '"Manrope", -apple-system, "Segoe UI", sans-serif' }),
  fontMono:    Platform.select({ web: '"IBM Plex Mono", "SF Mono", Consolas, monospace', default: 'monospace' }),
};

// Thème clair "banque privée" : même accent champagne (assombri pour rester
// lisible sur fond clair) et mêmes rôles sémantiques (up/down/red/blue/
// orange assombris pour le contraste), fond papier chaud plutôt que blanc pur.
const LIGHT_THEME = {
  bg:      '#f7f5f0',
  card:    '#ffffff',
  card2:   '#f1efe7',
  border:  '#e3ddd0',
  borderSoft: '#ece7db',
  gold:    '#9c7b3f',
  goldBg:  'rgba(156, 123, 63, 0.10)',
  goldLine:'rgba(156, 123, 63, 0.35)',
  up:      '#4d8f6e',
  upBg:    'rgba(77, 143, 110, 0.12)',
  down:    '#b5605f',
  downBg:  'rgba(181, 96, 95, 0.12)',
  red:     '#b23b3a',
  redBg:   'rgba(178, 59, 58, 0.10)',
  blue:    '#3b6fe0',
  blueBg:  '#eaf1ff',
  orange:  '#c9791f',
  orangeBg:'#fdf1e2',
  text:    '#1c2129',
  text2:   '#5b6472',
  text3:   '#8b93a1',

  yellow:  '#b8860b',
  purple:  '#6d3fd1',
  // Palette "Nexia" (landing) — identique au thème sombre, voir commentaire
  // au-dessus de DARK_THEME.
  deepBg:  '#05030e',
  violet:  '#7c3aed',
  cyan:    '#22d3ee',
  magenta: '#e879f9',
  stroke:  'rgba(139,135,168,0.18)',

  fontDisplay: Platform.select({ web: '"Instrument Serif", Georgia, serif' }),
  fontBody:    Platform.select({ web: '"Manrope", -apple-system, "Segoe UI", sans-serif' }),
  fontMono:    Platform.select({ web: '"IBM Plex Mono", "SF Mono", Consolas, monospace', default: 'monospace' }),
};

// Contexte thème : fournit { T, st, cs } déjà résolus pour le thème actif à
// tout composant de ce fichier, y compris ceux déclarés hors du composant
// App (CandlestickChart, ToastBanner, etc.) qui n'ont pas accès à l'état
// React local de App. `st`/`cs` (StyleSheet.create) sont recalculés une
// seule fois par changement de thème (useMemo côté App), pas à chaque rendu.
const ThemeContext = createContext({ T: DARK_THEME, st: null, cs: null });
const useTheme = () => useContext(ThemeContext);

// ═══════════════════════════════════════════════════════════
//  DEVISES & CRYPTO
// ═══════════════════════════════════════════════════════════
// Taux fixes (non rafraîchis en direct), comme le reste de cette liste —
// une imprécision de quelques % est acceptable pour un affichage indicatif,
// mais ne pas s'y fier pour un calcul exact (à rafraîchir à la main de temps
// en temps, ou brancher sur une vraie API de taux de change plus tard).
const LOCALE_DISPLAY = {
  fr: { flag: '🇫🇷', name: 'Français' },
  en: { flag: '🇬🇧', name: 'English' },
  es: { flag: '🇪🇸', name: 'Español' },
  de: { flag: '🇩🇪', name: 'Deutsch' },
  pt: { flag: '🇵🇹', name: 'Português' },
};

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
NexiaWallet est une application de portefeuille crypto non-custodial : elle permet de générer, importer et utiliser un portefeuille Ethereum/BNB Smart Chain sans que NexiaWallet ne détienne ou ne contrôle jamais les fonds de l'utilisateur (voir §2 pour le détail du traitement de la clé privée).

2. Nature non-custodiale
NexiaWallet ne détient et ne contrôle jamais les fonds de l'utilisateur, et ne conserve jamais durablement sa clé privée ou sa phrase de récupération : elles ne sont jamais écrites sur disque ni en base de données. Pour permettre la création, l'import et la signature des transactions, la clé privée transite par le serveur applicatif et y reste en mémoire pendant la durée de la session (expiration automatique sous 24h d'inactivité) — voir la Politique de Confidentialité pour le détail. En conséquence, NexiaWallet ne peut techniquement ni récupérer ni réinitialiser un accès perdu.

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
Le code PIN (chiffré), les favoris, le carnet d'adresses récentes et les alertes de prix sont stockés localement (stockage sécurisé du système ou stockage du navigateur). Rien de tout cela n'est envoyé à un serveur NexiaWallet.

3. Ce qui transite par le serveur
Lors de la création, de l'import ou de l'envoi d'une transaction, la clé privée transite par le serveur applicatif (protégé par HTTPS) et y est conservée en mémoire vive uniquement — jamais sur disque ni en base de données — associée à un jeton de session propre à chaque wallet, avec expiration automatique après 24h d'inactivité. Le serveur reçoit aussi les données publiques de blockchain nécessaires au fonctionnement : adresse publique (pour consulter un solde ou un historique), transaction déjà signée (pour la relayer au réseau). Ces dernières sont publiques par nature sur une blockchain.

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
NexiaWallet est édité par [NOM PRÉNOM À COMPLÉTER], entrepreneur individuel (micro-entreprise), SIRET [À COMPLÉTER], [ADRESSE À COMPLÉTER].
Directeur de la publication : [NOM PRÉNOM À COMPLÉTER].

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
  { icon: '🔐', title: 'Tes clés, tes cryptos', desc: "Ta phrase de récupération est la seule clé de tes fonds. NexiaWallet ne détient jamais tes cryptos et ne peut ni la récupérer ni la réinitialiser si tu la perds." },
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
    a: "NexiaWallet ne détient et ne contrôle jamais tes fonds, contrairement à un exchange (Binance, Coinbase...) qui les garde pour toi. Ta clé privée n'est jamais stockée durablement par NexiaWallet — pas sur disque, pas en base de données.",
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
// ETH/BNB/MATIC/USDT/USDC (adresse EVM, MATIC via le réseau Polygon dans le
// sélecteur réseau), SOL (adresse Solana dérivée de la même mnémonique —
// voir getSolanaAddress dans lib/wallet.js) et BTC (adresse Bitcoin BIP84,
// voir getBitcoinAddress) sont entièrement actifs : solde réel, envoi,
// réception, achat. ADA est affiché pour la vue d'ensemble (prix réel, style
// Trust Wallet) mais n'est pas envoyable depuis ce wallet ("Token non
// supporté" à l'envoi/achat).
const WALLET_TOKENS = {
  ETH:  { name: 'Ethereum', cgId: 'ethereum',      balance: 0,   icon: '🔷', color: '#5B8DEF', logo: COIN_LOGOS.ethereum },
  BTC:  { name: 'Bitcoin',  cgId: 'bitcoin',       balance: 0,   icon: '🟠', color: '#F7931A', logo: COIN_LOGOS.bitcoin },
  BNB:  { name: 'BNB',      cgId: 'binancecoin',   balance: 0,   icon: '🟡', color: '#F3BA2F', logo: COIN_LOGOS.binancecoin },
  SOL:  { name: 'Solana',   cgId: 'solana',        balance: 0,   icon: '🟣', color: '#9945FF', logo: COIN_LOGOS.solana },
  USDT: { name: 'Tether',   cgId: 'tether',        balance: 0,   icon: '💚', color: '#26A17B', logo: COIN_LOGOS.tether },
  USDC: { name: 'USD Coin', cgId: 'usd-coin',      balance: 0,   icon: '🟦', color: '#2775CA', logo: COIN_LOGOS['usd-coin'] },
  ADA:  { name: 'Cardano',  cgId: 'cardano',       balance: 0,   icon: '🔵', color: '#0033AD', logo: COIN_LOGOS.cardano, readOnly: true },
  MATIC:{ name: 'Polygon',  cgId: 'matic-network', balance: 0,   icon: '🟪', color: '#8247E5', logo: COIN_LOGOS['matic-network'] },
};

// Le wallet a une adresse EVM (0x...) et une adresse Solana (dérivée de la
// même mnémonique) : on ne propose l'achat MoonPay que pour les tokens qui
// peuvent réellement arriver sur l'une des deux.
const BUYABLE_TOKENS = {
  ethereum: ['ETH', 'USDT', 'USDC'],
  bsc: ['BNB', 'USDT', 'USDC'],
  polygon: ['MATIC'],
  solana: ['SOL'],
  bitcoin: ['BTC'],
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

// Ne JAMAIS charger une image de métadonnées NFT directement (voir
// GET /wallet/nft/image-proxy côté backend) : un NFT peut être envoyé à
// n'importe quelle adresse sans consentement (spam/phishing "airdrop NFT"),
// avec un champ `image` pointant vers un serveur contrôlé par l'attaquant —
// le charger directement révélerait l'IP de l'utilisateur (et le moment où
// il ouvre sa galerie) à cet attaquant, reliant son wallet à son IP.
const nftImageProxyUrl = (url) => (url ? `${API_BASE}/nft/image-proxy?url=${encodeURIComponent(url)}` : null);
const WALLET_STORAGE_KEY = 'wallet-pro-session-v1';
// Comptes multiples : la session "active" ci-dessus reste la source de vérité
// pour tout le code d'unlock/PIN existant (inchangé) ; ces deux clés
// n'ajoutent qu'une couche par-dessus (liste des comptes + id actif). Un
// appareil avec un seul wallet (ancien format) est migré vers un tableau à
// une entrée ("Compte 1") la première fois que initWallet() tourne — voir
// plus bas — sans jamais recréer ni perdre le wallet existant.
const WALLET_ACCOUNTS_KEY = 'wallet-pro-accounts-v1';
const ACTIVE_ACCOUNT_ID_KEY = 'wallet-pro-active-account-v1';

const genAccountId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const loadAccountsList = async () => {
  try {
    const raw = Platform.OS === 'web'
      ? await AsyncStorage.getItem(WALLET_ACCOUNTS_KEY)
      : await SecureStore.getItemAsync(WALLET_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('loadAccountsList failed', error);
    return [];
  }
};

const saveAccountsList = async (list) => {
  try {
    const serialized = JSON.stringify(list);
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(WALLET_ACCOUNTS_KEY, serialized);
    } else {
      await SecureStore.setItemAsync(WALLET_ACCOUNTS_KEY, serialized);
    }
  } catch (error) {
    console.warn('saveAccountsList failed', error);
  }
};

const clearAccountsList = async () => {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(WALLET_ACCOUNTS_KEY);
    } else {
      await SecureStore.deleteItemAsync(WALLET_ACCOUNTS_KEY);
    }
  } catch (error) {
    console.warn('clearAccountsList failed', error);
  }
};

const loadActiveAccountId = async () => {
  try {
    return Platform.OS === 'web'
      ? await AsyncStorage.getItem(ACTIVE_ACCOUNT_ID_KEY)
      : await SecureStore.getItemAsync(ACTIVE_ACCOUNT_ID_KEY);
  } catch (error) {
    console.warn('loadActiveAccountId failed', error);
    return null;
  }
};

const saveActiveAccountId = async (id) => {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(ACTIVE_ACCOUNT_ID_KEY, id);
    } else {
      await SecureStore.setItemAsync(ACTIVE_ACCOUNT_ID_KEY, id);
    }
  } catch (error) {
    console.warn('saveActiveAccountId failed', error);
  }
};

const clearActiveAccountId = async () => {
  try {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(ACTIVE_ACCOUNT_ID_KEY);
    } else {
      await SecureStore.deleteItemAsync(ACTIVE_ACCOUNT_ID_KEY);
    }
  } catch (error) {
    console.warn('clearActiveAccountId failed', error);
  }
};

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

// PIN de détresse ("duress PIN") : un second code, distinct du vrai, qui
// affiche un wallet à solde nul au lieu du vrai — utile si quelqu'un force
// l'utilisateur à déverrouiller son wallet sous contrainte. Ce code ne sert
// jamais à déchiffrer quoi que ce soit (contrairement au vrai PIN, qui
// déchiffre le keystore), donc pas besoin d'en faire une clé de chiffrement
// — juste vérifier qu'il correspond, puis ne RIEN déchiffrer.
//
// Stocké comme un sel aléatoire + un hash dérivé par PBKDF2 (100 000
// itérations), PAS un simple keccak256 non salé : sur un espace de
// seulement 1 000 000 de codes à 6 chiffres, un hash rapide se retrouve
// entièrement par force brute en une fraction de seconde si jamais le
// stockage de l'appareil est extrait (backup, malware, accès root) — un
// attaquant pourrait alors connaître le code de détresse À L'AVANCE et
// repérer qu'il est faux au moment où on le tape sous la contrainte,
// ruinant tout l'intérêt de la fonctionnalité. PBKDF2 rend ce calcul assez
// coûteux pour que ça ne soit plus praticable sur tout l'espace des codes.
const DURESS_PIN_HASH_KEY = 'wallet-pro-duress-pin-hash-v1';
const DURESS_PBKDF2_ITERATIONS = 100000;

const hashDuressPin = (pin, saltHex) => pbkdf2(
  ethers.utils.toUtf8Bytes(`nexia-duress-v1:${pin}`),
  saltHex,
  DURESS_PBKDF2_ITERATIONS,
  32,
  'sha256'
);

const loadDuressPinRecord = async () => {
  try {
    const raw = await AsyncStorage.getItem(DURESS_PIN_HASH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const saveDuressPin = async (pin) => {
  try {
    const salt = ethers.utils.hexlify(ethers.utils.randomBytes(16));
    const hash = hashDuressPin(pin, salt);
    await AsyncStorage.setItem(DURESS_PIN_HASH_KEY, JSON.stringify({ salt, hash }));
  } catch { /* rien à faire */ }
};

const clearDuressPin = async () => {
  try { await AsyncStorage.removeItem(DURESS_PIN_HASH_KEY); } catch { /* rien à faire */ }
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

// "Masquer les soldes à zéro" sur l'accueil — préférence d'affichage pure,
// ne cache rien ailleurs (Envoyer/Swap/Acheter listent toujours tout).
const HIDE_ZERO_BALANCES_KEY = 'wallet-pro-hide-zero-balances-v1';

const loadHideZeroBalances = async () => {
  try { return (await AsyncStorage.getItem(HIDE_ZERO_BALANCES_KEY)) === 'true'; } catch { return false; }
};

const saveHideZeroBalances = async (enabled) => {
  try { await AsyncStorage.setItem(HIDE_ZERO_BALANCES_KEY, String(enabled)); } catch { /* rien à faire */ }
};

// Parrainage : code de qui a invité cet appareil, capté une seule fois (à la
// toute première installation) depuis le lien ?ref=XXXXXXXX partagé — voir
// shareReferralLink. Purement informatif tant qu'aucun système de récompense
// n'existe côté backend ; stocké pour être prêt le jour où il en existera un.
const REFERRED_BY_KEY = 'wallet-pro-referred-by-v1';

const saveReferredBy = async (code) => {
  try {
    const existing = await AsyncStorage.getItem(REFERRED_BY_KEY);
    if (existing) return; // ne jamais écraser la toute première attribution
    await AsyncStorage.setItem(REFERRED_BY_KEY, code);
  } catch { /* rien à faire */ }
};

const loadReferredBy = async () => {
  try { return await AsyncStorage.getItem(REFERRED_BY_KEY); } catch { return null; }
};

// Mode hors-ligne : dernier solde connu mis en cache par adresse, affiché
// immédiatement au démarrage (avant même la première requête RPC) et
// réutilisé si le réseau tombe — toujours étiqueté comme "dernières données
// connues", jamais présenté comme un solde à jour en temps réel.
const PORTFOLIO_CACHE_KEY = 'wallet-pro-portfolio-cache-v1';

const savePortfolioCache = async (address, network, snapshot) => {
  if (!address) return;
  try {
    const raw = await AsyncStorage.getItem(PORTFOLIO_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[`${address.toLowerCase()}:${network}`] = { ...snapshot, cachedAt: Date.now() };
    await AsyncStorage.setItem(PORTFOLIO_CACHE_KEY, JSON.stringify(all));
  } catch { /* rien à faire */ }
};

const loadPortfolioCache = async (address, network) => {
  if (!address) return null;
  try {
    const raw = await AsyncStorage.getItem(PORTFOLIO_CACHE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[`${address.toLowerCase()}:${network}`] || null;
  } catch { return null; }
};

// Langue de l'interface (fr/en) — voir lib/i18n.js. Français par défaut
// (langue d'origine de l'app), persistée dès que l'utilisateur en choisit
// une autre dans Paramètres.
const LOCALE_KEY = 'wallet-pro-locale-v1';

const loadLocale = async () => {
  try {
    const raw = await AsyncStorage.getItem(LOCALE_KEY);
    return SUPPORTED_LOCALES.includes(raw) ? raw : 'fr';
  } catch { return 'fr'; }
};

const saveLocale = async (locale) => {
  try { await AsyncStorage.setItem(LOCALE_KEY, locale); } catch { /* rien à faire */ }
};

// Thème clair/sombre — voir DARK_THEME/LIGHT_THEME tout en haut du fichier.
// Sombre par défaut (thème d'origine de l'app), persisté dès que
// l'utilisateur en choisit un autre dans Paramètres.
const THEME_KEY = 'wallet-pro-theme-v1';

const loadTheme = async () => {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    return raw === 'light' ? 'light' : 'dark';
  } catch { return 'dark'; }
};

const saveTheme = async (mode) => {
  try { await AsyncStorage.setItem(THEME_KEY, mode); } catch { /* rien à faire */ }
};

// Comptes de stake Solana connus de cet appareil, par adresse de wallet (EVM,
// sert d'identifiant de "compte" partout ailleurs dans l'app — voir comptes
// multiples) : { [walletAddr]: [{ stakePubkey, createdAt }] }. Le réseau reste
// la source de vérité pour le SOLDE/STATUT de chaque compte (voir
// getSolanaStakeAccountsInfo dans lib/wallet.js) — ce qu'on stocke ici, c'est
// juste la LISTE des pubkeys à interroger, pour éviter un scan réseau coûteux
// (getProgramAccounts, peu fiable sur les RPC publics/gratuits).
const STAKE_REFS_KEY = 'wallet-pro-stake-refs-v1';

const loadStakeRefs = async (walletAddr) => {
  try {
    const raw = await AsyncStorage.getItem(STAKE_REFS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all[walletAddr] || [];
  } catch { return []; }
};

const saveStakeRefs = async (walletAddr, refs) => {
  try {
    const raw = await AsyncStorage.getItem(STAKE_REFS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[walletAddr] = refs;
    await AsyncStorage.setItem(STAKE_REFS_KEY, JSON.stringify(all));
  } catch { /* rien à faire */ }
};

// Période affichée sous le solde total de l'accueil (24h / 7j / 30j).
const BALANCE_PERIOD_KEY = 'wallet-pro-balance-period-v1';

const loadBalancePeriod = async () => {
  try {
    const raw = await AsyncStorage.getItem(BALANCE_PERIOD_KEY);
    return ['24h', '7d', '30d'].includes(raw) ? raw : '24h';
  } catch { return '24h'; }
};

const saveBalancePeriod = async (period) => {
  try { await AsyncStorage.setItem(BALANCE_PERIOD_KEY, period); } catch { /* rien à faire */ }
};

// Dernier envoi réussi — pour le raccourci "Répéter le dernier envoi" sur
// l'accueil. Rien de sensible : adresse publique, symbole, montant, réseau.
const LAST_SEND_KEY = 'wallet-pro-last-send-v1';

const loadLastSend = async () => {
  try {
    const raw = await AsyncStorage.getItem(LAST_SEND_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const saveLastSend = async (record) => {
  try { await AsyncStorage.setItem(LAST_SEND_KEY, JSON.stringify(record)); } catch { /* rien à faire */ }
};

// Compteur d'utilisation par token (nombre d'envois réussis) -- sert à trier
// "Mes Tokens" en mettant les plus utilisés en premier, plutôt qu'un ordre
// fixe arbitraire ou un vrai drag & drop (pas de lib de glisser-déposer
// installée, disproportionné pour ce seul besoin).
const TOKEN_USAGE_KEY = 'wallet-pro-token-usage-v1';

const loadTokenUsage = async () => {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_USAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
};

const saveTokenUsage = async (map) => {
  try { await AsyncStorage.setItem(TOKEN_USAGE_KEY, JSON.stringify(map)); } catch { /* rien à faire */ }
};

// Actions rapides masquées sur l'accueil (ids parmi QUICK_ACTION_IDS) --
// permet de cacher celles qu'on n'utilise jamais plutôt qu'un vrai
// glisser-déposer pour réordonner.
const HIDDEN_QUICK_ACTIONS_KEY = 'wallet-pro-hidden-quick-actions-v1';

const loadHiddenQuickActions = async () => {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_QUICK_ACTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const saveHiddenQuickActions = async (list) => {
  try { await AsyncStorage.setItem(HIDDEN_QUICK_ACTIONS_KEY, JSON.stringify(list)); } catch { /* rien à faire */ }
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

// Adresses "en observation" (watch-only) : une adresse EVM quelconque (celle
// de quelqu'un d'autre, ou la sienne sur un exchange) qu'on veut juste
// pouvoir consulter — solde public via RPC, AUCUNE clé associée. Liste
// totalement indépendante de WALLET_ACCOUNTS_KEY : jamais sélectionnable
// comme compte actif, jamais de PIN demandé, jamais d'accès à
// unlockedPrivateKey/unlockedMnemonic. Stockage en AsyncStorage simple (comme
// les tokens personnalisés) puisqu'aucun secret n'y transite — seulement des
// adresses publiques.
const WATCH_ADDRESSES_KEY = 'wallet-pro-watch-addresses-v1';

const loadWatchAddresses = async () => {
  try {
    const raw = await AsyncStorage.getItem(WATCH_ADDRESSES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const saveWatchAddresses = async (list) => {
  try { await AsyncStorage.setItem(WATCH_ADDRESSES_KEY, JSON.stringify(list)); } catch { /* rien à faire */ }
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
  const { T } = useTheme();
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
  const { T } = useTheme();
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
  const { T, cs } = useTheme();
  if (!candles || candles.length === 0) {
    return (
      <View style={cs.area}>
        <ActivityIndicator color={T.gold} style={{ marginTop: 60 }} />
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
          const color = bull ? T.up : T.down;
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

// `T` en paramètre (et non la constante du même nom) : ombrage volontaire
// pour que ce StyleSheet se reconstruise avec les couleurs du thème actif
// (voir ThemeContext / useMemo côté App) au lieu de figer le thème sombre.
function buildCs(T) {
  return StyleSheet.create({
    area:        { height: 190, width: '100%', marginVertical: 14, position: 'relative', overflow: 'hidden' },
    grid:        { position: 'absolute', left: 44, right: 0, height: 1, backgroundColor: T.border, zIndex: 0 },
    price_label: { position: 'absolute', left: 0, width: 42, textAlign: 'right', color: T.text3, fontSize: 9, zIndex: 1, transform: [{ translateY: -5 }] },
    candles_row: { position: 'absolute', top: 0, bottom: 0, left: 46, right: 4, flexDirection: 'row', alignItems: 'stretch', zIndex: 2 },
    candle_slot: { flex: 1, height: '100%', paddingHorizontal: 2 },
    candle_frame:{ position: 'absolute', top: 0, bottom: 0, left: 2, right: 2, alignItems: 'center' },
    wick:        { width: 1.5, position: 'absolute', zIndex: 1 },
    body:        { width: '100%', position: 'absolute', zIndex: 2, borderRadius: 1.5, minHeight: 2 },
  });
}

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
  const { T } = useTheme();
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

function AnimPressable({ style, onPress, disabled, children, scaleTo = 0.95, ...rest }) {
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
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}

// ═══════════════════════════════════════════════════════════
//  LOGO ANIMÉ (halo qui pulse + badge qui respire) — écran d'accueil
// ═══════════════════════════════════════════════════════════
function AnimatedLogo({ size = 92, icon = '🛡️' }) {
  const { T } = useTheme();
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
  const { st } = useTheme();
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
  const { st } = useTheme();
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
  const { T, st } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [toast, anim]);
  if (!toast) return null;
  const bg = toast.type === 'success' ? T.goldBg : toast.type === 'error' ? T.redBg : T.card2;
  const fg = toast.type === 'success' ? T.gold : toast.type === 'error' ? T.red : T.text;
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
function PulseDot({ color, size = 7 }) {
  const { T } = useTheme();
  const dotColor = color ?? T.gold;
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
        backgroundColor: dotColor, opacity, transform: [{ scale }],
      }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dotColor }} />
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
  const { T, st } = useTheme();
  if (points.length < 2) return null;
  const values = points.map(p => p.v);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const range = hi - lo || hi * 0.01 || 1;
  const trendUp = values[values.length - 1] >= values[0];
  const color = trendUp ? T.up : T.down;
  return (
    <View style={st.sparkline_row}>
      {points.map((p, i) => (
        <View key={p.t ?? i} style={[st.sparkline_bar, { height: `${Math.max(((p.v - lo) / range) * 100, 6)}%`, backgroundColor: color }]} />
      ))}
    </View>
  );
}

// En-tête de section standardisé (trait vert + majuscules espacées) au lieu
// d'un emoji collé au texte — remplace l'ancien `<Text style={st.section_title}>
// EMOJI Label</Text>` partout où c'était utilisé. Reste le premier enfant
// d'un `st.section_hdr` (flexDirection row, justifyContent space-between),
// donc un éventuel texte "sub" à droite continue de fonctionner sans y toucher.
function SectionTitle({ children }) {
  const { st } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={st.section_tick} />
      <Text style={st.section_title}>{children}</Text>
    </View>
  );
}

// Pastille de variation de prix — remplace le texte coloré brut collé au
// prix par un vrai badge, réutilisé partout où un %24h de token s'affiche.
function ChangePill({ value }) {
  const { T, st } = useTheme();
  const pos = (value || 0) >= 0;
  return (
    <View style={[st.change_pill, { backgroundColor: pos ? T.upBg : T.downBg }]}>
      <Text style={[st.change_pill_txt, { color: pos ? T.up : T.down }]} numberOfLines={1}>
        {pos ? '+' : ''}{(value || 0).toFixed(2)}%
      </Text>
    </View>
  );
}

function BalanceGlow() {
  const { T } = useTheme();
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
        borderRadius: 22, backgroundColor: T.gold, opacity, transform: [{ scale }],
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
  const { T } = useTheme();
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
  const { T, st } = useTheme();
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
            colors={[color, T.gold]}
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
  const { st } = useTheme();
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
  const { T, st } = useTheme();
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
              <Text style={[st.land_marquee_chg, { color: up ? T.up : T.down }]}>
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
  const { st } = useTheme();
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
  const { st } = useTheme();
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
  const { T } = useTheme();
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
// Composant interne : contient tout l'état/logique de l'app. Séparé de l'App
// par défaut ci-dessous car cette dernière a plusieurs `return` précoces
// (PIN, landing publique, app principale...) — un <ThemeContext.Provider>
// posé seulement autour du DERNIER return ne couvrirait pas les autres.
// En l'englobant depuis l'extérieur (App -> Provider -> AppContent), tous
// les early returns d'AppContent héritent du Provider, quel que soit celui
// qui s'exécute. `themeMode`/`changeTheme` restent au niveau App (state),
// `T`/`st`/`cs` sont lus ici via useTheme() comme n'importe quel composant.
function AppContent({ themeMode, changeTheme }) {
  const { T, st, cs } = useTheme();
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
  const [isDuressMode, setIsDuressMode] = useState(false); // voir hashDuressPin — wallet à solde nul, jamais la vraie clé
  const [duressPinConfigured, setDuressPinConfigured] = useState(false);
  const [showDuressSetup, setShowDuressSetup] = useState(false);
  const [duressSetupInput, setDuressSetupInput] = useState('');
  const [duressSetupError, setDuressSetupError] = useState(null);
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
  const [showImportData, setShowImportData] = useState(false);
  const [importDataText, setImportDataText] = useState('');
  const [historyItems, setHistoryItems]   = useState(null); // null = pas encore chargé, [] = chargé et vide
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilterSymbol, setHistoryFilterSymbol] = useState('ALL');
  const HISTORY_PAGE_SIZE = 15;
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [showSettings, setShowSettings]   = useState(false);
  const [legalDoc, setLegalDoc]           = useState(null); // 'cgu' | 'privacy' | 'mentions' | null
  // true seulement quand renderLegal() a été ouvert depuis Paramètres (et pas
  // depuis le pied de page de la landing publique, qui n'a pas de Settings à
  // rouvrir) — sert uniquement à décider si le bouton retour doit rouvrir
  // Paramètres.
  const [legalDocFromSettings, setLegalDocFromSettings] = useState(false);
  const [openFaq, setOpenFaq]             = useState(null); // index de la question dépliée sur la landing, ou null
  const [sendToken, setSendToken]         = useState('ETH');
  const [sendAddress, setSendAddress]     = useState('');
  const [ensResolving, setEnsResolving]   = useState(false);
  const [ensError, setEnsError]           = useState(null);
  const [sendAmount, setSendAmount]       = useState('');
  const [sendAmountMode, setSendAmountMode] = useState('crypto'); // 'crypto' | 'fiat' — sendAmount (en crypto) reste la seule source de vérité pour l'envoi
  const [sendAmountFiatInput, setSendAmountFiatInput] = useState('');
  const [receiveAmount, setReceiveAmount]       = useState(''); // demande de paiement (en token natif) sur l'écran Recevoir
  const [receiveChain, setReceiveChain]         = useState('evm'); // 'evm' | 'solana' | 'bitcoin' — quelle adresse afficher sur Recevoir
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
  const [showSell, setShowSell]           = useState(false);
  const [sellToken, setSellToken]         = useState('ETH');
  const [sellAmount, setSellAmount]       = useState('');
  const [sellLoading, setSellLoading]     = useState(false);
  // Achat récurrent (DCA) — rappel local, voir lib/recurringBuy.js.
  const [showRecurringBuy, setShowRecurringBuy] = useState(false);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringAmount, setRecurringAmount]   = useState('20');
  const [recurringToken, setRecurringToken]     = useState('ETH');
  const [recurringFrequency, setRecurringFrequency] = useState('weekly');
  const [recurringSaving, setRecurringSaving]   = useState(false);
  // Pont cross-chain (voir lib/bridge.js) — ETH natif entre Ethereum/
  // Arbitrum/Optimism/Base uniquement (v1, voir commentaire dans bridge.js).
  const [showBridge, setShowBridge]         = useState(false);
  const [bridgeFromNetwork, setBridgeFromNetwork] = useState('ethereum');
  const [bridgeToNetwork, setBridgeToNetwork]     = useState('arbitrum');
  const [bridgeAmount, setBridgeAmount]     = useState('');
  const [bridgeQuote, setBridgeQuote]       = useState(null);
  const [bridgeQuoteLoading, setBridgeQuoteLoading] = useState(false);
  const [bridgeExecuting, setBridgeExecuting]       = useState(false);
  const [bridgeError, setBridgeError]       = useState(null);
  // Positions DeFi (voir lib/defiPositions.js) — v1 : Lido stETH uniquement.
  const [showDefiPositions, setShowDefiPositions] = useState(false);
  const [defiPositionsList, setDefiPositionsList] = useState([]);
  const [defiPositionsLoading, setDefiPositionsLoading] = useState(false);
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
  // Comptes multiples : `accounts` = tous les wallets connus de cet appareil
  // (chacun avec son propre keystore chiffré), `activeAccountId` pointe vers
  // celui actuellement chargé dans `walletSession`/`walletAddr` ci-dessus.
  const [accounts, setAccounts]                 = useState([]);
  const [activeAccountId, setActiveAccountId]   = useState(null);
  const [showAddAccount, setShowAddAccount]     = useState(false);
  const [addAccountValue, setAddAccountValue]   = useState('');
  const [addAccountType, setAddAccountType]     = useState('mnemonic');
  const [addAccountError, setAddAccountError]   = useState(null);
  const [accountRenameFor, setAccountRenameFor] = useState(null); // id du compte en cours de renommage, ou null
  const [accountRenameInput, setAccountRenameInput] = useState('');
  // WalletConnect (se connecter à des dApps tierces) — voir lib/walletconnect.js.
  const [showWalletConnect, setShowWalletConnect] = useState(false);
  const [wcUri, setWcUri]                       = useState('');
  const [wcConnecting, setWcConnecting]         = useState(false);
  const [wcError, setWcError]                   = useState(null);
  const [wcSessions, setWcSessions]             = useState([]);
  const [wcProposal, setWcProposal]             = useState(null); // proposition de connexion en attente
  const [wcRequest, setWcRequest]               = useState(null); // demande de signature/tx en attente
  const [wcRequestLoading, setWcRequestLoading] = useState(false);
  const [wcRequestError, setWcRequestError]     = useState(null);
  const [wcSimResult, setWcSimResult]           = useState(null); // voir lib/txSimulation.js
  // Navigateur dApp intégré — WebView + provider EIP-1193 injecté (voir
  // lib/dappBrowserProvider.js). Pont direct WebView <-> natif (pas de
  // relais WalletConnect), mais la signature réutilise exactement
  // walletConnect.executeSessionRequest — même code que pour WalletConnect.
  // Natif uniquement : react-native-webview n'a pas d'implémentation web.
  const [showDappBrowser, setShowDappBrowser]     = useState(false);
  const [dappUrlInput, setDappUrlInput]           = useState('');
  const [dappCurrentUrl, setDappCurrentUrl]       = useState(null);
  const [dappConnectedOrigins, setDappConnectedOrigins] = useState([]); // origines autorisées à voir l'adresse (session app en cours)
  const [dappBridgeRequest, setDappBridgeRequest] = useState(null); // { id, method, params, origin } en attente de confirmation
  const [dappBridgeLoading, setDappBridgeLoading] = useState(false);
  const [dappBridgeError, setDappBridgeError]     = useState(null);
  const [dappSimResult, setDappSimResult]         = useState(null); // voir lib/txSimulation.js
  const dappWebViewRef = useRef(null);
  // Autorisations de tokens accordées via cette app (voir lib/approvals.js)
  // — suivi local uniquement, pas d'indexeur tiers.
  const [showApprovals, setShowApprovals]         = useState(false);
  const [tokenApprovals, setTokenApprovals]       = useState([]);
  const [approvalsLoading, setApprovalsLoading]   = useState(false);
  const [revokingApprovalId, setRevokingApprovalId] = useState(null);
  // Staking natif Solana — voir getSolanaValidators/getSolanaStakeAccounts/
  // createAndDelegateStake/deactivateStake/withdrawStake dans lib/wallet.js.
  const [showStaking, setShowStaking]           = useState(false);
  const [stakeAccounts, setStakeAccounts]       = useState([]);
  const [stakeAccountsLoading, setStakeAccountsLoading] = useState(false);
  const [validators, setValidators]             = useState([]);
  const [selectedValidator, setSelectedValidator] = useState(null);
  const [stakeAmount, setStakeAmount]           = useState('');
  const [stakeLoading, setStakeLoading]         = useState(false);
  const [stakeError, setStakeError]             = useState(null);
  // Galerie NFT (Ethereum, lecture via le backend — voir GET /wallet/nft/owned,
  // clé Alchemy côté serveur) — l'envoi reste signé localement (signNftTransferTx).
  const [showNftGallery, setShowNftGallery]     = useState(false);
  const [nfts, setNfts]                         = useState([]);
  const [nftsLoading, setNftsLoading]           = useState(false);
  const [nftsError, setNftsError]               = useState(null);
  const [selectedNft, setSelectedNft]           = useState(null);
  const [nftSendAddress, setNftSendAddress]     = useState('');
  const [nftSendLoading, setNftSendLoading]     = useState(false);
  const [nftSendError, setNftSendError]         = useState(null);
  const [nftNetwork, setNftNetwork]             = useState('ethereum'); // seul 'ethereum' est activé côté Alchemy pour l'instant
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
  const [hideZeroBalances, setHideZeroBalances] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [portfolioIsCached, setPortfolioIsCached] = useState(false); // true tant qu'on affiche le cache, pas un solde fraîchement récupéré
  const [showReferral, setShowReferral] = useState(false);
  const [referredByCode, setReferredByCode] = useState(null);
  const [locale, setLocale] = useState('fr');
  // t() traduit les libellés d'UI courants (nav, accueil, paramètres...) —
  // voir lib/i18n.js pour la portée exacte (les pages légales/FAQ restent en
  // français uniquement). Défini ici, tout en haut, pour être utilisable par
  // n'importe quel callback ou bloc JSX plus bas dans ce composant.
  const t = useCallback((key, vars) => i18nTranslate(locale, key, vars), [locale]);
  const changeLocale = useCallback((next) => { setLocale(next); saveLocale(next); }, []);
  const [balancePeriod, setBalancePeriod] = useState('24h');
  const [lastSend, setLastSend]           = useState(null);
  const [tokenUsage, setTokenUsage]       = useState({});
  const [hiddenQuickActions, setHiddenQuickActions] = useState([]);
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
  // Adresse Solana — dérivée de LA MÊME mnémonique que l'adresse EVM (voir
  // getSolanaAddress dans lib/wallet.js), jamais stockée séparément : elle
  // disparaît avec unlockedMnemonic au verrouillage, comme le reste.
  const solanaAddr = useMemo(() => {
    if (!unlockedMnemonic) return '';
    try { return localWallet.getSolanaAddress(unlockedMnemonic); } catch (e) { console.warn('getSolanaAddress error', e.message); return ''; }
  }, [unlockedMnemonic]);
  const [solanaBalance, setSolanaBalance] = useState('0');
  // Adresse Bitcoin — même principe, dérivée de la même mnémonique (BIP84,
  // voir getBitcoinAddress dans lib/wallet.js).
  const bitcoinAddr = useMemo(() => {
    if (!unlockedMnemonic) return '';
    try { return localWallet.getBitcoinAddress(unlockedMnemonic); } catch (e) { console.warn('getBitcoinAddress error', e.message); return ''; }
  }, [unlockedMnemonic]);
  const [bitcoinBalance, setBitcoinBalance] = useState('0');
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

  // Code de parrainage : dérivé directement de l'adresse (pas besoin de le
  // générer/stocker séparément — stable tant que l'adresse ne change pas).
  // Honnête sur le périmètre : aucun système de récompense n'existe côté
  // backend pour l'instant, juste un lien traçable prêt à en recevoir un
  // plus tard (voir referredByCode ci-dessous, capté si présent dans l'URL).
  const referralCode = walletAddr ? walletAddr.slice(2, 10).toUpperCase() : null;

  const shareReferralLink = useCallback(async () => {
    if (!referralCode) return;
    const shareUrl = `https://nexiawallet.fr?ref=${referralCode}`;
    const message = `Rejoins-moi sur NexiaWallet, mon portefeuille crypto non-custodial préféré : ${shareUrl}`;
    try {
      await Share.share({ title: 'NexiaWallet', message, url: shareUrl });
    } catch {
      await copyToClipboard(shareUrl, 'Lien de parrainage copié');
    }
  }, [referralCode, copyToClipboard]);

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
  // Adresses en observation (watch-only) : liste séparée des comptes réels,
  // jamais de clé, jamais de PIN — voir loadWatchAddresses ci-dessus.
  const [watchAddresses, setWatchAddresses]       = useState([]);
  const [watchAddressesLoaded, setWatchAddressesLoaded] = useState(false);
  const [watchBalances, setWatchBalances]         = useState({}); // id -> { native, USDT, USDC }
  const [showAddWatchAddress, setShowAddWatchAddress] = useState(false);
  const [watchAddrInput, setWatchAddrInput]       = useState('');
  const [watchLabelInput, setWatchLabelInput]     = useState('');
  const [watchNetworkInput, setWatchNetworkInput] = useState('ethereum');
  const [watchAddrError, setWatchAddrError]       = useState(null);
  const [watchAddrLoading, setWatchAddrLoading]   = useState(false);
  // Fiche "info seule" pour une crypto du Marché qui n'est PAS dans le
  // wallet (pas de solde/envoi possible — juste prix, capitalisation, desc).
  const [selectedMarketCoin, setSelectedMarketCoin] = useState(null);
  const [marketCoinInfo, setMarketCoinInfo]       = useState({}); // id -> fiche CoinGecko
  const [marketCoinCandles, setMarketCoinCandles] = useState({}); // id -> bougies 1J

  const fxRate = CURRENCIES[currency]?.rate || 1;
  const symC   = CURRENCIES[currency]?.symbol || '$';
  const NETWORK_INFO = {
    ethereum: { label: 'Ethereum Mainnet', network: 'ethereum', chainId: 1,     explorer: 'https://etherscan.io' },
    bsc:      { label: 'BNB Smart Chain',  network: 'bsc',      chainId: 56,    explorer: 'https://bscscan.com' },
    polygon:  { label: 'Polygon',          network: 'polygon',  chainId: 137,   explorer: 'https://polygonscan.com' },
    arbitrum: { label: 'Arbitrum One',     network: 'arbitrum', chainId: 42161, explorer: 'https://arbiscan.io' },
    optimism: { label: 'Optimism',         network: 'optimism', chainId: 10,    explorer: 'https://optimistic.etherscan.io' },
    base:     { label: 'Base',             network: 'base',     chainId: 8453,  explorer: 'https://basescan.org' },
  };
  const activeNetwork = NETWORK_INFO[network] || NETWORK_INFO.ethereum;
  // Symbole du token natif du réseau actif — recalculé souvent ailleurs
  // avant cette factorisation (envoi, swap, achat, affichage du solde) ;
  // une seule source évite un oubli si un réseau EVM est un jour ajouté/retiré.
  const nativeSymbol = { bsc: 'BNB', polygon: 'MATIC' }[network] || 'ETH';

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
            change7d:  token.price_change_percentage_7d ?? next[sym].change7d,
            change30d: token.price_change_percentage_30d ?? next[sym].change30d,
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
    // Mode détresse : ne JAMAIS récupérer le vrai solde, sinon il finirait
    // par écraser le zéro affiché (rafraîchissement périodique, changement
    // de réseau...) et trahirait que ce n'est pas le vrai wallet vide.
    if (isDuressMode) return;
    try {
      const nativeSymbol = { bsc: 'BNB', polygon: 'MATIC' }[selectedNetwork] || 'ETH';
      const nativeBalance = await localWallet.getNativeBalance(walletAddr, selectedNetwork);
      setWalletBalance(nativeBalance);
      setTokens(prev => ({
        ...prev,
        [nativeSymbol]: { ...prev[nativeSymbol], balance: parseFloat(nativeBalance) },
      }));

      const tokenSymbols = ['USDT', 'USDC'];
      const erc20Balances = {};
      await Promise.all(tokenSymbols.map(async (sym) => {
        try {
          const balance = await localWallet.getErc20Balance(walletAddr, sym, selectedNetwork);
          erc20Balances[sym] = parseFloat(balance);
          setTokens(prev => ({
            ...prev,
            [sym]: { ...prev[sym], balance: parseFloat(balance) },
          }));
        } catch (err) {
          console.warn(`Balance ${sym} failed`, err.message);
        }
      }));

      // Solde récupéré avec succès (au moins la partie native) — on n'est
      // plus hors-ligne, et on met à jour le cache pour la prochaine fois
      // que le réseau manquera.
      setIsOffline(false);
      setPortfolioIsCached(false);
      savePortfolioCache(walletAddr, selectedNetwork, { nativeSymbol, nativeBalance, erc20Balances });
    } catch (err) {
      console.warn('refreshPortfolio error', err.message);
      // Échec réseau (pas juste une erreur applicative) : bascule sur le
      // dernier solde connu en cache plutôt que de laisser l'écran figé sur
      // d'anciennes valeurs sans le signaler.
      const cached = await loadPortfolioCache(walletAddr, selectedNetwork);
      if (cached) {
        setWalletBalance(cached.nativeBalance);
        setTokens(prev => {
          const next = { ...prev, [cached.nativeSymbol]: { ...prev[cached.nativeSymbol], balance: parseFloat(cached.nativeBalance) } };
          Object.entries(cached.erc20Balances || {}).forEach(([sym, bal]) => {
            if (next[sym]) next[sym] = { ...next[sym], balance: bal };
          });
          return next;
        });
        setPortfolioIsCached(true);
      }
      setIsOffline(true);
    }
  }, [network, walletAddr, isDuressMode]);

  // Solde SOL — même principe (RPC public direct, pas de clé nécessaire),
  // mais indépendant du sélecteur réseau EVM (Solana n'en fait pas partie).
  const refreshSolanaBalance = useCallback(async () => {
    if (!solanaAddr) return;
    try {
      const balance = await localWallet.getSolanaBalance(solanaAddr);
      setSolanaBalance(balance);
      setTokens(prev => ({ ...prev, SOL: { ...prev.SOL, balance: parseFloat(balance) } }));
    } catch (err) {
      console.warn('refreshSolanaBalance error', err.message);
    }
  }, [solanaAddr]);

  useEffect(() => { refreshSolanaBalance(); }, [refreshSolanaBalance]);

  // Solde BTC — même principe (API publique Blockstream, pas de clé nécessaire).
  const refreshBitcoinBalance = useCallback(async () => {
    if (!bitcoinAddr) return;
    try {
      const balance = await localWallet.getBitcoinBalance(bitcoinAddr);
      setBitcoinBalance(balance);
      setTokens(prev => ({ ...prev, BTC: { ...prev.BTC, balance: parseFloat(balance) } }));
    } catch (err) {
      console.warn('refreshBitcoinBalance error', err.message);
    }
  }, [bitcoinAddr]);

  useEffect(() => { refreshBitcoinBalance(); }, [refreshBitcoinBalance]);

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
    if (tab === 'stats' && historyItems === null) fetchHistory();
  }, [tab, historyItems, fetchHistory]);

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
  // Exporte le keystore DÉJÀ chiffré (format JSON standard ethers/geth —
  // scrypt+AES, le même format que MetaMask) — pas une nouvelle sauvegarde en
  // clair, juste rendre portable ce qui est déjà stocké chiffré localement.
  // Toujours protégé par le même PIN qu'aujourd'hui : sur un autre appareil,
  // il faudra quand même le PIN d'origine pour le déchiffrer.
  const exportEncryptedKeystore = useCallback(async () => {
    if (!walletSession?.encryptedKeystore) return;
    await copyToClipboard(walletSession.encryptedKeystore, 'Keystore chiffré copié — colle-le dans un fichier .json en lieu sûr');
  }, [walletSession, copyToClipboard]);

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
  const createWallet = useCallback(async (isNewAccount = false) => {
    try {
      setBackendError(null);
      const created = localWallet.createLocalWallet();
      setPendingWalletForPin({ address: created.address, privateKey: created.privateKey, mnemonic: created.mnemonic, isImport: false, isMigration: false, isNewAccount });
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

      // Ajoute/replace l'entrée correspondante dans la liste des comptes :
      // `accountId` n'est présent que pour la migration d'un ancien wallet en
      // clair (on garde son id et son label) ; sinon (nouveau wallet, import,
      // ou "+ Ajouter un compte") on ajoute une nouvelle entrée et on bascule
      // dessus, comme le reste de cette fonction le fait déjà pour la session.
      let nextAccounts;
      let nextActiveId;
      if (pendingWalletForPin.accountId) {
        nextAccounts = accounts.map(a => (a.id === pendingWalletForPin.accountId ? { ...a, ...nextSession } : a));
        nextActiveId = pendingWalletForPin.accountId;
      } else {
        const newId = genAccountId();
        nextAccounts = [...accounts, { id: newId, label: `Compte ${accounts.length + 1}`, ...nextSession }];
        nextActiveId = newId;
      }
      await saveAccountsList(nextAccounts);
      await saveActiveAccountId(nextActiveId);
      setAccounts(nextAccounts);
      setActiveAccountId(nextActiveId);

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
  }, [pendingWalletForPin, network, refreshPortfolio, accounts]);

  // Déverrouillage : déchiffre le keystore stocké avec le PIN saisi. Un
  // mauvais PIN fait simplement échouer le déchiffrement (aucune comparaison
  // de code en clair nulle part) — la seule "vérité" est cryptographique.
  const attemptUnlock = useCallback(async (pin) => {
    if (!walletSession?.encryptedKeystore) return;
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      const duressRecord = await loadDuressPinRecord();
      if (duressRecord && hashDuressPin(pin, duressRecord.salt) === duressRecord.hash) {
        // Code de détresse : jamais de déchiffrement, jamais la vraie clé —
        // juste un état "déverrouillé" avec un solde à zéro.
        setIsDuressMode(true);
        setIsUnlocked(true);
        setWalletBalance('0');
        setTokens(prev => Object.fromEntries(Object.entries(prev).map(([sym, t]) => [sym, { ...t, balance: 0 }])));
        setPinCode('');
        setPinError(null);
        return;
      }
      const result = await localWallet.decryptWalletKeystore(walletSession.encryptedKeystore, pin);
      if (result.address.toLowerCase() !== walletSession.address.toLowerCase()) {
        throw new Error('Adresse incohérente après déchiffrement.');
      }
      setUnlockedPrivateKey(result.privateKey);
      setUnlockedMnemonic(result.mnemonic);
      setIsDuressMode(false);
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
      let accountsList = await loadAccountsList();
      let activeId = await loadActiveAccountId();

      if (!accountsList.length) {
        // Migration transparente : un wallet unique déjà présent (ancien
        // format, avant l'ajout des comptes multiples) devient "Compte 1" —
        // aucune donnée recréée ni perdue, juste enveloppée dans le tableau.
        const legacy = await loadWalletSession();
        if (legacy?.address) {
          const migratedId = genAccountId();
          accountsList = [{ id: migratedId, label: 'Compte 1', ...legacy }];
          activeId = migratedId;
          await saveAccountsList(accountsList);
          await saveActiveAccountId(activeId);
        }
      }
      setAccounts(accountsList);
      setActiveAccountId(activeId);

      const saved = accountsList.find(a => a.id === activeId) || accountsList[0] || null;

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
        // `accountId` fait pointer finalizePinSetup vers CETTE entrée déjà
        // créée ci-dessus, au lieu d'en ajouter une nouvelle en double.
        const wallet = localWallet.walletFromPrivateKey(saved.privateKey);
        if (wallet.address !== saved.address) {
          throw new Error('Session locale corrompue (adresse incohérente).');
        }
        setPendingWalletForPin({ address: saved.address, privateKey: saved.privateKey, mnemonic: saved.mnemonic || null, isImport: true, isMigration: true, accountId: saved.id });
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
    const multi = accounts.length > 1;
    showAlert(
      '⚠️ Déconnexion',
      multi
        ? `Ça efface les ${accounts.length} comptes de cet appareil. Sans leurs phrases de récupération notées ailleurs, tu ne pourras PAS les récupérer.`
        : 'Ça efface le wallet de cet appareil. Sans ta phrase de récupération notée ailleurs, tu ne pourras PAS le récupérer.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnecter',
          onPress: async () => {
            await clearWalletSession();
            await clearAccountsList();
            await clearActiveAccountId();
            await clearBiometricPin();
            setBiometricEnabled(false);
            setWalletSession(null);
            setWalletAddr('');
            setWalletBalance('0');
            setWalletCreated(false);
            setBackendReady(false);
            setIsUnlocked(false);
            setIsDuressMode(false);
            setShowSettings(false);
            setUnlockedPrivateKey(null);
            setUnlockedMnemonic(null);
            setPinStage(null);
            setPendingWalletForPin(null);
            setPendingPinDigits('');
            setPinError(null);
            setAccounts([]);
            setActiveAccountId(null);
            setTokens(prev => Object.fromEntries(Object.entries(prev).map(([sym, t]) => [sym, { ...t, balance: 0 }])));
          },
        },
      ]
    );
  }, [accounts]);

  // Bascule vers un autre compte déjà connu de cet appareil : on charge sa
  // session (adresse + keystore chiffré) mais on ne déchiffre RIEN — comme au
  // lancement de l'app, il faut retaper le PIN de CE compte pour le
  // déverrouiller. `refreshPortfolio`/`solanaAddr`/`bitcoinAddr` se
  // recalculent tout seuls une fois déverrouillé (dérivés de walletAddr /
  // unlockedMnemonic, voir plus haut).
  const switchAccount = useCallback(async (id) => {
    if (id === activeAccountId) { setShowSettings(false); return; }
    const target = accounts.find(a => a.id === id);
    if (!target) return;
    const session = { address: target.address, encryptedKeystore: target.encryptedKeystore, network: target.network || network, createdAt: target.createdAt };
    await saveActiveAccountId(id);
    await saveWalletSession(session);
    setActiveAccountId(id);
    setWalletSession(session);
    setWalletAddr(target.address);
    setWalletBalance('0');
    setNetwork(session.network);
    setUnlockedPrivateKey(null);
    setUnlockedMnemonic(null);
    setIsUnlocked(false);
    setIsDuressMode(false);
    setPinCode('');
    setPinError(null);
    setHistoryItems(null);
    setShowSettings(false);
  }, [accounts, activeAccountId, network]);

  const renameAccount = useCallback(async (id, label) => {
    const trimmed = (label || '').trim();
    if (!trimmed) return;
    const next = accounts.map(a => (a.id === id ? { ...a, label: trimmed } : a));
    setAccounts(next);
    await saveAccountsList(next);
  }, [accounts]);

  // Suppression d'un compte : jamais celui actif (il faut d'abord basculer
  // ailleurs — évite de supprimer une clé actuellement déchiffrée en
  // mémoire), jamais le dernier restant (sinon l'appareil se retrouve sans
  // wallet du tout sans passer par le vrai flux de "Déconnexion").
  const deleteAccount = useCallback((id) => {
    if (accounts.length <= 1) return;
    if (id === activeAccountId) {
      showAlert('Compte actif', "Bascule d'abord vers un autre compte avant de supprimer celui-ci.");
      return;
    }
    const target = accounts.find(a => a.id === id);
    showAlert(
      'Supprimer ce compte ?',
      `${target?.label || 'Ce compte'} sera retiré de cet appareil. Sans sa phrase de récupération notée ailleurs, il sera perdu définitivement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            const next = accounts.filter(a => a.id !== id);
            setAccounts(next);
            await saveAccountsList(next);
          },
        },
      ]
    );
  }, [accounts, activeAccountId]);

  // "+ Ajouter un compte" — deux entrées possibles, toutes deux réutilisent
  // le flux PIN existant (createWallet/pendingWalletForPin) : la nouvelle
  // entrée n'est écrite dans `accounts` qu'une fois le PIN confirmé, dans
  // finalizePinSetup (voir plus haut), exactement comme le tout premier
  // wallet de l'appareil.
  const addAccountGenerate = useCallback(() => {
    setShowAddAccount(false);
    createWallet(true);
  }, [createWallet]);

  const addAccountImport = useCallback(() => {
    try {
      setAddAccountError(null);
      if (!addAccountValue.trim()) {
        setAddAccountError('Entrer une phrase mnémonique ou une clé privée.');
        return;
      }
      const imported = localWallet.importLocalWallet(addAccountValue, addAccountType);
      if (accounts.some(a => a.address.toLowerCase() === imported.address.toLowerCase())) {
        setAddAccountError('Ce wallet est déjà un compte sur cet appareil.');
        return;
      }
      setPendingWalletForPin({ address: imported.address, privateKey: imported.privateKey, mnemonic: imported.mnemonic, isImport: true, isMigration: false, isNewAccount: true });
      setPinCode(''); setPendingPinDigits(''); setPinError(null);
      setPinStage('choose');
      setShowAddAccount(false);
      setAddAccountValue('');
    } catch (err) {
      setAddAccountError(err.message || 'Mnémonique ou clé privée invalide.');
    }
  }, [addAccountValue, addAccountType, accounts]);

  // ── WalletConnect (mode wallet : se connecter à des dApps tierces) ──
  // Toute la logique protocolaire vit dans lib/walletconnect.js ; ici on ne
  // fait que garder l'UI synchronisée et fournir la clé privée déjà
  // déverrouillée en mémoire au moment de signer — jamais avant, jamais
  // stockée ailleurs.
  const refreshWcSessions = useCallback(async () => {
    try {
      const sessions = await walletConnect.getActiveSessions();
      setWcSessions(sessions);
    } catch (err) {
      console.warn('getActiveSessions error', err.message);
    }
  }, []);

  // Écoute les propositions/demandes WalletConnect uniquement pendant que le
  // wallet est déverrouillé (il faut la clé privée en mémoire pour signer) —
  // se désabonne dès qu'il se reverrouille ou que le compte actif change,
  // pour ne jamais approuver une demande avec la mauvaise clé.
  useEffect(() => {
    if (!isUnlocked || !unlockedPrivateKey || !walletAddr) return undefined;
    let cleanup;
    let cancelled = false;
    walletConnect.subscribeToWalletKitEvents({
      onSessionProposal: (proposal) => { if (!cancelled) { setWcProposal(proposal); setShowWalletConnect(false); } },
      onSessionRequest: (request) => { if (!cancelled) setWcRequest(request); },
      onSessionDelete: () => { if (!cancelled) refreshWcSessions(); },
    }).then((fn) => { if (cancelled) fn(); else cleanup = fn; })
      .catch((err) => console.warn('WalletConnect subscribe error', err.message));
    refreshWcSessions();
    return () => { cancelled = true; if (cleanup) cleanup(); };
  }, [isUnlocked, unlockedPrivateKey, walletAddr, refreshWcSessions]);

  const handleWcConnect = useCallback(async (uriOverride) => {
    const uri = (uriOverride || wcUri).trim();
    if (!uri) { setWcError('Colle un lien WalletConnect (commence par "wc:").'); return; }
    setWcConnecting(true);
    setWcError(null);
    try {
      await walletConnect.pairWithUri(uri);
      setWcUri('');
    } catch (err) {
      setWcError(err.message || 'Connexion WalletConnect impossible.');
    } finally {
      setWcConnecting(false);
    }
  }, [wcUri]);

  // Deep links entrants (nexiawallet://... ou une URI "wc:..." ouverte
  // directement par le navigateur/l'appli d'une dApp) — au démarrage à froid
  // via Linking.getInitialURL(), puis pendant que l'app tourne déjà via
  // l'event 'url'. Réutilise handleWcConnect, exactement comme le scanner QR
  // du flux d'envoi (handleQrScanned) qui détecte déjà le préfixe "wc:".
  useEffect(() => {
    const handleIncomingUrl = (url) => {
      if (!url) return;
      const trimmed = url.trim();
      if (trimmed.startsWith('wc:')) {
        handleWcConnect(trimmed);
        return;
      }
      // nexiawallet://wc?uri=wc%3A... : certaines dApps/navigateurs
      // encapsulent l'URI WalletConnect dans un paramètre de notre propre
      // scheme plutôt que de passer un "wc:" brut.
      const match = trimmed.match(/[?&]uri=([^&]+)/);
      if (match) {
        try {
          const decoded = decodeURIComponent(match[1]);
          if (decoded.startsWith('wc:')) handleWcConnect(decoded);
        } catch { /* paramètre mal formé, on ignore */ }
      }
    };

    Linking.getInitialURL().then(handleIncomingUrl).catch(() => { /* rien à faire */ });
    const sub = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => sub.remove();
  }, [handleWcConnect]);

  const handleWcApproveProposal = useCallback(async () => {
    if (!wcProposal || !walletAddr) return;
    try {
      await walletConnect.approveSessionProposal(wcProposal, walletAddr);
      showToast('✓ dApp connectée', 'success');
    } catch (err) {
      showAlert('Connexion refusée', err.message || 'Cette dApp demande une chaîne non supportée par NexiaWallet.');
    } finally {
      setWcProposal(null);
      refreshWcSessions();
    }
  }, [wcProposal, walletAddr, showToast, refreshWcSessions]);

  const handleWcRejectProposal = useCallback(async () => {
    if (!wcProposal) return;
    try { await walletConnect.rejectSessionProposal(wcProposal); } catch (err) { console.warn('rejectSessionProposal error', err.message); }
    setWcProposal(null);
  }, [wcProposal]);

  // ── Autorisations de tokens (voir lib/approvals.js) ── déclaré ici, AVANT
  // handleWcApproveRequest/handleDappBridgeApprove qui référencent
  // maybeRecordApproval dans leur tableau de dépendances useCallback — sinon
  // TDZ ("Cannot access before initialization") au premier rendu, ce n'est
  // pas juste une question de style/ordre de lecture.
  const refreshApprovals = useCallback(async () => {
    if (!walletAddr) return;
    setApprovalsLoading(true);
    try {
      const list = await approvals.getApprovals(walletAddr);
      setTokenApprovals(list);
    } finally {
      setApprovalsLoading(false);
    }
  }, [walletAddr]);

  // Enregistre localement une approbation qu'on vient de faire signer avec
  // succès (approve/increaseAllowance/setApprovalForAll), si le calldata en
  // était bien une — no-op silencieux sinon. Best-effort sur le symbole du
  // token (n'empêche jamais l'enregistrement si l'appel réseau échoue).
  const maybeRecordApproval = useCallback(async ({ to, data, network: net, txHash }) => {
    if (!walletAddr) return;
    const known = decodeKnownCall(data);
    if (!known || !['approve', 'increaseAllowance', 'setApprovalForAll'].includes(known.name)) return;
    const isNft = known.name === 'setApprovalForAll';
    if (isNft && known.args[1] !== true) return; // setApprovalForAll(..., false) = ce n'est pas une nouvelle autorisation
    const spender = known.args[0];
    let tokenSymbol = '?';
    try { tokenSymbol = (await localWallet.getCustomTokenInfo(to, walletAddr, net)).symbol; } catch { /* best-effort */ }
    await approvals.recordApproval(walletAddr, {
      network: net, tokenAddress: to, tokenSymbol, spender,
      amount: isNft ? null : known.args[1]?.toString(), isNft, txHash,
    });
  }, [walletAddr]);

  const refreshDefiPositions = useCallback(async () => {
    if (!walletAddr) return;
    setDefiPositionsLoading(true);
    try {
      const list = await defiPositions.getDefiPositions(walletAddr);
      setDefiPositionsList(list);
    } finally {
      setDefiPositionsLoading(false);
    }
  }, [walletAddr]);

  const handleRevokeApproval = useCallback(async (entry) => {
    if (!unlockedPrivateKey) return;
    setRevokingApprovalId(entry.id);
    try {
      const txHash = await approvals.revokeApproval({
        privateKey: unlockedPrivateKey, network: entry.network,
        tokenAddress: entry.tokenAddress, spender: entry.spender, isNft: entry.isNft,
      });
      await localWallet.waitForTx(txHash, entry.network);
      await approvals.markRevoked(walletAddr, entry.id);
      showToast('✓ Autorisation révoquée', 'success');
      refreshApprovals();
    } catch (err) {
      showAlert('Révocation impossible', err.message || 'Réessaie plus tard.');
    } finally {
      setRevokingApprovalId(null);
    }
  }, [unlockedPrivateKey, walletAddr, showToast, refreshApprovals]);

  const handleWcApproveRequest = useCallback(async () => {
    if (!wcRequest || !unlockedPrivateKey) return;
    setWcRequestLoading(true);
    setWcRequestError(null);
    try {
      const { topic, id, params } = wcRequest;
      const result = await walletConnect.executeSessionRequest(
        { chainId: params.chainId, method: params.request.method, params: params.request.params },
        unlockedPrivateKey
      );
      await walletConnect.respondToSessionRequest(topic, id, result);
      if (params.request.method === 'eth_sendTransaction') {
        const tx = params.request.params?.[0] || {};
        const net = walletConnect.SUPPORTED_EVM_CHAINS[params.chainId] || 'ethereum';
        maybeRecordApproval({ to: tx.to, data: tx.data, network: net, txHash: result }).catch(() => {});
      }
      showToast('✓ Signé', 'success');
      setWcRequest(null);
    } catch (err) {
      setWcRequestError(err.message || 'Impossible de traiter cette demande.');
      try { await walletConnect.rejectSessionRequest(wcRequest.topic, wcRequest.id, err.message); } catch { /* rien à faire */ }
    } finally {
      setWcRequestLoading(false);
    }
  }, [wcRequest, unlockedPrivateKey, showToast, maybeRecordApproval]);

  const handleWcRejectRequest = useCallback(async () => {
    if (!wcRequest) return;
    try { await walletConnect.rejectSessionRequest(wcRequest.topic, wcRequest.id); } catch { /* rien à faire */ }
    setWcRequest(null);
    setWcRequestError(null);
  }, [wcRequest]);

  const handleWcDisconnect = useCallback(async (topic) => {
    try { await walletConnect.disconnectSession(topic); } catch (err) { console.warn('disconnectSession error', err.message); }
    refreshWcSessions();
  }, [refreshWcSessions]);

  // ── Navigateur dApp intégré ──
  const dappBridgeRespond = useCallback((id, errorMessage, result) => {
    const script = `window.__nexiaRespond(${id}, ${errorMessage ? JSON.stringify(errorMessage) : 'null'}, ${JSON.stringify(result === undefined ? null : result)}); true;`;
    dappWebViewRef.current?.injectJavaScript(script);
  }, []);

  const handleDappBrowserOpen = useCallback((url) => {
    const trimmed = (url || '').trim();
    if (!trimmed) return;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    setDappCurrentUrl(withScheme);
    setDappUrlInput(withScheme);
  }, []);

  // Messages venant de la page web (voir lib/dappBrowserProvider.js). Les
  // méthodes purement lecture (pas de signature, pas de nouvelle
  // autorisation) sont résolues tout de suite ; le reste passe par une
  // confirmation explicite (renderDappBridgeRequest).
  const handleDappMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!msg || msg.source !== 'nexiawallet-provider') return;
    const { id, method, params } = msg;
    let origin = dappCurrentUrl || '';
    try { origin = new URL(dappCurrentUrl).origin; } catch { /* garde l'URL brute si non parsable */ }

    if (method === 'eth_chainId') {
      return dappBridgeRespond(id, null, '0x' + localWallet.getNetworkConfig(network).chainId.toString(16));
    }
    if (method === 'net_version') {
      return dappBridgeRespond(id, null, String(localWallet.getNetworkConfig(network).chainId));
    }
    if (method === 'eth_accounts') {
      return dappBridgeRespond(id, null, dappConnectedOrigins.includes(origin) && walletAddr ? [walletAddr] : []);
    }
    // eth_requestAccounts / personal_sign / eth_sign / eth_signTypedData(_v4)
    // / eth_sendTransaction / wallet_switchEthereumChain : confirmation requise.
    setDappBridgeError(null);
    setDappBridgeRequest({ id, method, params, origin });
  }, [dappCurrentUrl, dappConnectedOrigins, walletAddr, network, dappBridgeRespond]);

  const handleDappBridgeApprove = useCallback(async () => {
    if (!dappBridgeRequest) return;
    const { id, method, params, origin } = dappBridgeRequest;
    setDappBridgeLoading(true);
    setDappBridgeError(null);
    try {
      if (method === 'eth_requestAccounts') {
        setDappConnectedOrigins(prev => (prev.includes(origin) ? prev : [...prev, origin]));
        dappBridgeRespond(id, null, walletAddr ? [walletAddr] : []);
      } else if (method === 'wallet_switchEthereumChain') {
        const requestedHex = params?.[0]?.chainId;
        const targetNetwork = walletConnect.SUPPORTED_EVM_CHAINS[`eip155:${parseInt(requestedHex, 16)}`];
        if (!targetNetwork) throw new Error('Réseau non supporté par NexiaWallet.');
        setNetwork(targetNetwork);
        dappBridgeRespond(id, null, null);
        dappWebViewRef.current?.injectJavaScript(`window.__nexiaEmit('chainChanged', ${JSON.stringify(requestedHex)}); true;`);
      } else {
        if (!unlockedPrivateKey) throw new Error('Wallet verrouillé.');
        const chainIdCaip = `eip155:${localWallet.getNetworkConfig(network).chainId}`;
        const result = await walletConnect.executeSessionRequest({ chainId: chainIdCaip, method, params }, unlockedPrivateKey);
        dappBridgeRespond(id, null, result);
        if (method === 'eth_sendTransaction') {
          const tx = params?.[0] || {};
          maybeRecordApproval({ to: tx.to, data: tx.data, network, txHash: result }).catch(() => {});
        }
      }
      setDappBridgeRequest(null);
    } catch (err) {
      const message = err.message || 'Requête refusée.';
      setDappBridgeError(message);
      dappBridgeRespond(id, message, null);
    } finally {
      setDappBridgeLoading(false);
    }
  }, [dappBridgeRequest, walletAddr, unlockedPrivateKey, network, dappBridgeRespond, maybeRecordApproval]);

  const handleDappBridgeReject = useCallback(() => {
    if (!dappBridgeRequest) return;
    dappBridgeRespond(dappBridgeRequest.id, "Refusé par l'utilisateur.", null);
    setDappBridgeRequest(null);
    setDappBridgeError(null);
  }, [dappBridgeRequest, dappBridgeRespond]);

  // Simulation avant signature (voir lib/txSimulation.js) — décodage local du
  // calldata (approbations dangereuses) + une estimation de gas réelle pour
  // détecter un revert probable. Ne bloque jamais la signature, affiche juste
  // un avertissement dans la modale de confirmation.
  useEffect(() => {
    const method = wcRequest?.params?.request?.method;
    if (method !== 'eth_sendTransaction') { setWcSimResult(null); return; }
    let cancelled = false;
    setWcSimResult(null);
    const tx = wcRequest.params.request.params?.[0] || {};
    const net = walletConnect.SUPPORTED_EVM_CHAINS[wcRequest.params.chainId] || 'ethereum';
    simulateTransaction({ to: tx.to, data: tx.data, value: tx.value, network: net })
      .then((res) => { if (!cancelled) setWcSimResult(res); })
      .catch(() => { if (!cancelled) setWcSimResult(null); });
    return () => { cancelled = true; };
  }, [wcRequest]);

  useEffect(() => {
    if (dappBridgeRequest?.method !== 'eth_sendTransaction') { setDappSimResult(null); return; }
    let cancelled = false;
    setDappSimResult(null);
    const tx = dappBridgeRequest.params?.[0] || {};
    simulateTransaction({ to: tx.to, data: tx.data, value: tx.value, network })
      .then((res) => { if (!cancelled) setDappSimResult(res); })
      .catch(() => { if (!cancelled) setDappSimResult(null); });
    return () => { cancelled = true; };
  }, [dappBridgeRequest, network]);

  // ── Staking natif Solana ──
  // La liste des comptes de stake connus de cet appareil (par adresse de
  // wallet, voir STAKE_REFS_KEY) fait foi pour QUELS comptes interroger ;
  // getSolanaStakeAccountsInfo fait foi pour leur solde/statut ACTUEL. Un
  // compte disparu du résultat (entièrement retiré) est retiré de la liste
  // locale au passage, pour ne pas s'accumuler indéfiniment.
  const loadStakeAccounts = useCallback(async () => {
    if (!walletAddr) return;
    setStakeAccountsLoading(true);
    try {
      const refs = await loadStakeRefs(walletAddr);
      const accounts = await localWallet.getSolanaStakeAccountsInfo(refs.map(r => r.stakePubkey));
      setStakeAccounts(accounts);
      const stillExisting = new Set(accounts.map(a => a.stakePubkey));
      const prunedRefs = refs.filter(r => stillExisting.has(r.stakePubkey));
      if (prunedRefs.length !== refs.length) await saveStakeRefs(walletAddr, prunedRefs);
    } catch (err) {
      console.warn('getSolanaStakeAccountsInfo error', err.message);
    } finally {
      setStakeAccountsLoading(false);
    }
  }, [walletAddr]);

  const openStaking = useCallback(async () => {
    setShowStaking(true);
    setStakeError(null);
    loadStakeAccounts();
    try {
      const list = await localWallet.getSolanaValidators();
      setValidators(list);
      if (list.length && !selectedValidator) setSelectedValidator(list[0].votePubkey);
    } catch (err) {
      console.warn('getSolanaValidators error', err.message);
    }
  }, [loadStakeAccounts, selectedValidator]);

  const handleCreateStake = useCallback(async () => {
    if (!stakeAmount || isNaN(Number(stakeAmount)) || Number(stakeAmount) <= 0) {
      setStakeError('Entre un montant de SOL valide.');
      return;
    }
    if (!selectedValidator) {
      setStakeError('Choisis un validateur.');
      return;
    }
    setStakeLoading(true);
    setStakeError(null);
    try {
      const { rawTx, stakePubkey } = await localWallet.createAndDelegateStake({
        mnemonic: unlockedMnemonic, votePubkey: selectedValidator, amountSol: stakeAmount,
      });
      const response = await axios.post(`${API_BASE}/tx/broadcast-solana`, { rawTx }, { timeout: 25000, headers: API_HEADERS });
      if (!response.data?.success) throw new Error(response.data?.error || 'Échec de la mise en stake.');
      const refs = await loadStakeRefs(walletAddr);
      await saveStakeRefs(walletAddr, [...refs, { stakePubkey, createdAt: Date.now() }]);
      showToast('✓ Stake créé — activation sous ~1 epoch (2-3 jours)', 'success');
      setStakeAmount('');
      await loadStakeAccounts();
      await refreshSolanaBalance();
    } catch (err) {
      setStakeError(err.message || 'Impossible de créer le stake.');
    } finally {
      setStakeLoading(false);
    }
  }, [stakeAmount, selectedValidator, unlockedMnemonic, walletAddr, loadStakeAccounts, showToast]);

  const handleDeactivateStake = useCallback((stakePubkey) => {
    showAlert(
      'Désactiver ce stake ?',
      'Le SOL restera bloqué encore ~1 epoch (2-3 jours) avant de pouvoir être retiré.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver', onPress: async () => {
            try {
              const { rawTx } = await localWallet.deactivateStake({ mnemonic: unlockedMnemonic, stakePubkey });
              const response = await axios.post(`${API_BASE}/tx/broadcast-solana`, { rawTx }, { timeout: 25000, headers: API_HEADERS });
              if (!response.data?.success) throw new Error(response.data?.error || 'Échec de la désactivation.');
              showToast('✓ Désactivation en cours', 'success');
              await loadStakeAccounts();
            } catch (err) {
              showAlert('Erreur', err.message || 'Impossible de désactiver ce stake.');
            }
          },
        },
      ]
    );
  }, [unlockedMnemonic, loadStakeAccounts, showToast]);

  const handleWithdrawStake = useCallback(async (stakePubkey, lamports) => {
    try {
      const { rawTx } = await localWallet.withdrawStake({ mnemonic: unlockedMnemonic, stakePubkey, lamports });
      const response = await axios.post(`${API_BASE}/tx/broadcast-solana`, { rawTx }, { timeout: 25000, headers: API_HEADERS });
      if (!response.data?.success) throw new Error(response.data?.error || 'Échec du retrait.');
      showToast('✓ SOL retiré vers ton wallet', 'success');
      await loadStakeAccounts();
      await refreshSolanaBalance();
    } catch (err) {
      showAlert('Erreur', err.message || 'Impossible de retirer ce stake.');
    }
  }, [unlockedMnemonic, loadStakeAccounts, showToast]);

  // ── Galerie NFT multi-chaînes (lecture via le backend, clé Alchemy côté
  // serveur — voir ALCHEMY_NFT_SUBDOMAINS dans crypto-wallet/src/routes/
  // wallet.js) — un réseau doit être activé sur le tableau de bord Alchemy
  // pour la clé actuelle avant de fonctionner ; seul Ethereum l'est
  // aujourd'hui, vérifié en direct (403 "not enabled for this app" sur les
  // autres). Le code accepte déjà les autres réseaux, prêt dès qu'ils
  // seront activés côté Alchemy, sans rien changer ici.
  const NFT_NETWORKS = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
  const openNftGallery = useCallback(async (net = nftNetwork) => {
    setShowNftGallery(true);
    setSelectedNft(null);
    setNftsError(null);
    if (!walletAddr) return;
    setNftsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/nft/owned/${walletAddr}`, { params: { network: net }, timeout: 25000, headers: API_HEADERS });
      if (!response.data?.success) throw new Error(response.data?.error || 'Impossible de récupérer les NFT.');
      setNfts(response.data.nfts || []);
    } catch (err) {
      setNftsError(err.response?.data?.error || err.message || 'Impossible de récupérer les NFT.');
    } finally {
      setNftsLoading(false);
    }
  }, [walletAddr, nftNetwork]);

  const handleSendNft = useCallback(async () => {
    if (!selectedNft) return;
    if (!ethers.utils.isAddress(nftSendAddress)) {
      setNftSendError("L'adresse de destination n'est pas valide.");
      return;
    }
    setNftSendLoading(true);
    setNftSendError(null);
    try {
      const { rawTx } = await localWallet.signNftTransferTx({
        privateKey: unlockedPrivateKey,
        contractAddress: selectedNft.contract,
        tokenId: selectedNft.tokenId,
        to: nftSendAddress,
        network: 'ethereum',
      });
      const response = await axios.post(`${API_BASE}/tx/broadcast`, { rawTx, network: 'ethereum' }, { timeout: 25000, headers: API_HEADERS });
      if (!response.data?.success) throw new Error(response.data?.error || "Échec de l'envoi du NFT.");
      showToast('✓ NFT envoyé', 'success');
      setSelectedNft(null);
      setNftSendAddress('');
      setNfts(prev => prev.filter(n => !(n.contract === selectedNft.contract && n.tokenId === selectedNft.tokenId)));
    } catch (err) {
      setNftSendError(err.message || "Impossible d'envoyer ce NFT.");
    } finally {
      setNftSendLoading(false);
    }
  }, [selectedNft, nftSendAddress, unlockedPrivateKey, showToast]);

  // Sur le web, l'app est limitée à 480px de large (webFrame) et centrée —
  // sans ça, les marges de chaque côté restent d'un blanc par défaut du
  // navigateur au lieu de suivre le thème actif. `T.bg` (pas `T.deepBg`,
  // réservé à la landing) pour que les marges suivent le thème clair/sombre
  // choisi, et redéclenché quand `T` change pour basculer en direct.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.backgroundColor = T.bg;
      document.body.style.backgroundColor = T.bg;
    }
  }, [T]);

  useEffect(() => {
    initWallet();
    fetchMarket();
    const id = setInterval(fetchMarket, 30000);
    return () => clearInterval(id);
  }, [fetchMarket, initWallet]);

  // Rafraîchit périodiquement le solde natif (pas juste sur action explicite
  // de l'utilisateur) pour pouvoir détecter une réception de fonds pendant
  // que l'app tourne — voir l'effet juste en dessous qui compare avec le
  // solde précédent. Ne détecte PAS une réception app totalement fermée
  // (nécessiterait un vrai push distant déclenché par un serveur qui
  // surveille la chaîne — hors de portée sans backend dédié pour ça).
  useEffect(() => {
    if (!walletAddr) return;
    const id = setInterval(() => refreshPortfolio(network), 45000);
    return () => clearInterval(id);
  }, [walletAddr, network, refreshPortfolio]);

  const previousBalanceRef = useRef(null);
  useEffect(() => {
    if (!walletBalance || Platform.OS === 'web') { previousBalanceRef.current = walletBalance; return; }
    const prev = previousBalanceRef.current;
    const current = parseFloat(walletBalance);
    if (prev != null && current > parseFloat(prev) + 1e-12) {
      const received = current - parseFloat(prev);
      Notifications.scheduleNotificationAsync({
        content: {
          title: '💰 Fonds reçus',
          body: `+${received.toFixed(6)} ${nativeSymbol} sur ${activeNetwork.label}`,
        },
        trigger: null, // immédiat
      }).catch(() => { /* notifications refusées, pas grave */ });
    }
    previousBalanceRef.current = walletBalance;
  }, [walletBalance, nativeSymbol, activeNetwork]);

  useEffect(() => {
    loadDuressPinRecord().then(record => setDuressPinConfigured(!!record));
  }, []);

  const handleSaveDuressPin = async () => {
    if (!/^\d{6}$/.test(duressSetupInput)) {
      setDuressSetupError('Le code de détresse doit faire exactement 6 chiffres.');
      return;
    }
    // Un code de détresse identique au vrai PIN n'aurait aucun sens (on ne
    // peut pas les distinguer à la saisie) — on ne peut pas comparer au
    // vrai PIN ici (jamais stocké en clair), donc juste avertir clairement
    // dans le texte de l'écran plutôt que tenter une vérification illusoire.
    await saveDuressPin(duressSetupInput);
    setDuressPinConfigured(true);
    setShowDuressSetup(false);
    setShowSettings(true);
    setDuressSetupInput('');
    setDuressSetupError(null);
    showToast('✓ Code de détresse activé', 'success');
  };

  const handleRemoveDuressPin = async () => {
    await clearDuressPin();
    setDuressPinConfigured(false);
    showToast('Code de détresse désactivé', 'success');
  };

  // Mode hors-ligne : NetInfo donne un signal immédiat (pas besoin d'attendre
  // qu'une requête RPC échoue/expire) — bascule tout de suite sur le cache
  // dès que la connexion tombe, et relance un vrai rafraîchissement dès
  // qu'elle revient.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false || state.isInternetReachable === false;
      setIsOffline(offline);
      if (offline && walletAddr) {
        loadPortfolioCache(walletAddr, network).then(cached => {
          if (!cached) return;
          setWalletBalance(cached.nativeBalance);
          setTokens(prev => {
            const next = { ...prev, [cached.nativeSymbol]: { ...prev[cached.nativeSymbol], balance: parseFloat(cached.nativeBalance) } };
            Object.entries(cached.erc20Balances || {}).forEach(([sym, bal]) => {
              if (next[sym]) next[sym] = { ...next[sym], balance: bal };
            });
            return next;
          });
          setPortfolioIsCached(true);
        });
      } else if (!offline && walletAddr) {
        refreshPortfolio(network);
      }
    });
    return () => unsubscribe();
  }, [walletAddr, network, refreshPortfolio]);

  // Capture ?ref=CODE dans l'URL (partagé via shareReferralLink) à la toute
  // première ouverture — Linking.getInitialURL() couvre aussi les deep links
  // natifs (nexiawallet://?ref=CODE), pas seulement le web.
  useEffect(() => {
    // Ne remplace l'état que si un code a réellement déjà été persisté —
    // sinon cette résolution asynchrone (lue avant que la capture ci-dessous
    // n'ait fini d'écrire) écrase avec `null` le code tout juste capturé.
    loadReferredBy().then((saved) => { if (saved) setReferredByCode(saved); });
    const captureRef = (url) => {
      if (!url) return;
      const match = url.match(/[?&]ref=([A-Za-z0-9]+)/);
      if (match) { saveReferredBy(match[1]); setReferredByCode(prev => prev || match[1]); }
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      captureRef(window.location.href);
    } else {
      Linking.getInitialURL().then(captureRef).catch(() => {});
    }
  }, []);

  useEffect(() => {
    recurringBuy.getConfig().then(cfg => {
      if (!cfg) return;
      setRecurringEnabled(!!cfg.enabled);
      setRecurringAmount(String(cfg.amountUsd ?? '20'));
      setRecurringToken(cfg.token || 'ETH');
      setRecurringFrequency(cfg.frequency || 'weekly');
    });
  }, []);

  // Appui sur le rappel local d'achat récurrent → ouvre directement l'écran
  // Acheter pré-rempli, comme un raccourci "il est temps d'acheter".
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'recurring-buy') {
        setBuyAmount(String(data.amountUsd));
        setBuyToken(data.token);
        setShowBuy(true);
      }
    });
    return () => sub.remove();
  }, []);

  // Demande la permission de notifications une fois, au démarrage — sert à
  // la fois aux notifications de fonds reçus/alertes de prix ci-dessus ET au
  // rappel d'achat récurrent (celui-ci redemande de toute façon au moment de
  // programmer un rappel, mais ça évite qu'un utilisateur qui n'active QUE
  // les alertes de prix/fonds reçus n'ait jamais eu la permission demandée.
  // iOS ignore silencieusement scheduleNotificationAsync sans permission
  // accordée au préalable — sans cette demande, ces notifications ne
  // s'afficheraient tout simplement jamais).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.requestPermissionsAsync().catch(() => { /* l'utilisateur pourra toujours l'activer manuellement plus tard */ });
  }, []);

  useEffect(() => {
    loadFavorites().then(list => { setFavorites(list); setFavoritesLoaded(true); });
    loadRecentAddresses().then(setRecentAddresses);
    loadPriceAlerts().then(list => { setPriceAlerts(list); setPriceAlertsLoaded(true); });
    loadVibrationEnabled().then(setVibrationEnabled);
    loadHideZeroBalances().then(setHideZeroBalances);
    loadLocale().then(setLocale);
    loadBalancePeriod().then(setBalancePeriod);
    loadLastSend().then(setLastSend);
    loadTokenUsage().then(setTokenUsage);
    loadHiddenQuickActions().then(setHiddenQuickActions);
    loadPortfolioHistory().then(list => { setPortfolioHistory(list); setPortfolioHistoryLoaded(true); });
    loadTxTags().then(setTxTags);
    loadCustomTokens().then(list => { setCustomTokens(list); setCustomTokensLoaded(true); });
    loadWatchAddresses().then(list => { setWatchAddresses(list); setWatchAddressesLoaded(true); });
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

  // ── Adresses en observation (watch-only) ──────────────────────
  // Totalement séparé du wallet réel : ne touche jamais unlockedPrivateKey /
  // unlockedMnemonic, ne passe jamais par le flux PIN, n'apparaît pas dans le
  // sélecteur de compte actif. Lecture seule via les mêmes fonctions RPC
  // publiques que le compte principal (aucune clé requise).
  useEffect(() => {
    if (watchAddressesLoaded) saveWatchAddresses(watchAddresses);
  }, [watchAddresses, watchAddressesLoaded]);

  const refreshWatchAddressBalances = useCallback(async () => {
    if (!watchAddresses.length) return;
    await Promise.all(watchAddresses.map(async (w) => {
      try {
        const native = await localWallet.getNativeBalance(w.address, w.network);
        const balances = { native: parseFloat(native) };
        await Promise.all(['USDT', 'USDC'].map(async (sym) => {
          try {
            const bal = await localWallet.getErc20Balance(w.address, sym, w.network);
            balances[sym] = parseFloat(bal);
          } catch { /* token non déployé sur ce réseau — ignoré */ }
        }));
        setWatchBalances(prev => ({ ...prev, [w.id]: balances }));
      } catch (err) {
        console.warn(`refreshWatchAddressBalances(${w.address}) failed`, err.message);
      }
    }));
  }, [watchAddresses]);

  useEffect(() => {
    if (watchAddressesLoaded) refreshWatchAddressBalances();
    // Se redéclenche seulement quand la liste change (ajout/suppression), pas
    // sur watchBalances lui-même (sinon boucle infinie).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchAddressesLoaded, watchAddresses.length]);

  const addWatchAddress = useCallback(() => {
    const addr = (watchAddrInput || '').trim();
    setWatchAddrError(null);
    if (!ethers.utils.isAddress(addr)) {
      setWatchAddrError('Adresse invalide — vérifie le format (0x...).');
      return;
    }
    if (watchAddresses.some(w => w.address.toLowerCase() === addr.toLowerCase() && w.network === watchNetworkInput)) {
      setWatchAddrError('Cette adresse est déjà en observation sur ce réseau.');
      return;
    }
    setWatchAddrLoading(true);
    const entry = {
      id: genAccountId(),
      label: (watchLabelInput || '').trim() || `${addr.slice(0, 6)}…${addr.slice(-4)}`,
      address: addr,
      network: watchNetworkInput,
      createdAt: Date.now(),
    };
    setWatchAddresses(prev => [...prev, entry]);
    setWatchAddrLoading(false);
    setShowAddWatchAddress(false);
    setWatchAddrInput('');
    setWatchLabelInput('');
    setWatchNetworkInput('ethereum');
    showToast('✓ Adresse ajoutée en observation', 'success');
  }, [watchAddrInput, watchLabelInput, watchNetworkInput, watchAddresses, showToast]);

  const removeWatchAddress = useCallback((id) => {
    setWatchAddresses(prev => prev.filter(w => w.id !== id));
    setWatchBalances(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
      const body = `${a.symbol} a ${a.direction === 'above' ? 'dépassé' : 'chuté sous'} ${fmt(a.targetPrice)}.`;
      showAlert('🔔 Alerte de prix', body);
      // Notification locale en plus de l'Alert (invisible si l'app est en
      // arrière-plan) — même limite que les fonds reçus ci-dessus : marche
      // tant que l'app tourne (même en arrière-plan), pas app totalement fermée.
      if (Platform.OS !== 'web') {
        Notifications.scheduleNotificationAsync({ content: { title: '🔔 Alerte de prix', body }, trigger: null }).catch(() => {});
      }
    });
    setPriceAlerts(prev => prev.filter(a => !triggered.some(t => t.id === a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se déclenche sur
    // les prix, pas sur `fmt`/`showAlert` (stables) ni `priceAlerts` lui-même
    // (mis à jour à l'intérieur, dépendre de lui reboucleraît inutilement).
  }, [tokens, marketCoins, priceAlertsLoaded, vibrationEnabled]);

  const handleQrScanned = useCallback(({ data }) => {
    if (!data) return;
    const trimmed = data.trim();
    if (trimmed.startsWith('wc:')) {
      // QR WalletConnect (bouton "Connecter" d'une dApp) — traité comme si
      // l'utilisateur l'avait collé dans l'écran WalletConnect.
      setShowQrScanner(false);
      handleWcConnect(trimmed);
      return;
    }
    // Gère une adresse brute 0x... ou un URI "ethereum:0x...".
    const match = trimmed.match(/0x[a-fA-F0-9]{40}/);
    if (match) {
      setSendAddress(match[0]);
      setShowQrScanner(false);
    } else {
      showToast('QR non reconnu', 'error');
    }
  }, [showToast, handleWcConnect]);

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
    setIsDuressMode(false);
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

  // Lien direct vers un document légal (?legal=privacy|cgu|mentions) — sans
  // ça, ces pages n'étaient accessibles qu'en popup depuis Paramètres,
  // aucune URL stable à donner à un tiers (ex. formulaire KYB MoonPay) qui a
  // besoin de visiter le lien sans passer par l'app.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const doc = new URLSearchParams(window.location.search).get('legal');
    if (doc === 'privacy' || doc === 'cgu' || doc === 'mentions') setLegalDoc(doc);
  }, []);

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
          <ActivityIndicator color={T.gold} />
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

  // Variation du solde sur la période choisie (24h/7j/30j) — même calcul
  // que todayChange mais avec le champ de variation correspondant. 24h reste
  // le champ dédié historique (todayChange), les deux autres réutilisent ce
  // même principe avec change7d/change30d (ajoutés au backend pour ça).
  const periodChangeField = { '24h': 'change24h', '7d': 'change7d', '30d': 'change30d' }[balancePeriod] || 'change24h';
  const periodChange = useMemo(() =>
    balancePeriod === '24h' ? todayChange : Object.values(tokens).reduce((total, t) => {
      const val = (t.balance || 0) * (t.price || 0);
      return total + val * ((t[periodChangeField] || 0) / 100);
    }, 0),
  [tokens, chartTick, balancePeriod, periodChangeField, todayChange]);

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

  // "Mes Tokens" trié par usage réel (nb d'envois) plutôt qu'un ordre fixe --
  // Array.prototype.sort est stable (ES2019+), les ex-aequo (jamais envoyés)
  // gardent leur ordre d'origine.
  const sortedTokenEntries = useMemo(() =>
    Object.entries(tokens).sort(([symA], [symB]) => (tokenUsage[symB] || 0) - (tokenUsage[symA] || 0)),
  [tokens, tokenUsage]);

  // "Masquer les soldes à zéro" (voir réglage hideZeroBalances) : ne cache
  // QUE l'affichage de l'accueil, jamais les autres écrans (Envoyer/Swap/
  // Acheter continuent de proposer tous les tokens configurés).
  const visibleTokenEntries = useMemo(() =>
    hideZeroBalances ? sortedTokenEntries.filter(([, t]) => (t.balance || 0) * (t.price || 0) >= 0.01) : sortedTokenEntries,
  [sortedTokenEntries, hideZeroBalances]);

  // Token détenu (solde > 0) dont le prix bouge le plus aujourd'hui, dans un
  // sens ou l'autre -- ignoré sous 1% pour ne pas polluer l'accueil avec du
  // bruit sans intérêt.
  const dailyMover = useMemo(() => {
    const entries = Object.entries(tokens).filter(([, t]) => (t.balance || 0) > 0 && typeof t.change24h === 'number');
    if (!entries.length) return null;
    entries.sort((a, b) => Math.abs(b[1].change24h) - Math.abs(a[1].change24h));
    const [sym, t] = entries[0];
    return Math.abs(t.change24h) >= 1 ? { sym, change: t.change24h } : null;
  }, [tokens]);

  const repeatLastSend = useCallback(() => {
    if (!lastSend) return;
    setSendToken(lastSend.token);
    setSendAddress(lastSend.address);
    setSendAmount(lastSend.amount);
    setShowSend(true);
  }, [lastSend]);

  const toggleQuickAction = useCallback((id) => {
    setHiddenQuickActions(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      saveHiddenQuickActions(next);
      return next;
    });
  }, []);

  // "Marché" retiré : redondant depuis que c'est un onglet principal. Le
  // raccourci "Répéter" n'apparaît que si un dernier envoi existe sur ce
  // même réseau (adresse/montant/token n'ont de sens que dans ce contexte).
  const QUICK_ACTIONS_BASE = [
    { id: 'send',    icon: '↑',  label: t('action_send'),    bg: T.card2, onPress: () => setShowSend(true) },
    { id: 'buy',     icon: '💳', label: t('action_buy'),     bg: T.gold, onPress: () => setShowBuy(true) },
    { id: 'sell',    icon: '💰', label: 'Vendre',            bg: T.card2, onPress: () => setShowSell(true) },
    { id: 'receive', icon: '+',  label: t('action_receive'), bg: T.card2, onPress: () => setShowReceive(true) },
    { id: 'history', icon: '🕐', label: t('home_activity'),  bg: T.card2, onPress: () => setShowHistory(true) },
    { id: 'nft',     icon: '🖼️', label: 'NFT',               bg: T.card2, onPress: () => openNftGallery() },
  ];
  const visibleQuickActions = [
    ...QUICK_ACTIONS_BASE.filter(a => !hiddenQuickActions.includes(a.id)),
    ...(lastSend && lastSend.network === network ? [{ id: 'repeat', icon: '🔁', label: 'Répéter', bg: T.card2, onPress: repeatLastSend }] : []),
  ];

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
      const isSolanaBuy = buyToken === 'SOL';
      const isBitcoinBuy = buyToken === 'BTC';
      const buyNetwork = isSolanaBuy ? 'solana' : isBitcoinBuy ? 'bitcoin' : network;
      const buyWalletAddress = isSolanaBuy ? solanaAddr : isBitcoinBuy ? bitcoinAddr : walletAddr;
      const res = await axios.post(`${API_BASE}/payments/create-checkout-session`, {
        amountUsd: Number(buyAmount),
        tokenSymbol: buyToken,
        network: buyNetwork,
        walletAddress: buyWalletAddress,
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

  // ── VENTE (off-ramp MoonPay) ── même principe que l'achat, sens inverse :
  // le widget MoonPay affiche une adresse de dépôt, l'utilisateur y envoie
  // lui-même ses fonds depuis ce wallet (aucune clé privée transmise au
  // backend — cohérent avec l'architecture non-custodiale du reste de l'app).
  const handleSellNow = async () => {
    if (!sellAmount || isNaN(Number(sellAmount)) || Number(sellAmount) <= 0) {
      showAlert('Montant invalide', `Entre un montant en ${sellToken}.`);
      return;
    }
    setSellLoading(true);
    try {
      const isSolanaSell = sellToken === 'SOL';
      const isBitcoinSell = sellToken === 'BTC';
      const sellNetwork = isSolanaSell ? 'solana' : isBitcoinSell ? 'bitcoin' : network;
      const sellWalletAddress = isSolanaSell ? solanaAddr : isBitcoinSell ? bitcoinAddr : walletAddr;
      const res = await axios.post(`${API_BASE}/payments/create-sell-session`, {
        amountCrypto: Number(sellAmount),
        tokenSymbol: sellToken,
        network: sellNetwork,
        walletAddress: sellWalletAddress,
        returnUrl: Platform.OS === 'web' ? window.location.origin : `exp://${HOST_OVERRIDE}:8087`,
      }, { timeout: 20000, headers: API_HEADERS });

      if (!res.data?.success || !res.data.url) {
        throw new Error(res.data?.error || 'Impossible de créer la session de vente.');
      }

      setShowSell(false);
      if (Platform.OS === 'web') {
        window.location.href = res.data.url;
      } else {
        await Linking.openURL(res.data.url);
      }
    } catch (err) {
      showAlert('Erreur', err.message || 'Impossible de lancer la vente.');
    } finally {
      setSellLoading(false);
    }
  };

  const handleSaveRecurringBuy = async () => {
    const amountUsd = Number(recurringAmount);
    if (recurringEnabled && (!amountUsd || isNaN(amountUsd) || amountUsd <= 0)) {
      showAlert('Montant invalide', 'Entre un montant en USD.');
      return;
    }
    setRecurringSaving(true);
    try {
      const config = { enabled: recurringEnabled, amountUsd, token: recurringToken, frequency: recurringFrequency };
      await recurringBuy.saveConfig(config);
      if (!recurringEnabled) {
        await recurringBuy.cancelReminder();
        showToast('Achat récurrent désactivé', 'success');
      } else if (Platform.OS === 'web') {
        showToast('✓ Préférences enregistrées (rappel disponible sur mobile)', 'success');
      } else {
        const id = await recurringBuy.scheduleReminder(config);
        if (!id) {
          showAlert('Notifications désactivées', "Autorise les notifications pour NexiaWallet dans les réglages du téléphone pour recevoir le rappel d'achat.");
        } else {
          showToast('✓ Rappel programmé', 'success');
        }
      }
      setShowRecurringBuy(false);
    } catch (err) {
      showAlert('Erreur', err.message || "Impossible d'enregistrer l'achat récurrent.");
    } finally {
      setRecurringSaving(false);
    }
  };

  const BRIDGE_NETWORKS = ['ethereum', 'arbitrum', 'optimism', 'base'];

  const handleGetBridgeQuote = async () => {
    if (!bridgeAmount || isNaN(Number(bridgeAmount)) || Number(bridgeAmount) <= 0) {
      showAlert('Montant invalide', 'Entre un montant en ETH.');
      return;
    }
    setBridgeQuoteLoading(true);
    setBridgeError(null);
    setBridgeQuote(null);
    try {
      const amountWei = ethers.utils.parseEther(bridgeAmount).toString();
      const quote = await bridge.getBridgeQuote({
        fromNetwork: bridgeFromNetwork,
        toNetwork: bridgeToNetwork,
        fromAddress: walletAddr,
        amountWei,
      });
      setBridgeQuote(quote);
    } catch (err) {
      setBridgeError(err.response?.data?.message || err.message || 'Impossible de récupérer une route de pont.');
    } finally {
      setBridgeQuoteLoading(false);
    }
  };

  const handleExecuteBridge = async () => {
    if (!bridgeQuote || !unlockedPrivateKey) return;
    setBridgeExecuting(true);
    setBridgeError(null);
    try {
      const tx = bridgeQuote.transactionRequest;
      const { rawTx } = await localWallet.signRawTx({
        privateKey: unlockedPrivateKey,
        to: tx.to,
        data: tx.data,
        value: ethers.BigNumber.from(tx.value || '0x0').toString(),
        gasLimit: ethers.BigNumber.from(tx.gasLimit || '0x0').toString(),
        network: bridgeFromNetwork,
      });
      const resp = await axios.post(`${API_BASE}/tx/broadcast`, { rawTx, network: bridgeFromNetwork }, { timeout: 25000, headers: API_HEADERS });
      if (!resp.data?.success) throw new Error(resp.data?.error || 'Échec de la diffusion.');
      showAlert('✅ Pont envoyé', `Ta transaction de pont a été diffusée.\nHash: ${resp.data.txHash?.slice(0, 10)}...\nL'arrivée sur ${bridgeToNetwork} peut prendre quelques minutes.`, [{ text: 'OK' }]);
      setShowBridge(false);
      setBridgeQuote(null);
      setBridgeAmount('');
    } catch (err) {
      setBridgeError(err.message || 'Impossible de finaliser le pont.');
    } finally {
      setBridgeExecuting(false);
    }
  };

  // Résolution ENS ("pablo.eth" -> 0x...) — le registre ENS ne vit que sur
  // Ethereum mainnet, quel que soit le réseau actif d'envoi (BSC/Polygon/L2),
  // donc toujours interroger localWallet.getProvider('ethereum'), jamais
  // `network`. Dès la résolution réussie, remplace directement le champ par
  // l'adresse 0x résolue : tout le reste du flux d'envoi (vérification anti
  // address-poisoning, écran de confirmation, signature) travaille alors
  // sur une adresse 0x normale sans rien à changer ailleurs.
  useEffect(() => {
    if (!/\.eth$/i.test((sendAddress || '').trim())) { setEnsError(null); return; }
    const name = sendAddress.trim();
    let cancelled = false;
    setEnsResolving(true);
    setEnsError(null);
    const timer = setTimeout(() => {
      localWallet.getProvider('ethereum').resolveName(name)
        .then((resolved) => {
          if (cancelled) return;
          if (resolved) {
            setSendAddress(resolved);
            showToast(`✓ ${name} → ${resolved.slice(0, 6)}…${resolved.slice(-4)}`, 'success');
          } else {
            setEnsError(`Aucune adresse trouvée pour ${name}.`);
          }
        })
        .catch(() => { if (!cancelled) setEnsError(`Impossible de résoudre ${name}.`); })
        .finally(() => { if (!cancelled) setEnsResolving(false); });
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sendAddress, showToast]);

  // ── ENVOI SÉCURISÉ (Validation sur réseau réel) ──
  // Étape 1 : valide et bascule vers l'écran "relis avant d'envoyer" — rien
  // n'est signé ni diffusé ici, juste une estimation des frais pour que
  // l'utilisateur voie tout (adresse, montant, frais) avant de confirmer.
  const prepareSend = async () => {
    if (!sendAddress || !sendAmount) { showAlert('Champs manquants', 'Renseigne une adresse de destination et un montant.'); return; }

    const amt = parseFloat(sendAmount);
    if (isNaN(amt) || amt <= 0) { showAlert('Montant invalide'); return; }

    // Solana — adresse base58 (rien à voir avec le format 0x), pas d'estimation
    // de frais EVM (frais Solana quasi fixes, ~0.000005 SOL par signature).
    if (sendToken === 'SOL') {
      if (!localWallet.isValidSolanaAddress(sendAddress)) {
        showAlert('Adresse invalide', "Ce n'est pas une adresse Solana valide.");
        return;
      }
      const solBal = parseFloat(solanaBalance || '0');
      if (amt > solBal) { showAlert('Solde insuffisant', `Tu as ${solBal.toFixed(6)} SOL`); return; }
      setSendStep('confirm');
      setSendFeeEstimate({ feeNative: '0.000005', nativeSymbol: 'SOL', approximate: true, tiers: null });
      setSendFeeLoading(false);
      return;
    }

    // Bitcoin — adresse bc1/1/3 (rien à voir avec le format 0x), frais
    // calculés au moment de signer (dépend des UTXOs sélectionnés — voir
    // signBitcoinTransferTx dans lib/wallet.js), donc juste un ordre de
    // grandeur affiché ici.
    if (sendToken === 'BTC') {
      if (!localWallet.isValidBitcoinAddress(sendAddress)) {
        showAlert('Adresse invalide', "Ce n'est pas une adresse Bitcoin valide.");
        return;
      }
      const btcBal = parseFloat(bitcoinBalance || '0');
      if (amt > btcBal) { showAlert('Solde insuffisant', `Tu as ${btcBal.toFixed(8)} BTC`); return; }
      setSendStep('confirm');
      setSendFeeEstimate({ feeNative: '0.00005', nativeSymbol: 'BTC', approximate: true, tiers: null });
      setSendFeeLoading(false);
      return;
    }

    if (!sendAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      showAlert('Adresse invalide', 'Doit commencer par 0x et contenir 40 caractères hexadécimaux.');
      return;
    }

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
    if (sendToken === 'SOL') {
      setSendLoading(true);
      try {
        const { rawTx } = await localWallet.signSolanaTransferTx({ mnemonic: unlockedMnemonic, to: sendAddress, amountSol: sendAmount });
        const response = await axios.post(`${API_BASE}/tx/broadcast-solana`, { rawTx }, { timeout: 25000, headers: API_HEADERS });
        if (!response.data?.success) throw new Error(response.data?.error || 'Échec du transfert');

        const txHash = response.data.txHash;
        playTone('success');
        showAlert(
          '✅ Transaction Soumise!',
          `SOL envoyé avec succès !\nHash: ${txHash?.slice(0, 10)}...\nRéseau: Solana`,
          [
            { text: 'Copier Hash', onPress: () => copyToClipboard(txHash, 'Hash copié'), style: 'default' },
            { text: 'OK' }
          ]
        );
        addRecentAddress(sendAddress);
        const sendRecord = { address: sendAddress, token: 'SOL', amount: sendAmount, network: 'solana' };
        setLastSend(sendRecord);
        saveLastSend(sendRecord);
        setTokenUsage(prev => {
          const next = { ...prev, SOL: (prev.SOL || 0) + 1 };
          saveTokenUsage(next);
          return next;
        });
        await refreshSolanaBalance();
        setShowSend(false);
        setSendStep('form');
        setSendAddress('');
        setSendAmount('');
        setSendFeeEstimate(null);
      } catch (e) {
        playTone('error');
        showAlert('❌ Erreur', e.message || 'Transaction échouée');
      }
      setSendLoading(false);
      return;
    }

    if (sendToken === 'BTC') {
      setSendLoading(true);
      try {
        const { rawTx } = await localWallet.signBitcoinTransferTx({ mnemonic: unlockedMnemonic, to: sendAddress, amountBtc: sendAmount });
        const response = await axios.post(`${API_BASE}/tx/broadcast-bitcoin`, { rawTx }, { timeout: 25000, headers: API_HEADERS });
        if (!response.data?.success) throw new Error(response.data?.error || 'Échec du transfert');

        const txHash = response.data.txHash;
        playTone('success');
        showAlert(
          '✅ Transaction Soumise!',
          `BTC envoyé avec succès !\nHash: ${txHash?.slice(0, 10)}...\nRéseau: Bitcoin`,
          [
            { text: 'Copier Hash', onPress: () => copyToClipboard(txHash, 'Hash copié'), style: 'default' },
            { text: 'OK' }
          ]
        );
        addRecentAddress(sendAddress);
        const sendRecord = { address: sendAddress, token: 'BTC', amount: sendAmount, network: 'bitcoin' };
        setLastSend(sendRecord);
        saveLastSend(sendRecord);
        setTokenUsage(prev => {
          const next = { ...prev, BTC: (prev.BTC || 0) + 1 };
          saveTokenUsage(next);
          return next;
        });
        await refreshBitcoinBalance();
        setShowSend(false);
        setSendStep('form');
        setSendAddress('');
        setSendAmount('');
        setSendFeeEstimate(null);
      } catch (e) {
        playTone('error');
        showAlert('❌ Erreur', e.message || 'Transaction échouée');
      }
      setSendLoading(false);
      return;
    }

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
      const sendRecord = { address: sendAddress, token: sendToken, amount: sendAmount, network };
      setLastSend(sendRecord);
      saveLastSend(sendRecord);
      setTokenUsage(prev => {
        const next = { ...prev, [sendToken]: (prev[sendToken] || 0) + 1 };
        saveTokenUsage(next);
        return next;
      });
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
        let approveTokenSymbol = swapFrom;
        try { approveTokenSymbol = (await localWallet.getCustomTokenInfo(sellAddress, walletAddr, network)).symbol; } catch { /* garde swapFrom en repli */ }
        approvals.recordApproval(walletAddr, {
          network, tokenAddress: sellAddress, tokenSymbol: approveTokenSymbol, spender,
          amount: ethers.constants.MaxUint256.toString(), isNft: false, txHash: approveResp.data.txHash,
        }).catch(() => {});
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
        <ActivityIndicator color={T.gold} size="large" />
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
      ? t('pin_confirm_title')
      : (pendingWalletForPin?.isMigration
        ? 'Choisis un code pour sécuriser ce wallet'
        : pendingWalletForPin?.isNewAccount
          ? 'Choisis un code PIN pour ce nouveau compte'
          : t('pin_choose_title'));
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
          <ActivityIndicator color={T.gold} style={{ marginTop: 20 }} />
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
        {!!pendingWalletForPin?.isNewAccount && !isVerifyingPin && (
          <TouchableOpacity
            onPress={() => { setPinStage(null); setPendingWalletForPin(null); setPinCode(''); setPendingPinDigits(''); setPinError(null); }}
            style={{ marginTop: 20 }}
          >
            <Text style={{ color: T.text3, fontSize: 13, textAlign: 'center' }}>Annuler</Text>
          </TouchableOpacity>
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
                desc="Wallet non-custodial : NexiaWallet ne détient et ne contrôle jamais tes fonds. Ta phrase de récupération est la seule clé de ton wallet."
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
              <TouchableOpacity style={[st.network_chip, network === 'polygon' && st.network_chip_on]} onPress={() => setNetwork('polygon')}>
                <Text style={[st.network_chip_txt, network === 'polygon' && { color: T.text }]}>Polygon</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.network_chip, network === 'arbitrum' && st.network_chip_on]} onPress={() => setNetwork('arbitrum')}>
                <Text style={[st.network_chip_txt, network === 'arbitrum' && { color: T.text }]}>Arbitrum</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.network_chip, network === 'optimism' && st.network_chip_on]} onPress={() => setNetwork('optimism')}>
                <Text style={[st.network_chip_txt, network === 'optimism' && { color: T.text }]}>Optimism</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.network_chip, network === 'base' && st.network_chip_on]} onPress={() => setNetwork('base')}>
                <Text style={[st.network_chip_txt, network === 'base' && { color: T.text }]}>Base</Text>
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
                <Text style={st.land_cta_btn_primary_txt}>{t('onboarding_create')}</Text>
              </AnimPressable>
              <AnimPressable style={st.land_cta_btn_ghost} onPress={() => { setImportMode(true); setImportError(null); }}>
                <Text style={st.land_cta_btn_ghost_txt}>{t('onboarding_import')}</Text>
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
          <ActivityIndicator color={T.gold} style={{ marginTop: 20 }} />
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
              <Ionicons name={favorites.includes(selectedToken) ? 'star' : 'star-outline'} size={20} color={T.gold} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={st.detail_price_wrap}>
              <Text style={st.detail_price}>{fmt(tk.price, tk.price < 1 ? 6 : 2)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <View style={[st.change_badge, { backgroundColor: positive ? T.upBg : T.downBg }]}>
                  <Text style={{ color: positive ? T.up : T.down, fontWeight: 'bold', fontSize: 13 }}>
                    {positive ? '▲ +' : '▼ '}{Math.abs(tk.change24h || 0).toFixed(2)}% (24h)
                  </Text>
                </View>
                {isLive && (
                  <View style={st.live_badge}>
                    <PulseDot color={T.gold} size={7} />
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
                    <Text style={[st.tf_txt, detailTf === tf && { color: T.gold }]}>{tf}</Text>
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
                ...(selectedToken === 'SOL' ? [{ icon: '🌱', label: 'Staker', onPress: () => { setSelectedToken(null); openStaking(); } }] : []),
              ].map(a => (
                <AnimPressable key={a.label} style={st.detail_action_btn} onPress={a.onPress}>
                  <View style={st.detail_action_icon}>
                    <Text style={{ color: T.gold, fontSize: 20 }}>{a.icon}</Text>
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
              <Ionicons name={favorites.includes(sym) ? 'star' : 'star-outline'} size={20} color={T.gold} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }}>
            <View style={st.detail_price_wrap}>
              <Text style={st.detail_price}>{fmt(coin.current_price, coin.current_price < 1 ? 6 : 2)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <View style={[st.change_badge, { backgroundColor: positive ? T.upBg : T.downBg }]}>
                  <Text style={{ color: positive ? T.up : T.down, fontWeight: 'bold', fontSize: 13 }}>
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
          <Text style={st.modal_title}>{sendStep === 'confirm' ? 'Vérifie et confirme' : t('send_title')}</Text>
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
              <View style={st.send_info_box}><ActivityIndicator color={T.gold} /></View>
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
              <Text style={{ color: T.orange, fontSize: 12, fontWeight: 'bold' }}>
                ⛓️ {{ SOL: 'SOLANA', BTC: 'BITCOIN' }[sendToken] || activeNetwork.label.toUpperCase()} • SOLDE RÉEL
              </Text>
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

            <Text style={st.form_label}>{{ SOL: 'Adresse Solana', BTC: 'Adresse Bitcoin' }[sendToken] || 'Adresse (0x...)'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput style={[st.form_input, { flex: 1, marginBottom: 0 }]} value={sendAddress} onChangeText={setSendAddress}
                placeholder={{ SOL: 'Adresse Solana (base58)', BTC: 'Adresse Bitcoin (bc1...)' }[sendToken] || '0x123...abc ou nom.eth'} placeholderTextColor={T.text3} autoCapitalize="none" />
              {Platform.OS === 'web' && (
                <TouchableOpacity style={st.addr_action_btn} onPress={pasteAddressFromClipboard} accessibilityRole="button" accessibilityLabel="Coller l'adresse depuis le presse-papier">
                  <Text style={{ fontSize: 18 }}>📋</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={st.addr_action_btn} onPress={() => setShowQrScanner(true)} accessibilityRole="button" accessibilityLabel="Scanner un QR code">
                <Text style={{ fontSize: 18 }}>📷</Text>
              </TouchableOpacity>
            </View>
            {ensResolving && <Text style={[st.settings_row_sub, { marginTop: 6 }]}>Résolution ENS…</Text>}
            {!!ensError && <Text style={[st.auth_error, { marginTop: 6 }]}>{ensError}</Text>}
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

            {!!sendAddress && sendAddress.length === 42 && (() => {
              const poisonedMatch = looksLikePoisonedAddress(sendAddress, recentAddresses.map(a => a.address));
              if (poisonedMatch) {
                return (
                  <View style={[st.warning_box, { marginTop: 12, borderColor: T.red }]}>
                    <Text style={st.warning_txt}>
                      🚨 Cette adresse ressemble énormément à une adresse déjà connue ({poisonedMatch.slice(0, 8)}…{poisonedMatch.slice(-6)})
                      mais N'EST PAS la même. C'est la technique de "l'adresse piégée" (address poisoning) : vérifie
                      caractère par caractère avant d'envoyer, ou copie l'adresse depuis une source sûre.
                    </Text>
                  </View>
                );
              }
              if (!recentAddresses.some(a => a.address.toLowerCase() === sendAddress.toLowerCase())) {
                return (
                  <View style={[st.warning_box, { marginTop: 12 }]}>
                    <Text style={st.warning_txt}>
                      🆕 Nouvelle adresse — tu ne lui as jamais envoyé de fonds ici. Vérifie-la bien avant de continuer.
                    </Text>
                  </View>
                );
              }
              return null;
            })()}

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
    const isSolana = receiveChain === 'solana';
    const isBitcoin = receiveChain === 'bitcoin';
    const isEvm = !isSolana && !isBitcoin;
    const displayAddr = isSolana ? solanaAddr : isBitcoin ? bitcoinAddr : walletAddr;
    const amt = parseFloat(receiveAmount);
    let qrValue = displayAddr;
    let paymentUri = null;
    if (isEvm && walletAddr && amt > 0) {
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
          <Text style={st.modal_title}>{t('receive_title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center', padding: 24 }}>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <TouchableOpacity style={[st.chain_tab_sm, isEvm && st.chain_tab_sm_on]} onPress={() => setReceiveChain('evm')}>
              <Text style={[st.chain_tab_sm_txt, isEvm && st.chain_tab_sm_txt_on]}>EVM (ETH/BNB/MATIC/USDT/USDC)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.chain_tab_sm, isSolana && st.chain_tab_sm_on]} onPress={() => setReceiveChain('solana')}>
              <Text style={[st.chain_tab_sm_txt, isSolana && st.chain_tab_sm_txt_on]}>Solana (SOL)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.chain_tab_sm, isBitcoin && st.chain_tab_sm_on]} onPress={() => setReceiveChain('bitcoin')}>
              <Text style={[st.chain_tab_sm_txt, isBitcoin && st.chain_tab_sm_txt_on]}>Bitcoin (BTC)</Text>
            </TouchableOpacity>
          </View>
          <View style={st.network_badge}>
            <Text style={{ color: T.blue, fontSize: 11 }}>
              {isSolana ? 'Réseau Solana • adresse distincte de ton adresse EVM'
                : isBitcoin ? 'Réseau Bitcoin • adresse distincte de ton adresse EVM'
                : 'EVM Compatible • Ethereum, Polygon, BNB…'}
            </Text>
          </View>
          <View style={st.qr_wrap}><QRCodeMock address={qrValue} /></View>
          <Text style={st.receive_title}>Adresse Publique</Text>
          <View style={st.receive_addr_box}>
            <Text style={st.receive_addr} selectable>{displayAddr}</Text>
          </View>
          <AnimPressable style={st.green_btn} onPress={() => copyToClipboard(displayAddr, 'Adresse copiée')}>
            <Text style={st.green_btn_txt}>📋 Copier</Text>
          </AnimPressable>

          {isEvm && (
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
          )}

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.market_filter_row}>
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
              <ActivityIndicator color={T.gold} size="large" />
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
                  <View style={[st.history_icon, { backgroundColor: isOut ? T.downBg : T.upBg }]}>
                    <Text style={{ fontSize: 18, color: isOut ? T.down : T.up }}>{isOut ? '↑' : '↓'}</Text>
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
                  <Text style={[st.history_amount, { color: item.failed ? T.text3 : (isOut ? T.down : T.up) }]}>
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
  const renderStatsTab = () => {
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
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        contentContainerStyle={isWideWeb ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : undefined}
        refreshControl={
          <RefreshControl refreshing={historyLoading} onRefresh={fetchHistory} tintColor={T.gold} />
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Ionicons name="stats-chart" size={20} color={T.text} />
          <Text style={[st.tab_title, { marginBottom: 0 }]}>Mes stats</Text>
        </View>

        {!!memberSince && (
          <View style={st.stats_card}>
            <Text style={st.stats_card_lbl}>Wallet créé le</Text>
            <Text style={st.stats_card_val}>{memberSince}</Text>
          </View>
        )}

        {historyLoading && !items.length ? (
          <View style={{ alignItems: 'center', marginTop: 30 }}><ActivityIndicator color={T.gold} /></View>
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
        <View style={{ height: 40 }} />
      </ScrollView>
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
            <TouchableOpacity
              onPress={() => { setLegalDoc(null); if (legalDocFromSettings) { setShowSettings(true); setLegalDocFromSettings(false); } }}
              style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour"
            >
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
  const renderWalletConnect = () => (
    <Modal visible={showWalletConnect} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowWalletConnect(false); setWcError(null); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>{t('settings_connect_dapp')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>
            Sur le site ou l'appli de la dApp (Uniswap, OpenSea...), choisis « WalletConnect » puis copie le lien (commence par « wc: ») ou scanne le QR code affiché.
          </Text>
          <TextInput
            style={[st.form_input, { marginBottom: 10, minHeight: 70 }]}
            value={wcUri}
            onChangeText={setWcUri}
            placeholder="wc:..."
            placeholderTextColor={T.text3}
            autoCapitalize="none"
            multiline
          />
          {!!wcError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{wcError}</Text>}
          <AnimPressable
            style={[st.green_btn, { opacity: wcConnecting ? 0.7 : 1, marginBottom: 10 }]}
            disabled={wcConnecting}
            onPress={() => handleWcConnect()}
          >
            {wcConnecting ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Connecter</Text>}
          </AnimPressable>
          <AnimPressable
            style={st.settings_row}
            onPress={() => { setShowWalletConnect(false); setShowQrScanner(true); }}
          >
            <Text style={{ fontSize: 22 }}>📷</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Scanner un QR code</Text>
              <Text style={st.settings_row_sub}>Utilise la caméra</Text>
            </View>
          </AnimPressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderWcProposal = () => {
    const meta = wcProposal?.params?.proposer?.metadata || {};
    return (
      <Modal visible={!!wcProposal} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <View style={{ width: 40 }} />
            <Text style={st.modal_title}>Demande de connexion</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ alignItems: 'center' }}>
            {meta.icons?.[0] ? (
              <Image source={{ uri: meta.icons[0] }} style={{ width: 64, height: 64, borderRadius: 14, marginTop: 20, marginBottom: 16 }} />
            ) : (
              <Text style={{ fontSize: 48, marginTop: 20, marginBottom: 16 }}>🔗</Text>
            )}
            <Text style={[st.settings_row_title, { fontSize: 18, textAlign: 'center' }]}>{meta.name || 'Une dApp'}</Text>
            <Text style={[st.settings_row_sub, { textAlign: 'center', marginBottom: 20 }]}>{meta.url}</Text>
            <View style={[st.warning_box, { width: '100%' }]}>
              <Text style={st.warning_txt}>
                Cette dApp va pouvoir te demander de signer des messages et des transactions sur Ethereum, BNB Smart Chain et Polygon avec l'adresse {walletAddr.slice(0, 6)}…{walletAddr.slice(-4)}. Rien n'est signé sans ta confirmation explicite à chaque demande.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', width: '100%', marginTop: 24 }}>
              <TouchableOpacity style={[st.settings_row, { flex: 1, justifyContent: 'center', marginRight: 8 }]} onPress={handleWcRejectProposal}>
                <Text style={{ color: T.red, fontWeight: '700' }}>Refuser</Text>
              </TouchableOpacity>
              <AnimPressable style={[st.green_btn, { flex: 1 }]} onPress={handleWcApproveProposal}>
                <Text style={st.green_btn_txt}>Connecter</Text>
              </AnimPressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderWcRequest = () => {
    const method = wcRequest?.params?.request?.method;
    const chainId = wcRequest?.params?.chainId;
    const network = walletConnect.SUPPORTED_EVM_CHAINS[chainId] || 'ethereum';
    const reqParams = wcRequest?.params?.request?.params || [];

    let title = 'Demande de signature';
    let detail = null;
    if (method === 'personal_sign' || method === 'eth_sign') {
      const hex = method === 'personal_sign' ? reqParams[0] : reqParams[1];
      let text = hex;
      try { text = ethers.utils.toUtf8String(hex); } catch { /* reste en hex si pas de l'UTF-8 valide */ }
      detail = <Text style={{ color: T.text, fontSize: 14 }}>{text}</Text>;
    } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
      title = 'Signature de données typées';
      const raw = reqParams[1];
      detail = <Text style={{ color: T.text3, fontSize: 12 }} numberOfLines={8}>{typeof raw === 'string' ? raw : JSON.stringify(raw)}</Text>;
    } else if (method === 'eth_sendTransaction') {
      title = 'Demande de transaction';
      const tx = reqParams[0] || {};
      detail = (
        <View style={{ width: '100%' }}>
          <Text style={st.settings_row_sub}>Vers</Text>
          <Text style={{ color: T.text, marginBottom: 10 }}>{tx.to}</Text>
          <Text style={st.settings_row_sub}>Montant</Text>
          <Text style={{ color: T.text, marginBottom: 10 }}>
            {tx.value ? ethers.utils.formatEther(tx.value) : '0'} {localWallet.getNetworkConfig(network).nativeSymbol}
          </Text>
          {!!tx.data && tx.data !== '0x' && (
            <>
              <Text style={st.settings_row_sub}>Données</Text>
              <Text style={{ color: T.text3, fontSize: 11 }} numberOfLines={3}>{tx.data}</Text>
            </>
          )}
        </View>
      );
    }

    return (
      <Modal visible={!!wcRequest} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <View style={{ width: 40 }} />
            <Text style={st.modal_title}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={[st.settings_row_sub, { marginBottom: 10 }]}>Réseau : {network}</Text>
            <View style={st.alert_form}>{detail}</View>
            {method === 'eth_sendTransaction' && !wcSimResult && (
              <Text style={[st.settings_row_sub, { marginTop: 10 }]}>⏳ Vérification de la transaction…</Text>
            )}
            {!!wcSimResult?.warnings?.length && (
              <View style={[st.warning_box, { marginTop: 10, borderColor: wcSimResult.risk === 'high' ? T.red : T.gold }]}>
                {wcSimResult.warnings.map((w, i) => (
                  <Text key={i} style={[st.warning_txt, i > 0 && { marginTop: 6 }]}>⚠️ {w}</Text>
                ))}
              </View>
            )}
            {!!wcRequestError && <Text style={[st.auth_error, { marginTop: 10 }]}>{wcRequestError}</Text>}
            <View style={{ flexDirection: 'row', marginTop: 24 }}>
              <TouchableOpacity style={[st.settings_row, { flex: 1, justifyContent: 'center', marginRight: 8 }]} onPress={handleWcRejectRequest} disabled={wcRequestLoading}>
                <Text style={{ color: T.red, fontWeight: '700' }}>Refuser</Text>
              </TouchableOpacity>
              <AnimPressable style={[st.green_btn, { flex: 1, opacity: wcRequestLoading ? 0.7 : 1 }]} onPress={handleWcApproveRequest} disabled={wcRequestLoading}>
                {wcRequestLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Signer</Text>}
              </AnimPressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const DAPP_SHORTCUTS = [
    { name: 'Uniswap', url: 'https://app.uniswap.org' },
    { name: 'OpenSea', url: 'https://opensea.io' },
    { name: 'PancakeSwap', url: 'https://pancakeswap.finance' },
  ];

  // Navigateur dApp intégré — natif uniquement (react-native-webview n'a pas
  // d'implémentation web, voir l'import de WebView tout en haut du fichier).
  const renderDappBrowser = () => (
    <Modal visible={showDappBrowser} animationType="slide" onRequestClose={() => setShowDappBrowser(false)}>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide, { flex: 1 }]}>
        {Platform.OS === 'web' ? (
          <>
            <View style={st.modal_hdr}>
              <TouchableOpacity onPress={() => { setShowDappBrowser(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
                <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
              </TouchableOpacity>
              <Text style={st.modal_title}>Navigateur Web3</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <Text style={{ color: T.text2, fontSize: 14, textAlign: 'center' }}>
                Le navigateur dApp n'est disponible que dans l'app mobile NexiaWallet (pas sur le web).
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={st.modal_hdr}>
              <TouchableOpacity
                onPress={() => {
                  if (dappCurrentUrl) { setDappCurrentUrl(null); return; }
                  setShowDappBrowser(false);
                  setShowSettings(true);
                }}
                style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour"
              >
                <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
              </TouchableOpacity>
              <Text style={st.modal_title} numberOfLines={1}>Navigateur Web3</Text>
              <View style={{ width: 40 }} />
            </View>

            {!dappCurrentUrl ? (
              <ScrollView style={{ flex: 1, padding: 16 }}>
                <Text style={{ color: T.text2, fontSize: 13, marginBottom: 12, lineHeight: 19 }}>
                  Colle l'adresse d'une dApp (Uniswap, OpenSea...) ou choisis un raccourci ci-dessous. Ton adresse n'est
                  partagée qu'après ta confirmation explicite, et chaque signature/transaction te sera toujours demandée.
                </Text>
                <TextInput
                  style={st.form_input}
                  placeholder="app.uniswap.org"
                  placeholderTextColor={T.text3}
                  value={dappUrlInput}
                  onChangeText={setDappUrlInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onSubmitEditing={() => handleDappBrowserOpen(dappUrlInput)}
                />
                <AnimPressable style={[st.green_btn, { marginTop: 12 }]} onPress={() => handleDappBrowserOpen(dappUrlInput)}>
                  <Text style={st.green_btn_txt}>Ouvrir</Text>
                </AnimPressable>
                <Text style={[st.settings_row_sub, { marginTop: 24, marginBottom: 10 }]}>Raccourcis</Text>
                {DAPP_SHORTCUTS.map(s => (
                  <TouchableOpacity key={s.url} style={st.settings_row} onPress={() => handleDappBrowserOpen(s.url)}>
                    <Text style={st.settings_row_title}>{s.name}</Text>
                    <Text style={st.settings_row_sub}>{s.url}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <>
                <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                  <Text style={{ color: T.text3, fontSize: 11 }} numberOfLines={1}>{dappCurrentUrl}</Text>
                </View>
                <WebView
                  ref={dappWebViewRef}
                  source={{ uri: dappCurrentUrl }}
                  style={{ flex: 1 }}
                  onMessage={handleDappMessage}
                  onNavigationStateChange={(nav) => { if (nav?.url) setDappUrlInput(nav.url); }}
                  injectedJavaScriptBeforeContentLoaded={buildInjectedProvider({
                    chainId: '0x' + localWallet.getNetworkConfig(network).chainId.toString(16),
                    address: dappConnectedOrigins.length ? walletAddr : null,
                  })}
                  javaScriptEnabled
                  domStorageEnabled
                  originWhitelist={['https://*', 'http://*']}
                />
              </>
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );

  const renderDappBridgeRequest = () => {
    const method = dappBridgeRequest?.method;
    const params = dappBridgeRequest?.params || [];
    const origin = dappBridgeRequest?.origin || '';

    let title = 'Demande de signature';
    let detail = null;
    if (method === 'eth_requestAccounts') {
      title = 'Connexion à cette dApp';
      detail = <Text style={{ color: T.text, fontSize: 14 }}>Autoriser {origin} à voir l'adresse de ton wallet ?</Text>;
    } else if (method === 'wallet_switchEthereumChain') {
      title = 'Changement de réseau';
      const requestedHex = params?.[0]?.chainId;
      const targetNetwork = walletConnect.SUPPORTED_EVM_CHAINS[`eip155:${parseInt(requestedHex, 16)}`];
      detail = <Text style={{ color: T.text, fontSize: 14 }}>{origin} demande à passer sur {targetNetwork || requestedHex}.</Text>;
    } else if (method === 'personal_sign' || method === 'eth_sign') {
      const hex = method === 'personal_sign' ? params[0] : params[1];
      let text = hex;
      try { text = ethers.utils.toUtf8String(hex); } catch { /* reste en hex si pas de l'UTF-8 valide */ }
      detail = <Text style={{ color: T.text, fontSize: 14 }}>{text}</Text>;
    } else if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
      title = 'Signature de données typées';
      const raw = params[1];
      detail = <Text style={{ color: T.text3, fontSize: 12 }} numberOfLines={8}>{typeof raw === 'string' ? raw : JSON.stringify(raw)}</Text>;
    } else if (method === 'eth_sendTransaction') {
      title = 'Demande de transaction';
      const tx = params[0] || {};
      detail = (
        <View style={{ width: '100%' }}>
          <Text style={st.settings_row_sub}>Vers</Text>
          <Text style={{ color: T.text, marginBottom: 10 }}>{tx.to}</Text>
          <Text style={st.settings_row_sub}>Montant</Text>
          <Text style={{ color: T.text, marginBottom: 10 }}>
            {tx.value ? ethers.utils.formatEther(tx.value) : '0'} {localWallet.getNetworkConfig(network).nativeSymbol}
          </Text>
          {!!tx.data && tx.data !== '0x' && (
            <>
              <Text style={st.settings_row_sub}>Données</Text>
              <Text style={{ color: T.text3, fontSize: 11 }} numberOfLines={3}>{tx.data}</Text>
            </>
          )}
        </View>
      );
    }

    return (
      <Modal visible={!!dappBridgeRequest} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <View style={{ width: 40 }} />
            <Text style={st.modal_title}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={[st.settings_row_sub, { marginBottom: 10 }]} numberOfLines={1}>{origin}</Text>
            <View style={st.alert_form}>{detail}</View>
            {method === 'eth_sendTransaction' && !dappSimResult && (
              <Text style={[st.settings_row_sub, { marginTop: 10 }]}>⏳ Vérification de la transaction…</Text>
            )}
            {!!dappSimResult?.warnings?.length && (
              <View style={[st.warning_box, { marginTop: 10, borderColor: dappSimResult.risk === 'high' ? T.red : T.gold }]}>
                {dappSimResult.warnings.map((w, i) => (
                  <Text key={i} style={[st.warning_txt, i > 0 && { marginTop: 6 }]}>⚠️ {w}</Text>
                ))}
              </View>
            )}
            {!!dappBridgeError && <Text style={[st.auth_error, { marginTop: 10 }]}>{dappBridgeError}</Text>}
            <View style={{ flexDirection: 'row', marginTop: 24 }}>
              <TouchableOpacity style={[st.settings_row, { flex: 1, justifyContent: 'center', marginRight: 8 }]} onPress={handleDappBridgeReject} disabled={dappBridgeLoading}>
                <Text style={{ color: T.red, fontWeight: '700' }}>Refuser</Text>
              </TouchableOpacity>
              <AnimPressable style={[st.green_btn, { flex: 1, opacity: dappBridgeLoading ? 0.7 : 1 }]} onPress={handleDappBridgeApprove} disabled={dappBridgeLoading}>
                {dappBridgeLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>{method === 'eth_requestAccounts' ? 'Connecter' : method === 'wallet_switchEthereumChain' ? 'Changer' : 'Signer'}</Text>}
              </AnimPressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderDefiPositions = () => (
    <Modal visible={showDefiPositions} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowDefiPositions(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Positions DeFi</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
            Contrairement au solde de tes tokens (calculé en direct depuis la blockchain), il n'existe pas d'indexeur
            multi-protocoles gratuit et sans clé API pour repérer TOUTES tes positions DeFi automatiquement — cette liste
            ne suit donc pour l'instant que le staking liquide Lido (stETH), vérifié sur le vrai contrat officiel.
          </Text>
          {defiPositionsLoading ? (
            <ActivityIndicator color={T.gold} style={{ marginTop: 20 }} />
          ) : defiPositionsList.length === 0 ? (
            <Text style={st.settings_row_sub}>Aucune position détectée sur ce wallet.</Text>
          ) : (
            defiPositionsList.map((pos) => (
              <View key={pos.id} style={st.settings_row}>
                <Text style={{ fontSize: 22 }}>{pos.icon}</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>{pos.protocol} — {pos.label}</Text>
                  <Text style={st.settings_row_sub}>{parseFloat(pos.balance).toFixed(6)} {pos.symbol}</Text>
                </View>
                <Text style={{ color: T.text, fontWeight: '700' }}>{fmt(parseFloat(pos.balance) * (tokens.ETH?.price || 0))}</Text>
              </View>
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderBridge = () => {
    const feeCosts = bridgeQuote?.estimate?.feeCosts || [];
    const toAmount = bridgeQuote?.estimate?.toAmount;
    return (
      <Modal visible={showBridge} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => { setShowBridge(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Pont cross-chain</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
              Transfère de l'ETH natif entre Ethereum, Arbitrum, Optimism et Base, via l'agrégateur LI.FI. Signature et
              diffusion se font exactement comme un envoi normal — LI.FI ne voit jamais ta clé privée.
            </Text>

            <Text style={st.form_label}>Depuis</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {BRIDGE_NETWORKS.map(net => (
                <TouchableOpacity
                  key={net}
                  style={[st.tok_chip, bridgeFromNetwork === net && st.tok_chip_on]}
                  onPress={() => { setBridgeFromNetwork(net); setBridgeQuote(null); }}
                >
                  <Text style={[st.tok_chip_txt, bridgeFromNetwork === net && { color: T.text }]}>{NETWORK_INFO[net].label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={st.form_label}>Vers</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {BRIDGE_NETWORKS.filter(net => net !== bridgeFromNetwork).map(net => (
                <TouchableOpacity
                  key={net}
                  style={[st.tok_chip, bridgeToNetwork === net && st.tok_chip_on]}
                  onPress={() => { setBridgeToNetwork(net); setBridgeQuote(null); }}
                >
                  <Text style={[st.tok_chip_txt, bridgeToNetwork === net && { color: T.text }]}>{NETWORK_INFO[net].label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={st.form_label}>Montant ETH</Text>
            <TextInput style={st.form_input} value={bridgeAmount} onChangeText={(v) => { setBridgeAmount(v); setBridgeQuote(null); }}
              placeholder="0.01" placeholderTextColor={T.text3} keyboardType="numeric" />

            {!bridgeQuote ? (
              <AnimPressable style={[st.green_btn, { marginTop: 16, opacity: bridgeQuoteLoading ? 0.7 : 1 }]} onPress={handleGetBridgeQuote} disabled={bridgeQuoteLoading}>
                {bridgeQuoteLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Obtenir une route</Text>}
              </AnimPressable>
            ) : (
              <>
                <View style={st.send_info_box}>
                  <Text style={st.send_info_line}>Tu recevras ≈ {toAmount ? ethers.utils.formatEther(toAmount) : '?'} ETH sur {NETWORK_INFO[bridgeToNetwork].label}</Text>
                  <Text style={st.send_info_line}>Route : {bridgeQuote.tool}</Text>
                  {feeCosts.map((f, i) => (
                    <Text key={i} style={st.send_info_line}>{f.name} : {ethers.utils.formatUnits(f.amount, f.token?.decimals || 18)} {f.token?.symbol}</Text>
                  ))}
                </View>
                <AnimPressable style={[st.green_btn, { marginTop: 16, opacity: bridgeExecuting ? 0.7 : 1 }]} onPress={handleExecuteBridge} disabled={bridgeExecuting}>
                  {bridgeExecuting ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Confirmer le pont</Text>}
                </AnimPressable>
              </>
            )}
            {!!bridgeError && <Text style={[st.auth_error, { marginTop: 12 }]}>{bridgeError}</Text>}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderReferral = () => (
    <Modal visible={showReferral} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowReferral(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Programme de parrainage</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 20, lineHeight: 18 }}>
            Partage ton code avec des proches. Il n'y a pas encore de récompense automatique en place — juste un moyen
            simple de leur faire découvrir NexiaWallet, prêt à en recevoir une plus tard.
          </Text>

          <Text style={st.form_label}>Ton code</Text>
          <View style={st.receive_addr_box}>
            <Text style={[st.receive_addr, { textAlign: 'center', letterSpacing: 2 }]} selectable>{referralCode || '—'}</Text>
          </View>

          <AnimPressable style={[st.green_btn, { marginTop: 16 }]} onPress={shareReferralLink} disabled={!referralCode}>
            <Text style={st.green_btn_txt}>📤 Partager mon lien</Text>
          </AnimPressable>
          <AnimPressable
            style={[st.green_btn, { marginTop: 10, backgroundColor: T.card2 }]}
            onPress={() => referralCode && copyToClipboard(`https://nexiawallet.fr?ref=${referralCode}`, 'Lien copié')}
            disabled={!referralCode}
          >
            <Text style={[st.green_btn_txt, { color: T.text }]}>📋 Copier le lien</Text>
          </AnimPressable>

          {!!referredByCode && (
            <View style={[st.send_info_box, { marginTop: 24 }]}>
              <Text style={st.send_info_line}>Tu as installé NexiaWallet via le code {referredByCode}.</Text>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderDuressSetup = () => (
    <Modal visible={showDuressSetup} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowDuressSetup(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Code PIN de détresse</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
            Si quelqu'un te force à déverrouiller ton wallet, tape ce code à la place de ton vrai PIN : l'app s'ouvrira
            normalement mais affichera un solde à zéro, sans jamais révéler ta vraie clé. Choisis un code DIFFÉRENT de
            ton vrai PIN.
          </Text>
          <TextInput
            style={st.form_input}
            value={duressSetupInput}
            onChangeText={(v) => setDuressSetupInput(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="6 chiffres"
            placeholderTextColor={T.text3}
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
          />
          {!!duressSetupError && <Text style={[st.auth_error, { marginTop: 10 }]}>{duressSetupError}</Text>}
          <AnimPressable style={[st.green_btn, { marginTop: 20 }]} onPress={handleSaveDuressPin}>
            <Text style={st.green_btn_txt}>Activer</Text>
          </AnimPressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderRecurringBuy = () => (
    <Modal visible={showRecurringBuy} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowRecurringBuy(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Achat récurrent</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
            MoonPay ne peut pas prélever ta carte automatiquement en arrière-plan (sécurité/conformité). NexiaWallet te
            programme un rappel qui rouvre l'écran Acheter, déjà pré-rempli — tu valides toi-même le paiement à chaque fois.
          </Text>

          <TouchableOpacity
            style={[st.settings_row, recurringEnabled && st.settings_row_on]}
            onPress={() => setRecurringEnabled(v => !v)}
          >
            <Text style={{ fontSize: 20 }}>{recurringEnabled ? '✅' : '⬜'}</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Activer le rappel</Text>
            </View>
          </TouchableOpacity>

          {recurringEnabled && (
            <>
              <Text style={st.form_label}>Token</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
                {[...(BUYABLE_TOKENS[network] || []), ...BUYABLE_TOKENS.solana, ...BUYABLE_TOKENS.bitcoin].map((sym) => {
                  const tk = tokens[sym];
                  if (!tk) return null;
                  return (
                    <TouchableOpacity key={sym} style={[st.tok_chip, recurringToken === sym && st.tok_chip_on]} onPress={() => setRecurringToken(sym)}>
                      <CoinLogo logo={tk.logo} icon={tk.icon} size={24} />
                      <Text style={[st.tok_chip_txt, recurringToken === sym && { color: T.text }]}>{sym}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={st.form_label}>Montant USD</Text>
              <TextInput style={st.form_input} value={recurringAmount} onChangeText={setRecurringAmount}
                placeholder="20" placeholderTextColor={T.text3} keyboardType="numeric" />

              <Text style={[st.form_label, { marginTop: 16 }]}>Fréquence</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[{ id: 'weekly', label: 'Chaque semaine' }, { id: 'monthly', label: 'Chaque mois' }].map(f => (
                  <TouchableOpacity
                    key={f.id}
                    style={[st.import_type_btn, recurringFrequency === f.id && st.import_type_btn_on, { flex: 1 }]}
                    onPress={() => setRecurringFrequency(f.id)}
                  >
                    <Text style={[st.import_type_txt, recurringFrequency === f.id && { color: T.text }]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <AnimPressable style={[st.green_btn, { marginTop: 24, opacity: recurringSaving ? 0.7 : 1 }]} onPress={handleSaveRecurringBuy} disabled={recurringSaving}>
            {recurringSaving ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Enregistrer</Text>}
          </AnimPressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderApprovals = () => {
    const activeApprovals = tokenApprovals.filter(a => !a.revoked);
    return (
      <Modal visible={showApprovals} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => { setShowApprovals(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Autorisations de tokens</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
              Liste des accès que tu as accordés à des contrats (approbations ERC20, accès à tes NFT) via WalletConnect,
              le navigateur intégré ou un échange dans l'app. Une approbation accordée ailleurs, avant d'utiliser
              NexiaWallet, ne peut pas apparaître ici.
            </Text>
            {approvalsLoading ? (
              <ActivityIndicator color={T.gold} style={{ marginTop: 20 }} />
            ) : activeApprovals.length === 0 ? (
              <Text style={st.settings_row_sub}>Aucune autorisation active suivie sur cet appareil.</Text>
            ) : (
              activeApprovals.map((a) => (
                <View key={a.id} style={[st.settings_row, { flexDirection: 'column', alignItems: 'stretch' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20 }}>{a.isNft ? '🖼️' : '🪙'}</Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.settings_row_title}>{a.tokenSymbol} · {a.network}</Text>
                      <Text style={st.settings_row_sub} numberOfLines={1}>Autorise {a.spender}</Text>
                      <Text style={st.settings_row_sub}>
                        {a.isNft
                          ? 'Contrôle de TOUTE la collection'
                          : (a.amount && ethers.BigNumber.from(a.amount).gte(ethers.BigNumber.from(2).pow(200)) ? 'Montant illimité' : `Montant : ${a.amount}`)}
                      </Text>
                    </View>
                  </View>
                  <AnimPressable
                    style={[st.settings_row, { marginTop: 10, justifyContent: 'center', backgroundColor: T.redBg, opacity: revokingApprovalId === a.id ? 0.7 : 1 }]}
                    onPress={() => handleRevokeApproval(a)}
                    disabled={revokingApprovalId === a.id}
                  >
                    {revokingApprovalId === a.id
                      ? <ActivityIndicator color={T.red} />
                      : <Text style={{ color: T.red, fontWeight: '700' }}>Révoquer</Text>}
                  </AnimPressable>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  const renderStaking = () => (
    <Modal visible={showStaking} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowStaking(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Staking Solana</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>
            Délègue du SOL à un validateur pour toucher des récompenses (~5-7%/an) — staking natif du protocole Solana, pas de protocole tiers. Le SOL délégué reste bloqué environ 1 epoch (2-3 jours) à l'activation et à la désactivation.
          </Text>

          <Text style={st.form_label}>Mes stakes</Text>
          {stakeAccountsLoading ? (
            <ActivityIndicator color={T.gold} style={{ marginVertical: 16 }} />
          ) : stakeAccounts.length === 0 ? (
            <Text style={{ color: T.text3, fontSize: 13, marginBottom: 16 }}>Aucun stake pour l'instant.</Text>
          ) : (
            stakeAccounts.map(acc => {
              const statusLabel = {
                activating: 'Activation en cours', active: 'Actif',
                deactivating: 'Désactivation en cours', inactive: 'Retirable',
              }[acc.status];
              const statusColor = {
                activating: T.orange, active: T.up, deactivating: T.orange, inactive: T.gold,
              }[acc.status];
              return (
                <View key={acc.stakePubkey} style={[st.settings_row, { justifyContent: 'space-between' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.settings_row_title}>{acc.amountSol.toFixed(4)} SOL</Text>
                    <Text style={[st.settings_row_sub, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                  {acc.status === 'active' && (
                    <TouchableOpacity onPress={() => handleDeactivateStake(acc.stakePubkey)} style={st.max_btn}>
                      <Text style={st.max_btn_txt}>Désactiver</Text>
                    </TouchableOpacity>
                  )}
                  {acc.status === 'inactive' && (
                    <TouchableOpacity onPress={() => handleWithdrawStake(acc.stakePubkey, acc.lamports)} style={st.max_btn}>
                      <Text style={st.max_btn_txt}>Retirer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}

          <Text style={[st.form_label, { marginTop: 24 }]}>Nouveau stake</Text>
          <Text style={{ color: T.text3, fontSize: 12, marginBottom: 8 }}>Validateur (triés par stake total, commission ≤ 10%)</Text>
          {validators.map(v => (
            <TouchableOpacity
              key={v.votePubkey}
              style={[st.settings_row, selectedValidator === v.votePubkey && st.settings_row_on]}
              onPress={() => setSelectedValidator(v.votePubkey)}
            >
              <View style={{ flex: 1 }}>
                <Text style={st.settings_row_title}>{v.votePubkey.slice(0, 8)}…{v.votePubkey.slice(-6)}</Text>
                <Text style={st.settings_row_sub}>Commission {v.commission}% • {Math.round(v.activatedStakeSol).toLocaleString()} SOL délégués</Text>
              </View>
              {selectedValidator === v.votePubkey && <Text style={{ color: T.gold }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <TextInput
            style={[st.form_input, { marginTop: 16, marginBottom: 10 }]}
            value={stakeAmount}
            onChangeText={setStakeAmount}
            placeholder="Montant en SOL"
            placeholderTextColor={T.text3}
            keyboardType="decimal-pad"
          />
          {!!stakeError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{stakeError}</Text>}
          <AnimPressable style={[st.green_btn, { opacity: stakeLoading ? 0.7 : 1 }]} disabled={stakeLoading} onPress={handleCreateStake}>
            {stakeLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Staker</Text>}
          </AnimPressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderNftGallery = () => (
    <Modal visible={showNftGallery} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity
            onPress={() => (selectedNft ? setSelectedNft(null) : setShowNftGallery(false))}
            style={st.back_btn}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>{selectedNft ? selectedNft.title : 'Mes NFT'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {selectedNft ? (
            <View>
              {!!selectedNft.image && (
                <Image source={{ uri: nftImageProxyUrl(selectedNft.image) }} style={{ width: '100%', aspectRatio: 1, borderRadius: 16, marginBottom: 16, backgroundColor: T.card2 }} resizeMode="cover" />
              )}
              <Text style={st.settings_row_sub}>Contrat</Text>
              <Text style={{ color: T.text, marginBottom: 10 }}>{selectedNft.contract.slice(0, 10)}…{selectedNft.contract.slice(-8)}</Text>
              <Text style={st.settings_row_sub}>Token ID</Text>
              <Text style={{ color: T.text, marginBottom: 20 }}>{ethers.BigNumber.from(selectedNft.tokenId).toString()}</Text>

              <Text style={st.form_label}>Envoyer à</Text>
              <TextInput
                style={[st.form_input, { marginBottom: 10 }]}
                value={nftSendAddress}
                onChangeText={setNftSendAddress}
                placeholder="0x..."
                placeholderTextColor={T.text3}
                autoCapitalize="none"
              />
              {!!nftSendError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{nftSendError}</Text>}
              <AnimPressable style={[st.green_btn, { opacity: nftSendLoading ? 0.7 : 1 }]} disabled={nftSendLoading} onPress={handleSendNft}>
                {nftSendLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Envoyer le NFT</Text>}
              </AnimPressable>
            </View>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {NFT_NETWORKS.map(net => (
                  <TouchableOpacity
                    key={net}
                    style={[st.tok_chip, nftNetwork === net && st.tok_chip_on]}
                    onPress={() => { setNftNetwork(net); openNftGallery(net); }}
                  >
                    <Text style={[st.tok_chip_txt, nftNetwork === net && { color: T.text }]}>{NETWORK_INFO[net]?.label || net}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {nftsLoading ? (
                <ActivityIndicator color={T.gold} style={{ marginTop: 40 }} />
              ) : nftsError ? (
                <Text style={{ color: T.red, fontSize: 13, textAlign: 'center', marginTop: 20 }}>{nftsError}</Text>
              ) : nfts.length === 0 ? (
                <Text style={{ color: T.text3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>Aucun NFT trouvé sur cette adresse ({NETWORK_INFO[nftNetwork]?.label || nftNetwork}).</Text>
              ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {nfts.map((n) => (
                <TouchableOpacity
                  key={`${n.contract}-${n.tokenId}`}
                  style={{ width: '48%', marginBottom: 16 }}
                  onPress={() => { setSelectedNft(n); setNftSendAddress(''); setNftSendError(null); }}
                >
                  {n.image ? (
                    <Image source={{ uri: nftImageProxyUrl(n.image) }} style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: T.card2 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 32 }}>🖼️</Text>
                    </View>
                  )}
                  <Text style={{ color: T.text, fontSize: 12, marginTop: 6 }} numberOfLines={1}>{n.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderSettings = () => (
    <Modal visible={showSettings} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowSettings(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>{t('settings_title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={st.settings_section}>💱 {t('settings_currency')}</Text>
          {Object.entries(CURRENCIES).map(([code, cur]) => (
            <TouchableOpacity key={code} style={[st.settings_row, currency === code && st.settings_row_on]} onPress={() => setCurrency(code)}>
              <Text style={{ fontSize: 22 }}>{cur.flag}</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>{code}</Text>
                <Text style={st.settings_row_sub}>{cur.name}</Text>
              </View>
              {currency === code && <Text style={{ color: T.gold }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <Text style={[st.settings_section, { marginTop: 24 }]}>🌐 {t('settings_network')}</Text>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('ethereum')}>
            <Text style={{ fontSize: 22 }}>⛓️</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Ethereum Mainnet</Text>
              <Text style={st.settings_row_sub}>Chain ID: 1 • Réseau réel</Text>
            </View>
            {network === 'ethereum' && <View style={[st.status_dot, { backgroundColor: T.gold }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('bsc')}>
            <Text style={{ fontSize: 22 }}>🟡</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>BNB Smart Chain</Text>
              <Text style={st.settings_row_sub}>Chain ID: 56 • Mainnet</Text>
            </View>
            {network === 'bsc' && <View style={[st.status_dot, { backgroundColor: T.gold }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('polygon')}>
            <Text style={{ fontSize: 22 }}>🟪</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Polygon</Text>
              <Text style={st.settings_row_sub}>Chain ID: 137 • Mainnet</Text>
            </View>
            {network === 'polygon' && <View style={[st.status_dot, { backgroundColor: T.gold }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('arbitrum')}>
            <Text style={{ fontSize: 22 }}>🔵</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Arbitrum One</Text>
              <Text style={st.settings_row_sub}>Chain ID: 42161 • Mainnet</Text>
            </View>
            {network === 'arbitrum' && <View style={[st.status_dot, { backgroundColor: T.gold }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('optimism')}>
            <Text style={{ fontSize: 22 }}>🔴</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Optimism</Text>
              <Text style={st.settings_row_sub}>Chain ID: 10 • Mainnet</Text>
            </View>
            {network === 'optimism' && <View style={[st.status_dot, { backgroundColor: T.gold }]} />}
          </TouchableOpacity>
          <TouchableOpacity style={st.settings_row} onPress={() => setNetwork('base')}>
            <Text style={{ fontSize: 22 }}>🔷</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Base</Text>
              <Text style={st.settings_row_sub}>Chain ID: 8453 • Mainnet</Text>
            </View>
            {network === 'base' && <View style={[st.status_dot, { backgroundColor: T.gold }]} />}
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

          <Text style={[st.settings_section, { marginTop: 24 }]}>🧩 {t('settings_tokens')}</Text>
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
              <Text style={[st.settings_section, { marginTop: 24 }]}>👤 {t('settings_accounts')}</Text>
              {accounts.map(acc => (
                <View key={acc.id}>
                  <AnimPressable
                    style={[st.settings_row, acc.id === activeAccountId && st.settings_row_on]}
                    onPress={() => switchAccount(acc.id)}
                  >
                    <Text style={{ fontSize: 22 }}>{acc.id === activeAccountId ? '👑' : '👤'}</Text>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={st.settings_row_title}>{acc.label}</Text>
                      <Text style={st.settings_row_sub}>{acc.address.slice(0, 8)}…{acc.address.slice(-6)}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setAccountRenameFor(acc.id); setAccountRenameInput(acc.label); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ marginRight: accounts.length > 1 && acc.id !== activeAccountId ? 16 : 0 }}
                    >
                      <Text style={{ fontSize: 16 }}>✏️</Text>
                    </TouchableOpacity>
                    {accounts.length > 1 && acc.id !== activeAccountId && (
                      <TouchableOpacity onPress={() => deleteAccount(acc.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ color: T.red, fontSize: 16 }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </AnimPressable>
                  {accountRenameFor === acc.id && (
                    <View style={[st.alert_form, { marginTop: -4, marginBottom: 10 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={[st.form_input, { flex: 1, marginBottom: 0 }]}
                          value={accountRenameInput}
                          onChangeText={setAccountRenameInput}
                          placeholder="Nom du compte"
                          placeholderTextColor={T.text3}
                          maxLength={24}
                        />
                        <TouchableOpacity
                          style={[st.max_btn, { marginBottom: 0 }]}
                          onPress={() => { renameAccount(acc.id, accountRenameInput); setAccountRenameFor(null); }}
                        >
                          <Text style={st.max_btn_txt}>OK</Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity onPress={() => setAccountRenameFor(null)} style={{ marginTop: 10 }}>
                        <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
              {showAddAccount ? (
                <View style={st.alert_form}>
                  <AnimPressable style={[st.green_btn, { marginBottom: 10 }]} onPress={addAccountGenerate}>
                    <Text style={st.green_btn_txt}>➕ Générer un nouveau compte</Text>
                  </AnimPressable>
                  <Text style={{ color: T.text3, fontSize: 11, marginBottom: 8, textAlign: 'center' }}>— ou importer un wallet existant —</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                    <TouchableOpacity
                      style={[st.import_type_btn, addAccountType === 'mnemonic' && st.import_type_btn_on, { flex: 1, marginRight: 8 }]}
                      onPress={() => setAddAccountType('mnemonic')}
                    >
                      <Text style={[st.import_type_txt, addAccountType === 'mnemonic' && { color: T.text }]}>Phrase (12 mots)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.import_type_btn, addAccountType === 'privateKey' && st.import_type_btn_on, { flex: 1 }]}
                      onPress={() => setAddAccountType('privateKey')}
                    >
                      <Text style={[st.import_type_txt, addAccountType === 'privateKey' && { color: T.text }]}>Clé privée</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[st.form_input, { marginBottom: 10 }]}
                    value={addAccountValue}
                    onChangeText={setAddAccountValue}
                    placeholder={addAccountType === 'mnemonic' ? 'mot1 mot2 mot3 ...' : '0x...'}
                    placeholderTextColor={T.text3}
                    autoCapitalize="none"
                    multiline={addAccountType === 'mnemonic'}
                  />
                  {!!addAccountError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{addAccountError}</Text>}
                  <AnimPressable style={st.green_btn} onPress={addAccountImport}>
                    <Text style={st.green_btn_txt}>Importer</Text>
                  </AnimPressable>
                  <TouchableOpacity onPress={() => { setShowAddAccount(false); setAddAccountValue(''); setAddAccountError(null); }} style={{ marginTop: 10 }}>
                    <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <AnimPressable style={st.settings_row} onPress={() => setShowAddAccount(true)}>
                  <Text style={{ fontSize: 22 }}>➕</Text>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={st.settings_row_title}>{t('settings_add_account')}</Text>
                    <Text style={st.settings_row_sub}>Générer ou importer un autre wallet</Text>
                  </View>
                </AnimPressable>
              )}

              <Text style={[st.settings_section, { marginTop: 24 }]}>👁️ Adresses en observation</Text>
              {watchAddresses.map(w => {
                const wNativeSym = { bsc: 'BNB', polygon: 'MATIC' }[w.network] || 'ETH';
                const bal = watchBalances[w.id];
                const usdVal = bal
                  ? (bal.native || 0) * (tokens[wNativeSym]?.price || 0)
                    + (bal.USDT || 0) * (tokens.USDT?.price || 0)
                    + (bal.USDC || 0) * (tokens.USDC?.price || 0)
                  : 0;
                const netLabel = NETWORK_INFO[w.network]?.label || w.network;
                return (
                  <View key={w.id} style={[st.settings_row, { justifyContent: 'space-between' }]}>
                    <Text style={{ fontSize: 22 }}>👁️</Text>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={st.settings_row_title}>{w.label}</Text>
                        <View style={st.readonly_badge}><Text style={st.readonly_badge_txt}>Lecture seule</Text></View>
                      </View>
                      <Text style={st.settings_row_sub}>
                        {w.address.slice(0, 6)}…{w.address.slice(-4)} • {netLabel}{bal ? ` • ${fmt(usdVal)}` : ' • …'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeWatchAddress(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: T.red, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {showAddWatchAddress ? (
                <View style={st.alert_form}>
                  <Text style={[st.form_label, { marginBottom: 8 }]}>Adresse à observer (0x...)</Text>
                  <TextInput
                    style={[st.form_input, { marginBottom: 10 }]}
                    value={watchAddrInput}
                    onChangeText={setWatchAddrInput}
                    placeholder="0x..."
                    placeholderTextColor={T.text3}
                    autoCapitalize="none"
                  />
                  <Text style={[st.form_label, { marginBottom: 8 }]}>Nom (optionnel)</Text>
                  <TextInput
                    style={[st.form_input, { marginBottom: 10 }]}
                    value={watchLabelInput}
                    onChangeText={setWatchLabelInput}
                    placeholder="Ex : Compte Binance"
                    placeholderTextColor={T.text3}
                    maxLength={24}
                  />
                  <Text style={[st.form_label, { marginBottom: 8 }]}>Réseau</Text>
                  <View style={{ flexDirection: 'row', marginBottom: 10 }}>
                    {['ethereum', 'bsc', 'polygon'].map((net, idx) => (
                      <TouchableOpacity
                        key={net}
                        style={[st.import_type_btn, watchNetworkInput === net && st.import_type_btn_on, { flex: 1, marginRight: idx < 2 ? 8 : 0 }]}
                        onPress={() => setWatchNetworkInput(net)}
                      >
                        <Text style={[st.import_type_txt, watchNetworkInput === net && { color: T.text }]}>{NETWORK_INFO[net].label.split(' ')[0]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {!!watchAddrError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{watchAddrError}</Text>}
                  <AnimPressable style={[st.green_btn, { opacity: watchAddrLoading ? 0.7 : 1 }]} disabled={watchAddrLoading} onPress={addWatchAddress}>
                    {watchAddrLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Ajouter</Text>}
                  </AnimPressable>
                  <TouchableOpacity
                    onPress={() => { setShowAddWatchAddress(false); setWatchAddrInput(''); setWatchLabelInput(''); setWatchAddrError(null); }}
                    style={{ marginTop: 10 }}
                  >
                    <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <AnimPressable style={st.settings_row} onPress={() => setShowAddWatchAddress(true)}>
                  <Text style={{ fontSize: 22 }}>➕</Text>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={st.settings_row_title}>Ajouter une adresse en observation</Text>
                    <Text style={st.settings_row_sub}>N'importe quelle adresse — lecture seule, aucune clé</Text>
                  </View>
                </AnimPressable>
              )}

              <Text style={[st.settings_section, { marginTop: 24 }]}>🔗 {t('settings_walletconnect')}</Text>
              {wcSessions.map(session => {
                const meta = session.peer?.metadata || {};
                return (
                  <View key={session.topic} style={[st.settings_row, { justifyContent: 'space-between' }]}>
                    {meta.icons?.[0] ? (
                      <Image source={{ uri: meta.icons[0] }} style={{ width: 28, height: 28, borderRadius: 6 }} />
                    ) : (
                      <Text style={{ fontSize: 22 }}>🔗</Text>
                    )}
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={st.settings_row_title}>{meta.name || 'dApp inconnue'}</Text>
                      <Text style={st.settings_row_sub} numberOfLines={1}>{meta.url || session.topic.slice(0, 12)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleWcDisconnect(session.topic)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: T.red, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {/* setShowSettings(false) avant d'ouvrir un second <Modal> : sur
                  iOS/SDK54 (New Architecture), présenter un Modal RN par-dessus
                  un Modal déjà visible ignore silencieusement le premier tap
                  (aucune erreur, juste rien ne s'ouvre) — confirmé en testant
                  en vrai sur iPhone. On referme Settings au lieu d'empiler. */}
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setShowWalletConnect(true); refreshWcSessions(); }}>
                <Text style={{ fontSize: 22 }}>➕</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>{t('settings_connect_dapp')}</Text>
                  <Text style={st.settings_row_sub}>Uniswap, OpenSea... via un lien ou un QR code</Text>
                </View>
              </AnimPressable>
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setDappCurrentUrl(null); setDappUrlInput(''); setShowDappBrowser(true); }}>
                <Text style={{ fontSize: 22 }}>🌐</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Navigateur Web3</Text>
                  <Text style={st.settings_row_sub}>Parcourir une dApp directement dans l'app</Text>
                </View>
              </AnimPressable>
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setShowApprovals(true); refreshApprovals(); }}>
                <Text style={{ fontSize: 22 }}>🔑</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Autorisations de tokens</Text>
                  <Text style={st.settings_row_sub}>Voir et révoquer les accès accordés à des contrats</Text>
                </View>
              </AnimPressable>
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setShowRecurringBuy(true); }}>
                <Text style={{ fontSize: 22 }}>🔁</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Achat récurrent</Text>
                  <Text style={st.settings_row_sub}>Rappel pour investir régulièrement (DCA)</Text>
                </View>
              </AnimPressable>
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setBridgeQuote(null); setBridgeError(null); setShowBridge(true); }}>
                <Text style={{ fontSize: 22 }}>🌉</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Pont cross-chain</Text>
                  <Text style={st.settings_row_sub}>Transférer de l'ETH entre Ethereum, Arbitrum, Optimism, Base</Text>
                </View>
              </AnimPressable>
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setShowDefiPositions(true); refreshDefiPositions(); }}>
                <Text style={{ fontSize: 22 }}>🌊</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Positions DeFi</Text>
                  <Text style={st.settings_row_sub}>Staking Lido (ETH) — plus de protocoles à venir</Text>
                </View>
              </AnimPressable>

              <Text style={[st.settings_section, { marginTop: 24 }]}>🔐 {t('settings_security')}</Text>
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
                    <Text style={st.settings_row_title}>{t('settings_show_mnemonic')}</Text>
                    <Text style={st.settings_row_sub}>À ne montrer à personne d'autre que toi</Text>
                  </View>
                </AnimPressable>
              )}
              {isUnlocked && !isDuressMode && (
                <AnimPressable
                  style={st.settings_row}
                  onPress={() => showAlert(
                    '⚠️ Keystore chiffré',
                    "Ce fichier reste protégé par ton code PIN actuel — il ne sert à rien sans lui. Garde-le quand même en lieu sûr, distinct de ton PIN.",
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Copier', onPress: exportEncryptedKeystore },
                    ]
                  )}
                >
                  <Text style={{ fontSize: 22 }}>🗄️</Text>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={st.settings_row_title}>Exporter le keystore chiffré</Text>
                    <Text style={st.settings_row_sub}>Format standard (ethers/geth), protégé par ton PIN</Text>
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
              <AnimPressable
                style={st.settings_row}
                onPress={() => {
                  if (duressPinConfigured) {
                    showAlert('Désactiver le code de détresse ?', 'Le code de détresse actuel ne fonctionnera plus.', [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Désactiver', style: 'destructive', onPress: handleRemoveDuressPin },
                    ]);
                  } else {
                    setShowSettings(false);
                    setDuressSetupInput('');
                    setDuressSetupError(null);
                    setShowDuressSetup(true);
                  }
                }}
              >
                <Text style={{ fontSize: 22 }}>🚨</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>Code PIN de détresse</Text>
                  <Text style={st.settings_row_sub}>
                    {duressPinConfigured ? 'Activé — appuie pour désactiver' : "Affiche un wallet vide si on te force à l'ouvrir"}
                  </Text>
                </View>
              </AnimPressable>
              <AnimPressable style={st.settings_row} onPress={handleLogout}>
                <Text style={{ fontSize: 22 }}>🚪</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={[st.settings_row_title, { color: T.red }]}>{t('settings_logout')}</Text>
                  <Text style={st.settings_row_sub}>{t('settings_logout_sub')}</Text>
                </View>
              </AnimPressable>
            </>
          )}

          <Text style={[st.settings_section, { marginTop: 24 }]}>👛 Affichage du portefeuille</Text>
          <AnimPressable
            style={st.settings_row}
            onPress={() => { const next = !hideZeroBalances; setHideZeroBalances(next); saveHideZeroBalances(next); }}
          >
            <Text style={{ fontSize: 22 }}>🧹</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Masquer les soldes à zéro</Text>
              <Text style={st.settings_row_sub}>Ne montre que les tokens que tu possèdes réellement</Text>
            </View>
            <View style={[st.status_dot, { backgroundColor: hideZeroBalances ? T.gold : T.text3 }]} />
          </AnimPressable>

          <Text style={[st.settings_section, { marginTop: 24 }]}>🏠 {t('settings_quick_actions')}</Text>
          {QUICK_ACTIONS_BASE.map(a => {
            const isHidden = hiddenQuickActions.includes(a.id);
            return (
              <AnimPressable key={a.id} style={st.settings_row} onPress={() => toggleQuickAction(a.id)}>
                <Text style={{ fontSize: 22 }}>{a.icon}</Text>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={st.settings_row_title}>{a.label}</Text>
                  <Text style={st.settings_row_sub}>{isHidden ? 'Masquée' : 'Visible sur l\'accueil'}</Text>
                </View>
                <View style={[st.status_dot, { backgroundColor: isHidden ? T.text3 : T.gold }]} />
              </AnimPressable>
            );
          })}

          <Text style={[st.settings_section, { marginTop: 24 }]}>🔔 {t('settings_notifications')}</Text>
          <AnimPressable
            style={st.settings_row}
            onPress={() => { const next = !vibrationEnabled; setVibrationEnabled(next); saveVibrationEnabled(next); }}
          >
            <Text style={{ fontSize: 22 }}>📳</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>{t('settings_sounds_vibrations')}</Text>
              <Text style={st.settings_row_sub}>Alertes de prix, envois et swaps · {vibrationEnabled ? 'Activés' : 'Désactivés'}</Text>
            </View>
            <View style={[st.status_dot, { backgroundColor: vibrationEnabled ? T.gold : T.text3 }]} />
          </AnimPressable>

          <Text style={[st.settings_section, { marginTop: 24 }]}>🌍 {t('settings_language')}</Text>
          {SUPPORTED_LOCALES.map(code => (
            <TouchableOpacity key={code} style={[st.settings_row, locale === code && st.settings_row_on]} onPress={() => changeLocale(code)}>
              <Text style={{ fontSize: 22 }}>{LOCALE_DISPLAY[code]?.flag || '🌐'}</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>{LOCALE_DISPLAY[code]?.name || code}</Text>
              </View>
              {locale === code && <Text style={{ color: T.gold }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <Text style={[st.settings_section, { marginTop: 24 }]}>🎨 {t('settings_theme')}</Text>
          {[['dark', '🌙', t('settings_theme_dark')], ['light', '☀️', t('settings_theme_light')]].map(([mode, icon, label]) => (
            <TouchableOpacity key={mode} style={[st.settings_row, themeMode === mode && st.settings_row_on]} onPress={() => changeTheme(mode)}>
              <Text style={{ fontSize: 22 }}>{icon}</Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={st.settings_row_title}>{label}</Text>
              </View>
              {themeMode === mode && <Text style={{ color: T.gold }}>✓</Text>}
            </TouchableOpacity>
          ))}

          <View style={[st.warning_box, { marginTop: 24 }]}>
            <Text style={st.warning_txt}>
              🛡️ NexiaWallet ne te demandera JAMAIS ta phrase de récupération ou ton code PIN par email, chat ou support. Si on te la demande, c'est une arnaque.
            </Text>
          </View>

          <Text style={[st.settings_section, { marginTop: 24 }]}>📋 {t('settings_info')}</Text>
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
              <Text style={st.settings_row_title}>{t('settings_share_app')}</Text>
              <Text style={st.settings_row_sub}>Envoie le lien à quelqu'un</Text>
            </View>
          </AnimPressable>
          <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setShowReferral(true); }}>
            <Text style={{ fontSize: 22 }}>🎁</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Programme de parrainage</Text>
              <Text style={st.settings_row_sub}>Ton code personnel à partager</Text>
            </View>
          </AnimPressable>
          <AnimPressable style={st.settings_row} onPress={exportUserData}>
            <Text style={{ fontSize: 22 }}>📦</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>{t('settings_export_data')}</Text>
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
                <Text style={st.settings_row_title}>{t('settings_import_data')}</Text>
                <Text style={st.settings_row_sub}>Depuis un JSON exporté sur un autre appareil</Text>
              </View>
            </AnimPressable>
          )}
          {Object.entries(LEGAL_DOCS).map(([key, doc]) => (
            <AnimPressable key={key} style={st.settings_row} onPress={() => { setShowSettings(false); setLegalDocFromSettings(true); setLegalDoc(key); }}>
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
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMarket(); }} tintColor={T.gold} />
      }
    >
      {(isOffline || portfolioIsCached) && (
        <View style={[st.warning_box, { marginHorizontal: 16, marginTop: 16 }]}>
          <Text style={st.warning_txt}>
            📡 Hors ligne — derniers soldes connus affichés{isOffline ? ', pas forcément à jour.' : '.'}
          </Text>
        </View>
      )}
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
          <Ionicons name="settings-outline" size={20} color={T.text2} />
        </TouchableOpacity>
      </View>

      <View style={{ position: 'relative', marginHorizontal: 14 }}>
        <BalanceGlow />
        <LinearGradient
          colors={['rgba(205,179,126,0.55)', 'rgba(139,92,246,0.30)', 'rgba(39,56,92,0.35)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={st.balance_border_wrap}
        >
          <LinearGradient
            colors={[T.card2, T.card, T.bg]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.balance_wrap}
          >
            <Text style={st.balance_kicker}>{t('home_total_balance')}</Text>
            <Text style={st.balance_amount}>{fmt(totalUSD)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: periodChange >= 0 ? T.up : T.down, fontSize: 14, fontWeight: '600' }}>
              {periodChange >= 0 ? '+' : ''}{fmt(periodChange)} ({((periodChange / Math.max(totalUSD - periodChange, 1)) * 100).toFixed(2)}%)
            </Text>
            <View style={{ flexDirection: 'row', marginLeft: 8, gap: 4 }}>
              {[['24h', '24h'], ['7d', '7j'], ['30d', '30j']].map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => { setBalancePeriod(key); saveBalancePeriod(key); }}
                  style={[st.period_chip, balancePeriod === key && st.period_chip_on]}
                >
                  <Text style={[st.period_chip_txt, balancePeriod === key && st.period_chip_txt_on]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          </LinearGradient>
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
        {visibleQuickActions.map(a => (
          <AnimPressable key={a.id} style={st.quick_btn} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label}>
            <View style={[st.quick_icon_wrap, { backgroundColor: a.bg }]}>
              <Text style={[st.quick_icon_txt, { color: a.bg === T.gold ? '#000' : T.text }]}>{a.icon}</Text>
            </View>
            <Text style={st.quick_lbl}>{a.label}</Text>
          </AnimPressable>
        ))}
      </View>

      {!!dailyMover && (
        <View style={st.mover_card}>
          <Text style={st.mover_txt}>
            {dailyMover.change >= 0 ? '🚀' : '📉'} {dailyMover.sym} est ton token qui bouge le plus aujourd'hui ({dailyMover.change >= 0 ? '+' : ''}{dailyMover.change.toFixed(2)}%).
          </Text>
        </View>
      )}

      {!!diversification && diversification.topPct >= 70 && (
        <View style={st.diversif_card}>
          <Text style={st.diversif_txt}>
            ⚖️ {diversification.topPct.toFixed(0)}% de ton portefeuille est en {diversification.topSymbol}. Diversifier réduit le risque si cette crypto chute.
          </Text>
        </View>
      )}

      {favoritesLoaded && !favorites.length && (
        <TouchableOpacity style={st.favorites_hint} onPress={() => setTab('markets')} activeOpacity={0.8}>
          <Ionicons name="star" size={26} color={T.gold} style={st.favorites_hint_icon} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={st.favorites_hint_title}>{t('home_no_favorites_title')}</Text>
            <Text style={st.favorites_hint_desc}>{t('home_no_favorites_sub')}</Text>
          </View>
        </TouchableOpacity>
      )}

      {!!favoriteMarketCoins.length && (
        <>
          <View style={st.section_hdr}>
            <SectionTitle>Favoris</SectionTitle>
          </View>
          <View style={isWideWeb && st.token_grid}>
            {favoriteMarketCoins.map((coin, i) => {
              const sym = coin.symbol?.toUpperCase() || '';
              return (
                <FadeInView key={coin.id} deps={[coin.id]} style={[st.token_row, isWideWeb && st.token_row_wide, { position: 'relative' }]}>
                  <AnimPressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} scaleTo={0.98} onPress={() => setSelectedMarketCoin(coin)}>
                    <CoinLogo logo={coin.image} icon="🪙" size={44} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.token_name}>{coin.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={st.token_price_txt}>{fmt(coin.current_price, coin.current_price < 1 ? 4 : 2)}</Text>
                        <ChangePill value={coin.price_change_percentage_24h} />
                      </View>
                    </View>
                  </AnimPressable>
                  <TouchableOpacity
                    style={st.market_card_fav}
                    onPress={() => toggleFavorite(sym)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="star" size={16} color={T.gold} />
                  </TouchableOpacity>
                </FadeInView>
              );
            })}
          </View>
        </>
      )}

      <View style={st.section_hdr}>
        <SectionTitle>{t('home_my_tokens')}</SectionTitle>
      </View>

      <View style={isWideWeb && st.token_grid}>
        {Object.values(tokens).every(t => !t.price) ? (
          Object.keys(tokens).map(sym => (
            <TokenRowSkeleton key={sym} style={[isWideWeb && st.token_row_wide]} />
          ))
        ) : visibleTokenEntries.map(([sym, t], i) => {
          const val = (t.balance || 0) * (t.price || 0);
          const isFav = favorites.includes(sym);
          return (
            <FadeInView key={sym} deps={[sym]} style={[st.token_row, isWideWeb && st.token_row_wide, { position: 'relative' }]}>
              <AnimPressable
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                scaleTo={0.98}
                onPress={() => setSelectedToken(sym)}
                accessibilityRole="button"
                accessibilityLabel={`${t.name}, ${fmt(val)}, ${(t.balance || 0).toFixed(4)} ${sym}`}
              >
                <CoinLogo logo={t.logo} icon={t.icon} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={st.token_name}>{t.name}</Text>
                    {t.readOnly && (
                      <View style={st.readonly_badge}><Text style={st.readonly_badge_txt}>Lecture seule</Text></View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={st.token_price_txt}>{fmt(t.price, t.price < 1 ? 4 : 2)}</Text>
                    <ChangePill value={t.change24h} />
                  </View>
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
                <Ionicons name={isFav ? 'star' : 'star-outline'} size={16} color={T.gold} />
              </TouchableOpacity>
            </FadeInView>
          );
        })}
      </View>

      {customTokens.filter(t => t.network === network).length > 0 && (
        <>
          <View style={st.section_hdr}>
            <SectionTitle>Tokens personnalisés</SectionTitle>
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.market_filter_row}>
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
            tintColor={T.gold}
          />
        }
      >
        {!!newsItems.length && (
          <View style={{ marginBottom: 20 }}>
            <View style={st.section_hdr}>
              <SectionTitle>Actu crypto en direct</SectionTitle>
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
          <SectionTitle>Tous les cours</SectionTitle>
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
                    <Ionicons name={isFav ? 'star' : 'star-outline'} size={14} color={T.gold} />
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
                  <View style={[st.market_card_badge, { backgroundColor: pos ? T.upBg : T.downBg }]}>
                    <Text style={{ color: pos ? T.up : T.down, fontSize: 11, fontWeight: 'bold' }}>
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
          <Text style={{ color: T.gold, fontSize: 22 }}>⇅</Text>
        </TouchableOpacity>

        <View style={st.swap_card}>
          <Text style={st.swap_lbl}>Tu reçois</Text>
          <Text style={[st.swap_big_input, { color: T.gold }]}>
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
          <Text style={st.form_label}>Token</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
            {[...(BUYABLE_TOKENS[network] || []), ...BUYABLE_TOKENS.solana, ...BUYABLE_TOKENS.bitcoin].map((sym) => {
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
            <Text style={st.send_info_line}>Réseau: {{ SOL: 'Solana', BTC: 'Bitcoin' }[buyToken] || activeNetwork.label}</Text>
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

  const renderSell = () => {
    const sellableBalance = sellToken === nativeSymbol
      ? parseFloat(walletBalance || '0')
      : (tokens[sellToken]?.balance || 0);
    return (
      <Modal visible={showSell} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => setShowSell(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Vendre des crypto</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={st.form_label}>Token</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
              {[...(BUYABLE_TOKENS[network] || []), ...BUYABLE_TOKENS.solana, ...BUYABLE_TOKENS.bitcoin].map((sym) => {
                const tk = tokens[sym];
                if (!tk) return null;
                return (
                  <TouchableOpacity key={sym} style={[st.tok_chip, sellToken === sym && st.tok_chip_on]} onPress={() => setSellToken(sym)}>
                    <CoinLogo logo={tk.logo} icon={tk.icon} size={24} />
                    <Text style={[st.tok_chip_txt, sellToken === sym && { color: T.text }]}>{sym}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={st.form_label}>Montant {sellToken}</Text>
            <TextInput style={st.form_input} value={sellAmount} onChangeText={setSellAmount}
              placeholder="0.1" placeholderTextColor={T.text3} keyboardType="numeric" />
            {!!sellableBalance && (
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                {[0.25, 0.5, 1].map(pct => (
                  <TouchableOpacity key={pct} style={st.quick_pct_btn} onPress={() => setSellAmount(String(sellableBalance * pct))}>
                    <Text style={st.quick_pct_txt}>{pct === 1 ? 'Tout' : `${pct * 100}%`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={st.send_info_box}>
              <Text style={st.send_info_line}>≈ {fmt((parseFloat(sellAmount) || 0) * (tokens[sellToken]?.price || 0))}</Text>
              <Text style={st.send_info_line}>Solde disponible : {sellableBalance.toFixed(6)} {sellToken}</Text>
              <Text style={st.send_info_line}>Tu enverras toi-même les fonds à l'adresse de dépôt affichée par MoonPay.</Text>
            </View>

            <AnimPressable style={[st.green_btn, { opacity: sellLoading ? 0.7 : 1, marginTop: 24 }]}
              onPress={handleSellNow} disabled={sellLoading}>
              {sellLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Vendre via MoonPay</Text>}
            </AnimPressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════
  const navItems = [
    { id: 'home',     icon: 'home',              label: t('nav_home')   },
    { id: 'markets',  icon: 'trending-up',       label: t('nav_market') },
    { id: 'stats',    icon: 'stats-chart',       label: t('nav_stats')  },
    { id: 'swap',     icon: 'swap-horizontal',   label: t('nav_swap'), big: true },
  ];

  // `key={tab}` force un nouveau montage à chaque changement d'onglet, donc
  // FadeInView rejoue son fondu — transition douce plutôt qu'un changement sec.
  const tabContent = (
    <FadeInView key={tab} style={{ flex: 1 }} deps={[tab]}>
      {tab === 'home'     && renderHome()}
      {tab === 'markets'  && renderMarkets()}
      {tab === 'stats'    && renderStatsTab()}
      {tab === 'swap'     && renderSwap()}
    </FadeInView>
  );

  return (
    <SafeAreaView style={[st.container, isWideWeb && st.container_wide]}>
      <StatusBar barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'} backgroundColor={T.bg} />
      {isWideWeb ? (
        <View style={st.desktop_shell}>
          <View style={st.sidebar}>
            <Text style={st.sidebar_logo}>⬡ NexiaWallet</Text>
            <View style={{ marginTop: 34, gap: 4 }}>
              {navItems.map(n => (
                <AnimPressable
                  key={n.id}
                  style={[st.sidebar_item, tab === n.id && st.sidebar_item_on]}
                  scaleTo={0.97}
                  onPress={() => setTab(n.id)}
                  accessibilityRole="tab"
                  accessibilityLabel={n.label}
                  accessibilityState={{ selected: tab === n.id }}
                >
                  <View style={{ width: 22, marginRight: 12, alignItems: 'center' }}>
                    <Ionicons name={n.icon} size={18} color={tab === n.id ? T.gold : T.text2} />
                  </View>
                  <Text style={[st.sidebar_lbl, tab === n.id && st.sidebar_lbl_on]}>{n.label}</Text>
                </AnimPressable>
              ))}
            </View>
            <AnimPressable
              style={[st.sidebar_item, { marginTop: 'auto' }]}
              scaleTo={0.97}
              onPress={() => setShowSettings(true)}
              accessibilityRole="button"
              accessibilityLabel={t('nav_settings')}
            >
              <View style={{ width: 22, marginRight: 12, alignItems: 'center' }}>
                <Ionicons name="settings-outline" size={18} color={T.text2} />
              </View>
              <Text style={st.sidebar_lbl}>{t('nav_settings')}</Text>
            </AnimPressable>
          </View>
          <View style={{ flex: 1 }}>
            {tabContent}
          </View>
        </View>
      ) : (
        <>
          {tabContent}
          <View style={st.bottom_nav}>
            {navItems.map(n => (
              <AnimPressable
                key={n.id}
                style={[st.nav_item, n.big && st.nav_item_big]}
                scaleTo={0.92}
                onPress={() => setTab(n.id)}
                accessibilityRole="tab"
                accessibilityLabel={n.label}
                accessibilityState={{ selected: tab === n.id }}
              >
                {n.big ? (
                  <View style={[st.nav_big_btn, { backgroundColor: tab === n.id ? T.gold : T.card2 }]}>
                    <Ionicons name={n.icon} size={20} color={tab === n.id ? '#000' : T.text2} />
                  </View>
                ) : (
                  <>
                    <View style={[st.nav_icon_wrap, tab === n.id && st.nav_icon_wrap_on]}>
                      <Ionicons name={n.icon} size={18} color={tab === n.id ? T.gold : T.text2} />
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
      {renderSell()}
      {renderRecurringBuy()}
      {renderDuressSetup()}
      {renderBridge()}
      {renderDefiPositions()}
      {renderReferral()}
      {!!selectedToken && renderTokenDetail()}
      {!!selectedMarketCoin && renderMarketCoinDetail()}
      {renderSend()}
      {showQrScanner && renderQrScanner()}
      {renderReceive()}
      {renderHistory()}
      {renderSettings()}
      {renderWalletConnect()}
      {!!wcProposal && renderWcProposal()}
      {renderDappBrowser()}
      {!!dappBridgeRequest && renderDappBridgeRequest()}
      {!!wcRequest && renderWcRequest()}
      {renderApprovals()}
      {renderStaking()}
      {renderNftGallery()}
      {renderLegal()}
      {renderMnemonicBackup()}
      {renderOnboarding()}
      <ToastBanner toast={toast} />
    </SafeAreaView>
  );
}

// La véritable App par défaut : détient l'état thème (state persistant,
// voir THEME_KEY/loadTheme/saveTheme plus haut) et englobe TOUT AppContent
// dans le Provider — voir le commentaire au-dessus de AppContent pour
// pourquoi ça doit être fait de l'extérieur plutôt qu'avec un seul `return`.
export default function App() {
  const [themeMode, setThemeMode] = useState('dark');
  useEffect(() => { loadTheme().then(setThemeMode); }, []);
  const T = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const cs = useMemo(() => buildCs(T), [T]);
  const st = useMemo(() => buildSt(T), [T]);
  const changeTheme = useCallback((next) => { setThemeMode(next); saveTheme(next); }, []);
  return (
    <ThemeContext.Provider value={{ T, st, cs }}>
      <AppContent themeMode={themeMode} changeTheme={changeTheme} />
    </ThemeContext.Provider>
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

// `T` en paramètre (et non la constante du même nom) : ombrage volontaire,
// voir le commentaire équivalent au-dessus de buildCs().
function buildSt(T) {
  return StyleSheet.create({
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
  sidebar_item_on:{ backgroundColor: T.goldBg },
  sidebar_icon:   { fontSize: 18, marginRight: 12, width: 22, textAlign: 'center' },
  sidebar_lbl:    { color: T.text2, fontSize: 14, fontWeight: '600' },
  sidebar_lbl_on: { color: T.gold },
  live_bar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: T.card, borderBottomWidth: 1, borderBottomColor: T.border },
  live_bar_txt: { color: T.text2, fontSize: 11, marginLeft: 6 },
  live_dot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: T.gold },

  pin_screen:      { flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center', ...webFrame },
  pin_logo_wrap:   { alignItems: 'center', marginBottom: 50 },
  pin_logo_circle: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.goldBg, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  pin_app_name:    { color: T.text, fontSize: 24, fontWeight: 'bold', marginBottom: 6 },
  pin_sub:         { color: T.text2, fontSize: 13 },
  pin_dots:        { flexDirection: 'row', marginBottom: 50 },
  pin_dot:         { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: T.border, marginHorizontal: 10 },
  pin_dot_on:      { backgroundColor: T.gold, borderColor: T.gold },
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
  import_confirm_btn:{ backgroundColor: T.gold, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },

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
  live_badge:  { flexDirection: 'row', alignItems: 'center', backgroundColor: T.goldBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 10 },
  live_txt:    { color: T.gold, fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
  change_badge:{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },

  detail_price_wrap: { alignItems: 'center', paddingVertical: 20 },
  detail_price:      { color: T.text, fontSize: 36, fontWeight: 'bold' },
  detail_grid:       { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, marginBottom: 16 },
  detail_stat:       { width: '50%', paddingVertical: 12, paddingHorizontal: 16 },
  detail_stat_lbl:   { color: T.text2, fontSize: 11, marginBottom: 4 },
  detail_stat_val:   { color: T.text, fontSize: 15, fontWeight: '600' },
  detail_actions:    { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 16, marginBottom: 24 },
  detail_action_btn: { alignItems: 'center' },
  detail_action_icon:{ width: 52, height: 52, borderRadius: 26, backgroundColor: T.goldBg, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
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
  home_addr:     { color: T.text2, fontFamily: T.fontMono, fontSize: 12, marginTop: 2 },
  icon_btn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  balance_border_wrap: { borderRadius: 23, padding: 1 },
  balance_wrap:  { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 16, borderRadius: 22 },
  balance_kicker:{ color: T.text3, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 },
  balance_amount:{ color: T.text, fontFamily: T.fontMono, fontSize: 44, fontWeight: '600', letterSpacing: -1, fontVariant: ['tabular-nums'] },

  quick_actions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, paddingVertical: 14, marginTop: 16, marginBottom: 16 },
  quick_btn:     { alignItems: 'center', minWidth: 54 },
  quick_icon_wrap:{
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  quick_icon_txt:{ fontSize: 18, fontWeight: 'bold' },
  quick_lbl:     { color: T.text2, fontSize: 11 },

  section_hdr:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  section_title: { color: T.text2, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  section_tick:  { width: 3, height: 12, borderRadius: 2, backgroundColor: T.gold, marginRight: 8 },
  change_pill:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginLeft: 6 },
  change_pill_txt: { fontSize: 11, fontWeight: '700' },
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
  token_val:     { color: T.text, fontFamily: T.fontMono, fontSize: 14, fontWeight: '600' },
  token_bal:     { color: T.text2, fontFamily: T.fontMono, fontSize: 11, marginTop: 2 },
  readonly_badge:    { marginLeft: 8, backgroundColor: T.card2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  readonly_badge_txt:{ color: T.text3, fontSize: 9, fontWeight: '600' },

  search_wrap:    { margin: 14, backgroundColor: T.card, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: T.border },
  search_input:   { flex: 1, color: T.text, fontSize: 14, paddingVertical: 12 },
  section_sub:    { color: T.text3, fontSize: 11 },
  market_filter_row: { paddingHorizontal: 14, paddingBottom: 14, alignItems: 'center' },
  market_filter_sep: { width: 1, height: 20, backgroundColor: T.border, marginHorizontal: 4 },
  chain_tab_sm:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: T.border, marginRight: 8 },
  chain_tab_sm_on:   { backgroundColor: T.goldBg, borderColor: T.gold },
  chain_tab_sm_txt:  { color: T.text2, fontSize: 12, fontWeight: '600' },
  chain_tab_sm_txt_on: { color: T.gold },
  load_more_btn: { alignItems: 'center', paddingVertical: 14, marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  load_more_txt: { color: T.text2, fontSize: 13, fontWeight: '600' },
  alert_section:  { marginHorizontal: 16, marginBottom: 16 },
  alert_chip:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.goldBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: T.gold + '44' },
  alert_chip_txt: { color: T.gold, fontSize: 12, fontWeight: '600' },
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
  swap_tok_btn_green: { backgroundColor: T.goldBg, borderColor: T.gold },
  swap_invert_btn:    { alignSelf: 'center', width: 44, height: 44, borderRadius: 22, backgroundColor: T.card2, alignItems: 'center', justifyContent: 'center', marginVertical: 8, borderWidth: 1, borderColor: T.border },

  form_label:    { color: T.text2, fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
  form_input:    { backgroundColor: T.card, color: T.text, borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  max_btn:       { backgroundColor: T.goldBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 8, marginBottom: 16, borderWidth: 1, borderColor: T.gold + '55' },
  addr_action_btn: { width: 48, height: 48, borderRadius: 12, backgroundColor: T.card2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  max_btn_txt:   { color: T.gold, fontWeight: 'bold', fontSize: 13 },
  quick_pct_btn: { flex: 1, backgroundColor: T.card2, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  quick_pct_txt: { color: T.text2, fontWeight: '600', fontSize: 12 },
  amount_mode_toggle: { color: T.cyan, fontSize: 12, fontWeight: '600' },
  tx_tag_chip: { color: T.text3, fontSize: 10, backgroundColor: T.card2, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  stats_card:    { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16 },
  stats_card_lbl:{ color: T.text2, fontSize: 12 },
  stats_card_val:{ color: T.text, fontSize: 20, fontWeight: 'bold', marginTop: 6 },
  gas_tier_btn:   { flex: 1, backgroundColor: T.card, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  gas_tier_btn_on:{ backgroundColor: T.goldBg, borderColor: T.gold },
  gas_tier_lbl:   { color: T.text2, fontWeight: 'bold', fontSize: 13 },
  gas_tier_lbl_on:{ color: T.gold },
  gas_tier_fee:   { color: T.text3, fontSize: 10, marginTop: 4 },
  tok_chip:      { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: T.border },
  tok_chip_on:   { backgroundColor: T.blueBg, borderColor: T.blue },
  tok_chip_txt:  { color: T.text2, fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
  send_info_box: { backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  send_info_line:{ color: T.text2, fontSize: 12, marginBottom: 4 },
  confirm_box:      { alignItems: 'center', backgroundColor: T.card, borderRadius: 16, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: T.border },
  confirm_label:    { color: T.text2, fontSize: 12, marginBottom: 6 },
  confirm_amount:   { color: T.text, fontFamily: T.fontMono, fontSize: 30, fontWeight: '600' },
  confirm_sub:      { color: T.text2, fontSize: 13, marginTop: 4 },
  confirm_addr_box: { backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border, marginBottom: 16 },
  confirm_addr_txt: { color: T.gold, fontFamily: T.fontMono, fontSize: 13 },
  recent_addr_chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: T.border, gap: 8 },
  recent_addr_txt:  { color: T.text2, fontSize: 12, fontWeight: '600' },
  recent_addr_edit: { fontSize: 12, opacity: 0.7 },
  green_btn:     {
    backgroundColor: T.gold, borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: T.gold, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  green_btn_txt: { color: '#000', fontWeight: 'bold', fontSize: 15 },

  qr_wrap:         { backgroundColor: T.card, padding: 20, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: T.border },
  receive_title:   { color: T.text, fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  receive_addr_box:{ backgroundColor: T.card, borderRadius: 12, padding: 14, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: T.border },
  receive_addr:    { color: T.gold, fontSize: 12, fontFamily: T.fontMono, textAlign: 'center' },
  warning_box:     { backgroundColor: T.redBg, borderRadius: 12, padding: 14, marginTop: 20, width: '100%', borderWidth: 1, borderColor: T.red + '44' },
  warning_txt:     { color: T.text2, fontSize: 12, lineHeight: 18 },
  diversif_card:   { backgroundColor: T.orangeBg, borderRadius: 12, padding: 14, marginHorizontal: 14, marginTop: 16, borderWidth: 1, borderColor: T.orange + '44' },
  mover_card:      { backgroundColor: T.blueBg, borderRadius: 12, padding: 14, marginHorizontal: 14, marginTop: 12, borderWidth: 1, borderColor: T.blue + '44' },
  mover_txt:       { color: T.text2, fontSize: 12, lineHeight: 18 },
  period_chip:     { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: T.card2 },
  period_chip_on:  { backgroundColor: T.gold },
  period_chip_txt: { color: T.text3, fontSize: 11, fontWeight: '600' },
  period_chip_txt_on: { color: '#000' },
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
  history_amount: { fontFamily: T.fontMono, fontSize: 13, fontWeight: '600' },

  error_box:       { backgroundColor: T.redBg, borderRadius: 12, padding: 12, marginTop: 16, borderWidth: 1, borderColor: T.red + '44' },
  network_badge:   { backgroundColor: T.orangeBg, borderRadius: 8, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: T.orange + '44' },

  settings_section:   { color: T.text2, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  settings_row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: T.border },
  settings_row_on:    { borderColor: T.gold, backgroundColor: T.goldBg },
  settings_row_title: { color: T.text, fontSize: 14, fontWeight: '600' },
  settings_row_sub:   { color: T.text2, fontSize: 11, marginTop: 2 },
  status_dot:         { width: 10, height: 10, borderRadius: 5 },

  bottom_nav:  { flexDirection: 'row', height: 64, backgroundColor: T.card, borderTopWidth: 1, borderTopColor: T.border, alignItems: 'center', justifyContent: 'space-around', paddingBottom: 4 },
  nav_item:    { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  nav_item_big:{ flex: 1.2 },
  nav_big_btn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    shadowColor: T.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6,
  },
  nav_lbl:     { color: T.text2, fontSize: 10, marginTop: 3 },
  nav_lbl_on:  { color: T.gold, fontWeight: 'bold' },
  nav_icon_wrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nav_icon_wrap_on: {
    backgroundColor: T.goldBg,
    shadowColor: T.gold, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 5, elevation: 3,
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

  land_title:      { color: T.text, fontFamily: T.fontDisplay, fontSize: 30, fontWeight: '400', textAlign: 'center', lineHeight: 36, marginTop: 8 },
  land_title_grad: { color: T.gold, fontStyle: 'italic' },
  land_subtitle:   { color: T.text2, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 14, maxWidth: 340 },

  land_marquee:       { borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.stroke, paddingVertical: 12, marginTop: 26, overflow: 'hidden' },
  land_marquee_track: { flexDirection: 'row' },
  land_marquee_item:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  land_marquee_icon:  { fontSize: 15 },
  land_marquee_sym:   { color: T.text, fontSize: 13, fontWeight: '700' },
  land_marquee_chg:   { fontSize: 12, fontWeight: '700' },

  land_section:         { paddingHorizontal: 20, paddingTop: 34 },
  land_section_eyebrow: { color: T.cyan, fontSize: 11, letterSpacing: 1.6, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  land_section_title:   { color: T.text, fontFamily: T.fontDisplay, fontWeight: '400', fontSize: 24, textAlign: 'center', lineHeight: 30, marginBottom: 20 },

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
  onboarding_dot_on:  { backgroundColor: T.gold, width: 18 },
  calc_card:      { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 16, marginBottom: 20 },
  sim_card:       { backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 18, marginTop: 8 },
  sim_row:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  sim_row_lbl:    { color: T.text2, fontSize: 13 },
  sim_row_val:    { color: T.gold, fontSize: 15, fontWeight: 'bold' },
  calc_sym:       { color: T.text2, fontWeight: 'bold', fontSize: 13, marginLeft: 10 },
  calc_result:    { color: T.gold, fontSize: 18, fontWeight: 'bold', marginTop: 10 },
  compare_table:  { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14, marginTop: 8, overflow: 'hidden' },
  compare_row:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  compare_head:   { color: T.gold, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  compare_label:  { color: T.text2, fontSize: 12 },
  compare_cell:   { fontSize: 12, textAlign: 'center' },
  compare_cell_us:{ color: T.gold, fontWeight: '600' },
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
}