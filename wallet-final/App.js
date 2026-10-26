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
  useWindowDimensions, AppState, Share, Vibration, AccessibilityInfo,
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
import * as Font from 'expo-font';

// Cloudflare Pages refuse d'uploader tout fichier sous un chemin
// contenant "node_modules" (comportement cote plateforme, pas un bug
// de config) — la police Ionicons vendue par @expo/vector-icons vit a
// .../node_modules/expo/node_modules/@expo/vector-icons/... et finissait
// donc en 404 (fallback HTML de la SPA) en production, cassant toutes
// les icones. On heberge une copie dans ce depot (assets/fonts/) et on
// la precharge sous le meme nom de famille AVANT le montage de tout
// composant <Ionicons>. expo-font deduplique par nom de police + verifie
// une promesse deja en cours avant de charger quoi que ce soit : cet
// appel gagne toujours la course et l'appel interne de @expo/vector-icons
// se contente de reutiliser cette promesse, sans jamais toucher au
// fichier casse.
Font.loadAsync({ Ionicons: require('./assets/fonts/Ionicons.ttf') });
import * as localWallet from './lib/wallet';
import * as walletConnect from './lib/walletconnect';
import { buildInjectedProvider } from './lib/dappBrowserProvider';
import { simulateTransaction, decodeKnownCall, analyzeTypedData } from './lib/txSimulation';
import * as approvals from './lib/approvals';
import { looksLikePoisonedAddress } from './lib/addressSafety';
import * as recurringBuy from './lib/recurringBuy';
import * as bridge from './lib/bridge';
import * as defiPositions from './lib/defiPositions';
import * as Notifications from 'expo-notifications';
import { translate as i18nTranslate, SUPPORTED_LOCALES, INTL_LOCALE_TAG, detectDeviceLocale } from './lib/i18n';
import { DESIGN_TOKENS } from './lib/designTokens';
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
  // Accent principal (boutons, onglet actif, coches, favoris…) = vert
  // NexiaWallet, aligné sur la landing publique. Nom "gold" conservé pour ne
  // pas toucher aux ~200 références dans les styles.
  gold:    '#10B981',
  goldBg:  'rgba(16, 185, 129, 0.14)',
  goldLine:'rgba(16, 185, 129, 0.38)',
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
  bg:      '#f6f6f8',
  card:    '#ffffff',
  card2:   '#f0f1f4',
  border:  '#e7e8ec',
  borderSoft: '#eff0f3',
  // Accent principal = vert NexiaWallet, aligné sur la landing (voir DARK_THEME).
  gold:    '#10B981',
  goldBg:  'rgba(16, 185, 129, 0.12)',
  goldLine:'rgba(16, 185, 129, 0.38)',
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

// Sur un appareil réglé en français, le clavier "decimal-pad" affiche une
// virgule (pas un point) comme séparateur décimal — mais parseFloat/Number ne
// comprennent que le point. Sans ça, "12,5" est lu comme 12 par parseFloat
// (il s'arrête à la virgule), silencieusement : un montant tronqué envoyé/
// swappé sans aucune erreur visible. On normalise donc dès la saisie, sur
// TOUS les champs de montant (swap, envoi, achat/vente, pont, alertes...).
const normalizeDecimalInput = (v) => v.replace(',', '.');

// ethers.js (v5) colle parfois le JSON-RPC brut ENTIER dans error.message
// (utile en debug, mais un vrai utilisateur a fini par voir un pavé JSON
// illisible dans une alerte "Erreur" — cas réel remonté par Pablo sur un
// swap qui a échoué faute de marge pour le gas). On reconnaît les cas
// fréquents pour un message clair, et on réduit tout le reste à un message
// court plutôt que d'afficher le JSON brut. Utiliser partout où une erreur
// de transaction (send/swap/bridge/stake/NFT/paiement...) est affichée.
const humanizeTxError = (err) => {
  const raw = String((typeof err?.message === 'string' && err.message) || (typeof err === 'string' && err) || '').trim();
  if (!raw) return null;
  if (/insufficient funds/i.test(raw)) {
    return 'Solde insuffisant pour couvrir le montant ET les frais de réseau (gas) — laisse un peu de marge.';
  }
  if (/nonce too low|already known|replacement transaction underpriced/i.test(raw)) {
    return 'Une transaction est déjà en cours sur ce wallet — réessaie dans quelques secondes.';
  }
  if (/timeout|network ?error|ECONNABORTED/i.test(raw)) {
    return 'Le réseau ne répond pas — réessaie dans un instant.';
  }
  // Erreur HTTP d'axios : « Request failed with status code 503 » s'affichait
  // tel quel à l'utilisateur. Serveur en panne ou surchargé → message clair.
  const httpStatus = err?.response?.status || Number((raw.match(/status code (\d{3})/i) || [])[1]);
  if (httpStatus >= 500 || httpStatus === 429) {
    return 'Le service ne répond pas pour le moment — réessaie dans un instant. Tes fonds ne sont pas concernés.';
  }
  // Sinon (400, 404...), le backend explique POURQUOI dans sa réponse — la
  // raison de l'agrégateur de swap, par exemple. « Request failed with status
  // code 400 » n'apprend rien ; cette explication-là, si.
  const duServeur = err?.response?.data?.error;
  if (typeof duServeur === 'string' && duServeur.trim() && duServeur.trim().length < 200) {
    return duServeur.trim();
  }
  // Ethers ajoute parfois "[ See: https://... ]" ou "(error={...})" avec le
  // JSON-RPC complet à la suite d'un message par ailleurs correct — nos
  // propres `throw new Error(...)` (messages métier) n'ont jamais ça.
  const looksLikeRawDump = /\[\s*See:|\(error=\{|"jsonrpc"/i.test(raw) || raw.length > 200;
  if (looksLikeRawDump) {
    const cleaned = raw.split(/\s*\[\s*See:|\s*\(error=/)[0].trim();
    return cleaned && cleaned.length < 120 ? cleaned : null;
  }
  return raw;
};

// Réserve de gas conservatrice à laisser de côté quand un bouton "Tout" /
// "MAX" / "100%" vide le solde du token NATIF d'un réseau (ETH, BNB,
// MATIC...). Sans ça, mettre 100% du natif dans le montant envoyé/swappé
// laisse 0 pour payer le gas de la transaction elle-même, qui échoue avec
// "insufficient funds for intrinsic transaction cost" (bug réel remonté par
// Pablo sur le bouton "Tout" du Swap). Valeurs volontairement généreuses —
// mieux vaut laisser un peu de poussière que faire échouer la transaction ;
// n'affecte que ces boutons de raccourci, jamais le solde réel affiché.
const NATIVE_GAS_RESERVE = { ethereum: 0.004, bsc: 0.002, polygon: 0.05, arbitrum: 0.001, optimism: 0.001, base: 0.001 };
const getNativeGasReserve = (net) => NATIVE_GAS_RESERVE[net] ?? 0.003;

// Affichage de l'indicateur de gas en direct (voir addGasSample) — 'low'/
// 'high'/'normal' viennent de la comparaison à l'historique du réseau,
// jamais d'un seuil absolu.
const GAS_LEVEL_LABEL = { low: 'Faible', normal: 'Normal', high: 'Élevé' };

// ═══════════════════════════════════════════════════════════
//  DOCUMENTS LÉGAUX — texte affiché tel quel dans Paramètres et le footer de
//  la landing. Gabarit générique pour un wallet non-custodial ; à faire
//  relire par un juriste avant un vrai lancement à grande échelle, mais
//  couvre déjà les points essentiels (pas de garde de fonds, responsabilité
//  utilisateur sur la phrase de récupération, absence de collecte de
//  données personnelles).
// ═══════════════════════════════════════════════════════════
const LEGAL_DOCS = {
  about: {
    title: 'À propos de NexiaWallet',
    updated: '11 septembre 2026',
    body: `Qui est derrière NexiaWallet ?
NexiaWallet est développé par une personne indépendante, Pablo, entrepreneur individuel enregistré en France (SIREN 108 689 357). Ce n'est pas une société avec une équipe et des investisseurs : c'est un projet solo, construit petit à petit, avec un objectif simple — un portefeuille crypto vraiment accessible, en français.

Pourquoi ce wallet ?
La plupart des wallets sérieux sont en anglais et pensés pour des gens déjà à l'aise avec la crypto. NexiaWallet essaie l'inverse : une interface épurée, en français, pour quelqu'un qui débute et qui a surtout peur de se faire avoir.

« Non-custodial », ça veut dire quoi ?
Custodial : une plateforme (un exchange par exemple) détient tes cryptos pour toi. Si elle est piratée, fait faillite ou gèle ton compte, tes fonds sont en danger.
Non-custodial : toi seul détiens tes cryptos. Concrètement, quand tu crées un wallet ici :
• Une phrase de récupération (12 mots) est générée sur ton appareil. C'est LA clé de ton wallet.
• Cette phrase et ta clé privée ne quittent jamais ton téléphone : elles ne passent par aucun serveur NexiaWallet et ne sont enregistrées nulle part ailleurs.
• Chaque transaction est signée sur ton appareil ; seule la transaction déjà signée (une donnée publique) est envoyée au réseau.
La contrepartie : si tu perds ta phrase de récupération, personne — ni moi, ni personne — ne peut te redonner l'accès. Note-la sur papier, hors ligne, et ne la partage JAMAIS. Si on te la demande, même au nom du « support », c'est une arnaque.

Ce que NexiaWallet ne fait pas
• Ne détient jamais tes fonds ni tes clés.
• Ne demande jamais d'email, de nom ou de compte pour créer un wallet.
• Ne vend aucune donnée, n'utilise aucun tracker publicitaire.
• Ne donne aucun conseil en investissement. Ce que tu achètes, gardes ou vends reste ta décision et ta responsabilité.

Comment le projet se finance
Une petite commission est prélevée sur les opérations optionnelles : 0,75 % sur un échange (swap) et 0,25 % sur un pont cross-chain. Une commission sur les achats/ventes par carte via un partenaire est à l'étude mais n'est pas encore active. Aucun abonnement ; envoyer, recevoir et garder ses cryptos est gratuit.

État du projet
NexiaWallet est jeune et évolue vite. Version web disponible aujourd'hui, application mobile en préparation. Les retours sont les bienvenus — c'est ce qui fait avancer l'app.

Contact : contact@nexiawallet.com`,
  },
  cgu: {
    title: "Conditions Générales d'Utilisation",
    updated: '11 septembre 2026',
    body: `1. Objet
NexiaWallet est une application de portefeuille crypto non-custodial : elle permet de générer, importer et utiliser un portefeuille multi-réseaux (Ethereum, BNB Smart Chain, Polygon, Arbitrum, Optimism, Base, Solana, Bitcoin) sans que NexiaWallet ne détienne ou ne contrôle jamais les fonds de l'utilisateur (voir §2 pour le détail du traitement de la clé privée). L'utilisation de l'application vaut acceptation pleine et entière des présentes conditions.

2. Nature non-custodiale
NexiaWallet ne détient et ne contrôle jamais les fonds de l'utilisateur. La clé privée et la phrase de récupération sont générées, chiffrées et utilisées EXCLUSIVEMENT sur l'appareil de l'utilisateur : elles ne quittent jamais cet appareil, ne transitent jamais par un serveur NexiaWallet et ne sont jamais écrites sur un disque ou une base de données qui nous appartient. Toute transaction est signée localement ; seule la transaction déjà signée (donnée publique dès sa diffusion) est relayée au réseau. En conséquence, NexiaWallet ne peut techniquement ni récupérer ni réinitialiser un accès perdu.

3. Éligibilité et usage autorisé
L'utilisation de NexiaWallet est réservée aux personnes majeures, juridiquement capables de contracter. L'utilisateur s'engage à ne pas utiliser l'application à des fins illégales (blanchiment, financement d'activités illicites, contournement de sanctions internationales, fraude). En tant qu'outil non-custodial, NexiaWallet n'effectue elle-même aucune vérification d'identité ; les contrôles d'identité (KYC) éventuels sont assurés par les prestataires tiers d'achat/vente mentionnés au §6.

4. Responsabilité de l'utilisateur
L'utilisateur est seul responsable de la conservation de sa phrase de récupération et de son code PIN. Leur perte entraîne la perte définitive et irréversible de l'accès aux fonds. NexiaWallet ne peut en aucun cas restaurer un accès perdu.

5. Transactions
Les transactions sur une blockchain publique sont irréversibles. L'utilisateur doit vérifier l'adresse et le montant avant toute confirmation d'envoi. NexiaWallet n'est pas responsable des transactions envoyées à une adresse erronée, y compris via une interaction avec un contrat intelligent tiers (dApp connectée en WalletConnect ou via le navigateur intégré).

6. Services et prestataires tiers
Achat de crypto par carte : Coinbase Onramp. Vente de crypto (mise en euros) : Coinbase Offramp — nécessite un compte Coinbase et sa propre vérification d'identité. Dans les deux cas, les fonds sont livrés ou prélevés directement sur l'adresse du wallet de l'utilisateur, jamais sur un compte détenu par NexiaWallet. Échange entre cryptos (swap) : agrégateur 0x. Transfert entre réseaux (pont) : agrégateur LI.FI. Dans ces deux cas, la signature de la transaction reste 100 % locale sur l'appareil de l'utilisateur. Connexion à une application décentralisée tierce (WalletConnect, navigateur intégré) : l'utilisateur interagit alors directement avec un contrat intelligent tiers dont NexiaWallet ne contrôle ni le code ni le comportement — vérifier la légitimité d'une dApp avant de s'y connecter reste de la responsabilité de l'utilisateur. Données de marché, historique de transactions et visuels NFT : CoinGecko, explorateurs de blocs (Etherscan et équivalents), Alchemy — fournis "en l'état", sans garantie d'exactitude en temps réel.

7. Commissions
NexiaWallet prélève une commission sur certaines opérations optionnelles, intégrée et affichée dans le taux proposé avant confirmation : 0,75 % sur un échange (swap) et 0,25 % sur un transfert entre réseaux (pont). Générer, importer, envoyer, recevoir et conserver des cryptos reste gratuit, sans abonnement. Le détail à jour de ce financement figure dans la page "À propos de NexiaWallet".

8. Limitation de responsabilité
NexiaWallet est fourni "en l'état", sans garantie d'absence d'erreur ou d'interruption. L'utilisation de cryptomonnaies comporte des risques de marché et de sécurité que l'utilisateur accepte en connaissance de cause. NexiaWallet ne saurait être tenu responsable des conséquences d'une décision d'investissement, d'une action d'un prestataire tiers, ou d'une interaction avec un contrat intelligent tiers.

9. Résiliation
L'utilisateur peut cesser d'utiliser NexiaWallet à tout moment en désinstallant l'application ou en supprimant son wallet local — sa phrase de récupération reste alors le seul moyen d'en retrouver l'accès ailleurs, y compris dans un autre wallet non-custodial compatible. NexiaWallet peut faire évoluer, suspendre ou arrêter tout ou partie du service sans que cela n'affecte les fonds de l'utilisateur.

10. Droit applicable
Les présentes conditions sont soumises au droit français. À défaut de résolution amiable, tout litige relève des tribunaux français compétents.

11. Évolution
Ces conditions peuvent être mises à jour ; la date de dernière mise à jour figure en haut de ce document. Contact : contact@nexiawallet.com`,
  },
  privacy: {
    title: 'Politique de Confidentialité',
    updated: '11 septembre 2026',
    body: `1. Aucune donnée personnelle collectée pour créer un wallet
NexiaWallet ne demande ni email, ni nom, ni numéro de téléphone pour créer un wallet. Aucun compte utilisateur n'existe côté serveur.

2. Ce qui reste uniquement sur l'appareil
Le code PIN (chiffré), les favoris, le carnet d'adresses récentes, les alertes de prix et les préférences d'affichage (devise, langue, thème) sont stockés localement (stockage sécurisé du système ou stockage du navigateur). Rien de tout cela n'est envoyé à un serveur NexiaWallet.

3. Ce qui ne transite JAMAIS par le serveur
La clé privée et la phrase de récupération sont générées et utilisées exclusivement sur l'appareil (génération, chiffrement et signature des transactions 100% locaux) — elles ne sont ni envoyées ni conservées, même temporairement, par un serveur NexiaWallet. Le serveur reçoit uniquement des données publiques de blockchain nécessaires au fonctionnement : adresse publique (pour consulter un solde ou un historique), transaction déjà signée (pour la relayer au réseau). Ces dernières sont publiques par nature sur une blockchain.

4. Fournisseurs tiers utilisés
Les prix de marché (CoinGecko), l'historique de transactions (Etherscan et équivalents), les visuels NFT (Alchemy), l'achat/la vente par carte (Coinbase Onramp/Offramp), l'échange entre cryptos (0x) et le pont entre réseaux (LI.FI) sont fournis par des services tiers ; consulter leurs propres politiques de confidentialité pour le traitement effectué de leur côté. NexiaWallet ne leur transmet jamais votre clé privée ni votre phrase de récupération.

5. Suivi d'erreurs (Sentry)
En cas de bug, un rapport technique (message d'erreur, type d'appareil, version de l'application) peut être envoyé à Sentry, l'outil utilisé pour détecter et corriger les problèmes. Aucune donnée sensible du wallet — clé privée, phrase de récupération, code PIN — n'est jamais incluse dans ces rapports.

6. Mesure d'audience
Le site nexiawallet.com utilise Umami pour mesurer sa fréquentation (nombre de visites, pages consultées sans leurs paramètres d'URL, site de provenance, pays, type d'appareil et de navigateur). Umami ne dépose aucun cookie et ne sert pas à identifier individuellement les visiteurs. Il ne reçoit aucune donnée du wallet : ni clé, ni phrase de récupération, ni adresse, ni solde.

7. Cookies
Aucun cookie publicitaire ni cookie de mesure d'audience n'est déposé sur ce site, et aucun outil publicitaire n'y est utilisé.

8. Vos droits
Pour les données techniques limitées décrites ci-dessus, vous disposez d'un droit d'accès, de rectification et d'effacement. Pour l'exercer, contactez contact@nexiawallet.com. Vous pouvez aussi introduire une réclamation auprès de la CNIL (cnil.fr).

9. Contact
Pour toute question sur cette politique, contactez contact@nexiawallet.com ou consultez les informations listées dans les Mentions Légales.`,
  },
  mentions: {
    title: 'Mentions Légales',
    updated: '11 septembre 2026',
    body: `Éditeur du site
NexiaWallet est édité par Pablo, entrepreneur individuel (micro-entreprise), SIREN 108 689 357, SIRET 108 689 357 00011, activité déclarée : programmation informatique (code APE 62.01Z). Entreprise à statut non-diffusible : l'adresse professionnelle n'est pas publiée ici, mais communiquée sur demande légitime (autorité, procédure judiciaire) via contact@nexiawallet.com.
Directeur de la publication : Pablo.

Hébergement
Backend applicatif hébergé par Railway (railway.app). Application web hébergée par Cloudflare Pages (pages.dev).

Nature du service
NexiaWallet met à disposition un outil technique de génération et de gestion de portefeuille crypto non-custodial. NexiaWallet n'est ni un établissement de paiement, ni un prestataire de services sur actifs numériques (PSAN) au sens où elle ne détient jamais les fonds des utilisateurs.

Propriété intellectuelle
L'interface, le code et les visuels de NexiaWallet sont la propriété de leur auteur, sauf logos et données de marché appartenant à leurs fournisseurs respectifs (CoinGecko, Coinbase).

Contact
contact@nexiawallet.com`,
  },
};

// Mini-onboarding affiché une seule fois, juste après qu'un NOUVEAU wallet
// (pas un import) a confirmé avoir noté sa phrase de récupération — le
// moment où l'utilisateur vient de tout mettre en place et est le plus
// réceptif avant de découvrir l'app par lui-même.
// Textes dans lib/i18n.js (onboarding_s*_title / onboarding_s*_desc).
const ONBOARDING_SLIDES = [
  { icon: '🔐', titleKey: 'onboarding_s1_title', descKey: 'onboarding_s1_desc' },
  { icon: '📤', titleKey: 'onboarding_s2_title', descKey: 'onboarding_s2_desc' },
  { icon: '💳', titleKey: 'onboarding_s3_title', descKey: 'onboarding_s3_desc' },
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
    a: 'Ethereum, BNB Smart Chain, Polygon, Arbitrum, Optimism et Base côté EVM, plus Solana et Bitcoin en natif — solde, envoi et réception sur les huit. D\'autres tokens ERC20 peuvent être ajoutés en lecture seule par adresse de contrat.',
  },
  {
    q: "J'ai perdu mon téléphone, comment je récupère mon wallet ?",
    a: 'Installe NexiaWallet sur un nouvel appareil et choisis "J\'ai déjà un wallet", puis entre ta phrase de récupération de 12 mots. Sans elle, la récupération est impossible.',
  },
  {
    q: 'Le swap et l\'achat par carte sont-ils sûrs ?',
    a: "L'achat par carte passe par Coinbase Onramp — la crypto est livrée directement sur l'adresse de ton wallet, jamais sur un compte tiers. Le swap passe par l'agrégateur DEX 0x pour trouver le meilleur prix, mais la signature de la transaction reste 100% locale sur ton appareil, comme un envoi classique.",
  },
  {
    q: 'Comment vendre mes cryptos et récupérer des euros ?',
    a: "Via Coinbase Offramp (bouton \"Vendre\") : tu envoies tes cryptos à l'adresse de dépôt affichée, puis tu retires en euros par virement SEPA. Il faut un compte Coinbase (gratuit) et sa vérification d'identité — NexiaWallet ne demande jamais d'identité de son côté.",
  },
  {
    q: 'Est-ce que NexiaWallet prend une commission ?',
    a: "Oui, une petite commission sur deux opérations optionnelles : 0,75 % sur un échange (swap) et 0,25 % sur un transfert entre réseaux (pont) — toujours affichée avant de confirmer. Créer un wallet, envoyer, recevoir et garder ses cryptos reste entièrement gratuit.",
  },
];

// Vrais logos des cryptos, embarqués en base64 dans ce fichier (choix de
// déploiement du 2026-10-26 : l'outil de push GitHub n'accepte que du texte
// UTF-8, les fichiers PNG séparés ne peuvent pas être poussés par ce canal.
// Les logos restent donc dans le bundle, sans dépendance CDN au chargement.
// Ce sont les marques de leurs projets respectifs, utilisées uniquement pour
// identifier le token — NexiaWallet ne prétend pas les détenir.
const COIN_LOGOS = {
  ethereum:      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAAD6CAYAAACI7Fo9AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAk5ElEQVR42uzavUvVcRTH8ff53etDYNoeCC61pRCIgbT0IN4WdQoigvKBzKUhJ5OGykxILGmohrApIiQMh4ZoDYLGtqB/Iij1nhYnidq/9/0av9/x8DnnDAdJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJksqxeP913FrYCNRyKtRKjgPjczefHUNSeV5tfu649+jt9fmFl59mbjyZunxxuQ1JZVlZ3xpeXnv3cX5xozk5+/jDlenVIdQyXN3Lx9Lamx4yz0dUJ6uoAhisRY5cm3nYjVqCQS8fEfVTEdUI0N1s7gL0RFWNZNQHUUsw6IVbebrVW0V9LDP7M5skAEnCAFRjVydXj6LiGfSCLb5439HcywsBo0AHJACZScChCBrUaMxOrrajotVRsbp+NgeA8YReDshMIPqImPjVxlfgCyqWE71QS+ub3QmNqKrBCIDkoAiIiKFmM0en51a7ULEMeoFuT2a07bWdrlW1BtCTmfzN/vuRqlY1dn8z3Mm2V3OFcnUv0OH+7b7MnIjME/xXQjJAFROXpr5/A36g4jjRC/PgzvN29nZGCM4ktGcm/7L/3xnBWeo753qquzb/AlnUwvxh725+rDzLOI5/f9dzzswww1BsZRj7MrRWaQu0lULRlg4ULAwUhnmhFenKnX+BqYmJi8ZQ3imva2OibmgrxSq4MzEuSY0udGfcmKjRNLalcOY8PzckiAXKIIXzPOf6/A3ne+5zX7nvcxfzh550aMJ4BHNDbAM8CEy+78FzwDlSreSKXiMHD7/1BYIdkr4GYpYktJooX27q8BCpVjL0GplxY1RRbEa6C5tZE/MJbbmo9nOkWsnQa2LPkbcfItgCLMbmZgk9SujFds/BEVJtZOg1cHT/yb5wMa6I9cYN29wM29huCm1Q2+Pn/VovqRYy9Br4qFE8RWgC+36X5rKbjZ0RERNzioEnSbWQoVfcruOnF1AUk8BKbhkj9DQqJpt9b9xNqrwMveIaJaOh2ATMs80tNB+xudVyDuZqIEOvsL1HT39RMCV4jFvMAtBSo6mIo4tIlZahV9SBXT/tU+lNUozaNGxzS9kATUWsmWFmY6OVg7kqy9AramZw7nKkaZflIrvks2CXuCwfktg+0zvwBKmyMvQKOnT858Oyd1isMuazZYGeKRU72s2DeWKuojL0ivn+j8/ExbbXS7FRMMjtIOZJMeYy1pIqKUOvmLn/uLhUMA18idvFAF5cyNspDiwhVU6GXiGvH/5Fr/FYhFZLNG1zexihHilGDRs+LA7m4w8Vk6FXSOjCqihiKzBsl9xOtsHcKxXjc8xKUqVk6BWx+/jPhlBMA0/ZxuY2M8YAKyVNtZtHPk+qjAy9ImIm1gWxETNomzvCBrhL0qYoWzmYq5D8h5kK2H3s1JMu+Sb2Yu4w2wCPQux049CfgD+QOl6u6B3ue8d+1KeSzRHxrKQGHUBSU4rVLtn0cauZjz9UQIbe4ea35y0PxUbBEB3CBvCwQmO9Pa28yloBGXoH23f03QVWMQVabhvbdAZjA2YFJVNqcA+po2XoHersd07Ibo+FYisw3zadxUh8LqRxtdhA6mg5jOtQ743cv0TW9tLlYjCd5/JgrjTbbb0H/JF0E3JF70r7D58cVFlOSjwjUdDR1JC0WvI29/UMkGYtQ+9SM+r5qqJ4EajEbTGJYaGtxYULq0izlqF3odcPv7lQeBr0FUB2Z/5sv8wAklguM6V2ewFpdjL07vL7t76tQo0XiijWAf2dH/kVe/W5KvR1Fax/+u+n81XW2cjQu8vZv4w9Bpq2ebhTB3DXYoPNlxWaPje0eTHpxmXo3ePIvjODpRrbkZ4zblZlNb/M2DRNrCldTPdcHMjB3I3K0LvH+d4LzxIaB4aoXORcYjDDEttmmh88Q7oxGXp3+MGx0wuEJoSWVn1zK4GkZZK3hSNPzN2ADL0LnPnuCfWU5fMRxSiiv7KL+f8O5iLWwMyaH/77l1X/7qqFDP0O+929DyxDsdN4sW2qNoS7FsOjhHZ+a96mx0jXl6HX2+797w4ITwo9h91T3b35VR9q7EVaE3iir9U/h3RtGXq9FT3laqEt4AXVm7J/GoO9EDR+sfejHMxdT4ZeX7vfOPWw7VcQy6gtAXqc0q8IPUi6qgy9pl498dsIGIsinpc0UL/VnEuMpLkRsR6VG/92z335ebuaDL2e7m79c4mkLZgH6hs5lxjDSEhbFv7rr4+QPilDr5/Xdv2kH9rbiFhhHHUP3TbgAvS0aG9tNNt9pCtl6PXTO3dgbUQxCQzVPfL/jt14WDBVtmKUdKUMvV72Hn1nRIpvgJdid9dBElugJ0S8HG3uI12WodfHyVffl0o2hbQW6HdNDsbM0gDBOsJjpMsy9Pr489CvH1fEBDBClzIAPKhCE4WVr7JySYZeDwdO/GrQDSYlrbQpumVv/gk24AbSKkc5OWDyKitAhl4PZevCqCK2lvYCu6Sb2QZ7IdK285SrSZChV9/e4+/cZ7zdeKnpsgHcNdhIsIzQtNEwKUOvskPHz/ZSMqGIdUB/XS6t/P8MMCDFCw2V23rn9TVJGXpVtbi4AngJ3LUDuOvzIsRLrQ8+fIqUoVfRnn1vzmWmnBCxHLp4AHcNtgEaUqzAGsc9/aR8kqlyeprrImIjML/MyK8Tu+6WirHQx78BzpByRa+KXQdPLULssHikSw/GzDJ2L0HsiJh5gJShV8Ge4283ioa2hmIUe07+ZP80xtCPYu1/2DvbF7nOMoxf13PmzGzTpNltkvrSNG0aG4LQ1jYm2rQVIax5oZomm0TbD4r0m/gnCI1UKRSUECp+8aUgCCLWVsV/QJGo8QVExC/9IPiS2Z2dOXNmzvvz3DrPnvVkNU2yb7Nnk+c3HHaYDzszZ7jOfd/Xc9/P0dI4MRH4Nb/X3ObECX2tKdQTJE+BeL/T+DLW24AHSHU6ndKPweGEXmcuvf6jbSTOKvLDEGncLhs9jokGwUNGMJMqtRUOJ/S6khSNZ5RqTAOYcin7ilz4HUqpY02I22POCb2evHbprT1Q6hyA/U7kK0VAkQMUnhNPuVFWJ/R6cfGb328K1GmSR0XMbbwH3Fg2qNhKYpoizzfv6bmOOSf0+pBmdx8EMCOQ3U7ka5LC74FwJg2nPgSHE3odePXSmztBnlPkoxCp7fkkCZCgfV7v2RoRKAKPK8E5z5N74Vg1fO3S23CsivNU3ssAPijGoF5UotZGI45SzF6dQ9gfotHwoDyviqJ1ovrcfxKRCwDehMNF9A1D8BDJGQL7UDOxkLDkeYGwP8Bcex6zVzvodHrodgMEQYgoilEUGjWkPJ18BMRZsnBDQU7oG8Ndgx2+kJ8i1RERtOoRFasInmfXCPw/R7fbRxQlVvhpmiEMIwS9EEGw8LrWGqhVWi8AZILg0yLec9LZ5uYynNDHT7Sl9yTBMyLyvo0WOclFgVoR93p9tNudkcBt5E7TFEYLSIDlQ0SQZTmiYYx+EFrRD4cR8jxH9T+xoZTn9X6AZ9SOoTPmVgG/9vrP4Vg2u7QpvgTysxCZxAZBwqK1QZpkNjLHUYIkTVHkhRUKySXC6QcDhOGgFFEFSXiegu/7aLWaaE007XNSARBsLOwC5js08iqADhwuoo8DbfT0qIOLwIaInARIWoEPBzE6cz202/PozHURhkPkWb7sNFxEbL0exwn6/cEoK7AXhSRJIcZsdHSfItUJUTwKhxP6ODBG9hA4BeAhjBmSlcEWDjA3212ov+cDm4JrrUGuts6uMoTBYIig17fCj+PEvr4RdTwxgg+DPEXP2w2HE/p60mnGvkCfpFIfqQy4cQo8R9gvBX51Hr1uUAqwEvhalgTGGGTZouDDUS1v369y6olxIKUxp6ieMkaOD/9pnDHnhL5+TCaNQ1TqvEDuF5HxCFyAOE6ta96+WhpsvdCm1MbIWCKsMda4G5l1NqXv9QIMwmFp3MlY9C4io2P36PxPvNc/CIcT+nogIveC/AyBJ8sR1HV10I0xNnp253uYbXcwNzs/qpmtqy5Gxpw+V2LLF536fmjT+jCMkKX5f809cj3fHz6AQ0rJeSpOwuGEvtYY0dMEp0Vku4ism8C11jZyznd6aJcNLsNBZF30qpUVG0SVPZTGnS0lrOD7CxchowUE1+lCZKP6JMhjGs6Yc0Jfe5f9UYIvANgrIusgcNjUuB+M6u+FDrb5zoLBVhR1a2RZKnittS0jwtA69VXHXXVhWo894fcReFGUu3+bE/oakcRBSyCnlVJHALTWWihZltma2wq83Vlw0KMERm+uWzfZOj5JR8ZdJfhhbFcI1hoCE6R6GuTzW4q73CirE/rqUc2Jg4rquAA71yo9FxEbBXvdvjXXrq2/zWL9Xe8Bs+tTfrc8z21UDwJbx4/EbwUvqM7BahBYdhE4EfnxE3DcFLfj5g3IVD7VEO8LpK3N7wJkxQJXyhpsI4Fbx7rXDe36dFItV1UiWEfSNLNZxDjSemOMFXie5TaVFyMgACqCSq32u5LkNgEStLzfAEjhcBF9uTzzr5P0Ch4neRyQyRWJnABJFEWBQRihM9u1BtvcXNeK3Ua5TTAfvlqKwpQdd6FN6xcucKmt71eOLHbMnZRCPgGHE/pK+OXOnx0g8CKAh0VkxRNk/bLBpX11HvPXOugEbnN9X6cnv3Tqw6GdmrMNOFGManJuRUMvH6DhCwqN/XA4oS+HRs/3jTKnqdRhAM1bFPcSg60U+GhM1NbitoPNGJC87SP4jSBpjcYszTAYRAiCgfUnFpz65ZcwImiR/KjRxSndKVzHnLv32q2T3pMdVsp7DsBOEbm1elRrpFlup8fskVQTZCNIYHM6bOsX4UvjzpY2SZqi6ft2aq7ZasJvNKCUgojcSgr/HlJ90ptq/gLAZTicGXczigbvo5gvKjspdRMDjoDR1mCzETzolvVnkkLXdOeWyoyrE5Vxl5XGndYGBKCUsseNIDhiuygUnqgrAGI4XOr+bnzrb+/QK8y0YtUBd4NGkXJEtFs2uPQwGEa1bXDZLOhCI4nLBpwgtH+TJIExZlHU+F9k4TFJ4pj2jOuYc0K/MS898OAjhJwD+KDIderv0kEfDiI7A16NiCZW4MSdXX+v6dKcHZWtOu76wVKnnuT/G3OCvTD4NMF9cLjU/Xr4bG41yrxE8owItgPVZFg5vWXNIzuu2Qvt8zzLYeHmieB1Td3fDRFAa2Nr+SzPUWi9dD2eBCoaBKcE0tfS+iOAHA4X0a+lkPRZkGdA7iIxoupg6wVot22L6oKDbnddkU0j7tsBEbFOvW02Cvp2eW5xjzsRqebxiftAnqXKjsDhXPdr0cbb0fD0jEfuFxGlyw62OEps3/li95qIuPp7w6jOuzXrCo00zeE3fUxMNNFqteD7DSgLD0DMTMPLrgDowuGEPsJvmqMU71ldFHfHSWJr7uEwsjViuX2SE3htWGqI6ljbSN9sppiYaC0Ivulv9Tz1MUN+HMCP4XCpe1bkh+M4+Vy/39/TbneWzIDrTTZBdqdizOISZzUqOxzGe9Mk+3yRabcbjYvoGLm5T+VZ9lgSpxNZlsMY46L3JmVB8Imt20e/Z7PZeLzh+4cB/A53OHd8RO+H4eV+L3wjTbM/AEiV8kDe8adl01J206V5nv0+iuLvRkn2Wzic0AH82mh9kcCXQbwB8K9uWWazwgzgXwB8WyAXIPklAFfgcEIv6QB4W5R+xRjzFYH8BMAsSXH96fWGxAgB2AbxlgCv0PO+CuCnAObhcEK/Dn8PUv8HgLwM4CKAyySHpHI1e+1g+ZtwCPBXAnxdFC40d275IYB/wOGEfhNyAH/W9L8B4AIg3wPxDsDCib0uEAAKgP9m786//KrrO44/X597v9+ZyYQkwwRmJpklISsJgiyeBrSFSosLLrWIyznaHgseW63WvZWZLBMSSBBxidYqqWETE5EgEAS3sKRIcKExbAkECmQnRLJOJvP93s+rv5TjOTlAM5eZAeQ+/ofn+XzufX8+925w5Apgdiyl3wYeBqoUitD7YTfwM8e4wNHzo32jYaukWAT/clKGtAW4IUbPJ2oh8EtgD4UidPJ7UsPrrooxdtnxy8CdwN7X+gckhpIkkADtAW43viSImdt6h18DbKRQhD5AqsC6rOrvGrpsL0Z6GOgrYh+CyE2f0IPC35U0sy8NlwPri216Efpg2Q/8CnSpo7ttLwU9KSkr3s4PPElV4Anja03sJuorwGqgh0IR+hDYkjyy+4eJwmzhS7BWArsoDNC4TAg9C/wSe2EIYfZJbv4RsI1CEXoeHePa6yYfNyWh/ww8Uc6SK7BmmvjviPskHZBC8X24HCRhdEDitxLfkphVVbgKeAow/TSudVzSOrqxjkIRehoYn9inTJ00vvHEpnbRfz3AvVkaL7M0B7hesFnilfnRuFcoSRlok+3ropkTQvpV4Nd5tulN4xvU3jGmMYZ4isV4CsWlFjlWLE4jDaf3jijfPeO45jXAfvpv50K/acW746pHLe5FvBVphqARwDaFQwmEBTuBe8C34ewXwCPk1FRTX++DyevBbzRUgZspFCt6tvJLGxRYiziLkHRTLn8kpsmxWaIy/WdgXVpb/53MsdP2N4HfAD3FOI4/kkAC6MH8BnuR4ALqR1yeN/JxrWPK7a1jpypJPxKkbuAsw1rgUQpF6IDrhid3WeEnwDSF0JkkycyQpG93uXQ0oTbkPF33+xD1dZnZmO+DNgCV13rskhD0AY+Ar454VlbKvgE8kOcyUVNbW2hrbz5ase9swSxJnZKnAbeW9tfeSaEInT+qKNOy6Ox64VqhDwaF7iB9ljQ7o5KURpLPs8CtIWie7XmGm0BbJb02n9+lzGiL4UbDhSiZB/w078TipCnDRpZLlTNQ+CyEOeAP2tTGzNeHoGXFLcQi9OezOSi7PMbsbsNBieMlfUpB89OE86rtzdMr41tqyOepp+O4q1HowvEy4G7EvtfEdl5CAsRewSrblyLNbO4ZcS2wiRw6xjTVtLS3TE+Vnid0kaRPgY4HDtrZ3Y5eDGyiUIT+AtZiXwFeD0RQHWiGpC8mCrNS9J7Y0dTW0zQypf8isC7Lev8jZtVZwBXAeqDvT3McJyQBHAStAy/BnlWqhO8C64FIP42Z3Jy2tjW3pZH3BJgl+ALoz4A6IALrgSuW9K5eS6EI/cXUJL7NzpaBnraNHRE0Cc4NkbnB4XN15brTOKf9CPLZB9wZgy62fRH2LYhtf1qXZYREBmzFrLCZpxAWAKtyTjTY2eYjVNEbkT4vaS7mfUCzHcFGsMOOP0xC8lOgGHEUof+/9hkvtePtiB4sbIMtYJIUPhoU5ipLP8axx5wUjxtXRz5bslLlB4Y5jvEr4DuA3ZJe3au7BGIXcDuOl4ow50DpiGXAVnIYN665bmxb88lRyceEuoXOR0w6ZGTZY3x7Iv8A2EuhCP0wPY5Zgr1WIjvkf9zDEKdL4QKJuYq8N04Z316ZMCnN+XZ+bbmmfhGOXdiXY60Fel9dwQtJgA4IrRF8J3HsOqIUvgU8kOfyydFHjU7HjG1qJ/pcpG4pXCA4HTwM+5CDNl4b4XvA4xSK0PsjKZXusvk+sEkSz7EjtkE0AGeHwJyQ8q+lEN78xclbGtsmtAT67yBwT4YW2u4GfgzaIinjFb+dF5IyYBN4OTAnI7kEuBc4SD81d7SGtnGtjaGcnimFfxNhDuZsRINtbB86qtuEfW01+i4KRei54ovhekffCNqlQ4KL8bngdYzE+QrMCwmfHFZTO2P8xObh5PMMsJzAnOh4ie2fC3ZIiiBeaYSipO3gnzr6ElA3cGPeb7W1NowcXiLMkMMnpXAh0nnAeGwc4/P9xGGX7Zsc9CPgIIUi9Jy2koTFtlcLVSRxKDsClCW9QSF8XiGZG+wPTZ82adKxkyeUyWd9ediBbweyLxHjIuB3EgcAQLwyqMfwG8f4DfCXaqo138l7Cq396Jby2LEtk1H8sMRcSZ8XegOmbBs4lABVDKuRFwNbKRShv0T3O2ZLLT8mYZ6HbWKMAPWSzgyoS9AZyz5r6rRjRp/cPjHQf33Amqwav07Muu24TOhx6eU6XSdAIFWAx8BLIeuOhG8Ca4E++ml007Awrr35qCRJz1KgU3KX4Eyg3o6AeT6SDDxme+mOvynfT6EIfSAo1QrHeANo54tFFmPE0YDGIj4MzIvoE3vrspNPnVKpJ589wC04zrbjQuw7QLukYBBDQ0iy0LPYK7EXJLEyB7gV2EMOpePq6mvL9acYfcIwD/QhYIxt7MgLE8BO7BsSuLkYpRWhD6SdIdPVMYsrbffwoowdsR2ETlDQpwnqTtPyRyZPbZ8+9YQpuU/XVdxzpWEW+FvAvcA+0BBEzl7gHjt+M8RsVh3JVcBGcmiZ2FTT3tY8PVTDPwQlc6XwL4YTjINtDkOP7ZWkvrr4bnsR+mB42PZiYM3hnlU3BhiF9LYQkjlBYWZweMfrjp/acuK0E5Kcb+dX43ShHTuxr5BYL6ky8OM4AeqTWGd7SYzuIugS4Nd5tukNY9uS5rbWMTbvBGaBZoPeAhrVnzvrEmuELgceplCEPhj27g+rHH2N0EYpcDgcI7YBGkHnQpifmc8djPtPnTxp4hHksxdYqZBcaHOR8a3AdokoaQDOpisKtoF/guJ8lyrzgNuBfeQwuWX4EfVUT0tD/JzEfNB7gUY7YsfDjRzQRuNrhjdkqygUoQ+i3tRheYzZbYg9hx2VjR3BDkJTgI8LX1giOX/KtGNOHD9hzDDyebq0r+Zaorrs+DVgFSj36TpJCO0C7gJfBu7aH3qWAjvIYWTL2GGtHc0nAR8VXCj0T0KTbQfb/f0f+h7bt8Y0XV6M0orQh8J22UuwV4MqIPrDNuA64IygMDMozJXi+6ZMm9wxfcLUlP6rAvdnsfo1YuzE8XugBxG9/RvHqdfofhMXR+IF+8rVRcCDeU61TWhtS5s62saZ+AHBXEldSKcDdbbJoQKsDklYAmynUIQ+FHas2fNbZ/EaYIMk+ss2tkFqAJ0t1A3+gkt9f3HstI6GiVNGif7rBe6O+GLsudg/Rtoskb3wCi8QGbARvBwzNyReCNwD9NJPrZNHq6X1qCMr9J4R8BclzQHejnToqbb+ruYbshiv3lHX+Jr/z3kR+tCKZYWbo32DxDOScv+437ZA7cD5BBZY4WNJOPK4CROOryGfHa9vOPo6CJ3grwKrhfYcGrskJHYDv7J8WVDoqn/69OuBZ8hh9ISjaugtHZ8o+UdJFwufJ2izLcdIHpIQesb28iwprQAihVy08GvFt/PI79gk0TzgbOMa2+QnACTtRKy0s5sc4z1ZFjYCfeSwYd2G4Q46ReidQeHMGOPk3bv31u3dt/+A7XXYv0Ba4XL6u7zXR1tbGsuJQzvoVODdwF/aPnKAxnoHBbdEYlfxlr1Y0V9ODxuuivhBXvJ9cgNGolFwrhQWSMkFaaKzatJk9IiRrcp59/2OGOJc49m2f4z4b8Py6Dg7C8wD7soTeUdar46m0UcF662GTmCB0DmgAYkcKYIfgOzKIvIi9JddcOmXdlwK3sKh8m/nwRor6e+QFkT8z/v3bzkpUK0nn917RzXdnOEuBT6jhJmrtm5bAezJt4o31HNk3cmgT4IuBn0YGBNt7DgwncMWrGXlrLqSwkumyxbdSOEla69anUgfAEZgMzCEBKDdxvcQfRP4jiytPv5yjJj+5/dbaiuheozkM0R4F3AqMMI2Obz4KA3/II3JRcBTFF6yhMJA2G2F7eCJQaEDSBhAErUBTUSaAbQFqy91sqvaywHADLJ1jz2T/GHbzmYT3xzQxyWdB3odUDPQkQv1Ye5E4bJiy15s3V9xappOuA/7KuBRSQwk20SMRKOk90KYb+nTpdp0RimkIxhEGx56YmTSe+C0kPEZ0HzEOaBGO2KbgSUQj2JfNeLA+PsoDBgt/HKxdR9AoyjTGUJyHrjBNgNNEv+nB7jPMS6T/bNUpSeAPgbI2kfW1yQxjosObwG9H3QiUAcAZuAJiWeNF1fq0vnAbgoDRgu+XoQ+wE4Meu7Chmvph5zBb5X5ueHmiFYfqFa2AVVyemLzlrS0r9ISiacS9C7QmTbNAGAGUS/4NkM3sIbCgNKli4o5+iB4h2E2cLJtMYhCCAC2/aThphjj8iQNvz/m5AO7+1Pm3d9u1O7a+0c54QRZ52C/S1KbQXZkMEky+LcRdwO3UChexr0alNLypmpWHSaF6ZJGgBkstgEkaRRwvOB1oLpdW5O92zcnew9ndb9tyeZhB0s7phm/H/iUxNsINAKyPdiRA9rsyH8eLA+7rviN0uDQwkUrKAyKduzuIL0PPMw2Q0JC8AfDKvDyEPkvV7UJ6OMQ969fXxMCrQnJn0v622jeBG5giEgC6HH0slRhNrCRQvHW/VXmKcOV4F8LVUEMCRvQkZLeLcLFVugk8V8p8ZEbejsE8Oy6Wj264aHRSeCvpWQmChcbvVOigaFVxdxrfGUR+eBS5/eKFX0QlUfuy/5eSr4ATLIjQ0USkrCpgB/Cui6am3duf2br/7Z3Lz9W3nUcx9+f5wxiaUVN3JhuqhsTY+Nf4D9gUrswmrjSmOjCdONCY0yqOzVp7EI3jVwqw1DuAwONMFAp1I5QJCp3KVKQlkI7zHAbLsOc5/dxo01MkUthmPM85/P6C05O8j7P5fc7v+/E5KXHoXzN8A1JXwDNsw2Yh0cI3rTLc9crBoGbxKzRc7/dQMyqz5iBn0j6Lr7Nktvsv52/ZPPa+PsThycnLj5p8xXBQgMwJ5/pgu2l8zr8CjhPzKqBkj/+zbbzwBAVnxP6qsTHH2bstgGQ9EnjpxBPIcDGzAUB3ADvAA8l8v/IM3or/N3Ui4GDczUT3TbYSGLuCEkAB4BFWS//r4TeGtOd6V3F9UbMORBzw9gGMyckAJ8tLhtn6oHMSvtAQm+Ta6KztpSyDftqcyalPjg2U7ZHB9RZC1wnACCht87xSloE7BXU9BOpBu81Xgz8k/hAQm+hi9ML37B5SVX1ltQfX78kJJ1w5RWfmD67l/gfCb2dZjoD9Ugp3VGJK+r5+ef3Hznocilla7f25mxx/bCE3l7j4JU2Y6AWbxQRNjfBY1CtBMaJD0noLTb5vad31y5LwEfbelWXQHC4lHrxi+Or3iBuKaG3m13V24rLOuBc22KXBHDWLus6N2a2Z7zxbST01rtcCquLvRV0tS2xSwKYcvEWrNXAFeL/S+h94Tj4d+A9SG76+roEgG32uPYi4ARxewm9P1y5PrXPlGHgX82/qgvgFC7D3cmpfcSdJfS+MdOhGrHLy8iXmxq7JIBLtje76owAXeLOEnpfOUNhiOIxYKaZt/CeAb9e5CHgXeLuJPT+cmF0517XXiJ0RFWzQpcqoDpkswT4C3HXEnr/ccWC7cVlk2CiKVtkJYEYp3jTx+ryCnFPEnp/uoxYZ5edwtO9/7wugGnXZadLWZ+ltN6U0HvQ5c8fPoQZtNnf8xtNhA1/q/Hgm8OLDxH3LKH3r7LQnVG7DAKnevWqLgngpCmDjzz2yLae/1HqYwm9d013ysBGF28GXZIqeokkgIsuHiml2phTXHtbQu9tZ4rLcuQxiVr0CgHUQn/CGgLOEj0tofe+fXQ9ZPsYEr1AAHDULiuAjDdugITeBPPqbXYZBs5LYm4JxDj28Eyn2k40QkJvhgk6rMR+Fbg5V7FLQvJN26+AVgKTRCMk9Ia4/vVvHrU8CNoPYu5Uf0Wd5cA/iMZI6M3hTmf+dlxWVeJMVVU8TJIAvV2XetWNmckdRKMk9GaZdpeRuvZW2w/xoAoBTNn1FuxNwDTRKAm9eU5AWYa9Byg8BIIa/GdVWgacJBonoTfQwivvjNleKunobN/CSxXAEbssnfri/D1EIyX0ZirzVI3aXgu8L2k2d7+9Z1jT0bxtQGbvNlRCb66JQr26dtmFVD/42AXQNWWHBrwauEA0VkJvsAXPPH3M1mqbg8yOA4I1wHGi0RJ6s7k7ML3VpTsEnJHEgyAJwdu2B1WVbUTjJfTmuyppfXH5A3BN0n1HDly1/TJdbQCuEY2X0NvhVKfSoNBuSZb0kSOXMDCGWA6cJlohobfElfkXd3eLV9g6AQLER2E4XvCKt6onMiutRRJ6e9QqnVGXegR8UeIeCWDSxcPqdrKU1jIJvV3eLXio2LtsahB3z127vIq7LwHniFZJ6G3zxJcOmDKEOCjpHt6ya7/x0MnP7soBjy2U0NunMF9bcVkmcbqqOnfe4iqdssuLnRtkvHFLJfR2mipiuLhs5bZnwwvbN0qpt9SUEeAq0UoJvb1Oy6zB3guYWzOwx/Ia4B2itRJ6iz3a9Wt2WQocl6pbrZkfw2UJjy14nWi1hN5uM6rnbXHxBvAlSQiQBOaCzfqZitGMN26/hN5+75XilcI7QVZVgWRgB3gVME60XkLvA49eP38Iey1wTKoQHC7Ua28+Xh0hItrj1y/88dO/eH7Dz3787O8Pfv+Z3/z0W99+/lNERPv8/Jerv/yjZ5d95wc/fOFJoq8MEP3kAHCA3hzOGhERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERcR/+DaRjfCC3oy8eAAAAAElFTkSuQmCC',
  bitcoin:      'data:image/png;base64,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',
  binancecoin:      'data:image/png;base64,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',
  solana:      'data:image/png;base64,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',
  tether:      'data:image/png;base64,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',
  cardano:      'data:image/png;base64,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',
  'polygon-ecosystem-token':      'data:image/png;base64,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',
  'usd-coin':      'data:image/png;base64,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',
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
  // cgId corrigé (2026-08-27) : 'matic-network' est l'ancien token, migré
  // vers POL en 2024 (capitalisation tombée à $0, absent du top 50 -> le
  // prix affiché ne se mettait plus JAMAIS à jour). 'polygon-ecosystem-token'
  // est le vrai id CoinGecko de POL (ex-MATIC) aujourd'hui. Symbole gardé
  // "MATIC" ici pour ne pas casser tout ce qui s'y réfère ailleurs (réseau,
  // écran d'envoi...) — à rediscuter si on veut afficher "POL" partout.
  MATIC:{ name: 'Polygon (POL)',  cgId: 'polygon-ecosystem-token', balance: 0,   icon: '🟪', color: '#8247E5', logo: COIN_LOGOS['polygon-ecosystem-token'] },
};

// Le wallet a une adresse EVM (0x...) et une adresse Solana (dérivée de la
// même mnémonique) : on ne propose l'achat que pour les tokens qui
// peuvent réellement arriver sur l'une des deux.
const BUYABLE_TOKENS = {
  ethereum: ['ETH', 'USDT', 'USDC'],
  bsc: ['BNB', 'USDT', 'USDC'],
  polygon: ['MATIC'],
  solana: ['SOL'],
  bitcoin: ['BTC'],
};

// Quelle adresse montrer sur « Recevoir » pour un jeton donné — même règle
// que l'achat, la vente et l'envoi : SOL vit sur Solana, BTC sur Bitcoin,
// tout le reste sur les réseaux EVM. Oublier cette correspondance affichait
// l'adresse 0x sous la fiche SOL : des SOL envoyés là sont perdus.
function receiveChainForToken(symbol) {
  if (symbol === 'SOL') return 'solana';
  if (symbol === 'BTC') return 'bitcoin';
  return 'evm';
}

// Le swap réel passe par un agrégateur DEX (0x) : on ne propose que les
// tokens pour lesquels le wallet peut réellement signer/diffuser une
// transaction (natif + ERC20/BEP20 configurés dans lib/wallet.js).
const SWAPPABLE_TOKENS = {
  ethereum: ['ETH', 'USDT', 'USDC'],
  bsc: ['BNB', 'USDT', 'USDC'],
};

// Vente de crypto (off-ramp) — active via Coinbase Offramp (backend
// /payments/create-sell-session quand PAYMENT_PROVIDER=coinbase). Aucune
// vérification business partenaire requise, contrairement à MoonPay dont la
// KYB a été refusée. L'utilisateur a besoin d'un compte Coinbase + KYC pour
// encaisser en fiat (SEPA). Réseaux : ethereum/base/polygon/arbitrum/
// optimism/solana (BTC/BSC non supportés par cette voie pour l'instant).
const SELL_ENABLED = true;

// Commission NexiaWallet prélevée sur chaque swap, en points de base
// (75 = 0,75 %). DOIT rester alignée sur SWAP_FEE_BPS du backend
// (crypto-wallet/src/routes/wallet.js) : le backend la transmet réellement à
// 0x, cette valeur ne sert ici qu'à l'estimation "Tu reçois" et à
// l'affichage de transparence.
const SWAP_FEE_BPS = 75;

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

// Refonte accueil — masquer le solde (comme les wallets de référence) :
// préférence locale, persistée, qui ne cache que l'affichage de l'accueil.
const HIDE_BALANCE_KEY = 'wallet-pro-hide-balance-v1';

const loadHideBalance = async () => {
  try { return (await AsyncStorage.getItem(HIDE_BALANCE_KEY)) === 'true'; } catch { return false; }
};

const saveHideBalance = async (enabled) => {
  try { await AsyncStorage.setItem(HIDE_BALANCE_KEY, String(enabled)); } catch { /* rien à faire */ }
};

// Refonte accueil — liste d'attente Carte Nexia : inscription locale
// uniquement, sans émission de carte, sans prélèvement, sans numéro de carte.
const CARD_WAITLIST_KEY = 'wallet-pro-card-waitlist-v1';

const loadCardWaitlist = async () => {
  try { return (await AsyncStorage.getItem(CARD_WAITLIST_KEY)) || ''; } catch { return ''; }
};

const saveCardWaitlist = async (email) => {
  try { await AsyncStorage.setItem(CARD_WAITLIST_KEY, email); } catch { /* rien à faire */ }
};

// Indicateur de gas en direct (avant même d'ouvrir Envoyer/Swap) — "c'est un
// bon ou un mauvais moment pour transacter ?". Un seuil fixe en Gwei ("< 20 =
// faible") serait faux à coup sûr : vérifié en direct sur les 6 réseaux au
// moment d'écrire ceci, Ethereum mainnet tournait à ~0,05 Gwei et Polygon à
// ~260 Gwei — l'échelle "normale" dépend du réseau ET dérive dans le temps
// (marché du gas, mises à jour protocolaires). On compare donc chaque
// nouvelle mesure à l'HISTORIQUE RÉCEMMENT OBSERVÉ sur CE réseau, sur CET
// appareil, plutôt qu'à un seuil absolu deviné — auto-calibré, ne peut pas
// devenir faux avec le temps. `GAS_HISTORY_SIZE` mesures par réseau suffisent
// pour une moyenne pertinente sans faire grossir le stockage indéfiniment.
const GAS_HISTORY_KEY = 'wallet-pro-gas-history-v1';
const GAS_HISTORY_SIZE = 12;

const loadGasHistory = async () => {
  try {
    const raw = await AsyncStorage.getItem(GAS_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch { return {}; }
};

const saveGasHistory = async (history) => {
  try { await AsyncStorage.setItem(GAS_HISTORY_KEY, JSON.stringify(history)); } catch { /* rien à faire */ }
};

// Ajoute une mesure à l'historique du réseau et renvoie { history, level } —
// `level` compare la mesure au reste de l'historique (médiane des mesures
// PRÉCÉDENTES, celle qu'on vient d'ajouter exclue) : 'low' sous 80% de la
// médiane, 'high' au-dessus de 130%, 'normal' entre les deux. `null` tant
// qu'il n'y a pas assez d'historique pour que la comparaison veuille dire
// quelque chose (3 mesures minimum) — mieux vaut ne rien afficher qu'un
// jugement basé sur une seule mesure passée.
const addGasSample = (history, network, gwei) => {
  const prevSamples = history[network] || [];
  const nextSamples = [...prevSamples, gwei].slice(-GAS_HISTORY_SIZE);
  const nextHistory = { ...history, [network]: nextSamples };
  if (prevSamples.length < 3) return { history: nextHistory, level: null };
  const sorted = [...prevSamples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return { history: nextHistory, level: null };
  const level = gwei <= median * 0.8 ? 'low' : gwei >= median * 1.3 ? 'high' : 'normal';
  return { history: nextHistory, level };
};

// Devise d'affichage (EUR par défaut — voir CURRENCIES). Persistée dès que
// l'utilisateur en choisit une autre dans Paramètres, sinon l'app repartait
// sur EUR à chaque ouverture même pour un utilisateur ayant choisi USD/GBP/etc.
const CURRENCY_KEY = 'wallet-pro-currency-v1';

const loadCurrency = async () => {
  try {
    const raw = await AsyncStorage.getItem(CURRENCY_KEY);
    return raw && CURRENCIES[raw] ? raw : 'EUR';
  } catch { return 'EUR'; }
};

const saveCurrency = async (code) => {
  try { await AsyncStorage.setItem(CURRENCY_KEY, code); } catch { /* rien à faire */ }
};

// Checklist sécurité gamifiée (Réglages) — deux étapes qui n'ont pas déjà
// leur propre état persisté ailleurs dans le fichier (PIN/biométrie/comptes/
// adresses en observation le sont déjà via leurs propres clés).
const SEED_BACKED_UP_KEY = 'wallet-pro-seed-backed-up-v1';
const KEYSTORE_EXPORTED_KEY = 'wallet-pro-keystore-exported-v1';
// Email optionnel lié à l'adresse du wallet (notifications futures,
// acquisition) — voir POST /profile/email côté backend. Aucune clé ni mot
// de passe : le wallet reste 100% non-custodial, ceci n'est qu'un profil
// léger côté serveur. Persisté localement pour pré-remplir le champ et
// afficher l'état "déjà enregistré" sans re-appeler le backend à chaque fois.
const PROFILE_EMAIL_KEY = 'wallet-pro-profile-email-v1';
const loadProfileEmail = async () => {
  try { return (await AsyncStorage.getItem(PROFILE_EMAIL_KEY)) || ''; } catch { return ''; }
};
const saveProfileEmailLocal = async (email) => {
  try { await AsyncStorage.setItem(PROFILE_EMAIL_KEY, email); } catch { /* rien à faire */ }
};
// Mode Débutant/Avancé : masque les sections WalletConnect/dApp browser/
// approvals/DCA/bridge/DeFi en mode Débutant. Défaut 'advanced' — un
// utilisateur déjà en place ne doit jamais voir des fonctionnalités qu'il
// utilisait déjà disparaître d'un coup après une mise à jour.
const EXPERIENCE_MODE_KEY = 'wallet-pro-experience-mode-v1';
const loadExperienceMode = async () => {
  try {
    const raw = await AsyncStorage.getItem(EXPERIENCE_MODE_KEY);
    return raw === 'beginner' ? 'beginner' : 'advanced';
  } catch { return 'advanced'; }
};
const saveExperienceMode = async (mode) => {
  try { await AsyncStorage.setItem(EXPERIENCE_MODE_KEY, mode); } catch { /* rien à faire */ }
};
const loadFlag = async (key) => {
  try { return (await AsyncStorage.getItem(key)) === '1'; } catch { return false; }
};
const saveFlag = async (key) => {
  try { await AsyncStorage.setItem(key, '1'); } catch { /* rien à faire */ }
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
    return SUPPORTED_LOCALES.includes(raw) ? raw : detectDeviceLocale();
  } catch { return detectDeviceLocale(); }
};

const saveLocale = async (locale) => {
  try { await AsyncStorage.setItem(LOCALE_KEY, locale); } catch { /* rien à faire */ }
};

// Thème clair/sombre — voir DARK_THEME/LIGHT_THEME tout en haut du fichier.
// Clair par défaut depuis 2026-08-28 (aligné sur les wallets grand public
// type Trust Wallet), persisté dès que l'utilisateur en choisit un autre
// dans Paramètres. Un choix "sombre" déjà enregistré avant ce changement
// reste bien respecté (seule l'absence de préférence bascule vers clair).
const THEME_KEY = 'wallet-pro-theme-v1';

const loadTheme = async () => {
  try {
    const raw = await AsyncStorage.getItem(THEME_KEY);
    return raw === 'dark' ? 'dark' : 'light';
  } catch { return 'light'; }
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
// dans le composant principal). Le natif continue d'utiliser CameraView.
//
// Deux voies, parce que la caméra en direct d'un navigateur reste fragile sur
// iPhone — le scan en direct y échouait encore après correction des
// redémarrages, sans qu'on puisse reproduire la caméra de Safari sur PC :
//
//  1. Scan en direct : getUserMedia + un <video> DOM inséré à la main dans
//     un View (React Native Web ne permet pas d'écrire <video> en JSX), et
//     jsQR sur des images copiées dans un <canvas>. Une ligne d'état dit ce
//     qui se passe (caméra démarrée ? images reçues ? image noire ?), pour
//     qu'une capture d'écran suffise à diagnostiquer un échec à distance.
//
//  2. Photo : <input type="file" accept="image/*">. Sur iPhone il propose
//     l'appareil photo NATIF — vrai autofocus, stabilisation — ou la galerie,
//     et l'on décode la photo. Sert aussi pour un QR reçu en capture d'écran,
//     et reste disponible quand l'accès à la caméra est refusé.

// Décodage en direct limité à ~8 images/s et à 960 px de côté : jsQR sur
// l'image pleine résolution à chaque rafraîchissement coûtait 39 ms par image
// en 1080p et 155 ms en 4K sur un PC — plusieurs fois plus sur un téléphone.
// L'aperçu, lui, reste fluide : c'est la balise <video> qui l'affiche.
const QR_DECODE_INTERVAL_MS = 120;
const QR_DECODE_MAX_SIDE = 960;
const QR_DECODE_FULL_SIDE = 640;
const QR_STATUS_INTERVAL_MS = 500;
// Sans aucune image exploitable après ce délai, on le dit à l'utilisateur.
const QR_NO_FRAME_AFTER_MS = 5000;
// Luminosité moyenne (0-255) sous laquelle l'image reçue est considérée noire.
const QR_BLACK_FRAME_LUMINANCE = 8;

function qrWorkspace() {
  const canvas = document.createElement('canvas');
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

function meanLuminance(data) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * 53) {
    sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    n += 1;
  }
  return n ? sum / n : 0;
}

// Carré central d'une image : là où l'on vise, et là où un QR petit ou
// lointain garde le plus de pixels par module.
function centerSquare(width, height, ratio) {
  const side = Math.round(Math.min(width, height) * ratio);
  return [Math.round((width - side) / 2), Math.round((height - side) / 2), side, side];
}

// Décode un QR dans une zone d'une image (vidéo ou photo), ramenée à au plus
// `maxSide` pixels de côté. Renvoie son contenu (ou null) et la luminosité
// moyenne de la zone, qui trahit une image noire.
function decodeQrRegion(ws, source, x, y, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const ow = Math.max(1, Math.round(w * scale));
  const oh = Math.max(1, Math.round(h * scale));
  if (ws.canvas.width !== ow || ws.canvas.height !== oh) { ws.canvas.width = ow; ws.canvas.height = oh; }
  ws.ctx.drawImage(source, x, y, w, h, 0, 0, ow, oh);
  const image = ws.ctx.getImageData(0, 0, ow, oh);
  const code = jsQR(image.data, ow, oh);
  return { data: code && code.data ? code.data : null, luminance: meanLuminance(image.data) };
}

const CAMERA_ERROR_MESSAGES = {
  NotAllowedError: "Accès à la caméra refusé. Autorise-le dans les réglages de Safari, ou prends le QR en photo avec le bouton en bas.",
  NotFoundError: 'Aucune caméra détectée sur cet appareil. Tu peux choisir une photo du QR avec le bouton en bas.',
  NotReadableError: 'La caméra est déjà utilisée par une autre application. Ferme-la, ou prends le QR en photo avec le bouton en bas.',
  SecurityError: 'Le scan caméra nécessite une connexion sécurisée (https). Tu peux choisir une photo du QR avec le bouton en bas.',
};

function WebQrScanner({ onScanned }) {
  const containerRef = useRef(null);
  const photoInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState({ started: false, width: 0, height: 0, analysed: 0, luminance: null, readyState: 0, elapsed: 0 });
  const [photo, setPhoto] = useState(null); // null | 'analyse' | 'echec'

  // La caméra ne doit démarrer qu'UNE fois par ouverture du scanner. Avant,
  // l'effet dépendait de `onScanned`, que l'appelant recrée à chaque rendu —
  // et l'app se redessine seule toutes les 25 à 45 s. Chaque rendu arrêtait
  // puis relançait la caméra : 10 redémarrages mesurés en 60 s. On lit donc
  // la dernière version du rappel dans une ref, et l'effet ne dépend de rien.
  const onScannedRef = useRef(onScanned);
  useEffect(() => { onScannedRef.current = onScanned; }, [onScanned]);

  // Entrée fichier cachée, créée dans le DOM : React Native Web ne rend pas
  // <input type="file">. Sans l'attribut capture, iOS propose à la fois
  // l'appareil photo et la photothèque.
  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('data-testid', 'qr-photo-input');
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = ''; // permet de rechoisir la même photo après un échec
      if (!file) return;
      setPhoto('analyse');
      let url = null;
      try {
        url = URL.createObjectURL(file);
        // Surtout pas `new Image()` : dans ce fichier, `Image` est le composant
        // importé de react-native, pas l'image du navigateur. `.decode()`
        // n'existait pas, l'exception partait dans le catch et l'écran
        // affichait « aucun QR trouvé » même sur une photo parfaitement nette.
        const img = document.createElement('img');
        img.src = url;
        await img.decode();
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const ws = qrWorkspace();
        // Plusieurs zones et plusieurs tailles. Mesuré sur une photo réaliste
        // (QR incliné, flou, JPEG, bruit de capteur ±19) : jsQR échoue à
        // 1400 px sur toutes les zones, mais réussit dès 900 px et en dessous
        // — la réduction fait la moyenne des pixels voisins et efface le
        // bruit. Les grandes tailles restent utiles pour un QR petit dans la
        // photo, pris de loin.
        const full = [0, 0, w, h];
        const essais = [
          [full, 800],
          [centerSquare(w, h, 0.7), 800],
          [full, 1400],
          [centerSquare(w, h, 0.5), 800],
          [full, 500],
          [centerSquare(w, h, 0.3), 600],
        ];
        for (const [[x, y, zw, zh], maxSide] of essais) {
          const result = decodeQrRegion(ws, img, x, y, zw, zh, maxSide);
          if (result.data) { setPhoto(null); onScannedRef.current(result.data); return; }
          await new Promise((resolve) => setTimeout(resolve, 0)); // laisse l'interface respirer
        }
        setPhoto('echec');
      } catch (e) {
        // Une panne n'est pas une photo sans QR : les confondre a masqué le
        // bug ci-dessus. On le dit autrement, avec le code technique.
        console.warn('Lecture de la photo du QR impossible', e);
        setPhoto(`erreur:${(e && e.name) || 'Error'}`);
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    });
    document.body.appendChild(input);
    photoInputRef.current = input;
    return () => { if (input.parentNode) input.parentNode.removeChild(input); };
  }, []);

  useEffect(() => {
    let stopped = false;
    let rafId = null;
    let stream = null;
    let videoEl = null;
    let lastDecode = 0;
    let lastStatus = 0;
    let analysed = 0;
    let luminance = null;
    let ticks = 0;
    const startedAt = performance.now();
    const cropWs = qrWorkspace();
    const smallWs = qrWorkspace();
    const tinyWs = qrWorkspace();
    const fullWs = qrWorkspace();

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoEl = document.createElement('video');
        // iOS Safari : sans ces attributs posés AVANT la lecture, la vidéo
        // passe en plein écran natif ou refuse de démarrer seule.
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('muted', '');
        videoEl.setAttribute('autoplay', '');
        videoEl.muted = true;
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
        videoEl.srcObject = stream;
        if (containerRef.current) containerRef.current.appendChild(videoEl);
        await videoEl.play();
        if (stopped) return;
        setLive((s) => ({ ...s, started: true }));

        const tick = (now) => {
          if (stopped) return;
          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          // HAVE_CURRENT_DATA suffit à drawImage ; exiger HAVE_ENOUGH_DATA,
          // comme avant, peut ne jamais arriver sur un flux caméra en direct.
          if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA && vw > 0 && vh > 0 && now - lastDecode >= QR_DECODE_INTERVAL_MS) {
            lastDecode = now;
            ticks += 1;
            const [cx, cy, cw, ch] = centerSquare(vw, vh, 0.7);
            const cropSide = Math.min(cw, QR_DECODE_MAX_SIDE);
            let result = decodeQrRegion(cropWs, videoEl, cx, cy, cw, ch, cropSide);
            luminance = result.luminance;
            // Puis le même carré réduit de moitié, et au tiers. Mesuré : filmé
            // en intérieur, le bruit du capteur suffit à faire échouer jsQR à
            // pleine résolution dès que le QR est un peu loin (35 % de la
            // hauteur, bruit ±19), alors que la réduction — qui fait la moyenne
            // des pixels voisins et efface ce bruit — le décode.
            if (!result.data) result = decodeQrRegion(smallWs, videoEl, cx, cy, cw, ch, Math.round(cropSide / 2));
            if (!result.data) result = decodeQrRegion(tinyWs, videoEl, cx, cy, cw, ch, Math.round(cropSide / 3));
            // Une fois sur trois, l'image entière aussi : un QR hors du cadre.
            if (!result.data && ticks % 3 === 0) result = decodeQrRegion(fullWs, videoEl, 0, 0, vw, vh, QR_DECODE_FULL_SIDE);
            analysed += 1;
            if (result.data) { onScannedRef.current(result.data); return; }
          }
          if (now - lastStatus >= QR_STATUS_INTERVAL_MS) {
            lastStatus = now;
            setLive({ started: true, width: vw, height: vh, analysed, luminance, readyState: videoEl.readyState, elapsed: now - startedAt });
          }
          rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      } catch (e) {
        // Les navigateurs normalisent le `name` des erreurs getUserMedia
        // (contrairement au `message`, souvent vague) : plus fiable pour
        // expliquer la vraie cause.
        if (!stopped) setError((e && e.name) || 'UnknownError');
      }
    })();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (videoEl && videoEl.parentNode) videoEl.parentNode.removeChild(videoEl);
    };
  }, []);

  const openPhoto = () => { if (photoInputRef.current) photoInputRef.current.click(); };

  let statusMessage = 'Démarrage de la caméra…';
  if (live.started) {
    if (live.analysed === 0 && live.elapsed > QR_NO_FRAME_AFTER_MS) statusMessage = "La caméra ne transmet pas d'image. Prends plutôt le QR en photo.";
    else if (live.analysed > 0 && live.luminance !== null && live.luminance < QR_BLACK_FRAME_LUMINANCE) statusMessage = 'La caméra renvoie une image noire. Prends plutôt le QR en photo.';
    else if (live.analysed > 0) statusMessage = "Recherche d'un QR code…";
  }
  const technicalLine = live.started
    ? `${live.width}×${live.height} · ${live.analysed} images analysées · luminosité ${live.luminance === null ? '—' : Math.round(live.luminance)} · état ${live.readyState}`
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#E5E7EB', textAlign: 'center', fontSize: 15, lineHeight: 22 }}>
            {CAMERA_ERROR_MESSAGES[error] || "Impossible d'accéder à la caméra. Prends plutôt le QR en photo avec le bouton en bas."}
          </Text>
          {/* Le nom technique de l'erreur, discret : sans lui, un « ça ne marche
              pas » signalé depuis un téléphone est impossible à diagnostiquer. */}
          {!CAMERA_ERROR_MESSAGES[error] && (
            <Text style={{ color: '#6B7280', textAlign: 'center', fontSize: 11, marginTop: 10 }}>Code : {error}</Text>
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View ref={containerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: '70%', maxWidth: 320, aspectRatio: 1, borderWidth: 3, borderColor: 'rgba(16,185,129,0.95)', borderRadius: 20 }} />
            <Text style={{ color: '#FFFFFF', marginTop: 18, fontSize: 15, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 }}>
              Place le QR code dans le cadre
            </Text>
          </View>
        </View>
      )}
      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, backgroundColor: '#000' }}>
        {!error && <Text style={{ color: '#D1D5DB', textAlign: 'center', fontSize: 13 }}>{statusMessage}</Text>}
        {!error && !!technicalLine && <Text style={{ color: '#6B7280', textAlign: 'center', fontSize: 10, marginTop: 4 }}>{technicalLine}</Text>}
        <TouchableOpacity
          onPress={openPhoto}
          disabled={photo === 'analyse'}
          accessibilityRole="button"
          accessibilityLabel="Prendre ou choisir une photo du QR code"
          style={{ marginTop: 14, backgroundColor: '#10B981', borderRadius: 14, paddingVertical: 15, alignItems: 'center', opacity: photo === 'analyse' ? 0.7 : 1 }}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>
            {photo === 'analyse' ? 'Analyse de la photo…' : 'Prendre ou choisir une photo du QR'}
          </Text>
        </TouchableOpacity>
        {photo === 'echec' && (
          <Text style={{ color: '#FCA5A5', textAlign: 'center', marginTop: 10, fontSize: 13, lineHeight: 19 }}>
            Aucun QR code trouvé sur cette photo. Cadre-le bien, au centre et net, puis réessaie.
          </Text>
        )}
        {typeof photo === 'string' && photo.startsWith('erreur:') && (
          <Text style={{ color: '#FCA5A5', textAlign: 'center', marginTop: 10, fontSize: 13, lineHeight: 19 }}>
            Impossible de lire cette photo. Essaie une autre image.{'\n'}
            <Text style={{ color: '#6B7280', fontSize: 11 }}>Code : {photo.slice('erreur:'.length)}</Text>
          </Text>
        )}
      </View>
    </View>
  );
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
//  LOGO D'UNE dAPP (onglet Découvrir)
// ═══════════════════════════════════════════════════════════
// Le vrai logo, embarqué dans l'app. La pastille colorée avec l'initiale ne
// sert plus que de secours, si l'image venait à manquer.
function DappLogo({ dapp }) {
  const [echec, setEchec] = useState(false);
  const cadre = { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' };
  if (!dapp.logo || echec) {
    return (
      <View style={[cadre, { backgroundColor: dapp.color }]}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{dapp.letter}</Text>
      </View>
    );
  }
  return (
    <View style={[cadre, { backgroundColor: '#FFFFFF', overflow: 'hidden' }]}>
      <Image
        source={dapp.logo}
        style={{ width: 40, height: 40 }}
        resizeMode="contain"
        onError={() => setEchec(true)}
        accessibilityLabel={`Logo ${dapp.name}`}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  ÉTAT D'ERREUR
// ═══════════════════════════════════════════════════════════
// Même langage visuel que les états vides de l'app (pastille, titre, texte),
// avec un bouton Réessayer. Règle : une erreur ne se déguise jamais en écran
// vide ni en chargement sans fin. Constaté avant correction : « Aucune
// transaction pour l'instant » quand le serveur ne répondait pas — faux, et
// inquiétant sur un portefeuille —, un « Chargement… » éternel sur la fiche
// d'un jeton, et le texte brut du serveur sur l'écran NFT.
function ErrorState({ title, message, onRetry, compact = false }) {
  const { T } = useTheme();
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };
  const size = compact ? 48 : 64;
  return (
    <View style={{ alignItems: 'center', marginTop: compact ? 0 : 40, paddingHorizontal: 24 }} accessibilityRole="alert">
      <View style={{ width: size, height: size, borderRadius: compact ? 16 : 20, backgroundColor: T.redBg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="cloud-offline-outline" size={compact ? 22 : 28} color={T.red} />
      </View>
      <Text style={{ color: T.text, fontSize: compact ? 14 : 16, fontWeight: '700', marginTop: 14, textAlign: 'center' }}>{title}</Text>
      {!!message && (
        <Text style={{ color: T.text3, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' }}>{message}</Text>
      )}
      {!!onRetry && (
        <TouchableOpacity
          onPress={retry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel="Réessayer"
          style={{ marginTop: 14, minWidth: 130, alignItems: 'center', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: T.gold, opacity: retrying ? 0.6 : 1 }}
        >
          {retrying
            ? <ActivityIndicator color={T.gold} />
            : <Text style={{ color: T.gold, fontWeight: '700', fontSize: 14 }}>Réessayer</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
//  CANDLESTICK CHART
// ═══════════════════════════════════════════════════════════
function CandlestickChart({ candles, failed = false, onRetry }) {
  const { T, cs } = useTheme();
  if (!candles || candles.length === 0) {
    // Vide ne veut pas dire « en cours » : après un échec, afficher encore
    // « Chargement… » laissait l'utilisateur attendre indéfiniment (observé :
    // toujours là après 20 s, serveur en panne).
    if (failed) {
      return (
        <View style={[cs.area, { justifyContent: 'center' }]}>
          <ErrorState compact title="Graphique indisponible pour le moment" message="Nouvel essai automatique en cours." onRetry={onRetry} />
        </View>
      );
    }
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
    // Sur une plage étroite (ex. ETH qui oscille de quelques %), "(v/1000).toFixed(1)+k"
    // affichait "2.5k" deux fois de suite. On n'abrège qu'à partir de 10 000, et
    // avec assez de précision pour que les 3 graduations restent distinctes.
    if (v >= 100000) return Math.round(v / 1000) + 'k';
    if (v >= 10000) return (v / 1000).toFixed(1) + 'k';
    if (v >= 1000) return Math.round(v).toLocaleString('fr-FR');
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

  // Sur le web, require() renvoie un objet {uri, width, height} — pas un
  // nombre, pas une chaîne. Il faut donc le passer tel quel à Image, sinon
  // l'image reste vide sans déclencher onError (bug corrigé en preview4).
  // Logo distant ou data URI base64 (chaîne) : {uri: chaîne}.
  // Logo natif (nombre) : direct.
  const resolvedSource = (logo && typeof logo === 'object' && typeof logo.uri === 'string')
    ? logo
    : (typeof logo === 'number' ? logo : { uri: logo });
  return (
    <Image
      source={resolvedSource}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setImageError(true)}
    />
  );
}

// ═══════════════════════════════════════════════════════════
//  ALERTES CROSS-PLATFORM
//  Alert.alert de react-native-web est un no-op total (voir
//  node_modules/react-native-web/dist/exports/Alert) : rien ne s'affiche
//  jamais sur le web. On passait donc par window.alert/confirm — la boîte
//  NATIVE du navigateur (« nexiawallet.com indique… »), qui fait penser à du
//  phishing sur un portefeuille et bloque toute la page. Sur le web, les
//  alertes s'affichent désormais dans une vraie boîte de dialogue de l'app
//  (AlertHost, monté à la racine). Repli sur window.alert/confirm tant
//  qu'AlertHost n'est pas monté. Aucun appelant ne dépend du blocage de
//  window.confirm : toutes les actions passent par le onPress des boutons.
// ═══════════════════════════════════════════════════════════
let pushAppAlert = null;

function AlertHost() {
  const { T } = useTheme();
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    pushAppAlert = (alert) => setQueue((q) => [...q, alert]);
    return () => { pushAppAlert = null; };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const buttons = Array.isArray(current.buttons) && current.buttons.length ? current.buttons : [{ text: 'OK' }];
  const choose = (button) => {
    setQueue((q) => q.slice(1));
    if (button && typeof button.onPress === 'function') button.onPress();
  };
  const cancel = buttons.find((b) => b.style === 'cancel');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => choose(cancel)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 380, backgroundColor: T.card, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: T.border }}>
          <Text style={{ color: T.text, fontSize: 17, fontWeight: '700', lineHeight: 23 }}>{current.title}</Text>
          {!!current.message && (
            <Text style={{ color: T.text2, fontSize: 14, lineHeight: 21, marginTop: 8 }}>{current.message}</Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            {buttons.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDestructive = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${b.text || 'OK'}-${i}`}
                  onPress={() => choose(b)}
                  accessibilityRole="button"
                  accessibilityLabel={b.text || 'OK'}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, minWidth: 84, alignItems: 'center',
                    backgroundColor: isCancel ? 'transparent' : isDestructive ? T.red : T.gold,
                    borderWidth: isCancel ? 1 : 0, borderColor: T.border,
                  }}
                >
                  <Text style={{ color: isCancel ? T.text2 : isDestructive ? '#FFFFFF' : '#000000', fontWeight: '700', fontSize: 14 }}>{b.text || 'OK'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function showAlert(title, message, buttons) {
  if (Platform.OS === 'web' && pushAppAlert) {
    pushAppAlert({ title, message, buttons });
    return;
  }
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

// Lit la préférence système "réduire les animations" (Réglages iOS/Android,
// prefers-reduced-motion sur le web) et se met à jour si elle change pendant
// que l'app tourne. Centralisé ici plutôt que patché animation par animation :
// AnimPressable et FadeInView, les deux briques réutilisées dans tout le
// fichier, s'en servent pour garder le changement d'état (le bouton s'enfonce,
// la carte apparaît) SANS le mouvement animé qui va avec.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      if (!mq) return;
      setReduced(mq.matches);
      const onChange = (e) => { if (mounted) setReduced(e.matches); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange);
      };
    }
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (mounted) setReduced(v); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { if (mounted) setReduced(v); });
    return () => { mounted = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

function AnimPressable({ style, onPress, disabled, children, scaleTo = 0.95, ...rest }) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue) => {
    if (reducedMotion) { scale.setValue(toValue); return; }
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
// Un emoji est déjà inclus dans la plupart des messages existants
// (`showToast('✓ Copié', ...)`) depuis l'ancien style à une ligne — la
// pilule a maintenant sa propre icône ronde, donc on retire cet emoji
// initial pour éviter d'en afficher deux côte à côte. Liste explicite
// plutôt qu'une regex Unicode générique : évite de couper un texte qui
// commencerait légitimement par un caractère non-ASCII.
const TOAST_LEADING_EMOJI_RE = /^(✓|✅|⚠️|❌|🔔|🛡️|🚨)\s*/u;
const stripToastLeadingEmoji = (s) => (s || '').replace(TOAST_LEADING_EMOJI_RE, '');

function ToastBanner({ toast }) {
  const { T, st } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [toast, anim]);
  if (!toast) return null;
  const iconName = toast.type === 'success' ? 'checkmark' : toast.type === 'error' ? 'close' : 'information';
  const iconBg = toast.type === 'success' ? '#2ecC71' : toast.type === 'error' ? '#e5534b' : '#5b9bf7';
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
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
          ]}
        >
          <View style={[st.toast_icon_circle, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={13} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.toast_title} numberOfLines={1}>{stripToastLeadingEmoji(toast.message)}</Text>
            {!!toast.subtitle && <Text style={st.toast_subtitle} numberOfLines={1}>{toast.subtitle}</Text>}
          </View>
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

// Badge "c'est un bon moment pour transacter ?" — réutilisé sur Envoyer et
// Swap (voir l'effet qui alimente gasIndicator, et addGasSample pour le
// calcul du niveau). Rien affiché tant que la première mesure n'est pas
// revenue plutôt qu'un badge vide ou un chiffre à 0 trompeur.
function GasIndicatorBadge({ gasIndicator, nativeSymbol }) {
  const { T } = useTheme();
  if (!gasIndicator) return null;
  const { gwei, level } = gasIndicator;
  const color = level === 'low' ? T.up : level === 'high' ? T.down : T.text2;
  const bg = level === 'low' ? T.upBg : level === 'high' ? T.downBg : T.card2;
  const gweiTxt = gwei < 1 ? gwei.toFixed(3) : gwei.toFixed(1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 }}>
      <Ionicons name="speedometer-outline" size={13} color={color} />
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>
        Gas {nativeSymbol ? `(${nativeSymbol}) ` : ''}: {gweiTxt} Gwei{level ? ` · ${GAS_LEVEL_LABEL[level]}` : ''}
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
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] });
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
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { anim.setValue(1); return; }
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reducedMotion]);
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
  // Phase 1 — navigation de la page d'accueil : positions des sections
  // vitrine, mesurées au rendu, pour un défilement sans nouvel état.
  const landingScrollRef = useRef(null);
  const landingSectionY = useRef({});
  const scrollToLandingSection = (key) => {
    const y = landingSectionY.current[key];
    if (landingScrollRef.current && typeof y === 'number') {
      landingScrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  };
  const [pinCode, setPinCode]         = useState('');
  const [isUnlocked, setIsUnlocked]   = useState(false);
  const [isDuressMode, setIsDuressMode] = useState(false); // voir hashDuressPin — wallet à solde nul, jamais la vraie clé
  const [duressPinConfigured, setDuressPinConfigured] = useState(false);
  const [showDuressSetup, setShowDuressSetup] = useState(false);
  const [duressSetupInput, setDuressSetupInput] = useState('');
  const [duressSetupError, setDuressSetupError] = useState(null);
  const [tab, setTab]                 = useState('home');
  // EUR par défaut : l'app est franco-française. Persisté (voir loadCurrency/
  // saveCurrency) dès que l'utilisateur choisit une autre devise.
  const [currency, setCurrency]       = useState('EUR');

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
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [showSend, setShowSend]           = useState(false);
  const [showBuy, setShowBuy]             = useState(false);
  const [showReceive, setShowReceive]     = useState(false);
  const [showHistory, setShowHistory]     = useState(false);
  const [showImportData, setShowImportData] = useState(false);
  const [importDataText, setImportDataText] = useState('');
  const [historyItems, setHistoryItems]   = useState(null); // null = pas encore chargé, [] = chargé et vide
  const [historyLoading, setHistoryLoading] = useState(false);
  // Échec du dernier chargement. Distinct de « vide » : avant, un serveur en
  // panne affichait « Aucune transaction pour l'instant » (Activité) et
  // « Pas encore de stats » (Stats).
  const [historyError, setHistoryError]   = useState(false);
  const [historyFilterSymbol, setHistoryFilterSymbol] = useState('ALL');
  const HISTORY_PAGE_SIZE = 15;
  const [historyVisibleCount, setHistoryVisibleCount] = useState(HISTORY_PAGE_SIZE);
  // Grille 2 colonnes -> multiple de 2 pour ne jamais couper une rangée à moitié.
  const NFT_PAGE_SIZE = 20;
  const [showSettings, setShowSettings]   = useState(false);
  const [legalDoc, setLegalDoc]           = useState(null); // 'cgu' | 'privacy' | 'mentions' | null
  // true seulement quand renderLegal() a été ouvert depuis Paramètres (et pas
  // depuis le pied de page de la landing publique, qui n'a pas de Settings à
  // rouvrir) — sert uniquement à décider si le bouton retour doit rouvrir
  // Paramètres.
  const [legalDocFromSettings, setLegalDocFromSettings] = useState(false);
  // Même principe que legalDocFromSettings ci-dessus, pour le même bug :
  // le Pont cross-chain est accessible depuis Paramètres ET depuis le
  // raccourci de l'onglet Découvrir (qui n'a pas de Settings ouvert à
  // rouvrir) — sans ce drapeau, le bouton retour du Pont rouvrait toujours
  // Paramètres, même en arrivant depuis Découvrir (bug réel trouvé en
  // auditant les deux points d'entrée).
  const [bridgeFromSettings, setBridgeFromSettings] = useState(false);
  // Même bug, même correctif : le navigateur Web3 a encore PLUS de points
  // d'entrée que le Pont (Réglages, ET la barre de recherche de Découvrir,
  // ET chaque dApp de la liste Découvrir) — sans ce drapeau c'est le
  // parcours le plus fréquent de l'onglet Découvrir qui atterrissait dans
  // Réglages au lieu d'y revenir.
  const [dappBrowserFromSettings, setDappBrowserFromSettings] = useState(false);
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
  const [showFaq, setShowFaq] = useState(false);
  // Accordéon FAQ : quelle question est dépliée (index), ou aucune. Réutilise
  // `openFaq`/`LANDING_FAQ` — déjà définis pour l'ancienne landing "vitrine"
  // (remplacée depuis par un accueil épuré, voir plus haut dans le fichier),
  // jamais réutilisés depuis nulle part : on leur donne enfin un écran.
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
  const [importKeystorePassword, setImportKeystorePassword] = useState('');
  // Saisie manuelle d'un code de parrainage sur l'écran d'accueil — complète
  // la capture automatique du lien "?ref=" (voir captureRef plus bas) : un
  // code entendu à l'oral ou vu sur une capture d'écran (Discord, etc.) n'a
  // jamais de lien cliquable derrière, donc sans ce champ il était impossible
  // à attribuer.
  const [referralInputMode, setReferralInputMode] = useState(false);
  const [referralInputValue, setReferralInputValue] = useState('');
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
  const [addAccountKeystorePassword, setAddAccountKeystorePassword] = useState('');
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
  const [dappCat, setDappCat]                     = useState('all'); // filtre catégorie de l'onglet Découvrir
  const [dappCurrentUrl, setDappCurrentUrl]       = useState(null); // URL initiale chargée par la WebView (source={{uri}}) — ne pas mettre à jour sur navigation interne, ça rechargerait la page
  const [dappDisplayUrl, setDappDisplayUrl]       = useState(null); // URL réellement affichée à l'instant, pour l'en-tête — voir onNavigationStateChange
  const [dappConnectedOrigins, setDappConnectedOrigins] = useState([]); // origines autorisées à voir l'adresse (session app en cours)
  const [dappBridgeRequest, setDappBridgeRequest] = useState(null); // { id, method, params, origin } en attente de confirmation
  const [dappBridgeLoading, setDappBridgeLoading] = useState(false);
  const [dappBridgeError, setDappBridgeError]     = useState(null);
  const [dappSimResult, setDappSimResult]         = useState(null); // voir lib/txSimulation.js
  const dappWebViewRef = useRef(null);
  // Autorisations de tokens accordées via cette app (voir lib/approvals.js)
  // — suivi local uniquement, pas d'indexeur tiers.
  const [showAllAddresses, setShowAllAddresses]   = useState(false);
  const [allAddressesFromReceive, setAllAddressesFromReceive] = useState(false);
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
  const [validatorsLoading, setValidatorsLoading] = useState(false);
  const [validatorsError, setValidatorsError]     = useState(false);
  const [selectedValidator, setSelectedValidator] = useState(null);
  const [stakeAmount, setStakeAmount]           = useState('');
  const [stakeLoading, setStakeLoading]         = useState(false);
  const [stakeError, setStakeError]             = useState(null);
  // Galerie NFT (Ethereum, lecture via le backend — voir GET /wallet/nft/owned,
  // clé Alchemy côté serveur) — l'envoi reste signé localement (signNftTransferTx).
  const [showNftGallery, setShowNftGallery]     = useState(false);
  const [nfts, setNfts]                         = useState([]);
  const [nftVisibleCount, setNftVisibleCount]   = useState(NFT_PAGE_SIZE);
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
  // Anti-bruteforce sur le déverrouillage : sans ça, un appareil déverrouillé
  // laissé sans surveillance (ou un script qui simule des taps) peut essayer
  // les 10^6 PIN à 6 chiffres au rythme du déchiffrement scrypt local
  // (~100ms/essai, voir KEYSTORE_SCRYPT_OPTS dans lib/wallet.js) sans aucun
  // frein — le même calcul qui avait justifié une passphrase dédiée pour
  // l'export de keystore s'applique ici, mais un PIN doit rester un PIN.
  // Délai croissant après plusieurs échecs consécutifs, remis à zéro dès
  // qu'un PIN correct est saisi.
  const [pinFailCount, setPinFailCount]         = useState(0);
  const [pinLockedUntil, setPinLockedUntil]     = useState(0);
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState(null);
  const [unlockedMnemonic, setUnlockedMnemonic]     = useState(null);
  const [biometricEnabled, setBiometricEnabled]     = useState(false);
  const [experienceMode, setExperienceMode]         = useState('advanced');
  const [seedBackedUp, setSeedBackedUp]             = useState(false);
  const [keystoreExported, setKeystoreExported]     = useState(false);
  const [profileEmailInput, setProfileEmailInput]   = useState('');
  const [profileEmailSaved, setProfileEmailSaved]   = useState('');
  const [profileEmailSaving, setProfileEmailSaving] = useState(false);
  // Écran de confirmation avant envoi : 'form' (saisie) -> 'confirm' (relire
  // adresse/montant/frais avant de signer). Adresses récentes = carnet léger,
  // rempli au fil des envois réussis.
  const [sendStep, setSendStep]                 = useState('form');
  const [sendFeeEstimate, setSendFeeEstimate]   = useState(null);
  const [gasIndicator, setGasIndicator]         = useState(null); // { gwei, level } | null tant que pas chargé
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
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [tokenSearch, setTokenSearch] = useState('');
  const [tokenSort, setTokenSort] = useState('value');
  const [newsFilter, setNewsFilter] = useState('all');
  const [showCardWaitlist, setShowCardWaitlist] = useState(false);
  const [cardWaitlistEmail, setCardWaitlistEmail] = useState('');
  const [cardWaitlistJoined, setCardWaitlistJoined] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [portfolioIsCached, setPortfolioIsCached] = useState(false); // true tant qu'on affiche le cache, pas un solde fraîchement récupéré
  const [showReferral, setShowReferral] = useState(false);
  const [referredByCode, setReferredByCode] = useState(null);
  // Démarre sur la langue de l'appareil (synchrone, pas de flash en français
  // pour un visiteur anglophone) ; loadLocale() la remplace ensuite par un
  // choix enregistré dans Paramètres s'il y en a un.
  const [locale, setLocale] = useState(detectDeviceLocale);
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
  // Depuis Envoyer, le scanner QR s'ouvre PAR-DESSUS l'écran Envoyer (pas de
  // setShowSend(false) avant) — le fermer révèle donc Envoyer tout seul.
  // Depuis WalletConnect en revanche, on ferme explicitement WalletConnect
  // AVANT d'ouvrir le scanner (voir le commentaire sur ce bouton) pour
  // éviter le bug des Modal imbriqués sur iOS/SDK54 — mais sans ce drapeau,
  // annuler le scan (bouton retour, sans rien scanner) ne rouvrait jamais
  // WalletConnect, et laissait l'utilisateur sur l'écran du dessous (Accueil)
  // au lieu de l'endroit où il était.
  const [qrScannerFromWalletConnect, setQrScannerFromWalletConnect] = useState(false);
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
  // `subtitle` optionnel (3e argument, rétrocompatible avec tous les appels
  // existants qui ne passent que message+type) : deuxième ligne grise sous le
  // titre, comme "Envoyé !" / "0,19 USDT" dans la pilule de notification.
  const showToast = useCallback((message, type = 'info', subtitle = null, durationMs = 2600) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type, subtitle });
    toastTimerRef.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  // Indicateur de gas en direct sur Envoyer/Swap ("bon ou mauvais moment
  // pour transacter ?") — voir addGasSample plus haut pour le calcul du
  // niveau (auto-calibré sur l'historique de CE réseau sur CET appareil,
  // pas un seuil absolu deviné). Ne tourne QUE quand un de ces deux écrans
  // est effectivement ouvert (pas de polling permanent en arrière-plan),
  // et se rafraîchit toutes les 25s tant qu'il reste ouvert.
  useEffect(() => {
    const relevant = showSend || tab === 'swap';
    if (!relevant) { setGasIndicator(null); return; }
    let cancelled = false;
    const fetchGas = async () => {
      try {
        const gwei = await localWallet.getGasPriceGwei(network);
        if (cancelled) return;
        const history = await loadGasHistory();
        const { history: nextHistory, level } = addGasSample(history, network, gwei);
        saveGasHistory(nextHistory);
        if (!cancelled) setGasIndicator({ gwei, level });
      } catch {
        if (!cancelled) setGasIndicator(null); // réseau injoignable — pas d'indicateur plutôt qu'un mensonge
      }
    };
    fetchGas();
    const id = setInterval(fetchGas, 25000);
    return () => { cancelled = true; clearInterval(id); };
  }, [showSend, tab, network]);

  // Barre du bas qui se réduit en scrollant vers le bas et redevient
  // complète vers le haut (ou tout en haut de la liste). PAS un simple
  // `scale` du même bloc (essayé d'abord, jugé "moche" par Pablo — le
  // texte/les icônes rapetissés restent tous là, juste plus petits) : ici
  // c'est un VRAI changement de contenu, deux blocs distincts en fondu
  // croisé -- la barre complète, remplacée par une seule icône ronde
  // "Accueil" ancrée à GAUCHE. `navCollapsed` (state, pas juste une
  // Animated.Value) parce qu'il faut basculer entre deux arbres JSX
  // différents, pas juste interpoler un style. Déclaré ici (avec les
  // autres hooks, avant tout `return` conditionnel de AppContent) --
  // voir le hooks-order bug rencontré plus tôt le même jour.
  const navBarAnim = useRef(new Animated.Value(0)).current;
  const lastScrollYRef = useRef(0);
  const navBarHiddenRef = useRef(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const handleTabScroll = useCallback((e) => {
    const y = e.nativeEvent.contentOffset.y;
    const delta = y - lastScrollYRef.current;
    lastScrollYRef.current = y;
    const shouldHide = y > 60 && delta > 4;
    const shouldShow = delta < -4 || y <= 60;
    if (shouldHide && !navBarHiddenRef.current) {
      navBarHiddenRef.current = true;
      setNavCollapsed(true);
      Animated.timing(navBarAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (shouldShow && navBarHiddenRef.current) {
      navBarHiddenRef.current = false;
      setNavCollapsed(false);
      Animated.timing(navBarAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [navBarAnim]);
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
    const shareUrl = 'https://nexiawallet.com';
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
    const shareUrl = `https://nexiawallet.com?ref=${referralCode}`;
    const message = `Rejoins-moi sur NexiaWallet, mon portefeuille crypto non-custodial préféré : ${shareUrl}`;
    try {
      await Share.share({ title: 'NexiaWallet', message, url: shareUrl });
    } catch {
      await copyToClipboard(shareUrl, 'Lien de parrainage copié');
    }
  }, [referralCode, copyToClipboard]);

  // Saisie manuelle (voir referralInputMode plus haut) : même règle que la
  // capture automatique via l'URL — saveReferredBy() n'écrase jamais une
  // attribution déjà posée, donc entrer un code ici après avoir cliqué un
  // lien de parrainage ne change rien (le premier code capté reste valide).
  const applyReferralCode = useCallback(async (code) => {
    const trimmed = (code || '').trim().toUpperCase();
    if (!trimmed) return;
    await saveReferredBy(trimmed);
    setReferredByCode(prev => prev || trimmed);
    setReferralInputMode(false);
    setReferralInputValue('');
    showToast('✓ Code de parrainage enregistré', 'success');
  }, [showToast]);

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
  // « live » ne doit s'afficher que si les prix viennent vraiment d'arriver.
  // Quand le backend tombait, le Marché continuait d'annoncer « live » à côté
  // de prix figés ou repris du cache — malhonnête envers l'utilisateur.
  const MARKET_FRESH_MS = 120000;
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now()); // mis à jour par fetchMarket
  const marketFreshness = (apiError || !lastUpdateTime || (Date.now() - lastUpdateTime) > MARKET_FRESH_MS)
    ? 'prix différés'
    : 'live';
  const [realCandles, setRealCandles]     = useState({}); // `${symbol}_${timeframe}` -> vraies bougies CoinGecko
  const [coinDetails, setCoinDetails]     = useState({}); // symbol -> fiche crypto réelle (CoinGecko)
  // Échecs de chargement des fiches (bougies, infos) par clé, pour afficher un
  // état d'erreur au lieu d'un « Chargement… » éternel. « Réessayer » les
  // efface et relance les chargements en incrémentant detailRetryTick.
  const [detailLoadErrors, setDetailLoadErrors] = useState({});
  const [detailRetryTick, setDetailRetryTick]   = useState(0);
  const markDetailError = useCallback((key, failed) => {
    setDetailLoadErrors((prev) => {
      if (!!prev[key] === failed) return prev;
      const next = { ...prev };
      if (failed) next[key] = true; else delete next[key];
      return next;
    });
  }, []);
  const retryDetailLoad = useCallback(() => {
    setDetailLoadErrors({});
    setDetailRetryTick((t) => t + 1);
  }, []);
  const [newsItems, setNewsItems]         = useState([]);
  // Phrase de récupération à faire sauvegarder par l'utilisateur juste après
  // la création d'un wallet — sans ça, il n'a AUCUN moyen de récupérer ses
  // fonds s'il perd son appareil ou vide son navigateur.
  const [pendingMnemonic, setPendingMnemonic] = useState(null);
  // Re-authentification (re-saisie du PIN) avant d'afficher la phrase de
  // récupération, même app déjà déverrouillée — sans ça, quiconque récupère
  // le téléphone pendant la fenêtre de déverrouillage (jusqu'à 2 min
  // d'inactivité, voir AUTO_LOCK_MS) pourrait voir la phrase avec un simple
  // "Afficher" sur une boîte de dialogue, sans jamais retaper le PIN — pour
  // le secret qui donne un contrôle total sur TOUS les fonds (EVM/Solana/
  // Bitcoin), c'est nettement insuffisant face au risque le plus courant
  // pour un wallet mobile : un accès physique bref à l'appareil déverrouillé.
  const [showMnemonicReauth, setShowMnemonicReauth] = useState(false);
  const [mnemonicReauthPin, setMnemonicReauthPin]   = useState('');
  const [mnemonicReauthError, setMnemonicReauthError] = useState(null);
  const [mnemonicReauthLoading, setMnemonicReauthLoading] = useState(false);

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
  // `emoji`/`desc` servent uniquement à l'affichage compact du sélecteur de
  // réseau dans Paramètres (voir renderSettings) — une seule source pour
  // éviter que la liste UI et cette config divergent avec le temps.
  const NETWORK_INFO = {
    ethereum: { label: 'Ethereum Mainnet', network: 'ethereum', chainId: 1,     explorer: 'https://etherscan.io',        emoji: '⛓️', desc: 'Le réseau principal, le plus utilisé' },
    bsc:      { label: 'BNB Smart Chain',  network: 'bsc',      chainId: 56,    explorer: 'https://bscscan.com',         emoji: '🟡', desc: 'Frais de transaction très bas' },
    polygon:  { label: 'Polygon',          network: 'polygon',  chainId: 137,   explorer: 'https://polygonscan.com',     emoji: '🟪', desc: 'Rapide et frais très bas' },
    arbitrum: { label: 'Arbitrum One',     network: 'arbitrum', chainId: 42161, explorer: 'https://arbiscan.io',         emoji: '🔵', desc: 'Ethereum en plus rapide et moins cher' },
    optimism: { label: 'Optimism',         network: 'optimism', chainId: 10,    explorer: 'https://optimistic.etherscan.io', emoji: '🔴', desc: 'Ethereum en plus rapide et moins cher' },
    base:     { label: 'Base',             network: 'base',     chainId: 8453,  explorer: 'https://basescan.org',        emoji: '🔷', desc: 'Ethereum en plus rapide et moins cher, par Coinbase' },
  };
  const activeNetwork = NETWORK_INFO[network] || NETWORK_INFO.ethereum;

  // Profil léger : associe un email optionnel à l'adresse du wallet côté
  // backend (voir POST /profile/email) — aucune clé, aucun mot de passe,
  // juste une adresse publique + un email pour notifications/acquisition.
  const submitProfileEmail = useCallback(async () => {
    const email = profileEmailInput.trim();
    if (!walletAddr) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Adresse email invalide', 'error');
      return;
    }
    setProfileEmailSaving(true);
    try {
      const res = await axios.post(`${API_BASE}/profile/email`, { address: walletAddr, email }, { headers: API_HEADERS, timeout: 10000 });
      if (!res.data?.success) throw new Error(res.data?.error || 'Échec');
      await saveProfileEmailLocal(email);
      setProfileEmailSaved(email);
      showToast('✓ Email enregistré', 'success');
    } catch (err) {
      showToast(humanizeTxError(err) || 'Impossible d\'enregistrer l\'email pour le moment.', 'error');
    } finally {
      setProfileEmailSaving(false);
    }
  }, [profileEmailInput, walletAddr, showToast]);

  // Reçu de transaction partageable — même repli clipboard que shareApp/
  // shareReferralLink si Share.share échoue (desktop web sans navigator.share).
  // Le nom ENS déjà résolu (voir ensNamesCache, écran Activité) est passé en
  // paramètre plutôt que re-résolu ici.
  const shareTransactionReceipt = useCallback(async (item, counterpartyLabel) => {
    const isOut = item.direction === 'out';
    const explorerUrl = `${activeNetwork.explorer}/tx/${item.hash}`;
    const message = [
      'NexiaWallet — Reçu de transaction',
      `${isOut ? 'Envoyé' : 'Reçu'} : ${item.amount || ''} ${item.symbol || ''}`.trim(),
      `Réseau : ${activeNetwork.label}`,
      `Date : ${new Date(item.timestamp).toLocaleString('fr-FR')}`,
      `${isOut ? 'Vers' : 'Depuis'} : ${counterpartyLabel}`,
      `Statut : ${item.failed ? 'Échouée' : 'Confirmée'}`,
      `Explorateur : ${explorerUrl}`,
    ].join('\n');
    try {
      await Share.share({ title: 'Reçu de transaction NexiaWallet', message, url: explorerUrl });
    } catch {
      await copyToClipboard(message, 'Reçu copié dans le presse-papiers');
    }
  }, [activeNetwork, copyToClipboard]);
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
  // ═══ NOTIFICATIONS — fonds reçus, envoi confirmé ═══
  // Choix validé par Pablo le 17/09/2026 (option A) : tout se passe sur
  // l'appareil. Aucun serveur ne surveille les adresses — il apprendrait
  // celles de tous les utilisateurs, à l'opposé de la promesse « aucune
  // donnée personnelle ». Limite assumée : rien n'est détecté app fermée.
  //
  // Avant : une seule notification, sur natif uniquement, pour la crypto
  // native du réseau actif — rien pour USDT, USDC, SOL, BTC, rien sur le web,
  // rien à l'envoi.
  //
  // Affichage : toujours dans l'app (fonctionne partout, iPhone compris), et
  // en notification système quand l'app n'est pas au premier plan, là où
  // c'est possible (natif ; navigateur si l'autorisation est déjà accordée).
  const NOTIFY_TOAST_MS = 6000;
  const notify = useCallback(({ title, body, type = 'success' }) => {
    showToast(title, type, body, NOTIFY_TOAST_MS);
    try {
      if (Platform.OS === 'web') {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted'
          && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          new Notification(title, { body, icon: '/icon.png' });
        }
      } else if (AppState.currentState !== 'active') {
        Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(() => {});
      }
    } catch { /* notification système indisponible : l'affichage dans l'app suffit */ }
  }, [showToast]);

  // Dernier solde vu, par compte + réseau + actif. Les soldes affichés
  // (`tokens`) ne sont PAS rangés par réseau : au changement de réseau, le
  // solde USDT devient celui de l'autre réseau. Comparer `tokens` d'un relevé
  // à l'autre crierait donc « fonds reçus » à chaque changement. On compare
  // au contraire chaque relevé, au moment où il est fait, au précédent relevé
  // de la MÊME clé. Le premier relevé d'une clé sert de référence, sans
  // notification (sinon tout le solde « arriverait » au déverrouillage).
  const balanceSeenRef = useRef({});
  const noteBalance = useCallback((key, symbol, value, placeLabel) => {
    const v = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(v)) return;
    const prev = balanceSeenRef.current[key];
    balanceSeenRef.current[key] = v;
    if (prev === undefined) return;
    const delta = v - prev;
    if (delta > 1e-9) {
      const amount = Number(delta.toPrecision(6)).toString();
      notify({ title: 'Fonds reçus', body: `+${amount} ${symbol}${placeLabel ? ` sur ${placeLabel}` : ''}` });
    }
  }, [notify]);

  // Suivi d'un envoi EVM jusqu'à sa confirmation : avant, l'app disait
  // « Transaction soumise » puis plus rien. On interroge le réseau toutes les
  // 10 s, 30 min au plus, et l'on arrête tout au verrouillage.
  // Couvre les trois écosystèmes (EVM, Solana, Bitcoin) et les trois sortes
  // d'opération (envoi, swap, pont). Bitcoin confirme en ~10 min : on l'espace
  // davantage et on patiente plus longtemps, sans marteler l'API publique.
  const sendTrackersRef = useRef(new Set());
  const trackTransaction = useCallback(({ txHash, net, token, amount, kind = 'Envoi' }) => {
    if (!txHash) return;
    const placeLabel = NETWORK_INFO[net]?.label || (net === 'solana' ? 'Solana' : net === 'bitcoin' ? 'Bitcoin' : net);
    const intervalle = net === 'bitcoin' ? 60000 : 10000;
    const dureeMax = net === 'bitcoin' ? 3 * 60 * 60 * 1000 : 30 * 60 * 1000;
    const startedAt = Date.now();
    const tracker = { stopped: false, timer: null };
    const stop = () => { tracker.stopped = true; if (tracker.timer) clearTimeout(tracker.timer); sendTrackersRef.current.delete(stop); };
    sendTrackersRef.current.add(stop);

    // 'ok' | 'ko' | null (pas encore confirmée / réseau muet)
    const etat = async () => {
      if (net === 'solana') {
        const s = await localWallet.getSolanaTxStatus(txHash);
        return s === 'confirmee' ? 'ok' : s === 'echouee' ? 'ko' : null;
      }
      if (net === 'bitcoin') {
        return (await localWallet.getBitcoinTxStatus(txHash)) === 'confirmee' ? 'ok' : null;
      }
      const receipt = await localWallet.getProvider(net).getTransactionReceipt(txHash);
      if (receipt && receipt.blockNumber) return receipt.status === 1 ? 'ok' : 'ko';
      return null;
    };

    const check = async () => {
      if (tracker.stopped) return;
      try {
        const resultat = await etat();
        if (tracker.stopped) return;
        if (resultat === 'ok') {
          notify({ title: `✅ ${kind} confirmé`, body: `${amount} ${token} sur ${placeLabel}` });
          stop();
          return;
        }
        if (resultat === 'ko') {
          notify({ title: `❌ ${kind} échoué`, body: `Le réseau a rejeté l'opération de ${amount} ${token}.`, type: 'error' });
          stop();
          return;
        }
      } catch { /* nœud momentanément injoignable : on retente */ }
      if (Date.now() - startedAt > dureeMax) { stop(); return; }
      tracker.timer = setTimeout(check, intervalle);
    };
    tracker.timer = setTimeout(check, 8000);
  }, [notify]);

  useEffect(() => {
    // Verrouillage ou changement de compte : on arrête les suivis d'envoi. Les
    // références de soldes, elles, restent (clés par adresse) : des fonds
    // arrivés pendant le verrouillage seront signalés au déverrouillage.
    const trackers = sendTrackersRef.current;
    return () => { trackers.forEach((stop) => stop()); };
  }, [walletAddr]);

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
      noteBalance(`${walletAddr}:${selectedNetwork}:${nativeSymbol}`, nativeSymbol, nativeBalance, NETWORK_INFO[selectedNetwork]?.label);
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
          noteBalance(`${walletAddr}:${selectedNetwork}:${sym}`, sym, balance, NETWORK_INFO[selectedNetwork]?.label);
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
  }, [network, walletAddr, isDuressMode, noteBalance]);

  // Solde SOL — même principe (RPC public direct, pas de clé nécessaire),
  // mais indépendant du sélecteur réseau EVM (Solana n'en fait pas partie).
  const refreshSolanaBalance = useCallback(async () => {
    if (!solanaAddr) return;
    try {
      const balance = await localWallet.getSolanaBalance(solanaAddr);
      setSolanaBalance(balance);
      setTokens(prev => ({ ...prev, SOL: { ...prev.SOL, balance: parseFloat(balance) } }));
      if (!isDuressMode) noteBalance(`${solanaAddr}:solana:SOL`, 'SOL', balance, 'Solana');
    } catch (err) {
      console.warn('refreshSolanaBalance error', err.message);
    }
  }, [solanaAddr, isDuressMode, noteBalance]);

  useEffect(() => { refreshSolanaBalance(); }, [refreshSolanaBalance]);

  // Solde BTC — même principe (API publique Blockstream, pas de clé nécessaire).
  const refreshBitcoinBalance = useCallback(async () => {
    if (!bitcoinAddr) return;
    try {
      const balance = await localWallet.getBitcoinBalance(bitcoinAddr);
      setBitcoinBalance(balance);
      setTokens(prev => ({ ...prev, BTC: { ...prev.BTC, balance: parseFloat(balance) } }));
      if (!isDuressMode) noteBalance(`${bitcoinAddr}:bitcoin:BTC`, 'BTC', balance, 'Bitcoin');
    } catch (err) {
      console.warn('refreshBitcoinBalance error', err.message);
    }
  }, [bitcoinAddr, isDuressMode, noteBalance]);

  useEffect(() => { refreshBitcoinBalance(); }, [refreshBitcoinBalance]);

  // SOL et BTC n'étaient relevés qu'au chargement (et après un envoi de
  // l'utilisateur) : des SOL ou BTC reçus pendant que l'app est ouverte ne
  // mettaient même pas le solde à jour, et ne pouvaient donc pas être
  // signalés. Relevé toutes les 60 s, hors mode détresse.
  useEffect(() => {
    if (isDuressMode || (!solanaAddr && !bitcoinAddr)) return;
    const id = setInterval(() => {
      refreshSolanaBalance();
      refreshBitcoinBalance();
    }, 60000);
    return () => clearInterval(id);
  }, [isDuressMode, solanaAddr, bitcoinAddr, refreshSolanaBalance, refreshBitcoinBalance]);

  // Historique — données publiques de la blockchain (Etherscan), aucune clé
  // impliquée. Chargé à la demande, à l'ouverture de la modale "Activité".
  const fetchHistory = useCallback(async () => {
    if (!walletAddr) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = await axios.get(`${API_BASE}/tx/history`, {
        params: { address: walletAddr, network },
        headers: API_HEADERS,
        timeout: 20000,
      });
      if (res.data?.success) {
        setHistoryItems(res.data.items);
      } else {
        setHistoryItems(null);
        setHistoryError(true);
      }
    } catch (err) {
      console.warn('fetchHistory error', err.message);
      // null et non [] : un échec n'est pas un historique vide.
      setHistoryItems(null);
      setHistoryError(true);
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

  // Photo du portefeuille à l'instant T (solde + valeur par token) — même
  // principe que l'export CSV de l'historique ci-dessus, utile pour un
  // suivi personnel ou une déclaration fiscale (la valorisation des cryptos
  // détenues est demandée par l'administration française, contrairement à
  // l'historique complet des mouvements que seul un vrai indexeur fiscal
  // dédié peut produire correctement — ce CSV n'a pas cette prétention).
  const exportPortfolioCsv = useCallback(async (holdings) => {
    if (!holdings.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Date du relevé', 'Token', 'Symbole', 'Solde', 'Prix unitaire', 'Valeur', 'Devise'].map(esc).join(',');
    const now = new Date().toISOString();
    const rows = holdings.map(h => [
      now,
      h.name,
      h.sym,
      (tokens[h.sym]?.balance || 0),
      (tokens[h.sym]?.price || 0) * fxRate,
      h.value * fxRate,
      currency,
    ].map(esc).join(','));
    await copyToClipboard([header, ...rows].join('\n'), `Relevé de ${holdings.length} crypto(s) copié en CSV`);
  }, [copyToClipboard, tokens, fxRate, currency]);

  // Migration entre appareils : favoris, carnet d'adresses, alertes de prix
  // et étiquettes -- rien de sensible (aucune clé, aucune donnée privée),
  // copié en JSON via le presse-papier plutôt qu'un vrai fichier (même choix
  // que l'export CSV, pas de expo-file-system installé).
  // Exporte le keystore, mais RE-chiffré avec une phrase de passe dédiée
  // saisie ici, jamais avec le PIN app à 6 chiffres.
  //
  // Pourquoi : le PIN protège un keystore qui ne quitte normalement jamais le
  // SecureStore matériel du téléphone (Keychain iOS / Keystore Android) —
  // dans ce contexte, un PIN à 6 chiffres est une défense secondaire
  // raisonnable, la vraie barrière étant l'accès physique+déverrouillage de
  // l'appareil. Mais CE bouton produit un fichier .json destiné à en sortir
  // ("colle-le en lieu sûr" — mail, cloud, clé USB...). Mesuré en local avec
  // les mêmes paramètres scrypt que ce fichier (N=16384) : déchiffrer UN
  // essai prend ~115ms, donc épuiser les 1 000 000 de PIN à 6 chiffres
  // possibles prend seulement ~32h sur un seul cœur, et ~2h sur 16 cœurs —
  // largement à la portée de quiconque récupère ce fichier (mail piraté,
  // service cloud compromis...). Une vraie phrase de passe (8+ caractères,
  // alphanumérique) rend ce même brute-force pratiquement infaisable, sans
  // rien changer au format (toujours ethers/geth V3 standard, déchiffrable
  // par ce wallet OU par MetaMask/n'importe quel outil compatible).
  const [showExportKeystore, setShowExportKeystore] = useState(false);
  const [exportPassphraseInput, setExportPassphraseInput] = useState('');
  const [exportPassphraseConfirm, setExportPassphraseConfirm] = useState('');
  const [exportPassphraseError, setExportPassphraseError] = useState(null);
  const [exportPassphraseLoading, setExportPassphraseLoading] = useState(false);

  const confirmExportKeystore = useCallback(async () => {
    if (!unlockedPrivateKey) { setExportPassphraseError('Wallet verrouillé.'); return; }
    if (exportPassphraseInput.length < 8) {
      setExportPassphraseError('Au moins 8 caractères — c\'est ce qui protège le fichier exporté, pas ton PIN.');
      return;
    }
    if (exportPassphraseInput !== exportPassphraseConfirm) {
      setExportPassphraseError('Les deux saisies ne correspondent pas.');
      return;
    }
    setExportPassphraseLoading(true);
    setExportPassphraseError(null);
    try {
      const freshlyEncrypted = await localWallet.encryptWalletKeystore(
        { privateKey: unlockedPrivateKey, mnemonic: unlockedMnemonic },
        exportPassphraseInput
      );
      await copyToClipboard(freshlyEncrypted, 'Keystore copié — colle-le dans un fichier .json en lieu sûr');
      setShowExportKeystore(false);
      setExportPassphraseInput('');
      setExportPassphraseConfirm('');
      setKeystoreExported(true);
      saveFlag(KEYSTORE_EXPORTED_KEY);
    } catch (err) {
      setExportPassphraseError(humanizeTxError(err) || "Échec de l'export.");
    } finally {
      setExportPassphraseLoading(false);
    }
  }, [unlockedPrivateKey, unlockedMnemonic, exportPassphraseInput, exportPassphraseConfirm, copyToClipboard]);

  // Revérifie le PIN (déchiffre réellement le keystore, ne compare aucun code
  // en clair — même principe que attemptUnlock) avant de révéler la phrase de
  // récupération. isDuressMode ne devrait jamais atteindre ce point (le bouton
  // est masqué en mode détresse), mais on le revérifie ici par sécurité :
  // jamais la vraie phrase tant que ce mode est actif.
  const handleMnemonicReauthConfirm = useCallback(async () => {
    if (!walletSession?.encryptedKeystore || isDuressMode) return;
    setMnemonicReauthLoading(true);
    setMnemonicReauthError(null);
    try {
      const result = await localWallet.decryptWalletKeystore(walletSession.encryptedKeystore, mnemonicReauthPin);
      if (result.address.toLowerCase() !== walletSession.address.toLowerCase() || !result.mnemonic) {
        throw new Error('PIN incorrect.');
      }
      setShowMnemonicReauth(false);
      setMnemonicReauthPin('');
      setIsFirstTimeMnemonicBackup(false);
      setPendingMnemonic(result.mnemonic);
    } catch {
      setMnemonicReauthError('PIN incorrect.');
    } finally {
      setMnemonicReauthLoading(false);
    }
  }, [walletSession, isDuressMode, mnemonicReauthPin]);

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
      let imported;
      if (importType === 'keystore') {
        if (!importValue.trim() || !importKeystorePassword) {
          setImportError('Colle le keystore JSON et son mot de passe.');
          return false;
        }
        try {
          imported = await localWallet.decryptWalletKeystore(importValue.trim(), importKeystorePassword);
        } catch (err) {
          setImportError('Keystore ou mot de passe invalide.');
          return false;
        }
      } else {
        if (!importValue.trim()) {
          setImportError('Entrer une phrase mnémonique ou une clé privée.');
          return false;
        }
        imported = localWallet.importLocalWallet(importValue, importType);
      }
      setPendingWalletForPin({ address: imported.address, privateKey: imported.privateKey, mnemonic: imported.mnemonic, isImport: true, isMigration: false });
      setPinCode(''); setPendingPinDigits(''); setPinError(null);
      setImportKeystorePassword('');
      setPinStage('choose');
      return true;
    } catch (err) {
      console.error('Import local échoué:', err.message);
      setImportError(humanizeTxError(err) || 'Mnémonique ou clé privée invalide.');
      return false;
    }
  }, [importType, importValue, importKeystorePassword]);

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
        // Seul le tout premier wallet de l'appareil déclenche l'onboarding —
        // un compte additionnel ("+ Ajouter un compte") affiche sa phrase de
        // récupération mais ne doit pas rejouer les 3 slides d'intro.
        if (!pendingWalletForPin.isNewAccount) {
          setIsFirstTimeMnemonicBackup(true);
        }
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
    if (Date.now() < pinLockedUntil) {
      setPinError(`Trop d'essais — réessaie dans ${Math.ceil((pinLockedUntil - Date.now()) / 1000)}s.`);
      setPinCode('');
      return;
    }
    setIsVerifyingPin(true);
    setPinError(null);
    try {
      const duressRecord = await loadDuressPinRecord();
      if (duressRecord && hashDuressPin(pin, duressRecord.salt) === duressRecord.hash) {
        // Code de détresse : jamais de déchiffrement, jamais la vraie clé —
        // juste un état "déverrouillé" avec un solde à zéro.
        setPinFailCount(0);
        setPinLockedUntil(0);
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
      setPinFailCount(0);
      setPinLockedUntil(0);
      setUnlockedPrivateKey(result.privateKey);
      setUnlockedMnemonic(result.mnemonic);
      setIsDuressMode(false);
      setIsUnlocked(true);
      setPinCode('');
      setPinError(null);
      await refreshPortfolio(network);
    } catch (err) {
      // Délai croissant à partir du 3e échec consécutif (5s, 10s, 20s, 40s,
      // plafonné à 60s) — voir le commentaire sur pinFailCount/pinLockedUntil
      // plus haut. Les 2 premiers échecs restent instantanés (faute de frappe
      // normale), le frein n'arrive qu'ensuite.
      setPinFailCount(prev => {
        const next = prev + 1;
        if (next >= 3) setPinLockedUntil(Date.now() + Math.min(5000 * (2 ** (next - 3)), 60000));
        return next;
      });
      setPinError('Code incorrect');
      setPinCode('');
    } finally {
      setIsVerifyingPin(false);
    }
  }, [walletSession, network, refreshPortfolio, pinLockedUntil]);

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

  // Suppression d'un compte, à la Trust Wallet : n'importe quel compte de la
  // liste se supprime directement, y compris celui actif — pas de détour
  // obligatoire par "bascule d'abord". S'il reste un autre compte, on
  // bascule dessus (PIN à retaper, comme switchAccount, jamais de clé
  // déchiffrée conservée en mémoire pour un compte qui vient d'être
  // supprimé). Si c'était le dernier compte, ça efface l'appareil entier —
  // Trust Wallet n'a pas de bouton "tout effacer" séparé, seulement la
  // suppression individuelle qui peut aller jusqu'à zéro compte.
  const deleteAccount = useCallback((id) => {
    const target = accounts.find(a => a.id === id);
    const isLast = accounts.length <= 1;
    showAlert(
      isLast ? '⚠️ Supprimer ce compte' : 'Supprimer ce compte ?',
      isLast
        ? "C'est ton dernier compte sur cet appareil : le supprimer efface le wallet entièrement. Sans ta phrase de récupération notée ailleurs, tu ne pourras PAS le récupérer."
        : `${target?.label || 'Ce compte'} sera retiré de cet appareil. Sans sa phrase de récupération notée ailleurs, il sera perdu définitivement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive', onPress: async () => {
            if (isLast) {
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
              return;
            }
            const next = accounts.filter(a => a.id !== id);
            setAccounts(next);
            await saveAccountsList(next);
            if (id === activeAccountId) {
              const fallback = next[0];
              const session = { address: fallback.address, encryptedKeystore: fallback.encryptedKeystore, network: fallback.network || network, createdAt: fallback.createdAt };
              await saveActiveAccountId(fallback.id);
              await saveWalletSession(session);
              setActiveAccountId(fallback.id);
              setWalletSession(session);
              setWalletAddr(fallback.address);
              setWalletBalance('0');
              setNetwork(session.network);
              setUnlockedPrivateKey(null);
              setUnlockedMnemonic(null);
              setIsUnlocked(false);
              setIsDuressMode(false);
              setPinCode('');
              setPinError(null);
              setHistoryItems(null);
            }
          },
        },
      ]
    );
  }, [accounts, activeAccountId, network]);

  // "+ Ajouter un compte" — deux entrées possibles, toutes deux réutilisent
  // le flux PIN existant (createWallet/pendingWalletForPin) : la nouvelle
  // entrée n'est écrite dans `accounts` qu'une fois le PIN confirmé, dans
  // finalizePinSetup (voir plus haut), exactement comme le tout premier
  // wallet de l'appareil.
  const addAccountGenerate = useCallback(() => {
    setShowAddAccount(false);
    createWallet(true);
  }, [createWallet]);

  const addAccountImport = useCallback(async () => {
    try {
      setAddAccountError(null);
      let imported;
      if (addAccountType === 'keystore') {
        if (!addAccountValue.trim() || !addAccountKeystorePassword) {
          setAddAccountError('Colle le keystore JSON et son mot de passe.');
          return;
        }
        try {
          imported = await localWallet.decryptWalletKeystore(addAccountValue.trim(), addAccountKeystorePassword);
        } catch (err) {
          setAddAccountError('Keystore ou mot de passe invalide.');
          return;
        }
      } else {
        if (!addAccountValue.trim()) {
          setAddAccountError('Entrer une phrase mnémonique ou une clé privée.');
          return;
        }
        imported = localWallet.importLocalWallet(addAccountValue, addAccountType);
      }
      if (accounts.some(a => a.address.toLowerCase() === imported.address.toLowerCase())) {
        setAddAccountError('Ce wallet est déjà un compte sur cet appareil.');
        return;
      }
      setPendingWalletForPin({ address: imported.address, privateKey: imported.privateKey, mnemonic: imported.mnemonic, isImport: true, isMigration: false, isNewAccount: true });
      setPinCode(''); setPendingPinDigits(''); setPinError(null);
      setPinStage('choose');
      setShowAddAccount(false);
      setAddAccountValue('');
      setAddAccountKeystorePassword('');
    } catch (err) {
      setAddAccountError(humanizeTxError(err) || 'Import invalide.');
    }
  }, [addAccountValue, addAccountType, addAccountKeystorePassword, accounts]);

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
      setWcError(humanizeTxError(err) || 'Connexion WalletConnect impossible.');
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
      showAlert('Connexion refusée', humanizeTxError(err) || 'Cette dApp demande une chaîne non supportée par NexiaWallet.');
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
      showAlert('Révocation impossible', humanizeTxError(err) || 'Réessaie plus tard.');
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
      setWcRequestError(humanizeTxError(err) || 'Impossible de traiter cette demande.');
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
    setDappDisplayUrl(withScheme);
    setDappUrlInput(withScheme);
  }, []);

  // Messages venant de la page web (voir lib/dappBrowserProvider.js). Les
  // méthodes purement lecture (pas de signature, pas de nouvelle
  // autorisation) sont résolues tout de suite ; le reste passe par une
  // confirmation explicite (renderDappBridgeRequest).
  //
  // SÉCURITÉ (faille corrigée le 2026-09-11, trouvée par audit) : `msg.origin`
  // vient du CORPS du message que la page envoie elle-même via
  // `window.ReactNativeWebView.postMessage` — un pont global que N'IMPORTE
  // QUELLE page chargée peut appeler directement, sans passer par le script
  // injecté (`dappBrowserProvider.js`) qui, lui, y met honnêtement
  // `window.location.origin`. Une page malveillante peut donc forger
  // `origin: "https://vraie-dapp-deja-connectee.com"` dans son propre appel et
  // se faire passer pour un site déjà autorisé (fuite silencieuse de
  // l'adresse via eth_accounts) ou pour un site de confiance dans la modale de
  // confirmation d'une signature/transaction (phishing). On calcule donc
  // l'origine de confiance nous-mêmes, côté natif, à partir de l'URL RÉELLE
  // suivie par la WebView (`dappDisplayUrl`, mis à jour par
  // `onNavigationStateChange` — un événement natif qu'une page ne peut pas
  // falsifier), et on ignore complètement `msg.origin`.
  const dappTrustedOrigin = useCallback(() => {
    try { return new URL(dappDisplayUrl || dappCurrentUrl || '').origin; } catch { return ''; }
  }, [dappDisplayUrl, dappCurrentUrl]);

  const handleDappMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!msg || msg.source !== 'nexiawallet-provider') return;
    const { id, method, params } = msg;
    const origin = dappTrustedOrigin();

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
  }, [dappConnectedOrigins, walletAddr, network, dappBridgeRespond, dappTrustedOrigin]);

  const handleDappBridgeApprove = useCallback(async () => {
    if (!dappBridgeRequest) return;
    const { id, method, params, origin } = dappBridgeRequest;
    setDappBridgeLoading(true);
    setDappBridgeError(null);
    try {
      if (method === 'eth_requestAccounts') {
        setDappConnectedOrigins(prev => (prev.includes(origin) ? prev : [...prev, origin]));
        dappBridgeRespond(id, null, walletAddr ? [walletAddr] : []);
        // Met a jour selectedAddress dans la page COURANTE uniquement (voir
        // dappBrowserProvider.js) — si l'utilisateur a navigue ailleurs entre
        // la demande et cette approbation, ce message atterrit dans le
        // document qui est reellement affiche maintenant, jamais dans un
        // document deja ferme/remplace.
        if (walletAddr) {
          dappWebViewRef.current?.injectJavaScript(`window.__nexiaEmit('accountsChanged', ${JSON.stringify([walletAddr])}); true;`);
        }
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
      const message = humanizeTxError(err) || 'Requête refusée.';
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
    // Avant, un échec ne faisait qu'un avertissement en console : la liste des
    // validateurs restait vide, sans indicateur ni message, et « Staker »
    // renvoyait « Choisis un validateur » alors qu'aucun n'était proposé.
    // Vérifié en coupant le nœud Solana.
    setValidatorsLoading(true);
    setValidatorsError(false);
    try {
      const list = await localWallet.getSolanaValidators();
      setValidators(list);
      if (list.length && !selectedValidator) setSelectedValidator(list[0].votePubkey);
    } catch (err) {
      console.warn('getSolanaValidators error', err.message);
      setValidatorsError(true);
    } finally {
      setValidatorsLoading(false);
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
      setStakeError(humanizeTxError(err) || 'Impossible de créer le stake.');
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
              showAlert('Erreur', humanizeTxError(err) || 'Impossible de désactiver ce stake.');
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
      showAlert('Erreur', humanizeTxError(err) || 'Impossible de retirer ce stake.');
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
    setNftVisibleCount(NFT_PAGE_SIZE);
    if (!walletAddr) return;
    setNftsLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/nft/owned/${walletAddr}`, { params: { network: net }, timeout: 25000, headers: API_HEADERS });
      if (!response.data?.success) throw new Error(response.data?.error || 'Impossible de récupérer les NFT.');
      setNfts(response.data.nfts || []);
    } catch (err) {
      // Le détail brut (« Service indisponible »…) reste en console : à
      // l'écran, un état d'erreur lisible avec Réessayer.
      console.warn('NFT indisponibles :', err.response?.data?.error || err.message);
      setNftsError(err.response?.data?.error || humanizeTxError(err) || 'Impossible de récupérer les NFT.');
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
      setNftSendError(humanizeTxError(err) || "Impossible d'envoyer ce NFT.");
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

  // (L'ancienne notification de réception — natif seulement, crypto native du
  // réseau actif seulement, et fausse alerte possible au changement de réseau
  // puisqu'elle comparait walletBalance d'un réseau à l'autre — est remplacée
  // par noteBalance, appelé à chaque relevé de solde.)

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
    loadCurrency().then(setCurrency);
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
      showToast(humanizeTxError(err) || 'Impossible de lire ce contrat', 'error');
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
    const evmMatch = trimmed.match(/0x[a-fA-F0-9]{40}/);
    if (evmMatch) {
      setSendAddress(evmMatch[0]);
      setShowQrScanner(false);
      return;
    }
    // Ce même scanner sert aussi à l'envoi Solana/Bitcoin (le champ adresse
    // sur Envoyer est unique quel que soit sendToken) — sans ceci, scanner
    // une adresse Solana ou Bitcoin valide échouait toujours avec "QR non
    // reconnu", alors que le scan compte justement plus pour ces formats
    // (base58/bech32), bien plus pénibles à retaper à la main qu'un 0x...
    // Certains générateurs de QR préfixent d'un schéma URI ("bitcoin:bc1...",
    // "solana:...") suivi d'éventuels paramètres ("?amount=...") — on isole
    // la partie adresse avant de la valider avec les mêmes fonctions que
    // prepareSend, sans présumer quel token est sélectionné.
    const withoutScheme = trimmed.replace(/^[a-z]+:/i, '').split('?')[0].trim();
    if (localWallet.isValidSolanaAddress(withoutScheme) || localWallet.isValidBitcoinAddress(withoutScheme)) {
      setSendAddress(withoutScheme);
      setShowQrScanner(false);
      return;
    }
    showToast('QR non reconnu', 'error');
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
    loadFlag(SEED_BACKED_UP_KEY).then(setSeedBackedUp);
    loadFlag(KEYSTORE_EXPORTED_KEY).then(setKeystoreExported);
    loadHideBalance().then(setBalanceHidden);
    loadHideZeroBalances().then(setHideZeroBalances);
    loadCardWaitlist().then((email) => { setCardWaitlistJoined(email); setCardWaitlistEmail(email); });
    loadExperienceMode().then(setExperienceMode);
    loadProfileEmail().then((email) => { setProfileEmailSaved(email); setProfileEmailInput(email); });
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
      const label = { completed: '✅ Achat confirmé', pending: '⏳ Achat en cours', failed: '❌ Achat échoué' }[status] || `Statut Coinbase : ${status}`;
      showAlert(label, status === 'failed'
        ? "La transaction Coinbase n'a pas abouti."
        : 'Ton solde se met à jour dès que la transaction est confirmée sur la blockchain — vérification automatique en cours.');
    } else {
      showAlert('✅ Achat (mode démo)', 'Aucun vrai paiement effectué — configure un fournisseur de paiement pour un achat réel.');
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
    // Estimation indicative : ratio de prix moins la commission NexiaWallet
    // (le devis 0x réel au moment de confirmer reste la valeur qui fait foi).
    const result = ((parseFloat(swapAmt) * fp) / tp) * (1 - SWAP_FEE_BPS / 10000);
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

    // Vraies bougies (CoinGecko) pour les vues plus longues. Tant qu'elles ne
    // sont pas encore arrivées, on renvoie [] — CandlestickChart affiche alors
    // son état "Chargement données…" plutôt qu'un graphique inventé.
    const real = realCandles[`${symbol}_${detailTf}`];
    const numCandles = cfg?.numCandles || 8;
    if (real && real.length) return real.slice(-numCandles);

    return [];
  }, [detailTf, tokens, candleHistory, chartTick, realCandles]);

  // Récupère les vraies bougies + la fiche crypto (CoinGecko) dès qu'on ouvre
  // le détail d'un token ou qu'on change de zoom — avec cache pour ne pas
  // re-télécharger à chaque re-render. En cas d'échec (rate limit, coupure
  // réseau), on retente en boucle (backoff jusqu'à 30s) plutôt que d'abandonner :
  // jamais de donnée inventée affichée à la place d'un vrai graphique.
  useEffect(() => {
    if (!selectedToken) return;
    const cfg = TF_CONFIG[detailTf];
    if (cfg?.live) return; // 5M/15M restent sur l'agrégation live locale (déjà réelle)
    const cgId = WALLET_TOKENS[selectedToken]?.cgId;
    if (!cgId) return;
    const key = `${selectedToken}_${detailTf}`;
    if (realCandles[key]) return;
    const errKey = `candles:${key}`;

    let cancelled = false;
    let attempt = 0;
    const load = () => {
      axios.get(`${API_BASE}/coin/${cgId}/candles`, {
        params: { timeframe: detailTf }, headers: API_HEADERS, timeout: 15000,
      }).then(res => {
        if (cancelled) return;
        if (res.data?.success) { setRealCandles(prev => ({ ...prev, [key]: res.data.candles })); markDetailError(errKey, false); }
        else retry();
      }).catch(err => {
        console.warn('candles CoinGecko indisponibles, nouvelle tentative:', err.message);
        retry();
      });
    };
    const retry = () => {
      if (cancelled) return;
      // Dès le premier échec on le DIT (état d'erreur + Réessayer) ; les
      // tentatives automatiques continuent derrière.
      markDetailError(errKey, true);
      attempt += 1;
      setTimeout(load, Math.min(5000 * attempt, 30000));
    };
    load();
    return () => { cancelled = true; };
  }, [selectedToken, detailTf, realCandles, detailRetryTick, markDetailError]);

  // Une seule tentative et une erreur envoyée en console, avant : en cas
  // d'échec, « Chargement des infos réelles… » restait affiché pour toujours,
  // sans même un nouvel essai.
  useEffect(() => {
    if (!selectedToken || coinDetails[selectedToken]) return;
    const cgId = WALLET_TOKENS[selectedToken]?.cgId;
    if (!cgId) return;
    const errKey = `coin:${selectedToken}`;
    let cancelled = false;
    axios.get(`${API_BASE}/coin/${cgId}`, { headers: API_HEADERS, timeout: 15000 })
      .then(res => {
        if (cancelled) return;
        if (res.data?.success) { setCoinDetails(prev => ({ ...prev, [selectedToken]: res.data.coin })); markDetailError(errKey, false); }
        else markDetailError(errKey, true);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('fiche crypto indisponible:', err.message);
        markDetailError(errKey, true);
      });
    return () => { cancelled = true; };
  }, [selectedToken, coinDetails, detailRetryTick, markDetailError]);

  // Fiche + bougies pour une crypto du Marché qui n'est PAS dans le wallet —
  // même endpoints que ci-dessus, mais indexés par id CoinGecko (pas de
  // symbole wallet connu pour ces cryptos-là).
  useEffect(() => {
    if (!selectedMarketCoin) return;
    const id = selectedMarketCoin.id;
    if (!id || marketCoinInfo[id]) return;
    const errKey = `mcoin:${id}`;
    let cancelled = false;
    axios.get(`${API_BASE}/coin/${id}`, { headers: API_HEADERS, timeout: 15000 })
      .then(res => {
        if (cancelled) return;
        if (res.data?.success) { setMarketCoinInfo(prev => ({ ...prev, [id]: res.data.coin })); markDetailError(errKey, false); }
        else markDetailError(errKey, true);
      })
      .catch(err => {
        if (cancelled) return;
        console.warn('fiche crypto (marché) indisponible:', err.message);
        markDetailError(errKey, true);
      });
    return () => { cancelled = true; };
  }, [selectedMarketCoin, marketCoinInfo, detailRetryTick, markDetailError]);

  useEffect(() => {
    if (!selectedMarketCoin) return;
    const id = selectedMarketCoin.id;
    if (!id || marketCoinCandles[id]) return;
    const errKey = `mcandles:${id}`;

    let cancelled = false;
    let attempt = 0;
    const load = () => {
      axios.get(`${API_BASE}/coin/${id}/candles`, {
        params: { timeframe: '1J' }, headers: API_HEADERS, timeout: 15000,
      }).then(res => {
        if (cancelled) return;
        if (res.data?.success) { setMarketCoinCandles(prev => ({ ...prev, [id]: res.data.candles })); markDetailError(errKey, false); }
        else retry();
      }).catch(err => {
        console.warn('bougies (marché) indisponibles, nouvelle tentative:', err.message);
        retry();
      });
    };
    const retry = () => {
      if (cancelled) return;
      markDetailError(errKey, true);
      attempt += 1;
      setTimeout(load, Math.min(5000 * attempt, 30000));
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMarketCoin, marketCoinCandles, detailRetryTick, markDetailError]);

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
  const renderCoinAbout = (info, keyId, accentColor = T.blue, failed = false) => {
    if (!info && failed) {
      return (
        <View style={[st.about_box, { alignItems: 'center', paddingVertical: 18 }]}>
          <ErrorState compact title="Infos indisponibles pour le moment" onRetry={retryDetailLoad} />
        </View>
      );
    }
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

  // Refonte accueil — recherche + tri fonctionnels sur « Mes tokens ».
  // La recherche filtre par nom ou symbole, le tri réordonne vraiment la
  // liste (valeur, nom, variation 24h). Ne change rien aux autres écrans.
  const homeTokenEntries = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    const filtered = q
      ? visibleTokenEntries.filter(([sym, t]) => (t.name || '').toLowerCase().includes(q) || sym.toLowerCase().includes(q))
      : [...visibleTokenEntries];
    if (tokenSort === 'name') return filtered.sort(([, a], [, b]) => (a.name || '').localeCompare(b.name || ''));
    if (tokenSort === 'change') return filtered.sort(([, a], [, b]) => ((b.change24h ?? -Infinity) - (a.change24h ?? -Infinity)));
    return filtered.sort(([, a], [, b]) => (((b.balance || 0) * (b.price || 0)) - ((a.balance || 0) * (a.price || 0))));
  }, [visibleTokenEntries, tokenSearch, tokenSort]);

  const filteredNewsItems = useMemo(() =>
    newsFilter === 'all' ? newsItems : newsItems.filter((item) => (item.category || 'crypto') === newsFilter),
  [newsItems, newsFilter]);

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
  // `icon` = nom d'icône Ionicons (jeu homogène, plus de mélange emoji/glyphe).
  const QUICK_ACTIONS_BASE = [
    { id: 'send',    icon: 'arrow-up',   label: t('action_send'),    bg: T.card2, onPress: () => setShowSend(true) },
    { id: 'buy',     icon: 'card',       label: t('action_buy'),     bg: T.gold, onPress: () => setShowBuy(true) },
    ...(SELL_ENABLED ? [{ id: 'sell', icon: 'cash', label: t('action_sell'), bg: T.card2, onPress: () => setShowSell(true) }] : []),
    { id: 'receive', icon: 'arrow-down', label: t('action_receive'), bg: T.card2, onPress: () => { setReceiveChain('evm'); setShowReceive(true); } },
    { id: 'history', icon: 'time',       label: t('home_activity'),  bg: T.card2, onPress: () => setShowHistory(true) },
    { id: 'nft',     icon: 'image',      label: 'NFT',               bg: T.card2, onPress: () => openNftGallery() },
  ];
  const visibleQuickActions = [
    ...QUICK_ACTIONS_BASE.filter(a => !hiddenQuickActions.includes(a.id)),
    ...(lastSend && lastSend.network === network ? [{ id: 'repeat', icon: 'reload', label: t('action_repeat'), bg: T.card2, onPress: repeatLastSend }] : []),
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
      // `??` (pas `||`) : une crypto exactement à 0,00 % sur 24h est une
      // valeur légitime, pas une absence de donnée — `||` la traiterait
      // comme falsy et l'enverrait tout en bas du tri "Hausse" comme si
      // c'était la pire performance. Le tri "Baisse" juste en dessous
      // utilisait déjà `??` correctement ; "Hausse" ne l'avait pas.
      sorted.sort((a, b) => (b.price_change_percentage_24h ?? -Infinity) - (a.price_change_percentage_24h ?? -Infinity));
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

  // Résolution ENS inversée (adresse -> "nom.eth") pour l'écran Activité —
  // purement cosmétique (juste un nom plus lisible qu'un hash), donc toujours
  // interrogée sur Ethereum mainnet (seule chaîne où le registre ENS existe),
  // quel que soit le réseau actif de la transaction affichée. Cache par
  // adresse en minuscules ; `null` en cache = déjà cherché, aucun nom trouvé
  // (évite de re-cogner le RPC à chaque re-render pour une adresse sans ENS).
  const [ensNamesCache, setEnsNamesCache] = useState({});
  useEffect(() => {
    if (!showHistory || !filteredHistoryItems.length) return;
    const addrs = [...new Set(
      filteredHistoryItems.slice(0, historyVisibleCount).map(item => (item.direction === 'out' ? item.to : item.from)?.toLowerCase()).filter(Boolean)
    )].filter(addr => !(addr in ensNamesCache));
    if (!addrs.length) return;
    let cancelled = false;
    (async () => {
      const provider = localWallet.getProvider('ethereum');
      const entries = await Promise.all(addrs.map(async (addr) => {
        try { return [addr, await provider.lookupAddress(addr)]; } catch { return [addr, null]; }
      }));
      if (!cancelled) setEnsNamesCache(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
  }, [showHistory, filteredHistoryItems, historyVisibleCount]);

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
      showAlert('Montant invalide', 'Entre un montant en EUR.');
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
      showAlert('Erreur paiement', humanizeTxError(err) || 'Impossible de lancer le paiement.');
    } finally {
      setBuyLoading(false);
    }
  };

  // ── VENTE (off-ramp Coinbase) ── même principe que l'achat, sens inverse :
  // le widget Coinbase affiche une adresse de dépôt, l'utilisateur y envoie
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
      showAlert('Erreur', humanizeTxError(err) || 'Impossible de lancer la vente.');
    } finally {
      setSellLoading(false);
    }
  };

  const handleSaveRecurringBuy = async () => {
    const amountUsd = Number(recurringAmount);
    if (recurringEnabled && (!amountUsd || isNaN(amountUsd) || amountUsd <= 0)) {
      showAlert('Montant invalide', 'Entre un montant en EUR.');
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
      showAlert('Erreur', humanizeTxError(err) || "Impossible d'enregistrer l'achat récurrent.");
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
        apiBase: API_BASE,
        apiHeaders: API_HEADERS,
      });
      setBridgeQuote(quote);
    } catch (err) {
      setBridgeError(err.response?.data?.message || humanizeTxError(err) || 'Impossible de récupérer une route de pont.');
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
      // Confirmation du DÉPART sur le réseau d'origine. L'arrivée sur l'autre
      // réseau dépend du pont lui-même et se voit au solde, qui déclenche sa
      // propre notification « Fonds reçus ».
      trackTransaction({ txHash: resp.data.txHash, net: bridgeFromNetwork, token: ({ bsc: 'BNB', polygon: 'MATIC' }[bridgeFromNetwork] || 'ETH'), amount: bridgeAmount, kind: 'Pont' });
      showAlert('✅ Pont envoyé', `Ta transaction de pont a été diffusée.\nHash: ${resp.data.txHash?.slice(0, 10)}...\nL'arrivée sur ${bridgeToNetwork} peut prendre quelques minutes.`, [{ text: 'OK' }]);
      setShowBridge(false);
      setBridgeQuote(null);
      setBridgeAmount('');
    } catch (err) {
      setBridgeError(humanizeTxError(err) || 'Impossible de finaliser le pont.');
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
        trackTransaction({ txHash, net: 'solana', token: 'SOL', amount: sendAmount, kind: 'Envoi' });
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
        showAlert('❌ Erreur', humanizeTxError(e) || 'Transaction échouée');
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
        trackTransaction({ txHash, net: 'bitcoin', token: 'BTC', amount: sendAmount, kind: 'Envoi' });
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
        showAlert('❌ Erreur', humanizeTxError(e) || 'Transaction échouée');
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
      trackTransaction({ txHash, net: network, token: sendToken, amount: sendAmount, kind: 'Envoi' });
      showAlert(
        '✅ Transaction Soumise!',
        `${sendToken} envoyé avec succès !\nHash: ${txHash?.slice(0, 10)}...\nRéseau: ${activeNetwork.label}\n\nTu seras prévenu dès qu'elle est confirmée.`,
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
      showAlert('❌ Erreur', humanizeTxError(e) || 'Transaction échouée');
    }
    setSendLoading(false);
  };

  // ── ÉCHANGE ENTRE ÉCOSYSTÈMES (SOL, BTC) ───────────────────────────────
  // L'échange classique passe par 0x, qui ne fait que de l'EVM sur UNE chaîne :
  // le SOL et le BTC n'étaient donc pas échangeables du tout. Dès qu'un des
  // deux côtés est du SOL ou du BTC, on passe par /swap/cross-quote (LI.FI),
  // et l'app signe selon l'écosystème de départ — toujours en local, la clé ne
  // sort jamais de l'appareil.
  const reseauDuJeton = useCallback((symbole) => (symbole === 'SOL' ? 'solana' : symbole === 'BTC' ? 'bitcoin' : network), [network]);
  const decimalesDuJeton = useCallback((symbole) => {
    if (symbole === 'SOL') return 9;
    if (symbole === 'BTC') return 8;
    if (symbole === nativeSymbol) return 18;
    return localWallet.ERC20_TOKENS[network]?.[symbole]?.decimals ?? 18;
  }, [network, nativeSymbol]);
  const adresseDuReseau = useCallback((reseau) => (reseau === 'solana' ? solanaAddr : reseau === 'bitcoin' ? bitcoinAddr : walletAddr), [solanaAddr, bitcoinAddr, walletAddr]);
  const soldeDuJeton = useCallback((symbole) => {
    if (symbole === 'SOL') return parseFloat(solanaBalance || '0');
    if (symbole === 'BTC') return parseFloat(bitcoinBalance || '0');
    if (symbole === nativeSymbol) return parseFloat(walletBalance || '0');
    return tokens[symbole]?.balance || 0;
  }, [solanaBalance, bitcoinBalance, walletBalance, nativeSymbol, tokens]);
  const estEchangeInterEcosysteme = (de, vers) => de === 'SOL' || de === 'BTC' || vers === 'SOL' || vers === 'BTC';

  const confirmerEchangeInterEcosysteme = async () => {
    const reseauDepart = reseauDuJeton(swapFrom);
    const reseauArrivee = reseauDuJeton(swapTo);
    const decimales = decimalesDuJeton(swapFrom);
    const fromAddress = adresseDuReseau(reseauDepart);
    const toAddress = adresseDuReseau(reseauArrivee);
    if (!fromAddress || !toAddress) throw new Error('Adresse de wallet indisponible pour ce réseau.');
    const montantUnites = ethers.utils.parseUnits(parseFloat(swapAmt).toFixed(decimales), decimales).toString();

    const devis = await axios.get(`${API_BASE}/swap/cross-quote`, {
      params: {
        fromNetwork: reseauDepart, toNetwork: reseauArrivee,
        fromToken: swapFrom, toToken: swapTo,
        fromAmount: montantUnites, fromAddress, toAddress,
      },
      headers: API_HEADERS,
      timeout: 30000,
    });
    if (!devis.data?.success) throw new Error(devis.data?.error || 'Aucune route disponible pour cet échange.');
    const { quote, ecosystemeDepart } = devis.data;
    const tx = quote?.transactionRequest || {};

    let rawTx;
    let routeDiffusion;
    let corps;
    if (ecosystemeDepart === 'solana') {
      ({ rawTx } = await localWallet.signSolanaSwapTx({ mnemonic: unlockedMnemonic, base64Tx: tx.data }));
      routeDiffusion = '/tx/broadcast-solana';
      corps = { rawTx };
    } else if (ecosystemeDepart === 'bitcoin') {
      ({ rawTx } = await localWallet.signBitcoinSwapPsbt({ mnemonic: unlockedMnemonic, psbtHex: tx.data }));
      routeDiffusion = '/tx/broadcast-bitcoin';
      corps = { rawTx };
    } else {
      ({ rawTx } = await localWallet.signRawTx({
        privateKey: unlockedPrivateKey,
        to: tx.to,
        data: tx.data,
        value: ethers.BigNumber.from(tx.value || '0x0').toString(),
        gasLimit: tx.gasLimit ? ethers.BigNumber.from(tx.gasLimit).toString() : undefined,
        network: reseauDepart,
      }));
      routeDiffusion = '/tx/broadcast';
      corps = { rawTx, network: reseauDepart };
    }

    const diffusion = await axios.post(`${API_BASE}${routeDiffusion}`, corps, { timeout: 25000, headers: API_HEADERS });
    if (!diffusion.data?.success) throw new Error(diffusion.data?.error || "Échec de la diffusion de l'échange.");

    const txHash = diffusion.data.txHash;
    trackTransaction({ txHash, net: reseauDepart, token: swapFrom, amount: swapAmt, kind: 'Échange' });
    playTone('success');
    showAlert(
      '✅ Échange lancé',
      `${swapAmt} ${swapFrom} → ${swapTo}.\nHash : ${txHash?.slice(0, 10)}…\n\nL'arrivée peut prendre quelques minutes ; tu seras prévenu.`,
      [{ text: 'OK' }],
    );
    setSwapAmt('');
    refreshPortfolio(network);
    refreshSolanaBalance();
    refreshBitcoinBalance();
  };

  const handleSwapConfirm = async () => {
    if (!swapAmt || parseFloat(swapAmt) <= 0) { showAlert('Montant invalide'); return; }
    if (swapFrom === swapTo) { showAlert('Tokens identiques', 'Choisis deux tokens différents.'); return; }

    const available = soldeDuJeton(swapFrom);
    if (parseFloat(swapAmt) > available) {
      showAlert('Solde insuffisant', `Tu n'as pas assez de ${swapFrom} pour cette opération.`);
      return;
    }

    if (estEchangeInterEcosysteme(swapFrom, swapTo)) {
      setSwapLoading(true);
      try {
        await confirmerEchangeInterEcosysteme();
      } catch (e) {
        console.warn('échange inter-écosystèmes échoué', e.message);
        showAlert('❌ Erreur', humanizeTxError(e) || 'Échange impossible');
      } finally {
        setSwapLoading(false);
      }
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
      // Approuve UNIQUEMENT le montant de ce swap, jamais MaxUint256: notre
      // propre simulation anti-arnaque (voir txSimulation.js) signale une
      // autorisation quasi-illimitée comme un risque ÉLEVÉ quand c'est une
      // dApp tierce qui la demande — appliquer le même risque à nos propres
      // swaps serait incohérent, et exposerait tout le solde du token (pas
      // seulement le montant échangé) si jamais le contrat du swap était un
      // jour compromis. Coût : une nouvelle approbation à chaque swap du même
      // token, accepté comme contrepartie normale de cette protection.
      const spender = quote.issues?.allowance?.spender;
      if (spender) {
        const { rawTx: approveRawTx } = await localWallet.signApproveTx({
          privateKey: unlockedPrivateKey,
          tokenAddress: sellAddress,
          spender,
          amount: sellAmountUnits,
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
          amount: sellAmountUnits, isNft: false, txHash: approveResp.data.txHash,
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
      trackTransaction({ txHash, net: network, token: swapFrom, amount: swapAmt, kind: 'Swap' });
      playTone('success');
      showAlert(
        '✅ Swap Soumis !',
        `${swapAmt} ${swapFrom} → ${swapTo}\nHash: ${txHash?.slice(0, 10)}...\nRéseau: ${activeNetwork.label}`,
        [{ text: 'OK' }]
      );

      await refreshPortfolio(network);
      setSwapAmt('');
      fetchMarket();
    } catch (e) {
      playTone('error');
      showAlert('❌ Erreur', humanizeTxError(e) || 'Swap échoué');
    }
    setSwapLoading(false);
  };

  const renderMnemonicReauth = () => (
    <Modal visible={showMnemonicReauth} animationType="fade" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowMnemonicReauth(false); setMnemonicReauthPin(''); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Annuler">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Confirme ton PIN</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <View style={st.warning_box}>
            <Text style={st.warning_txt}>
              ⚠️ Ta phrase de récupération va s'afficher — assure-toi que personne ne regarde ton écran. Retape ton
              code PIN pour confirmer que c'est bien toi.
            </Text>
          </View>
          <TextInput
            style={[st.form_input, { marginTop: 16 }]}
            value={mnemonicReauthPin}
            onChangeText={(v) => { setMnemonicReauthPin(v.replace(/\D/g, '').slice(0, 6)); setMnemonicReauthError(null); }}
            placeholder="Code PIN"
            placeholderTextColor={T.text3}
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
            autoFocus
          />
          {!!mnemonicReauthError && <Text style={[st.auth_error, { marginTop: 10 }]}>{mnemonicReauthError}</Text>}
          <AnimPressable
            style={[st.green_btn, { marginTop: 20, opacity: mnemonicReauthLoading ? 0.7 : 1 }]}
            disabled={mnemonicReauthLoading || mnemonicReauthPin.length !== 6}
            onPress={handleMnemonicReauthConfirm}
          >
            {mnemonicReauthLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Afficher la phrase</Text>}
          </AnimPressable>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

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
            <Text style={st.modal_title_lg}>{t('mnemonic_title')}</Text>
            <View style={st.warning_box}>
              <Text style={st.warning_txt}>{t('mnemonic_warning')}</Text>
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
                setSeedBackedUp(true);
                saveFlag(SEED_BACKED_UP_KEY);
                if (isFirstTimeMnemonicBackup) {
                  setIsFirstTimeMnemonicBackup(false);
                  setOnboardingStep(0);
                  setShowOnboarding(true);
                } else {
                  setShowSettings(true);
                }
              }}
            >
              <Text style={st.green_btn_txt}>{t('mnemonic_saved_button')}</Text>
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
        ? t('pin_choose_migration')
        : pendingWalletForPin?.isNewAccount
          ? t('pin_choose_new_account')
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
            <Text style={{ color: T.text3, fontSize: 13, textAlign: 'center' }}>{t('common_cancel')}</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // ════════════════════════════════════════════════════════
  //  ACCUEIL PUBLIC (pas encore de wallet sur cet appareil)
  // ════════════════════════════════════════════════════════
  if (!walletCreated) {
    // Palette claire et épurée, indépendante du thème (l'accueil est public,
    // vu avant tout choix de thème). Accent vert = positif, pas le violet
    // "startup IA". Volontairement minimal : marque, phrase, bouton, 3 repères.
    // Phase 1 : la palette claire de la page d'accueil vient des tokens
    // partagés (lib/designTokens.js) — le blanc n'y est écrit qu'une fois.
    const L = {
      bg: DESIGN_TOKENS.white,
      text: DESIGN_TOKENS.ink,
      soft: DESIGN_TOKENS.soft,
      accent: DESIGN_TOKENS.accent,
      chip: DESIGN_TOKENS.chip,
      border: DESIGN_TOKENS.border,
    };
    const impInput = { borderWidth: 1, borderColor: L.border, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14, color: L.text, backgroundColor: DESIGN_TOKENS.white, minHeight: 46 };
    const primaryBtn = { backgroundColor: L.accent, borderRadius: 16, paddingVertical: 17, alignItems: 'center', width: '100%' };
    return (
      <SafeAreaView style={[st.land_screen, { backgroundColor: L.bg }, isWideWeb && st.land_screen_wide]}>
        <StatusBar barStyle="dark-content" />
        <ScrollView ref={landingScrollRef} style={st.land_scroll_flex} contentContainerStyle={{ paddingBottom: 40, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: isWideWeb ? 860 : 420, paddingHorizontal: isWideWeb ? 48 : 24, paddingTop: 30, alignItems: 'center' }}>

            {/* Phase 1 — barre de navigation minimale : logo, sections
                de la page (défilement interne) et contact. Aucun lien
                vers un téléchargement d'app, qui n'existe pas encore. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 44, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: L.accent, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                  <Ionicons name="shield-checkmark" size={18} color={DESIGN_TOKENS.white} />
                </View>
                <Text style={{ fontSize: 17, fontWeight: '800', color: L.text }}>NexiaWallet</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => scrollToLandingSection('produit')}><Text style={{ fontSize: 13, fontWeight: '700', color: L.text }}>{t('landing_nav_produit')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => scrollToLandingSection('reseaux')}><Text style={{ fontSize: 13, fontWeight: '700', color: L.text }}>{t('landing_nav_reseaux')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => scrollToLandingSection('securite')}><Text style={{ fontSize: 13, fontWeight: '700', color: L.text }}>{t('landing_nav_securite')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL('mailto:contact@nexiawallet.com')}><Text style={{ fontSize: 13, fontWeight: '700', color: L.text }}>{t('landing_nav_contact')}</Text></TouchableOpacity>
              </View>
            </View>

            {/* Accroche */}
            <Text style={{ fontSize: 30, lineHeight: 38, fontWeight: '800', color: L.text, textAlign: 'center' }}>
              {t('landing_title_line1')}{'\n'}<Text style={{ color: L.accent }}>{t('landing_title_line2')}</Text>
            </Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: L.soft, textAlign: 'center', marginTop: 14, maxWidth: 300 }}>
              {t('landing_subtitle')}
            </Text>

            {/* Onboarding, visuellement séparé de la vitrine ci-dessous */}
            <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1.2, color: L.soft, marginTop: 20, marginBottom: 12, textAlign: 'center' }}>{t('landing_onboarding_title')}</Text>
            <View style={{ width: '100%', borderWidth: 1, borderColor: L.border, borderRadius: 18, padding: 16, backgroundColor: DESIGN_TOKENS.white }}>
            {/* Boutons — tout en haut */}
            <View style={{ width: '100%', marginTop: 30 }}>
              <AnimPressable style={primaryBtn} onPress={() => createWallet()}>
                <Text style={{ color: '#062219', fontSize: 16, fontWeight: '800' }}>{t('onboarding_create')}</Text>
              </AnimPressable>
              <AnimPressable style={{ paddingVertical: 15, alignItems: 'center', width: '100%', marginTop: 10, borderRadius: 16, borderWidth: 1.5, borderColor: L.border }} onPress={() => { setImportMode(true); setImportError(null); }}>
                <Text style={{ color: L.text, fontSize: 14, fontWeight: '700' }}>{t('onboarding_import')}</Text>
              </AnimPressable>
            </View>

            {backendError ? <Text style={st.auth_error}>{backendError}</Text> : null}

            {/* 3 repères */}
            <View style={{ flexDirection: 'row', marginTop: 24, width: '100%' }}>
              {[['lock-closed-outline', t('landing_chip_noncustodial')], ['flash-outline', t('landing_chip_instant')], ['globe-outline', t('landing_chip_networks')]].map(([ic, lb], i) => (
                <View key={lb} style={{ flex: 1, backgroundColor: L.chip, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginLeft: i ? 8 : 0 }}>
                  <Ionicons name={ic} size={20} color={L.accent} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: L.text, marginTop: 6 }}>{lb}</Text>
                </View>
              ))}
            </View>

            {/* Parrainage (discret) */}
            {!referredByCode && (
              referralInputMode ? (
                <View style={{ width: '100%', marginTop: 18, backgroundColor: L.chip, borderRadius: 14, padding: 14 }}>
                  <TextInput
                    style={impInput}
                    value={referralInputValue}
                    onChangeText={setReferralInputValue}
                    placeholder={t('landing_referral_placeholder')}
                    placeholderTextColor={L.soft}
                    autoCapitalize="characters"
                  />
                  <AnimPressable style={{ backgroundColor: L.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 10 }} onPress={() => applyReferralCode(referralInputValue)}>
                    <Text style={{ color: DESIGN_TOKENS.white, fontWeight: '800' }}>{t('common_validate')}</Text>
                  </AnimPressable>
                  <TouchableOpacity onPress={() => { setReferralInputMode(false); setReferralInputValue(''); }} style={{ marginTop: 10 }}>
                    <Text style={{ color: L.soft, fontSize: 12, textAlign: 'center' }}>{t('common_cancel')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setReferralInputMode(true)} style={{ marginTop: 18 }}>
                  <Text style={{ color: L.soft, fontSize: 12 }}>{t('landing_referral_cta')}</Text>
                </TouchableOpacity>
              )
            )}

            {/* Import */}
            {importMode && (
              <View style={{ width: '100%', marginTop: 16, backgroundColor: L.chip, borderRadius: 16, padding: 16 }}>
                <View style={{ flexDirection: 'row', backgroundColor: DESIGN_TOKENS.white, borderRadius: 10, padding: 3, marginBottom: 12 }}>
                  {[['mnemonic', t('import_tab_words')], ['privateKey', t('import_tab_private_key')], ['keystore', t('import_tab_keystore')]].map(([tp, lb]) => (
                    <TouchableOpacity key={tp} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: importType === tp ? L.accent : 'transparent' }} onPress={() => setImportType(tp)}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: importType === tp ? DESIGN_TOKENS.white : L.soft }}>{lb}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={[impInput, (importType === 'mnemonic' || importType === 'keystore') && { minHeight: 84, textAlignVertical: 'top' }]}
                  value={importValue}
                  onChangeText={setImportValue}
                  placeholder={importType === 'mnemonic' ? t('import_placeholder_mnemonic') : importType === 'keystore' ? t('import_placeholder_keystore') : t('import_placeholder_private_key')}
                  placeholderTextColor={L.soft}
                  multiline={importType === 'mnemonic' || importType === 'keystore'}
                  autoCapitalize="none"
                />
                {importType === 'keystore' && (
                  <TextInput
                    style={[impInput, { marginTop: 10 }]}
                    value={importKeystorePassword}
                    onChangeText={setImportKeystorePassword}
                    placeholder={t('import_keystore_password')}
                    placeholderTextColor={L.soft}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                )}
                {importError ? <Text style={st.import_error}>{importError}</Text> : null}
                <AnimPressable style={{ backgroundColor: L.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 }} onPress={importWallet}>
                  <Text style={{ color: DESIGN_TOKENS.white, fontWeight: '800' }}>{t('import_button')}</Text>
                </AnimPressable>
              </View>
            )}

            </View>

            {/* ── Vitrine (Phase 1) : distincte de l'onboarding ci-dessus.
                Contenu repris du README et des CGU, sans chiffre inventé. */}
            <View style={{ width: '100%', height: 1, backgroundColor: L.border, marginTop: 36, marginBottom: 8 }} />

            <View style={{ width: '100%', marginTop: 24 }} onLayout={(e) => { landingSectionY.current.produit = e.nativeEvent.layout.y; }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: L.text, textAlign: isWideWeb ? 'left' : 'center' }}>{t('landing_showcase_title')}</Text>
              <Text style={{ fontSize: 14, lineHeight: 21, color: L.soft, marginTop: 10, textAlign: isWideWeb ? 'left' : 'center' }}>{t('landing_showcase_sub')}</Text>
              <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 12, marginTop: 18 }}>
                {[
                  ['key-outline', t('landing_feature_keys_title'), t('landing_feature_keys_desc')],
                  ['flash-outline', t('landing_feature_instant_title'), t('landing_feature_instant_desc')],
                  ['globe-outline', t('landing_feature_networks_title'), t('landing_feature_networks_desc')],
                ].map(([ic, ti, de]) => (
                  <View key={ti} style={{ flex: 1, backgroundColor: L.chip, borderRadius: 14, padding: 16 }}>
                    <Ionicons name={ic} size={22} color={L.accent} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: L.text, marginTop: 10 }}>{ti}</Text>
                    <Text style={{ fontSize: 13, lineHeight: 19, color: L.soft, marginTop: 6 }}>{de}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={{ width: '100%', marginTop: 32 }} onLayout={(e) => { landingSectionY.current.reseaux = e.nativeEvent.layout.y; }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: L.text, textAlign: isWideWeb ? 'left' : 'center' }}>{t('landing_networks_title')}</Text>
              <Text style={{ fontSize: 13, lineHeight: 20, color: L.soft, marginTop: 10 }}>{t('landing_networks_desc')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {['Ethereum', 'BNB Smart Chain', 'Polygon', 'Arbitrum', 'Optimism', 'Base', 'Solana', 'Bitcoin'].map((n) => (
                  <View key={n} style={{ backgroundColor: L.chip, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: L.text }}>{n}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', marginTop: 14, gap: 10 }}>
                <Ionicons name="flash-outline" size={18} color={L.accent} />
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: L.soft }}>{t('landing_instant_note')}</Text>
              </View>
            </View>

            <View style={{ width: '100%', marginTop: 32 }} onLayout={(e) => { landingSectionY.current.securite = e.nativeEvent.layout.y; }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: L.text, textAlign: isWideWeb ? 'left' : 'center' }}>{t('landing_security_title')}</Text>
              <View style={{ gap: 14, marginTop: 14 }}>
                {[
                  [t('landing_security_1_title'), t('landing_security_1_desc')],
                  [t('landing_security_2_title'), t('landing_security_2_desc')],
                  [t('landing_security_3_title'), t('landing_security_3_desc')],
                ].map(([ti, de]) => (
                  <View key={ti} style={{ flexDirection: 'row', gap: 10 }}>
                    <Ionicons name="checkmark-circle-outline" size={20} color={L.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: L.text }}>{ti}</Text>
                      <Text style={{ fontSize: 13, lineHeight: 19, color: L.soft, marginTop: 4 }}>{de}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Anti-phishing */}
            <View style={{ width: '100%', alignSelf: 'stretch', marginTop: 28, backgroundColor: DESIGN_TOKENS.warningBg, borderRadius: 12, padding: 14 }}>
              <Text style={{ flexShrink: 1, color: DESIGN_TOKENS.warningText, fontSize: 12, lineHeight: 18 }}>
                {t('landing_antiphishing')}
              </Text>
            </View>
            {Platform.OS === 'web' && (
              <Text style={{ color: L.soft, fontSize: 11, lineHeight: 16, marginTop: 12, textAlign: 'center' }}>
                {t('landing_web_note')}
              </Text>
            )}

            {/* Footer */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 26 }}>
              {Object.entries(LEGAL_DOCS).map(([key, doc]) => (
                <TouchableOpacity key={key} onPress={() => setLegalDoc(key)} style={{ marginHorizontal: 7, marginVertical: 3 }}>
                  <Text style={{ color: L.soft, fontSize: 11 }}>{doc.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: L.soft, fontSize: 11, marginTop: 12, letterSpacing: 0.4 }}>{t('landing_footer_tagline')}</Text>
            <TouchableOpacity onPress={() => Linking.openURL('mailto:contact@nexiawallet.com')} style={{ marginTop: 12 }}>
              <Text style={{ color: L.soft, fontSize: 11, textDecorationLine: 'underline' }}>contact@nexiawallet.com</Text>
            </TouchableOpacity>
            <Text style={{ color: L.soft, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' }}>{t('landing_footer_app')}</Text>

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
              <CandlestickChart candles={candles} failed={!!detailLoadErrors[`candles:${selectedToken}_${detailTf}`]} onRetry={retryDetailLoad} />
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
                { icon: 'arrow-up',         label: 'Envoyer',  onPress: () => { setSelectedToken(null); setSendToken(selectedToken); setShowSend(true); } },
                { icon: 'arrow-down',       label: 'Recevoir', onPress: () => { setReceiveChain(receiveChainForToken(selectedToken)); setSelectedToken(null); setShowReceive(true); } },
                { icon: 'swap-horizontal',  label: 'Swap',     onPress: () => { setSelectedToken(null); setSwapFrom(selectedToken); setTab('swap'); } },
                ...(selectedToken === 'SOL' ? [{ icon: 'leaf-outline', label: 'Staker', onPress: () => { setSelectedToken(null); openStaking(); } }] : []),
              ].map(a => (
                <AnimPressable key={a.label} style={st.detail_action_btn} onPress={a.onPress}>
                  <View style={st.detail_action_icon}>
                    <Ionicons name={a.icon} size={20} color={T.gold} />
                  </View>
                  <Text style={st.detail_action_lbl}>{a.label}</Text>
                </AnimPressable>
              ))}
            </View>

            {renderCoinAbout(coinDetails[selectedToken], selectedToken, tokens[selectedToken]?.color, !!detailLoadErrors[`coin:${selectedToken}`])}

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

            {/* Caché pendant le chargement, comme avant ; mais un échec se dit. */}
            {(candles.length > 0 || !!detailLoadErrors[`mcandles:${coin.id}`]) && (
              <View style={{ paddingHorizontal: 16 }}>
                <CandlestickChart candles={candles} failed={!!detailLoadErrors[`mcandles:${coin.id}`]} onRetry={retryDetailLoad} />
              </View>
            )}

            <View style={[st.calc_card, { marginHorizontal: 16 }]}>
              <Text style={st.form_label}>Calculatrice rapide</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[st.form_input, { flex: 1, marginBottom: 0 }]}
                  value={calcAmount}
                  onChangeText={(v) => setCalcAmount(normalizeDecimalInput(v))}
                  placeholder={`Montant en ${sym}`}
                  placeholderTextColor={T.text3}
                  keyboardType="decimal-pad"
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

            {renderCoinAbout(info, coin.id, T.violet, !!detailLoadErrors[`mcoin:${coin.id}`])}

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="notifications-outline" size={13} color={T.gold} />
              <Text style={st.alert_chip_txt}>
                Prix {a.direction === 'above' ? '≥' : '≤'} {fmt(a.targetPrice, a.targetPrice < 1 ? 4 : 2)}
              </Text>
            </View>
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
                onChangeText={(v) => setAlertTargetInput(normalizeDecimalInput(v))}
                keyboardType="decimal-pad"
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
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 }}
            onPress={() => { setAlertFormFor(symbol); setAlertTargetInput(''); setAlertDirection('above'); }}
          >
            <Ionicons name="notifications-outline" size={14} color={T.gold} />
            <Text style={[st.alert_add_txt, { paddingVertical: 0 }]}>Créer une alerte de prix</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const closeSend = () => { setShowSend(false); setSendStep('form'); setSendFeeEstimate(null); setSendAmountMode('crypto'); setSendAmountFiatInput(''); };

  // `sendAmount` (en crypto) reste la seule valeur utilisée par prepareSend/
  // confirmAndSend — le mode "devise" n'est qu'un affichage alternatif de
  // saisie qui reconvertit immédiatement vers la crypto sous-jacente.
  const setSendCryptoAmount = (cryptoStrRaw) => {
    const cryptoStr = normalizeDecimalInput(cryptoStrRaw);
    setSendAmount(cryptoStr);
    if (sendAmountMode === 'fiat') {
      const price = tokens[sendToken]?.price || 0;
      const fiatVal = (parseFloat(cryptoStr) || 0) * price * fxRate;
      setSendAmountFiatInput(fiatVal ? fiatVal.toFixed(2) : '');
    }
  };
  const setSendFiatAmount = (fiatStrRaw) => {
    const fiatStr = normalizeDecimalInput(fiatStrRaw);
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
          <TouchableOpacity
            onPress={() => { setShowQrScanner(false); if (qrScannerFromWalletConnect) { setShowWalletConnect(true); setQrScannerFromWalletConnect(false); } }}
            style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour"
          >
            {/* Fond toujours noir (convention des écrans caméra) : en thème
                clair, T.text rendait la flèche et le titre invisibles. */}
            <Text style={{ color: '#FFFFFF', fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={[st.modal_title, { color: '#FFFFFF' }]}>Scanner un QR code</Text>
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
            {sendToken !== 'SOL' && sendToken !== 'BTC' && <GasIndicatorBadge gasIndicator={gasIndicator} nativeSymbol={nativeSymbol} />}
            <View style={st.network_badge}>
              <Text style={{ color: T.text2, fontSize: 12, fontWeight: 'bold' }}>
                ⛓️ Réseau {{ SOL: 'Solana', BTC: 'Bitcoin' }[sendToken] || activeNetwork.label}
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
                  <Ionicons name="clipboard-outline" size={20} color={T.text2} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={st.addr_action_btn} onPress={() => { setQrScannerFromWalletConnect(false); setShowQrScanner(true); }} accessibilityRole="button" accessibilityLabel="Scanner un QR code">
                <Ionicons name="qr-code-outline" size={20} color={T.text2} />
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
                  placeholder={`0.00 ${symC}`} placeholderTextColor={T.text3} keyboardType="decimal-pad" />
              ) : (
                <TextInput style={[st.form_input, { flex: 1 }]} value={sendAmount} onChangeText={setSendCryptoAmount}
                  placeholder="0.00" placeholderTextColor={T.text3} keyboardType="decimal-pad" />
              )}
              <TouchableOpacity
                style={st.max_btn}
                onPress={() => {
                  const bal = tokens[sendToken]?.balance || 0;
                  // Réserve de gas si on vide le token NATIF (voir
                  // getNativeGasReserve) : sinon plus rien pour payer la
                  // transaction elle-même, qui échoue.
                  const max = sendToken === nativeSymbol ? Math.max(0, bal - getNativeGasReserve(network)) : bal;
                  setSendCryptoAmount(String(max));
                }}
              >
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
              <Text style={st.send_info_line}>Solde : {((sendToken === nativeSymbol) ? parseFloat(walletBalance || '0') : (tokens[sendToken]?.balance || 0)).toFixed(6)} {sendToken}</Text>
              <Text style={st.send_info_line}>Réseau : {activeNetwork.label}</Text>
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
            <Text style={{ color: T.text2, fontSize: 11 }}>
              {isSolana ? 'Réseau Solana — une adresse différente de tes autres réseaux (Ethereum, Polygon, BNB…)'
                : isBitcoin ? 'Réseau Bitcoin — une adresse différente de tes autres réseaux (Ethereum, Polygon, BNB…)'
                : 'Valable pour Ethereum, Polygon, BNB Chain, Arbitrum, Optimism et Base'}
            </Text>
          </View>
          <View style={st.qr_wrap}><QRCodeMock address={qrValue} /></View>
          <Text style={st.receive_title}>Adresse Publique</Text>
          <View style={st.receive_addr_box}>
            <Text style={st.receive_addr} selectable>{displayAddr}</Text>
          </View>
          <AnimPressable style={[st.green_btn, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]} onPress={() => copyToClipboard(displayAddr, 'Adresse copiée')}>
            <Ionicons name="copy-outline" size={16} color="#000" />
            <Text style={st.green_btn_txt}>Copier</Text>
          </AnimPressable>

          {isEvm && (
            <View style={{ width: '100%', marginTop: 20 }}>
              <Text style={st.form_label}>Demander un montant précis (optionnel)</Text>
              <TextInput
                style={st.form_input}
                value={receiveAmount}
                onChangeText={(v) => setReceiveAmount(normalizeDecimalInput(v))}
                placeholder={`0.00 ${nativeSymbol}`}
                placeholderTextColor={T.text3}
                keyboardType="decimal-pad"
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
            <Text style={st.warning_txt}>N'envoie à cette adresse que des actifs du réseau affiché ci-dessus. Un envoi depuis un autre réseau peut être perdu.</Text>
          </View>

          <TouchableOpacity
            onPress={() => { setShowReceive(false); setAllAddressesFromReceive(true); setShowAllAddresses(true); }}
            style={{ marginTop: 16 }}
            accessibilityRole="button"
          >
            <Text style={{ color: T.gold, fontSize: 13, fontWeight: '600' }}>Voir toutes mes adresses en un coup d'œil</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  MODAL: TOUTES MES ADRESSES (vue unifiée — une seule adresse EVM
  //  couvre 6 réseaux, Solana et Bitcoin ont chacune la leur)
  // ════════════════════════════════════════════════════════
  const renderAllAddresses = () => {
    const groups = [
      { key: 'evm', label: 'EVM', sub: 'Ethereum, Polygon, BNB Chain, Arbitrum, Optimism, Base', addr: walletAddr, emoji: '⛓️' },
      { key: 'solana', label: 'Solana', sub: 'SOL uniquement', addr: solanaAddr, emoji: '🟣' },
      { key: 'bitcoin', label: 'Bitcoin', sub: 'BTC uniquement', addr: bitcoinAddr, emoji: '🟠' },
    ].filter(g => !!g.addr);
    return (
      <Modal visible={showAllAddresses} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity
              onPress={() => { setShowAllAddresses(false); if (allAddressesFromReceive) { setShowReceive(true); setAllAddressesFromReceive(false); } }}
              style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour"
            >
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Toutes mes adresses</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
              Ce wallet a une adresse par famille de réseau — la même adresse EVM sert pour Ethereum, Polygon, BNB Chain,
              Arbitrum, Optimism et Base ; Solana et Bitcoin ont chacune leur propre adresse.
            </Text>
            {groups.map(g => (
              <View key={g.key} style={[st.stats_card, { marginBottom: 12 }]}>
                <Text style={st.stats_card_lbl}>{g.emoji} {g.label}</Text>
                <Text style={{ color: T.text3, fontSize: 11, marginTop: 2, marginBottom: 10 }}>{g.sub}</Text>
                <Text style={{ color: T.text, fontSize: 13 }} selectable numberOfLines={1} ellipsizeMode="middle">{g.addr}</Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(g.addr, 'Adresse copiée')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Copier l'adresse ${g.label}`}
                >
                  <Ionicons name="copy-outline" size={16} color={T.gold} />
                  <Text style={{ color: T.gold, fontSize: 12, fontWeight: '600' }}>Copier</Text>
                </TouchableOpacity>
              </View>
            ))}
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
              {/* Plus d'URL d'explorateur à l'écran : c'est du jargon, et la
                  source varie selon le réseau (Etherscan, Blockscout, NodeReal). */}
              <Text style={{ color: T.text2, fontSize: 12, marginTop: 10 }}>Chargement de ton activité sur {activeNetwork.label}…</Text>
            </View>
          )}

          {!historyLoading && historyError && (
            <ErrorState
              title="Impossible de charger ton activité"
              message="Tes fonds ne sont pas concernés : seul l'affichage de l'historique n'a pas pu se charger."
              onRetry={fetchHistory}
            />
          )}

          {!historyLoading && !historyError && !!filteredHistoryItems.length && (
            <TouchableOpacity
              onPress={() => exportHistoryCsv(filteredHistoryItems)}
              style={{ alignSelf: 'flex-end', marginBottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Exporter l'historique en CSV"
            >
              <Text style={{ color: T.cyan, fontSize: 12, fontWeight: '600' }}>⇩ Exporter en CSV</Text>
            </TouchableOpacity>
          )}

          {!historyLoading && !historyError && filteredHistoryItems.length === 0 && (
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
            const counterparty = isOut ? item.to : item.from;
            const counterpartyLabel = (counterparty && ensNamesCache[counterparty.toLowerCase()])
              || `${counterparty?.slice(0, 6)}…${counterparty?.slice(-4)}`;
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
                      {' • '}{counterpartyLabel}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 }}>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation?.(); cycleTxTag(item.hash); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Changer la catégorie de cette transaction"
                      >
                        <Text style={st.tx_tag_chip}>🏷️ {txTags[item.hash] || 'Étiqueter'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation?.(); shareTransactionReceipt(item, counterpartyLabel); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Partager le reçu de cette transaction"
                      >
                        <Ionicons name="share-outline" size={15} color={T.text3} />
                      </TouchableOpacity>
                    </View>
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

    // Répartition du portefeuille — NOUVEAU : contrairement aux stats
    // ci-dessous (comptage de transactions, vide tant qu'aucune n'a eu
    // lieu), ceci se base sur les soldes actuels et est donc utile dès la
    // première crypto détenue, même sans historique de transaction.
    const holdingsForAllocation = Object.entries(tokens)
      .map(([sym, tk]) => ({ sym, name: tk.name, color: tk.color || T.gold, value: (tk.balance || 0) * (tk.price || 0) }))
      .filter(h => h.value >= 0.01)
      .sort((a, b) => b.value - a.value);
    const allocationTotal = holdingsForAllocation.reduce((s, h) => s + h.value, 0);

    return (
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        contentContainerStyle={isWideWeb ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : undefined}
        onScroll={handleTabScroll}
        scrollEventThrottle={16}
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

        {!!holdingsForAllocation.length && (
          <View style={[st.stats_card, { marginTop: 12 }]}>
            <Text style={st.stats_card_lbl}>Répartition du portefeuille</Text>
            <View style={{ flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', marginTop: 12, marginBottom: 14, backgroundColor: T.card2 }}>
              {holdingsForAllocation.map(h => (
                <View key={h.sym} style={{ flex: h.value, backgroundColor: h.color }} />
              ))}
            </View>
            {holdingsForAllocation.map(h => (
              <View key={h.sym} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: h.color, marginRight: 10 }} />
                <Text style={{ color: T.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>{h.name}</Text>
                <Text style={{ color: T.text2, fontSize: 12, marginRight: 10 }}>{fmt(h.value)}</Text>
                <Text style={{ color: T.text3, fontSize: 12, width: 42, textAlign: 'right' }}>
                  {allocationTotal > 0 ? ((h.value / allocationTotal) * 100).toFixed(1) : '0.0'}%
                </Text>
              </View>
            ))}
            <TouchableOpacity
              onPress={() => exportPortfolioCsv(holdingsForAllocation)}
              style={{ alignSelf: 'flex-end', marginTop: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Exporter le relevé du portefeuille en CSV"
            >
              <Text style={{ color: T.cyan, fontSize: 12, fontWeight: '600' }}>⇩ Exporter en CSV</Text>
            </TouchableOpacity>
          </View>
        )}

        {allocationTotal > 0 && (() => {
          const portfolioPct = (periodChange / allocationTotal) * 100;
          const btcPct = typeof tokens.BTC?.[periodChangeField] === 'number' ? tokens.BTC[periodChangeField] : null;
          const ethPct = typeof tokens.ETH?.[periodChangeField] === 'number' ? tokens.ETH[periodChangeField] : null;
          if (btcPct == null && ethPct == null) return null;
          const periodLabel = { '24h': '24h', '7d': '7 jours', '30d': '30 jours' }[balancePeriod] || '24h';
          const rows = [
            { label: 'Ton portefeuille', value: portfolioPct, highlight: true },
            ...(btcPct != null ? [{ label: 'Bitcoin', value: btcPct }] : []),
            ...(ethPct != null ? [{ label: 'Ethereum', value: ethPct }] : []),
          ];
          return (
            <View style={[st.stats_card, { marginTop: 12 }]}>
              <Text style={st.stats_card_lbl}>Comparaison de performance ({periodLabel})</Text>
              {rows.map(r => {
                const pos = r.value >= 0;
                return (
                  <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                    <Text style={{ color: r.highlight ? T.text : T.text2, fontSize: 13, fontWeight: r.highlight ? '700' : '500', flex: 1 }}>{r.label}</Text>
                    <Text style={{ color: pos ? T.up : T.down, fontSize: 13, fontWeight: '700' }}>
                      {pos ? '+' : ''}{r.value.toFixed(2)}%
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {historyLoading && !items.length ? (
          <View style={{ alignItems: 'center', marginTop: 30 }}><ActivityIndicator color={T.gold} /></View>
        ) : historyError && !items.length ? (
          <ErrorState
            title="Impossible de calculer tes stats"
            message="Elles se basent sur ton historique, qui n'a pas pu se charger. Tes fonds ne sont pas concernés."
            onRetry={fetchHistory}
          />
        ) : !items.length ? (
          <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: T.goldBg, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="stats-chart" size={28} color={T.gold} />
            </View>
            <Text style={{ color: T.text, fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>Pas encore de stats</Text>
            <Text style={{ color: T.text3, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' }}>
              Tes stats (transactions envoyées, reçues, frais payés) apparaîtront ici après ta première opération.
            </Text>
          </View>
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
            <Text style={st.onboarding_title}>{t(slide.titleKey)}</Text>
            <Text style={st.onboarding_desc}>{t(slide.descKey)}</Text>
            <View style={st.onboarding_dots}>
              {ONBOARDING_SLIDES.map((_, i) => (
                <View key={i} style={[st.onboarding_dot, i === onboardingStep && st.onboarding_dot_on]} />
              ))}
            </View>
            <AnimPressable
              style={[st.green_btn, { marginTop: 20, width: '100%' }]}
              onPress={() => (isLast ? setShowOnboarding(false) : setOnboardingStep(s => s + 1))}
            >
              <Text style={st.green_btn_txt}>{isLast ? t('onboarding_start') : t('common_next')}</Text>
            </AnimPressable>
            {!isLast && (
              <TouchableOpacity onPress={() => setShowOnboarding(false)} style={{ marginTop: 14 }}>
                <Text style={{ color: T.text3, fontSize: 13 }}>{t('onboarding_skip')}</Text>
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
            onPress={() => { setShowWalletConnect(false); setQrScannerFromWalletConnect(true); setShowQrScanner(true); }}
          >
            <Ionicons name="qr-code-outline" size={22} color={T.text} />
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
    const isTypedData = method === 'eth_signTypedData' || method === 'eth_signTypedData_v4';
    const typedDataSim = isTypedData ? analyzeTypedData(reqParams[1]) : null;
    const activeSimResult = method === 'eth_sendTransaction' ? wcSimResult : typedDataSim;
    if (method === 'personal_sign' || method === 'eth_sign') {
      const hex = method === 'personal_sign' ? reqParams[0] : reqParams[1];
      let text = hex;
      try { text = ethers.utils.toUtf8String(hex); } catch { /* reste en hex si pas de l'UTF-8 valide */ }
      detail = <Text style={{ color: T.text, fontSize: 14 }}>{text}</Text>;
    } else if (isTypedData) {
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
            {!!activeSimResult?.warnings?.length && (
              <View style={[st.warning_box, { marginTop: 10, borderColor: activeSimResult.risk === 'high' ? T.red : T.gold }]}>
                {activeSimResult.warnings.map((w, i) => (
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
              <TouchableOpacity onPress={() => { setShowDappBrowser(false); if (dappBrowserFromSettings) { setShowSettings(true); setDappBrowserFromSettings(false); } }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
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
                  if (dappCurrentUrl) { setDappCurrentUrl(null); setDappDisplayUrl(null); return; }
                  setShowDappBrowser(false);
                  if (dappBrowserFromSettings) { setShowSettings(true); setDappBrowserFromSettings(false); }
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
                  <Text style={{ color: T.text3, fontSize: 11 }} numberOfLines={1}>{dappDisplayUrl}</Text>
                </View>
                <WebView
                  ref={dappWebViewRef}
                  source={{ uri: dappCurrentUrl }}
                  style={{ flex: 1 }}
                  onMessage={handleDappMessage}
                  onNavigationStateChange={(nav) => { if (nav?.url) { setDappUrlInput(nav.url); setDappDisplayUrl(nav.url); } }}
                  injectedJavaScriptBeforeContentLoaded={buildInjectedProvider({
                    chainId: '0x' + localWallet.getNetworkConfig(network).chainId.toString(16),
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
    const isDappTypedData = method === 'eth_signTypedData' || method === 'eth_signTypedData_v4';
    const dappTypedDataSim = isDappTypedData ? analyzeTypedData(params[1]) : null;
    const activeDappSimResult = method === 'eth_sendTransaction' ? dappSimResult : dappTypedDataSim;
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
    } else if (isDappTypedData) {
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
            {!!activeDappSimResult?.warnings?.length && (
              <View style={[st.warning_box, { marginTop: 10, borderColor: activeDappSimResult.risk === 'high' ? T.red : T.gold }]}>
                {activeDappSimResult.warnings.map((w, i) => (
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

  // ════════════════════════════════════════════════════════
  //  MODAL: FOIRE AUX QUESTIONS
  // ════════════════════════════════════════════════════════
  // Contenu (LANDING_FAQ) déjà écrit pour l'ancienne landing "vitrine",
  // jamais réutilisé depuis sa suppression lors de la refonte épurée de
  // l'accueil (2026-09-10) — remis en service ici, dans un vrai écran
  // accessible depuis Réglages, plutôt que de le laisser mort dans le
  // fichier. Utile pour l'acquisition d'utilisateurs en cours (Discord/
  // Telegram) : un nouveau venu qui a une question peut se répondre seul
  // sans passer par un message à Pablo.
  const renderFaq = () => (
    <Modal visible={showFaq} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => { setShowFaq(false); setShowSettings(true); }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>Foire aux questions</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          {LANDING_FAQ.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <TouchableOpacity key={i} style={st.faq_item} onPress={() => setOpenFaq(isOpen ? null : i)} activeOpacity={0.8}>
                <View style={st.faq_q_row}>
                  <Text style={st.faq_q_txt}>{item.q}</Text>
                  <Text style={[st.faq_chevron, { color: T.gold }]}>{isOpen ? '−' : '+'}</Text>
                </View>
                {isOpen && <Text style={st.faq_a_txt}>{item.a}</Text>}
              </TouchableOpacity>
            );
          })}
          <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            D'autres questions ? Écris à contact@nexiawallet.com
          </Text>
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
            <TouchableOpacity onPress={() => { setShowBridge(false); if (bridgeFromSettings) { setShowSettings(true); setBridgeFromSettings(false); } }} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Pont cross-chain</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ color: T.text2, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>
              Transfère de l'ETH natif entre Ethereum, Arbitrum, Optimism et Base, via l'agrégateur LI.FI. Signature et
              diffusion se font exactement comme un envoi normal — LI.FI ne voit jamais ta clé privée.
              {'\n'}Frais NexiaWallet de 0,25 % inclus dans la route (voir le détail des frais ci-dessous une fois la route obtenue).
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
            <TextInput style={st.form_input} value={bridgeAmount} onChangeText={(v) => { setBridgeAmount(normalizeDecimalInput(v)); setBridgeQuote(null); }}
              placeholder="0.01" placeholderTextColor={T.text3} keyboardType="decimal-pad" />

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
            onPress={() => referralCode && copyToClipboard(`https://nexiawallet.com?ref=${referralCode}`, 'Lien copié')}
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
            Coinbase ne peut pas prélever ta carte automatiquement en arrière-plan (sécurité/conformité). NexiaWallet te
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

              <Text style={st.form_label}>Montant (EUR)</Text>
              <TextInput style={st.form_input} value={recurringAmount} onChangeText={(v) => setRecurringAmount(normalizeDecimalInput(v))}
                placeholder="20" placeholderTextColor={T.text3} keyboardType="decimal-pad" />

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
              <View style={{ alignItems: 'center', marginTop: 40 }}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: T.goldBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="key-outline" size={28} color={T.gold} />
                </View>
                <Text style={[st.settings_row_sub, { marginTop: 16, textAlign: 'center' }]}>Aucune autorisation active suivie sur cet appareil.</Text>
              </View>
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

  // ════════════════════════════════════════════════════════
  //  MODAL: RECHERCHE GLOBALE (tokens du wallet, marché, actions/écrans)
  // ════════════════════════════════════════════════════════
  const renderGlobalSearch = () => {
    const q = globalSearchQuery.trim().toLowerCase();
    const closeAndRun = (fn) => { setShowGlobalSearch(false); fn(); };

    const tokenResults = q ? Object.entries(tokens)
      .filter(([sym, tk]) => sym.toLowerCase().includes(q) || (tk.name || '').toLowerCase().includes(q))
      .slice(0, 6) : [];

    const walletSymbols = new Set(Object.keys(tokens));
    const marketResults = q ? marketCoins
      .filter(c => !walletSymbols.has((c.symbol || '').toUpperCase()))
      .filter(c => (c.symbol || '').toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q))
      .slice(0, 5) : [];

    const ACTIONS = [
      { key: 'send', label: 'Envoyer', icon: 'arrow-up', onPress: () => setShowSend(true) },
      { key: 'receive', label: 'Recevoir', icon: 'arrow-down', onPress: () => { setReceiveChain('evm'); setShowReceive(true); } },
      { key: 'buy', label: 'Acheter', icon: 'card', onPress: () => setShowBuy(true) },
      ...(SELL_ENABLED ? [{ key: 'sell', label: 'Vendre', icon: 'cash', onPress: () => setShowSell(true) }] : []),
      { key: 'swap', label: 'Swap', icon: 'swap-horizontal', onPress: () => setTab('swap') },
      { key: 'history', label: 'Activité', icon: 'time', onPress: () => setShowHistory(true) },
      { key: 'market', label: 'Marché', icon: 'trending-up', onPress: () => setTab('markets') },
      { key: 'stats', label: 'Stats', icon: 'stats-chart', onPress: () => setTab('stats') },
      { key: 'discover', label: 'Découvrir', icon: 'compass', onPress: () => setTab('discover') },
      { key: 'addresses', label: 'Toutes mes adresses', icon: 'wallet', onPress: () => { setAllAddressesFromReceive(false); setShowAllAddresses(true); } },
      { key: 'settings', label: 'Réglages', icon: 'settings', onPress: () => setShowSettings(true) },
      { key: 'faq', label: 'Foire aux questions', icon: 'help-circle', onPress: () => setShowFaq(true) },
    ];
    const actionResults = q ? ACTIONS.filter(a => a.label.toLowerCase().includes(q)) : [];

    const hasResults = !!(tokenResults.length || marketResults.length || actionResults.length);

    return (
      <Modal visible={showGlobalSearch} animationType="slide" transparent>
        <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
          <View style={st.modal_hdr}>
            <TouchableOpacity onPress={() => setShowGlobalSearch(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
              <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
            </TouchableOpacity>
            <Text style={st.modal_title}>Recherche</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={{ padding: 16 }}>
            <TextInput
              style={st.form_input}
              value={globalSearchQuery}
              onChangeText={setGlobalSearchQuery}
              placeholder="Un token, une action, un écran..."
              placeholderTextColor={T.text3}
              autoFocus
              autoCapitalize="none"
            />
          </View>
          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {!q && (
              <Text style={{ color: T.text3, fontSize: 13, textAlign: 'center', marginTop: 30 }}>
                Cherche un token, "Envoyer", "Réglages", "FAQ"...
              </Text>
            )}
            {q && !hasResults && (
              <Text style={{ color: T.text3, fontSize: 13, textAlign: 'center', marginTop: 30 }}>Aucun résultat pour "{globalSearchQuery}".</Text>
            )}
            {!!tokenResults.length && (
              <>
                <Text style={[st.settings_section, { marginTop: 8 }]}>Mes tokens</Text>
                {tokenResults.map(([sym, tk]) => (
                  <AnimPressable key={sym} style={st.settings_row} onPress={() => closeAndRun(() => setSelectedToken(sym))}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tk.color || T.gold, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontWeight: '700', fontSize: 12, color: '#000' }}>{sym.slice(0, 2)}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.settings_row_title}>{tk.name || sym}</Text>
                      <Text style={st.settings_row_sub}>{sym} • {fmt((tk.balance || 0) * (tk.price || 0))}</Text>
                    </View>
                  </AnimPressable>
                ))}
              </>
            )}
            {!!marketResults.length && (
              <>
                <Text style={[st.settings_section, { marginTop: 16 }]}>Marché</Text>
                {marketResults.map(c => (
                  <AnimPressable
                    key={c.id}
                    style={st.settings_row}
                    onPress={() => closeAndRun(() => { setTab('markets'); setMarketSearch(c.symbol?.toUpperCase() || ''); })}
                  >
                    <Ionicons name="trending-up-outline" size={20} color={T.text2} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.settings_row_title}>{c.name}</Text>
                      <Text style={st.settings_row_sub}>{(c.symbol || '').toUpperCase()}</Text>
                    </View>
                  </AnimPressable>
                ))}
              </>
            )}
            {!!actionResults.length && (
              <>
                <Text style={[st.settings_section, { marginTop: 16 }]}>Actions & écrans</Text>
                {actionResults.map(a => (
                  <AnimPressable key={a.key} style={st.settings_row} onPress={() => closeAndRun(a.onPress)}>
                    <Ionicons name={a.icon} size={20} color={T.text2} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={st.settings_row_title}>{a.label}</Text>
                    </View>
                  </AnimPressable>
                ))}
              </>
            )}
            <View style={{ height: 40 }} />
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
          {validatorsLoading && !validators.length && (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <ActivityIndicator color={T.gold} />
              <Text style={{ color: T.text3, fontSize: 12, marginTop: 8 }}>Chargement des validateurs…</Text>
            </View>
          )}
          {!validatorsLoading && validatorsError && !validators.length && (
            <ErrorState
              compact
              title="Liste des validateurs indisponible"
              message="Le réseau Solana n'a pas répondu. Tes SOL ne sont pas concernés."
              onRetry={openStaking}
            />
          )}
          {!validatorsLoading && !validatorsError && !validators.length && (
            <Text style={{ color: T.text3, fontSize: 13, paddingVertical: 16, textAlign: 'center' }}>
              Aucun validateur ne correspond aux critères pour le moment.
            </Text>
          )}
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
          {/* Inactif tant qu'aucun validateur n'est proposé : sinon le bouton
              invitait à cliquer pour répondre « Choisis un validateur » alors
              qu'il n'y en avait aucun à choisir. */}
          <AnimPressable style={[st.green_btn, { opacity: (stakeLoading || !selectedValidator) ? 0.6 : 1 }]} disabled={stakeLoading || !selectedValidator} onPress={handleCreateStake}>
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
                <ErrorState
                  title="Impossible de charger tes NFT"
                  message="Tes NFT ne sont pas concernés : seul leur affichage n'a pas pu se charger."
                  onRetry={() => openNftGallery(nftNetwork)}
                />
              ) : nfts.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: T.goldBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="image-outline" size={28} color={T.gold} />
                  </View>
                  <Text style={{ color: T.text3, fontSize: 13, textAlign: 'center', marginTop: 16 }}>Aucun NFT trouvé sur cette adresse ({NETWORK_INFO[nftNetwork]?.label || nftNetwork}).</Text>
                </View>
              ) : (
            <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {nfts.slice(0, nftVisibleCount).map((n) => (
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
              {nfts.length > nftVisibleCount && (
                <AnimPressable style={st.load_more_btn} onPress={() => setNftVisibleCount(c => c + NFT_PAGE_SIZE)}>
                  <Text style={st.load_more_txt}>Charger plus ({nfts.length - nftVisibleCount} restants)</Text>
                </AnimPressable>
              )}
            </>
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
          <Text style={st.settings_section}>🧭 Mode d'affichage</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 }}>
            {[['beginner', '🌱', 'Débutant'], ['advanced', '⚡', 'Avancé']].map(([mode, icon, label]) => (
              <TouchableOpacity
                key={mode}
                style={[st.chip_pill, { flex: 1, justifyContent: 'center' }, experienceMode === mode && st.chip_pill_on]}
                onPress={() => { setExperienceMode(mode); saveExperienceMode(mode); }}
              >
                <Text style={{ fontSize: 15 }}>{icon}</Text>
                <Text style={[st.chip_pill_txt, experienceMode === mode && st.chip_pill_txt_on]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: T.text3, fontSize: 11, marginBottom: 4 }}>
            Le mode Débutant masque WalletConnect, le navigateur Web3, les autorisations, le pont cross-chain et les positions DeFi. Rien n'est supprimé, tu peux repasser en Avancé à tout moment.
          </Text>

          <Text style={[st.settings_section, { marginTop: 24 }]}>💱 {t('settings_currency')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {Object.entries(CURRENCIES).map(([code, cur]) => (
              <TouchableOpacity
                key={code}
                style={[st.chip_pill, currency === code && st.chip_pill_on]}
                onPress={() => { setCurrency(code); saveCurrency(code); }}
              >
                <Text style={{ fontSize: 15 }}>{cur.flag}</Text>
                <Text style={[st.chip_pill_txt, currency === code && st.chip_pill_txt_on]}>{code}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[st.settings_section, { marginTop: 24 }]}>🌐 {t('settings_network')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {Object.entries(NETWORK_INFO).map(([id, n]) => (
              <TouchableOpacity
                key={id}
                style={[st.chip_pill, network === id && st.chip_pill_on]}
                onPress={() => setNetwork(id)}
              >
                <Text style={{ fontSize: 15 }}>{n.emoji}</Text>
                <Text style={[st.chip_pill_txt, network === id && st.chip_pill_txt_on]}>{n.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[st.settings_row_sub, { marginTop: 8 }]}>{activeNetwork.desc}</Text>

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
                      style={{ marginRight: 16 }}
                    >
                      <Text style={{ fontSize: 16 }}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteAccount(acc.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: T.red, fontSize: 16 }}>✕</Text>
                    </TouchableOpacity>
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
                      style={[st.import_type_btn, addAccountType === 'mnemonic' && st.import_type_btn_on, { flex: 1, marginRight: 6 }]}
                      onPress={() => setAddAccountType('mnemonic')}
                    >
                      <Text style={[st.import_type_txt, addAccountType === 'mnemonic' && { color: T.text }]}>Phrase (12 mots)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.import_type_btn, addAccountType === 'privateKey' && st.import_type_btn_on, { flex: 1, marginRight: 6 }]}
                      onPress={() => setAddAccountType('privateKey')}
                    >
                      <Text style={[st.import_type_txt, addAccountType === 'privateKey' && { color: T.text }]}>Clé privée</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.import_type_btn, addAccountType === 'keystore' && st.import_type_btn_on, { flex: 1 }]}
                      onPress={() => setAddAccountType('keystore')}
                    >
                      <Text style={[st.import_type_txt, addAccountType === 'keystore' && { color: T.text }]}>Keystore</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[st.form_input, { marginBottom: 10 }]}
                    value={addAccountValue}
                    onChangeText={setAddAccountValue}
                    placeholder={addAccountType === 'mnemonic' ? 'mot1 mot2 mot3 ...' : addAccountType === 'keystore' ? 'Colle le JSON du keystore chiffré...' : '0x...'}
                    placeholderTextColor={T.text3}
                    autoCapitalize="none"
                    multiline={addAccountType === 'mnemonic' || addAccountType === 'keystore'}
                  />
                  {addAccountType === 'keystore' && (
                    <TextInput
                      style={[st.form_input, { marginBottom: 10 }]}
                      value={addAccountKeystorePassword}
                      onChangeText={setAddAccountKeystorePassword}
                      placeholder="Mot de passe du keystore"
                      placeholderTextColor={T.text3}
                      secureTextEntry
                      autoCapitalize="none"
                    />
                  )}
                  {!!addAccountError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{addAccountError}</Text>}
                  <AnimPressable style={st.green_btn} onPress={addAccountImport}>
                    <Text style={st.green_btn_txt}>Importer</Text>
                  </AnimPressable>
                  <TouchableOpacity onPress={() => { setShowAddAccount(false); setAddAccountValue(''); setAddAccountKeystorePassword(''); setAddAccountError(null); }} style={{ marginTop: 10 }}>
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
                  {/* Les 6 réseaux EVM (avant : seuls ethereum/bsc/polygon
                      étaient proposés ici, oubliés lors de l'ajout des L2
                      Arbitrum/Optimism/Base ailleurs dans l'app — lecture
                      seule via getNativeBalance/getErc20Balance, déjà
                      génériques sur tous les réseaux de NETWORK_INFO). */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {Object.keys(NETWORK_INFO).map((net) => (
                      <TouchableOpacity
                        key={net}
                        style={[st.chip_pill, watchNetworkInput === net && st.chip_pill_on]}
                        onPress={() => setWatchNetworkInput(net)}
                      >
                        <Text style={[st.chip_pill_txt, watchNetworkInput === net && st.chip_pill_txt_on]}>{NETWORK_INFO[net].label.split(' ')[0]}</Text>
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

              {experienceMode === 'advanced' && (<>
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

              {/* Regroupe les fonctionnalités qui n'ont rien à voir avec
                  WalletConnect (bridge, DeFi, achat récurrent...) — avant,
                  elles étaient rangées sous "WalletConnect" par erreur. */}
              <Text style={[st.settings_section, { marginTop: 24 }]}>⚡ Fonctionnalités avancées</Text>
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setDappCurrentUrl(null); setDappDisplayUrl(null); setDappUrlInput(''); setDappBrowserFromSettings(true); setShowDappBrowser(true); }}>
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
              <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setBridgeQuote(null); setBridgeError(null); setBridgeFromSettings(true); setShowBridge(true); }}>
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
              </>)}

              <Text style={[st.settings_section, { marginTop: 24 }]}>🔐 {t('settings_security')}</Text>
              {!isDuressMode && (() => {
                const checks = [
                  { key: 'pin', label: 'Code PIN configuré', done: true },
                  { key: 'seed', label: 'Phrase de récupération notée', done: seedBackedUp },
                  ...(Platform.OS !== 'web' ? [{ key: 'bio', label: 'Déverrouillage biométrique activé', done: biometricEnabled }] : []),
                  { key: 'export', label: 'Sauvegarde chiffrée exportée', done: keystoreExported },
                  { key: 'accounts', label: 'Compte de secours créé', done: accounts.length > 1 },
                  { key: 'watch', label: 'Une adresse surveillée ajoutée', done: watchAddresses.length > 0 },
                ];
                const doneCount = checks.filter(c => c.done).length;
                const pct = Math.round((doneCount / checks.length) * 100);
                return (
                  <View style={[st.stats_card, { marginBottom: 14 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={st.stats_card_lbl}>Niveau de sécurité</Text>
                      <Text style={{ color: pct === 100 ? T.up : T.gold, fontSize: 13, fontWeight: '700' }}>{doneCount}/{checks.length}</Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: T.card2, overflow: 'hidden', marginTop: 10, marginBottom: 14 }}>
                      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: pct === 100 ? T.up : T.gold }} />
                    </View>
                    {checks.map(c => (
                      <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Ionicons
                          name={c.done ? 'checkmark-circle' : 'ellipse-outline'}
                          size={18}
                          color={c.done ? T.up : T.text3}
                        />
                        <Text style={{ color: c.done ? T.text : T.text2, fontSize: 13, marginLeft: 10, textDecorationLine: c.done ? 'line-through' : 'none' }}>
                          {c.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
              {!!unlockedMnemonic && !isDuressMode && (
                <AnimPressable
                  style={st.settings_row}
                  onPress={() => { setShowSettings(false); setMnemonicReauthPin(''); setMnemonicReauthError(null); setShowMnemonicReauth(true); }}
                >
                  <Text style={{ fontSize: 22 }}>🔑</Text>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={st.settings_row_title}>{t('settings_show_mnemonic')}</Text>
                    <Text style={st.settings_row_sub}>À ne montrer à personne d'autre que toi</Text>
                  </View>
                </AnimPressable>
              )}
              {isUnlocked && !isDuressMode && (
                <>
                  <AnimPressable
                    style={st.settings_row}
                    onPress={() => { setExportPassphraseInput(''); setExportPassphraseConfirm(''); setExportPassphraseError(null); setShowExportKeystore(true); }}
                  >
                    <Text style={{ fontSize: 22 }}>🗄️</Text>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={st.settings_row_title}>Exporter le keystore chiffré</Text>
                      <Text style={st.settings_row_sub}>Format standard (ethers/geth), protégé par une phrase de passe dédiée</Text>
                    </View>
                  </AnimPressable>
                  {showExportKeystore && (
                    <View style={st.alert_form}>
                      <Text style={{ color: T.text, fontSize: 13, marginBottom: 10 }}>
                        Choisis une phrase de passe pour ce fichier — pas ton code PIN. Un PIN à 6 chiffres se
                        devine en quelques heures une fois le fichier sorti de l'appareil ; une vraie phrase de
                        passe, non.
                      </Text>
                      <TextInput
                        style={[st.form_input, { marginBottom: 10 }]}
                        value={exportPassphraseInput}
                        onChangeText={setExportPassphraseInput}
                        placeholder="Phrase de passe (8+ caractères)"
                        placeholderTextColor={T.text3}
                        secureTextEntry
                        autoCapitalize="none"
                      />
                      <TextInput
                        style={[st.form_input, { marginBottom: 10 }]}
                        value={exportPassphraseConfirm}
                        onChangeText={setExportPassphraseConfirm}
                        placeholder="Confirme la phrase de passe"
                        placeholderTextColor={T.text3}
                        secureTextEntry
                        autoCapitalize="none"
                      />
                      {!!exportPassphraseError && <Text style={[st.auth_error, { marginBottom: 10 }]}>{exportPassphraseError}</Text>}
                      <AnimPressable style={[st.green_btn, { opacity: exportPassphraseLoading ? 0.7 : 1 }]} onPress={confirmExportKeystore} disabled={exportPassphraseLoading}>
                        {exportPassphraseLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Chiffrer et copier</Text>}
                      </AnimPressable>
                      <TouchableOpacity onPress={() => { setShowExportKeystore(false); setExportPassphraseInput(''); setExportPassphraseConfirm(''); }} style={{ marginTop: 10 }}>
                        <Text style={{ color: T.text3, fontSize: 12, textAlign: 'center' }}>Annuler</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
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
                <Ionicons name={a.icon} size={20} color={T.text2} />
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

          <View style={[st.alert_form, { marginTop: 10 }]}>
            <Text style={[st.form_label, { marginBottom: 4 }]}>Email (optionnel)</Text>
            <Text style={{ color: T.text3, fontSize: 11, marginBottom: 10, lineHeight: 16 }}>
              Pour être prévenu des nouveautés et faciliter le contact — jamais utilisé pour autre chose, jamais
              partagé. Aucune clé n'y est liée, ton wallet reste 100% non-custodial.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[st.form_input, { flex: 1 }]}
                value={profileEmailInput}
                onChangeText={setProfileEmailInput}
                placeholder="toi@exemple.com"
                placeholderTextColor={T.text3}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <AnimPressable
                style={[st.green_btn, { paddingHorizontal: 18, opacity: profileEmailSaving ? 0.7 : 1 }]}
                onPress={submitProfileEmail}
                disabled={profileEmailSaving || !profileEmailInput.trim()}
              >
                {profileEmailSaving ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>{profileEmailSaved ? 'Modifier' : 'Enregistrer'}</Text>}
              </AnimPressable>
            </View>
            {!!profileEmailSaved && (
              <Text style={{ color: T.up, fontSize: 11, marginTop: 8 }}>✓ Enregistré : {profileEmailSaved}</Text>
            )}
          </View>

          <Text style={[st.settings_section, { marginTop: 24 }]}>🌍 {t('settings_language')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {SUPPORTED_LOCALES.map(code => (
              <TouchableOpacity key={code} style={[st.chip_pill, locale === code && st.chip_pill_on]} onPress={() => changeLocale(code)}>
                <Text style={{ fontSize: 15 }}>{LOCALE_DISPLAY[code]?.flag || '🌐'}</Text>
                <Text style={[st.chip_pill_txt, locale === code && st.chip_pill_txt_on]}>{LOCALE_DISPLAY[code]?.name || code}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[st.settings_section, { marginTop: 24 }]}>🎨 {t('settings_theme')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {[['dark', '🌙', t('settings_theme_dark')], ['light', '☀️', t('settings_theme_light')]].map(([mode, icon, label]) => (
              <TouchableOpacity key={mode} style={[st.chip_pill, { flex: 1, justifyContent: 'center' }, themeMode === mode && st.chip_pill_on]} onPress={() => changeTheme(mode)}>
                <Text style={{ fontSize: 15 }}>{icon}</Text>
                <Text style={[st.chip_pill_txt, themeMode === mode && st.chip_pill_txt_on]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

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
              <Text style={st.settings_row_sub}>Non-custodial • CoinGecko Live • EVM + Solana + Bitcoin</Text>
            </View>
          </View>
          <AnimPressable style={st.settings_row} onPress={() => { setShowSettings(false); setShowFaq(true); }}>
            <Text style={{ fontSize: 22 }}>❓</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Foire aux questions</Text>
              <Text style={st.settings_row_sub}>Phrase de récupération, sécurité, frais...</Text>
            </View>
          </AnimPressable>
          <AnimPressable
            style={st.settings_row}
            onPress={() => {
              const subject = encodeURIComponent('Signalement NexiaWallet');
              const body = encodeURIComponent(
                `Décris ici le problème rencontré :\n\n\n\n— Infos techniques (laisse cette partie) —\nRéseau : ${activeNetwork?.label || '—'}\nAdresse : ${walletAddr || '—'}\nPlateforme : ${Platform.OS}`
              );
              Linking.openURL(`mailto:contact@nexiawallet.com?subject=${subject}&body=${body}`).catch(() => {
                showAlert('Impossible d\'ouvrir ton client mail', 'Écris-nous directement à contact@nexiawallet.com.');
              });
            }}
          >
            <Text style={{ fontSize: 22 }}>🚩</Text>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.settings_row_title}>Signaler un problème</Text>
              <Text style={st.settings_row_sub}>Ouvre un email pré-rempli vers le support</Text>
            </View>
          </AnimPressable>
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
      onScroll={handleTabScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMarket(); }} tintColor={T.gold} />
      }
    >
      {(isOffline || portfolioIsCached) && (
        <View style={[st.warning_box, { marginHorizontal: 16, marginTop: 16 }]}>
          <Text style={st.warning_txt}>
            {isOffline ? t('home_offline_stale') : t('home_offline_cached')}
          </Text>
        </View>
      )}
      <View style={st.home_hdr}>
        <View>
          <Text style={st.home_account}>{t('home_wallet_label')}</Text>
          <TouchableOpacity
            onPress={() => walletAddr && copyToClipboard(walletAddr, t('toast_address_copied'))}
            disabled={!walletAddr}
            accessibilityRole="button"
            accessibilityLabel={t('a11y_copy_wallet_address')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={st.home_addr}>{walletAddr ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}` : t('home_address_pending')}</Text>
            {!!walletAddr && <Ionicons name="copy-outline" size={13} color={T.text2} />}
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => { setGlobalSearchQuery(''); setShowGlobalSearch(true); }} style={st.icon_btn} accessibilityRole="button" accessibilityLabel="Recherche">
            <Ionicons name="search-outline" size={20} color={T.text2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={st.icon_btn} accessibilityRole="button" accessibilityLabel={t('settings_title')}>
            <Ionicons name="settings-outline" size={20} color={T.text2} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8, paddingBottom: 12 }}>
        {Object.entries(NETWORK_INFO).map(([id, n]) => (
          <TouchableOpacity
            key={id}
            style={[st.chip_pill, network === id && st.chip_pill_on]}
            onPress={() => setNetwork(id)}
            accessibilityRole="button"
            accessibilityLabel={n.label}
          >
            <Text style={[st.chip_pill_txt, network === id && st.chip_pill_txt_on]}>{n.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ position: 'relative', marginHorizontal: 14 }}>
        <BalanceGlow />
        <LinearGradient
          colors={['rgba(16,185,129,0.50)', 'rgba(16,185,129,0.18)', 'rgba(16,185,129,0.05)']}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <Text style={st.balance_kicker}>{t('home_total_balance')}</Text>
              <TouchableOpacity
                onPress={() => { const next = !balanceHidden; setBalanceHidden(next); saveHideBalance(next); }}
                style={{ padding: 6 }}
                accessibilityRole="button"
                accessibilityLabel={balanceHidden ? t('home_show_balance') : t('home_hide_balance')}
              >
                <Ionicons name={balanceHidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={T.text2} />
              </TouchableOpacity>
            </View>
            <Text style={st.balance_amount}>{balanceHidden ? '••••••' : fmt(totalUSD)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: periodChange >= 0 ? T.up : T.down, fontSize: 14, fontWeight: '600' }}>
              {balanceHidden ? '••••' : `${periodChange >= 0 ? '+' : ''}${fmt(periodChange)} (${((periodChange / Math.max(totalUSD - periodChange, 1)) * 100).toFixed(2)}%)`}
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
            {t('home_since_date', { date: new Date(portfolioHistory[0].t).toLocaleDateString(INTL_LOCALE_TAG[locale] || 'fr-FR', { day: 'numeric', month: 'short' }) })}
          </Text>
        </View>
      )}

      <View style={st.quick_actions}>
        {visibleQuickActions.map(a => (
          <AnimPressable key={a.id} style={st.quick_btn} onPress={a.onPress} accessibilityRole="button" accessibilityLabel={a.label}>
            <View style={[st.quick_icon_wrap, { backgroundColor: a.bg }]}>
              <Ionicons name={a.icon} size={21} color={a.bg === T.gold ? '#000' : T.text} />
            </View>
            <Text style={st.quick_lbl}>{a.label}</Text>
          </AnimPressable>
        ))}
      </View>

      <AnimPressable
        style={{ marginHorizontal: 14, marginTop: 4, marginBottom: 8, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.border, backgroundColor: T.card, flexDirection: 'row', alignItems: 'center' }}
        onPress={() => { setCardWaitlistEmail(cardWaitlistJoined || profileEmailInput || ''); setShowCardWaitlist(true); }}
        accessibilityRole="button"
        accessibilityLabel={t('card_waitlist_title')}
      >
        <View style={{ width: 46, height: 30, borderRadius: 6, backgroundColor: T.gold, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ color: '#000', fontWeight: '800', fontSize: 10 }}>NEXIA</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: T.text, fontWeight: '700' }}>{t('card_waitlist_title')}</Text>
          <Text style={{ color: T.text2, fontSize: 12, marginTop: 2 }}>{cardWaitlistJoined ? t('card_waitlist_joined') : t('card_waitlist_teaser')}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={T.text2} />
      </AnimPressable>

      {!!dailyMover && (
        <View style={st.mover_card}>
          <Text style={st.mover_txt}>
            {t('home_daily_mover', {
              emoji: dailyMover.change >= 0 ? '↑' : '↓',
              sym: dailyMover.sym,
              sign: dailyMover.change >= 0 ? '+' : '',
              change: dailyMover.change.toFixed(2),
            })}
          </Text>
        </View>
      )}

      {!!diversification && diversification.topPct >= 70 && (
        <View style={st.diversif_card}>
          <Text style={st.diversif_txt}>
            {t('home_diversification', { pct: diversification.topPct.toFixed(0), symbol: diversification.topSymbol })}
          </Text>
        </View>
      )}

      {favoritesLoaded && !favorites.length && (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 4, marginBottom: 2, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: T.goldBg }}
          onPress={() => setTab('markets')}
          activeOpacity={0.8}
        >
          <Ionicons name="star" size={13} color={T.gold} />
          <Text style={{ color: T.gold, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{t('home_add_favorites_cta')}</Text>
        </TouchableOpacity>
      )}

      {!!favoriteMarketCoins.length && (
        <>
          <View style={st.section_hdr}>
            <SectionTitle>{t('common_favorites')}</SectionTitle>
          </View>
          <View style={isWideWeb && st.token_grid}>
            {favoriteMarketCoins.map((coin, i) => {
              const sym = coin.symbol?.toUpperCase() || '';
              return (
                <FadeInView key={coin.id} deps={[coin.id]} style={[st.token_row, isWideWeb && st.token_row_wide]}>
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
                    style={st.token_row_fav}
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
        <SectionTitle>{t('home_my_tokens')} ({homeTokenEntries.length})</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity
            onPress={() => { const next = !hideZeroBalances; setHideZeroBalances(next); saveHideZeroBalances(next); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t('home_hide_zero')}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hideZeroBalances ? T.gold : T.text3 }} />
            <Text style={{ color: hideZeroBalances ? T.gold : T.text2, fontSize: 12, fontWeight: '700' }}>{t('home_hide_zero')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTokenSort(tokenSort === 'value' ? 'name' : tokenSort === 'name' ? 'change' : 'value')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t('home_sort_label')}
          >
            <Ionicons name="swap-vertical" size={16} color={T.gold} />
            <Text style={{ color: T.gold, fontSize: 12, fontWeight: '700' }}>{tokenSort === 'value' ? t('home_sort_value') : tokenSort === 'name' ? t('home_sort_name') : t('home_sort_change')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ marginHorizontal: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12 }}>
        <Ionicons name="search-outline" size={16} color={T.text3} />
        <TextInput
          style={{ flex: 1, color: T.text, fontSize: 14, paddingVertical: 11, marginLeft: 8 }}
          placeholder={t('home_search_tokens')}
          placeholderTextColor={T.text3}
          value={tokenSearch}
          onChangeText={setTokenSearch}
          autoCapitalize="none"
        />
        {!!tokenSearch && (
          <TouchableOpacity onPress={() => setTokenSearch('')}>
            <Ionicons name="close-circle" size={18} color={T.text3} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={{ color: T.text3, fontSize: 11, marginHorizontal: 14, marginBottom: 10 }}>{t('home_price_freshness', { status: marketFreshness })}</Text>

      <View style={isWideWeb && st.token_grid}>
        {/* `readOnlyLabel` hissé ici, avant le .map ci-dessous : ce .map
            déstructure sa propre valeur locale nommée `t` ([sym, t]), qui
            masquerait la fonction de traduction t() si on l'appelait à
            l'intérieur. */}
        {(() => { const readOnlyLabel = t('common_read_only'); return Object.values(tokens).every(t => !t.price) ? (
          Object.keys(tokens).map(sym => (
            <TokenRowSkeleton key={sym} style={[isWideWeb && st.token_row_wide]} />
          ))
        ) : homeTokenEntries.map(([sym, t], i) => {
          const val = (t.balance || 0) * (t.price || 0);
          const isFav = favorites.includes(sym);
          return (
            <FadeInView key={sym} deps={[sym]} style={[st.token_row, isWideWeb && st.token_row_wide]}>
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
                      <View style={st.readonly_badge}><Text style={st.readonly_badge_txt}>{readOnlyLabel}</Text></View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={st.token_price_txt}>{fmt(t.price, t.price < 1 ? 4 : 2)}</Text>
                    <ChangePill value={t.change24h} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={st.token_val}>{balanceHidden ? '••••' : fmt(val)}</Text>
                  <Text style={st.token_bal}>{balanceHidden ? '••••' : `${(t.balance || 0).toFixed(4)} ${sym}`}</Text>
                </View>
              </AnimPressable>
              <TouchableOpacity
                style={st.token_row_fav}
                onPress={() => toggleFavorite(sym)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name={isFav ? 'star' : 'star-outline'} size={16} color={T.gold} />
              </TouchableOpacity>
            </FadeInView>
          );
        }); })()}
      </View>

      {customTokens.filter(t => t.network === network).length > 0 && (
        <>
          <View style={st.section_hdr}>
            <SectionTitle>{t('home_custom_tokens')}</SectionTitle>
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

      {!!newsItems.length && (
        <View style={{ marginTop: 20 }}>
          <View style={st.section_hdr}>
            <SectionTitle>{t('home_news_title')}</SectionTitle>
            <Text style={st.section_sub}>{t('home_news_updated')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 10 }}>
            {[
              ['all', t('news_filter_all')],
              ['crypto', t('news_filter_crypto')],
              ['economy', t('news_filter_economy')],
            ].map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[st.chip_pill, newsFilter === key && st.chip_pill_on, { paddingHorizontal: 12, paddingVertical: 6 }]}
                onPress={() => setNewsFilter(key)}
              >
                <Text style={[st.chip_pill_txt, newsFilter === key && st.chip_pill_txt_on, { fontSize: 12 }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 14, paddingRight: 4 }}>
            {filteredNewsItems.slice(0, 10).map((item, i) => (
              <AnimPressable key={`${item.link}-${i}`} style={st.news_card} scaleTo={0.97} onPress={() => item.link && Linking.openURL(item.link)}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={st.news_img} />
                ) : (
                  <View style={[st.news_img, { alignItems: 'center', justifyContent: 'center', backgroundColor: T.goldBg }]}>
                    <Text style={{ color: T.gold, fontWeight: '800', fontSize: 13, textAlign: 'center', paddingHorizontal: 12 }}>{item.source || 'NexiaWallet'}</Text>
                  </View>
                )}
                <Text style={st.news_title} numberOfLines={2}>{item.title}</Text>
                <Text style={[st.news_date, { fontWeight: '700', color: T.gold }]}>{item.source || ''}</Text>
                <Text style={st.news_date}>
                  {item.pubDate ? new Date(item.pubDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
              </AnimPressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={{ height: 90 }} />
    </ScrollView>
  );

  // ════════════════════════════════════════════════════════
  //  TAB: MARCHÉ
  // ════════════════════════════════════════════════════════
  // Grille virtualisée (FlatList) plutôt qu'un .map() dans un ScrollView : avec
  // 50+ cryptos (CoinGecko), un simple .map() montait toutes les cartes (+ leur
  // animation d'apparition) d'un coup à l'ouverture de l'onglet — coûteux en
  // perf/mémoire sur un appareil bas de gamme. FlatList ne monte que les lignes
  // visibles + une marge. numColumns ne peut pas changer sans redémonter la
  // FlatList (limite connue de RN) — d'où le `key={numColumns}` qui force ce
  // redémarrage si la fenêtre passe en largeur "web" (2 → 4 colonnes).
  const renderMarketCard = ({ item: coin }) => {
    if (coin.__skeleton) {
      return (
        <View style={[st.market_card_slot, isWideWeb && st.market_card_slot_wide]}>
          <SkeletonBlock style={{ height: 96, borderRadius: 16 }} />
        </View>
      );
    }
    const pos = (coin.price_change_percentage_24h || 0) >= 0;
    const p = coin.current_price || 0;
    const sym = coin.symbol?.toUpperCase() || '';
    const known = WALLET_TOKENS[sym];
    const isFav = favorites.includes(sym);
    return (
      <FadeInView deps={[coin.id]} style={[st.market_card_slot, isWideWeb && st.market_card_slot_wide]}>
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
  };

  const renderMarkets = () => {
    const numColumns = isWideWeb ? 4 : 2;
    const gridData = marketCoins.length === 0
      ? Array.from({ length: 8 }, (_, i) => ({ id: `skeleton-${i}`, __skeleton: true }))
      : filteredCoins;

    return (
      <View style={{ flex: 1 }}>
        <View style={st.search_wrap}>
          <TextInput style={st.search_input} value={marketSearch} onChangeText={setMarketSearch}
            placeholder="🔍 Bitcoin, Ethereum…" placeholderTextColor={T.text3} />
        </View>

        {/* flexShrink: 0 — sinon, sur le web, la FlatList en dessous (très haute)
            écrase cette rangée à quelques pixels et coupe les filtres. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={st.market_filter_row}>
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

        <FlatList
          key={numColumns}
          style={{ flex: 1 }}
          data={gridData}
          numColumns={numColumns}
          keyExtractor={(item) => item.id}
          renderItem={renderMarketCard}
          columnWrapperStyle={st.market_grid}
          showsVerticalScrollIndicator={false}
          onScroll={handleTabScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); Promise.all([fetchMarket(), fetchNews()]).finally(() => setRefreshing(false)); }}
              tintColor={T.gold}
            />
          }
          ListHeaderComponent={
            <>
              {!!newsItems.length && (
                <View style={{ marginBottom: 20 }}>
                  <View style={st.section_hdr}>
                    <SectionTitle>Actu crypto en direct</SectionTitle>
                    <Text style={st.section_sub}>MAJ / 5 min</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 14, paddingRight: 4 }}>
                    {filteredNewsItems.slice(0, 10).map((item, i) => (
                      <AnimPressable key={`${item.link}-${i}`} style={st.news_card} scaleTo={0.97} onPress={() => item.link && Linking.openURL(item.link)}>
                        {item.image ? (
                          <Image source={{ uri: item.image }} style={st.news_img} />
                        ) : (
                          <View style={[st.news_img, { alignItems: 'center', justifyContent: 'center', backgroundColor: T.goldBg }]}>
                            <Text style={{ color: T.gold, fontWeight: '800', fontSize: 13, textAlign: 'center', paddingHorizontal: 12 }}>{item.source || 'NexiaWallet'}</Text>
                          </View>
                        )}
                        <Text style={st.news_title} numberOfLines={2}>{item.title}</Text>
                        <Text style={[st.news_date, { fontWeight: '700', color: T.gold }]}>{item.source || ''}</Text>
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
                <Text style={st.section_sub}>{filteredCoins.length} cryptos • {marketFreshness}</Text>
              </View>
            </>
          }
          ListFooterComponent={<View style={{ height: 90 }} />}
        />
      </View>
    );
  };

  // ════════════════════════════════════════════════════════
  //  TAB: DÉCOUVRIR — assemble des fonctionnalités déjà existantes
  //  (navigateur dApp intégré, staking Lido) dans une grille de découverte,
  //  plutôt que d'inventer de nouvelles intégrations. Volontairement AUCUN
  //  produit à effet de levier (perpétuels) ni pari (prédictions) : hors de
  //  portée réglementaire/technique pour ce wallet non-custodial.
  // ════════════════════════════════════════════════════════
  // Logos EMBARQUÉS (assets/dapps/) plutôt qu'appelés sur un CDN : ils
  // s'affichent même hors ligne, et aucun service tiers ne voit passer les
  // utilisateurs qui ouvrent cet onglet. La lettre colorée reste en secours
  // si une image manquait.
  const DISCOVER_DAPPS = [
    { name: 'Uniswap',     cat: 'dex',     url: 'https://app.uniswap.org',    color: '#FF007A', letter: 'U', logo: require('./assets/dapps/uniswap.png'),     desc: 'Le plus gros échange décentralisé (DEX).' },
    { name: 'PancakeSwap', cat: 'dex',     url: 'https://pancakeswap.finance',color: '#D1884F', letter: 'P', logo: require('./assets/dapps/pancakeswap.png'), desc: 'Le DEX n°1 sur BNB Smart Chain.' },
    { name: '1inch',       cat: 'dex',     url: 'https://app.1inch.io',       color: '#1B314F', letter: '1', logo: require('./assets/dapps/1inch.png'),       desc: 'Agrégateur : trouve le meilleur taux de swap.' },
    { name: 'Curve',       cat: 'dex',     url: 'https://curve.fi',           color: '#3465A4', letter: 'C', logo: require('./assets/dapps/curve.png'),       desc: 'Échange de stablecoins à faible slippage.' },
    { name: 'Aave',        cat: 'lending', url: 'https://app.aave.com',       color: '#B6509E', letter: 'A', logo: require('./assets/dapps/aave.png'),        desc: 'Prête tes cryptos et gagne des intérêts.' },
    { name: 'Lido',        cat: 'yield',   url: 'https://stake.lido.fi',      color: '#00A3FF', letter: 'L', logo: require('./assets/dapps/lido.png'),        desc: "Staking liquide d'ETH — reçois du stETH." },
    { name: 'OpenSea',     cat: 'nft',     url: 'https://opensea.io',         color: '#2081E2', letter: 'O', logo: require('./assets/dapps/opensea.png'),     desc: 'La plus grande place de marché NFT.' },
    { name: 'Blur',        cat: 'nft',     url: 'https://blur.io',            color: '#FF7A00', letter: 'B', logo: require('./assets/dapps/blur.png'),        desc: 'Marketplace NFT rapide pour traders.' },
  ];
  const DISCOVER_CATS = [
    { id: 'all', label: 'Tout' },
    { id: 'dex', label: 'DEX' },
    { id: 'lending', label: 'Prêt' },
    { id: 'yield', label: 'Rendement' },
    { id: 'nft', label: 'NFT' },
  ];

  const renderDiscover = () => {
    const list = dappCat === 'all' ? DISCOVER_DAPPS : DISCOVER_DAPPS.filter(d => d.cat === dappCat);
    return (
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleTabScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16 }}
      >
        <Text style={st.tab_title}>{t('nav_discover')}</Text>

        <TouchableOpacity
          style={st.search_wrap}
          onPress={() => { setDappUrlInput(''); setDappBrowserFromSettings(false); setShowDappBrowser(true); }}
        >
          <View pointerEvents="none">
            <TextInput
              style={st.search_input}
              placeholder="🔍 Rechercher ou saisir l'URL d'une dApp"
              placeholderTextColor={T.text3}
              editable={false}
            />
          </View>
        </TouchableOpacity>

        {/* Raccourcis natifs */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <AnimPressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.borderSoft, paddingVertical: 13 }} scaleTo={0.97} onPress={() => setTab('swap')}>
            <Ionicons name="swap-horizontal" size={18} color={T.gold} />
            <Text style={{ color: T.text, fontWeight: '700', fontSize: 13, marginLeft: 8 }}>Swap</Text>
          </AnimPressable>
          <AnimPressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.borderSoft, paddingVertical: 13 }} scaleTo={0.97} onPress={() => { setBridgeFromSettings(false); setShowBridge(true); }}>
            <Ionicons name="git-network" size={18} color={T.gold} />
            <Text style={{ color: T.text, fontWeight: '700', fontSize: 13, marginLeft: 8 }}>Pont</Text>
          </AnimPressable>
        </View>

        {/* Filtres catégorie */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 18, marginBottom: 4 }} contentContainerStyle={{ paddingRight: 8 }}>
          {DISCOVER_CATS.map(c => {
            const on = dappCat === c.id;
            return (
              <TouchableOpacity key={c.id} onPress={() => setDappCat(c.id)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginRight: 8, backgroundColor: on ? T.gold : T.card2, borderWidth: 1, borderColor: on ? T.gold : T.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? '#062219' : T.text2 }}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Liste dApps */}
        <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.borderSoft, marginTop: 8, overflow: 'hidden' }}>
          {list.map((d, i) => (
            <AnimPressable
              key={d.name}
              scaleTo={0.99}
              onPress={() => { handleDappBrowserOpen(d.url); setDappBrowserFromSettings(false); setShowDappBrowser(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: T.border }}
            >
              <DappLogo dapp={d} />
              <View style={{ flex: 1, marginLeft: 13 }}>
                <Text style={{ color: T.text, fontWeight: '700', fontSize: 15 }}>{d.name}</Text>
                <Text style={{ color: T.text3, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{d.desc}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={T.text3} />
            </AnimPressable>
          ))}
        </View>

        <Text style={{ color: T.text3, fontSize: 11, textAlign: 'center', marginTop: 14 }}>
          Les dApps s'ouvrent dans le navigateur intégré. Tes clés restent sur ton appareil.
        </Text>

        <View style={{ height: 90 }} />
      </ScrollView>
    );
  };

  // ════════════════════════════════════════════════════════
  //  TAB: SWAP
  // ════════════════════════════════════════════════════════
  const renderSwap = () => {
    const ft = tokens[swapFrom];
    const tt = tokens[swapTo];
    const fprice = ft?.price || 1;
    const tprice = tt?.price || 1;
    const rate = tprice > 0 ? fprice / tprice : 0;
    // Même source que le contrôle "solde insuffisant" à la confirmation
    // (soldeDuJeton), SOL et BTC compris — chacun a son propre solde.
    const swapAvailable = soldeDuJeton(swapFrom);
    // SOL et BTC s'ajoutent aux jetons EVM du réseau actif : l'échange passe
    // alors par LI.FI (voir confirmerEchangeInterEcosysteme) au lieu de 0x.
    const jetonsEchangeables = [...(SWAPPABLE_TOKENS[network] || []), 'SOL', 'BTC'];
    return (
      <ScrollView
        style={{ flex: 1, padding: 16 }}
        contentContainerStyle={isWideWeb ? { maxWidth: 480, width: '100%', alignSelf: 'center' } : undefined}
      >
        {/* Ce titre annonçait « Achat / Vente live » : c'est faux et ça prête
            à confusion avec les boutons Acheter / Vendre de l'accueil, qui
            passent par carte bancaire en euros. Ici on échange un jeton
            contre un autre, sans euros. */}
        <Text style={st.tab_title}>⇄ Échanger</Text>
        <Text style={{ color: T.text3, fontSize: 13, marginTop: -6, marginBottom: 12 }}>
          Échange un jeton contre un autre, directement depuis ton wallet — sans euros.
        </Text>
        <GasIndicatorBadge gasIndicator={gasIndicator} nativeSymbol={nativeSymbol} />
        <View style={st.swap_card}>
          <Text style={st.swap_lbl}>Tu paies</Text>
          <TextInput style={st.swap_big_input} value={swapAmt} onChangeText={(v) => setSwapAmt(normalizeDecimalInput(v))}
            placeholder="0" placeholderTextColor={T.text3} keyboardType="decimal-pad" />
          <Text style={{ color: T.text2, fontSize: 12, marginBottom: 4 }}>≈ {fmt((parseFloat(swapAmt) || 0) * fprice)}</Text>
          {!!swapAvailable && (
            <>
              <Text style={{ color: T.text3, fontSize: 11, marginBottom: 8 }}>Solde disponible : {swapAvailable.toFixed(6)} {swapFrom}</Text>
              <View style={{ flexDirection: 'row', marginBottom: 10, gap: 8 }}>
                {[0.25, 0.5, 0.75, 1].map(pct => (
                  <TouchableOpacity
                    key={pct}
                    style={st.quick_pct_btn}
                    onPress={() => {
                      // À 100% sur le token NATIF (ETH/BNB...), on swappe
                      // aussi le token qui paie le gas : mettre le solde
                      // exact laisse 0 pour la transaction elle-même, qui
                      // échoue ("insufficient funds for intrinsic transaction
                      // cost" — bug réel remonté par Pablo). On réserve donc
                      // une petite marge à 100% pour ce cas précis.
                      const raw = pct === 1 && swapFrom === nativeSymbol
                        ? Math.max(0, swapAvailable - getNativeGasReserve(network))
                        : swapAvailable * pct;
                      setSwapAmt(raw.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''));
                    }}
                  >
                    <Text style={st.quick_pct_txt}>{pct === 1 ? 'Tout' : `${pct * 100}%`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {jetonsEchangeables.map((sym) => {
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
            {jetonsEchangeables.map((sym) => {
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

        {/* Le chemin et les frais ne sont pas les mêmes selon les jetons : dire
            « 0x, 0,75 % » pour un échange vers du BTC ou du SOL serait faux. */}
        <Text style={{ color: T.text3, fontSize: 11, marginTop: 4, textAlign: 'center' }}>
          {estEchangeInterEcosysteme(swapFrom, swapTo)
            ? "Échange entre réseaux via LI.FI — la meilleure route est cherchée automatiquement.\nL'arrivée peut prendre quelques minutes ; le taux affiché ici est une estimation."
            : `Swap réel via agrégateur DEX (0x) — la meilleure route est cherchée automatiquement.\nFrais NexiaWallet de ${(SWAP_FEE_BPS / 100).toFixed(2)} % inclus dans le taux affiché.`}
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
          <Text style={st.modal_title}>{t('buy_screen_title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={st.form_label}>{t('buy_token_label')}</Text>
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

          <Text style={st.form_label}>{t('buy_amount_label')}</Text>
          <View style={st.buy_amount_row}>
            <Text style={st.buy_amount_currency}>€</Text>
            <TextInput style={st.buy_amount_input} value={buyAmount} onChangeText={(v) => setBuyAmount(normalizeDecimalInput(v))}
              placeholder="10" placeholderTextColor={T.text3} keyboardType="decimal-pad" />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 4 }}>
            {[10, 25, 50, 100].map(v => (
              <TouchableOpacity key={v} style={st.quick_pct_btn} onPress={() => setBuyAmount(String(v))}>
                <Text style={st.quick_pct_txt}>{v} €</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={st.buy_amount_convert}>
            ≈ {(() => {
              const price = tokens[buyToken]?.price || 0;
              if (!price) return '0';
              const qty = (parseFloat(buyAmount) || 0) / price;
              return qty.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
            })()} {buyToken}
          </Text>

          <View style={st.buy_info_box}>
            <View style={st.buy_info_row}>
              <Text style={st.buy_info_label}>{t('buy_network_label')}</Text>
              <Text style={st.buy_info_value}>{{ SOL: 'Solana', BTC: 'Bitcoin' }[buyToken] || activeNetwork.label}</Text>
            </View>
            <View style={st.buy_info_divider} />
            <View style={st.buy_info_row}>
              <Text style={st.buy_info_label}>{t('buy_destination_label')}</Text>
              <Text style={st.buy_info_value}>
                {(() => {
                  const addr = buyToken === 'SOL' ? solanaAddr : buyToken === 'BTC' ? bitcoinAddr : walletAddr;
                  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';
                })()}
              </Text>
            </View>
          </View>
          <Text style={st.buy_disclaimer}>{t('buy_disclaimer')}</Text>

          <AnimPressable style={[st.green_btn, { opacity: buyLoading ? 0.7 : 1, marginTop: 20 }]}
            onPress={handleBuyNow} disabled={buyLoading}>
            {buyLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>{t('buy_pay_button')}</Text>}
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
      <Modal visible={SELL_ENABLED && showSell} animationType="slide" transparent>
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
              {/* BTC/BSC exclus : la voie Coinbase Offramp ne les couvre pas encore. */}
              {[...(network === 'bsc' ? [] : (BUYABLE_TOKENS[network] || [])), ...BUYABLE_TOKENS.solana].map((sym) => {
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
            <TextInput style={st.form_input} value={sellAmount} onChangeText={(v) => setSellAmount(normalizeDecimalInput(v))}
              placeholder="0.1" placeholderTextColor={T.text3} keyboardType="decimal-pad" />
            {!!sellableBalance && (
              <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                {[0.25, 0.5, 1].map(pct => (
                  <TouchableOpacity
                    key={pct}
                    style={st.quick_pct_btn}
                    onPress={() => {
                      // Même réserve de gas qu'ailleurs (Swap/Envoyer) sur
                      // "Tout" quand le token vendu est le natif du réseau —
                      // sinon plus rien pour payer la transaction on-chain
                      // vers l'adresse de dépôt Coinbase.
                      const amt = pct === 1 && sellToken === nativeSymbol
                        ? Math.max(0, sellableBalance - getNativeGasReserve(network))
                        : sellableBalance * pct;
                      setSellAmount(String(amt));
                    }}
                  >
                    <Text style={st.quick_pct_txt}>{pct === 1 ? 'Tout' : `${pct * 100}%`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={st.send_info_box}>
              <Text style={st.send_info_line}>≈ {fmt((parseFloat(sellAmount) || 0) * (tokens[sellToken]?.price || 0))}</Text>
              <Text style={st.send_info_line}>Solde disponible : {sellableBalance.toFixed(6)} {sellToken}</Text>
              <Text style={st.send_info_line}>Tu enverras toi-même les fonds à l'adresse de dépôt affichée par Coinbase. Un compte Coinbase (+ vérification d'identité) est nécessaire pour recevoir les euros par virement SEPA.</Text>
            </View>

            <AnimPressable style={[st.green_btn, { opacity: sellLoading ? 0.7 : 1, marginTop: 24 }]}
              onPress={handleSellNow} disabled={sellLoading}>
              {sellLoading ? <ActivityIndicator color="#000" /> : <Text style={st.green_btn_txt}>Vendre via Coinbase</Text>}
            </AnimPressable>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  // ════════════════════════════════════════════════════════
  //  CARTE NEXIA — LISTE D'ATTENTE (pas une carte émise)
  //  Formulaire local uniquement : l'email est enregistré sur l'appareil,
  //  aucun numéro de carte, aucun prélèvement, aucune date promise.
  const renderCardWaitlist = () => (
    <Modal visible={showCardWaitlist} animationType="slide" transparent>
      <SafeAreaView style={[st.modal_bg, isWideWeb && st.modal_bg_wide]}>
        <View style={st.modal_hdr}>
          <TouchableOpacity onPress={() => setShowCardWaitlist(false)} style={st.back_btn} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={{ color: T.text, fontSize: 22 }}>←</Text>
          </TouchableOpacity>
          <Text style={st.modal_title}>{t('card_waitlist_title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1, padding: 16 }}>
          <Text style={{ color: T.text2, fontSize: 14, lineHeight: 20 }}>{t('card_waitlist_desc')}</Text>
          {cardWaitlistJoined ? (
            <View style={{ marginTop: 20, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.border, backgroundColor: T.card }}>
              <Text style={{ color: T.text, fontWeight: '700' }}>{t('card_waitlist_joined')}</Text>
              <Text style={{ color: T.text2, marginTop: 6 }}>{cardWaitlistJoined}</Text>
              <TouchableOpacity
                style={{ marginTop: 16 }}
                onPress={() => { setCardWaitlistJoined(''); setCardWaitlistEmail(''); saveCardWaitlist(''); showToast(t('card_waitlist_removed'), 'success'); }}
              >
                <Text style={{ color: T.red, fontWeight: '600' }}>{t('card_waitlist_remove')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={[st.form_input, { marginTop: 20 }]}
                placeholder={t('card_waitlist_email_placeholder')}
                placeholderTextColor={T.text3}
                value={cardWaitlistEmail}
                onChangeText={setCardWaitlistEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <AnimPressable
                style={[st.green_btn, { marginTop: 16 }]}
                onPress={() => {
                  const email = cardWaitlistEmail.trim();
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast(t('card_waitlist_email_invalid'), 'error'); return; }
                  setCardWaitlistJoined(email);
                  saveCardWaitlist(email);
                  showToast(t('card_waitlist_joined'), 'success');
                  setShowCardWaitlist(false);
                }}
              >
                <Text style={st.green_btn_txt}>{t('card_waitlist_join')}</Text>
              </AnimPressable>
              <Text style={{ color: T.text3, fontSize: 12, lineHeight: 18, marginTop: 12 }}>{t('card_waitlist_note')}</Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  //  RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════
  const navItems = [
    { id: 'home',     icon: 'home',              label: t('nav_home')   },
    { id: 'markets',  icon: 'trending-up',       label: t('nav_market') },
    { id: 'stats',    icon: 'stats-chart',       label: t('nav_stats')  },
    { id: 'discover', icon: 'compass',           label: t('nav_discover') },
    { id: 'swap',     icon: 'swap-horizontal',   label: t('nav_swap'), big: true },
  ];

  // `key={tab}` force un nouveau montage à chaque changement d'onglet, donc
  // FadeInView rejoue son fondu — transition douce plutôt qu'un changement sec.
  const tabContent = (
    <FadeInView key={tab} style={{ flex: 1 }} deps={[tab]}>
      {tab === 'home'     && renderHome()}
      {tab === 'markets'  && renderMarkets()}
      {tab === 'stats'    && renderStatsTab()}
      {tab === 'discover' && renderDiscover()}
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
          {/* Deux blocs distincts en fondu croisé (pas un `scale` du même
              contenu — essayé d'abord, jugé "moche" : les icônes/texte
              rétrécis restaient tous là, juste plus petits). Au scroll vers
              le bas : la barre complète s'efface, seule une icône ronde
              "Accueil" ancrée à GAUCHE reste — tout le reste (Marché, Stats,
              Découvrir, Swap) disparaît complètement, pas juste réduit. */}
          <Animated.View
            style={[
              st.bottom_nav_float,
              {
                opacity: navBarAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [{ scale: navBarAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
              },
            ]}
            pointerEvents={navCollapsed ? 'none' : 'auto'}
          >
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
          </Animated.View>

          <Animated.View
            style={[
              st.nav_mini_float,
              {
                opacity: navBarAnim,
                transform: [{ scale: navBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
              },
            ]}
            pointerEvents={navCollapsed ? 'auto' : 'none'}
          >
            <AnimPressable style={st.nav_mini_btn} scaleTo={0.9} onPress={() => setTab('home')} accessibilityRole="button" accessibilityLabel={t('nav_home')}>
              <Ionicons name="home" size={20} color={tab === 'home' ? T.gold : T.text2} />
            </AnimPressable>
          </Animated.View>
        </>
      )}
      {renderBuy()}
      {renderSell()}
      {renderRecurringBuy()}
      {renderDuressSetup()}
      {renderBridge()}
      {renderDefiPositions()}
      {renderFaq()}
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
      {renderAllAddresses()}
      {renderGlobalSearch()}
      {renderStaking()}
      {renderCardWaitlist()}
      {renderNftGallery()}
      {renderLegal()}
      {renderMnemonicReauth()}
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
  const [themeMode, setThemeMode] = useState('light');
  useEffect(() => { loadTheme().then(setThemeMode); }, []);
  const T = themeMode === 'light' ? LIGHT_THEME : DARK_THEME;
  const cs = useMemo(() => buildCs(T), [T]);
  const st = useMemo(() => buildSt(T), [T]);
  const changeTheme = useCallback((next) => { setThemeMode(next); saveTheme(next); }, []);
  return (
    <ThemeContext.Provider value={{ T, st, cs }}>
      <AppContent themeMode={themeMode} changeTheme={changeTheme} />
      {Platform.OS === 'web' && <AlertHost />}
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
  // Pilule flottante EN HAUT (sous l'encoche/île dynamique), toujours sombre
  // quel que soit le thème actif — comme les notifications système/Trust
  // Wallet, pas un composant qui doit s'accorder au thème clair/sombre.
  toast_layer: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 56, paddingHorizontal: 20 },
  toast_wrap: {
    flexDirection: 'row', alignItems: 'center', maxWidth: 420,
    backgroundColor: '#1c1c1e', borderRadius: 999,
    paddingVertical: 10, paddingHorizontal: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 10,
  },
  toast_icon_circle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  toast_title:    { color: '#fff', fontSize: 13, fontWeight: '700' },
  toast_subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '500', marginTop: 1 },
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
  about_tag:      { backgroundColor: T.goldBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 6, marginBottom: 6 },
  about_tag_txt:  { color: T.gold, fontSize: 10, fontWeight: '600' },
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
    borderWidth: 1, borderColor: T.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 2,
  },
  quick_icon_txt:{ fontSize: 18, fontWeight: 'bold' },
  quick_lbl:     { color: T.text, fontSize: 11, fontWeight: '600' },

  section_hdr:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  section_title: { color: T.text2, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  section_tick:  { width: 3, height: 12, borderRadius: 2, backgroundColor: T.gold, marginRight: 8 },
  change_pill:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginLeft: 6 },
  change_pill_txt: { fontSize: 11, fontWeight: '700' },
  token_row:     {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14,
    marginHorizontal: 14, marginBottom: 10, backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 1,
  },
  // Étoile favori sur une LIGNE (Accueil "Mes tokens"/"Favoris") : simple
  // enfant du flex-row `token_row`, PAS en position absolue comme
  // `market_card_fav` (pensé pour les cartes du Marché, sans colonne de
  // valeur alignée à droite) — en absolu ici, l'étoile se superposait
  // exactement au montant en $ affiché tout à droite de la ligne.
  token_row_fav: { padding: 6, marginLeft: 2 },
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

  chip_pill:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: T.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: T.border },
  chip_pill_on:    { backgroundColor: T.goldBg, borderColor: T.gold },
  chip_pill_txt:   { color: T.text2, fontSize: 13, fontWeight: '700' },
  chip_pill_txt_on:{ color: T.gold },
  load_more_btn: { alignItems: 'center', paddingVertical: 14, marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  load_more_txt: { color: T.text2, fontSize: 13, fontWeight: '600' },
  alert_section:  { marginHorizontal: 16, marginBottom: 16 },
  alert_chip:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: T.goldBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: T.gold + '44' },
  alert_chip_txt: { color: T.gold, fontSize: 12, fontWeight: '600' },
  alert_form:     { backgroundColor: T.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: T.border },
  alert_add_txt:  { color: T.gold, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 10 },

  news_card:  { width: 220, marginRight: 12, backgroundColor: T.card, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: T.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
  news_img:   { width: '100%', height: 100, borderRadius: 10, marginBottom: 8, backgroundColor: T.card2 },
  news_title: { color: T.text, fontSize: 13, fontWeight: '700', marginBottom: 4, minHeight: 34 },
  news_desc:  { color: T.text2, fontSize: 12, lineHeight: 17, marginBottom: 6 },
  news_date:  { color: T.text3, fontSize: 10 },

  discover_grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  discover_tile: { width: '30%', alignItems: 'center', backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.borderSoft, paddingVertical: 14 },
  discover_tile_icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  discover_tile_name: { color: T.text, fontSize: 11, fontWeight: '600' },
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
  buy_amount_row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, borderRadius: 18, borderWidth: 1, borderColor: T.border, paddingVertical: 26, marginBottom: 10 },
  buy_amount_currency: { color: T.text2, fontSize: 30, fontWeight: '700', marginRight: 6 },
  buy_amount_input: { color: T.text, fontSize: 42, fontWeight: 'bold', textAlign: 'center', minWidth: 90, padding: 0 },
  buy_amount_convert: { color: T.text2, fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 18 },
  buy_info_box: { backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.border, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12 },
  buy_info_row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  buy_info_divider: { height: 1, backgroundColor: T.border },
  buy_info_label: { color: T.text3, fontSize: 13 },
  buy_info_value: { color: T.text, fontSize: 13, fontWeight: '600' },
  buy_disclaimer: { color: T.text3, fontSize: 12, textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
  max_btn:       { backgroundColor: T.goldBg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginLeft: 8, marginBottom: 16, borderWidth: 1, borderColor: T.gold + '55' },
  addr_action_btn: { width: 48, height: 48, borderRadius: 12, backgroundColor: T.card2, borderWidth: 1, borderColor: T.border, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  max_btn_txt:   { color: T.gold, fontWeight: 'bold', fontSize: 13 },
  quick_pct_btn: { flex: 1, backgroundColor: T.card2, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: T.border, alignItems: 'center' },
  quick_pct_txt: { color: T.text2, fontWeight: '600', fontSize: 12 },
  amount_mode_toggle: { color: T.gold, fontSize: 12, fontWeight: '600' },
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
  network_badge:   { backgroundColor: T.card2, borderRadius: 8, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: T.borderSoft },

  settings_section:   { color: T.text2, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  settings_row:       { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: T.border },
  settings_row_on:    { borderColor: T.gold, backgroundColor: T.goldBg },
  settings_row_title: { color: T.text, fontSize: 14, fontWeight: '600' },
  settings_row_sub:   { color: T.text2, fontSize: 11, marginTop: 2 },
  status_dot:         { width: 10, height: 10, borderRadius: 5 },

  // Conteneur qui "flotte" au-dessus du bas de l'écran (marge + coins très
  // arrondis + ombre) — c'est cette View qui est animée (masquage au scroll),
  // `bottom_nav` reste la pilule elle-même à l'intérieur.
  bottom_nav_float: { marginHorizontal: 14, marginBottom: 10 },
  // État "réduit" de la barre au scroll — une seule icône ronde ancrée en
  // BAS À GAUCHE (pas la même position que la barre complète, qui est
  // centrée) : un vrai bouton flottant séparé, pas le même bloc rétréci.
  nav_mini_float: { position: 'absolute', left: 14, bottom: 10 },
  nav_mini_btn: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.card, borderWidth: 1, borderColor: T.borderSoft,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 14, elevation: 8,
  },
  bottom_nav:  { flexDirection: 'row', height: 60, backgroundColor: T.card, borderRadius: 30, alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8, borderWidth: 1, borderColor: T.borderSoft },
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