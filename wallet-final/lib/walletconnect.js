// wallet-final/lib/walletconnect.js
// ─────────────────────────────────────────────────────────────────
//  WalletConnect côté WALLET : permet à NexiaWallet de se connecter à des
//  dApps tierces (Uniswap, OpenSea...) qui demandent une signature/tx, à la
//  place d'un MetaMask/Trust Wallet. Aucune clé privée ni mnémonique ne
//  transite par WalletConnect — seule une signature déjà calculée localement
//  (via ethers, exactement comme signNativeTx/signErc20Tx dans wallet.js)
//  est renvoyée à la dApp demandeuse.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { Core } = require('@walletconnect/core');
const { WalletKit } = require('@reown/walletkit');
const { buildApprovedNamespaces } = require('@walletconnect/utils');
const { ethers } = require('ethers');
const { getProvider } = require('./wallet');

const PROJECT_ID = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID)
  || '55c2aebe65c7efd7a891664b9570c52d';

// Format CAIP-2 ("eip155:<chainId>") des 3 chaînes EVM que ce wallet sait
// réellement signer (voir NETWORKS dans wallet.js) — Solana/Bitcoin ne sont
// pas EVM et utiliseraient un namespace CAIP différent ("solana:...") non
// géré ici pour l'instant.
const SUPPORTED_EVM_CHAINS = {
  'eip155:1': 'ethereum',
  'eip155:56': 'bsc',
  'eip155:137': 'polygon',
};

const SUPPORTED_METHODS = ['personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v4', 'eth_sendTransaction'];
const SUPPORTED_EVENTS = ['chainChanged', 'accountsChanged'];

let walletKitInstance = null;
let walletKitInitPromise = null;

// Un seul WalletKit par process (sessions/pairings vivent tant que l'app
// tourne) — initialisé paresseusement à la première connexion demandée par
// l'utilisateur, pas au démarrage de l'app (évite un handshake réseau inutile
// pour qui n'utilise jamais WalletConnect).
async function getWalletKit() {
  if (walletKitInstance) return walletKitInstance;
  if (!walletKitInitPromise) {
    const core = new Core({ projectId: PROJECT_ID });
    walletKitInitPromise = WalletKit.init({
      core,
      metadata: {
        name: 'NexiaWallet',
        description: 'Portefeuille crypto non-custodial',
        url: 'https://nexiawallet.pages.dev',
        icons: ['https://nexiawallet.pages.dev/favicon.ico'],
      },
    }).then((kit) => { walletKitInstance = kit; return kit; });
  }
  return walletKitInitPromise;
}

// Enregistre les callbacks d'événements WalletConnect. Retourne une fonction
// de nettoyage (à appeler si le composant qui écoute est démonté).
async function subscribeToWalletKitEvents({ onSessionProposal, onSessionRequest, onSessionDelete }) {
  const kit = await getWalletKit();
  if (onSessionProposal) kit.on('session_proposal', onSessionProposal);
  if (onSessionRequest) kit.on('session_request', onSessionRequest);
  if (onSessionDelete) kit.on('session_delete', onSessionDelete);
  return () => {
    if (onSessionProposal) kit.off('session_proposal', onSessionProposal);
    if (onSessionRequest) kit.off('session_request', onSessionRequest);
    if (onSessionDelete) kit.off('session_delete', onSessionDelete);
  };
}

// Démarre l'appairage à partir d'une URI "wc:..." collée ou scannée par
// l'utilisateur — déclenche ensuite un événement `session_proposal`.
async function pairWithUri(uri) {
  const trimmed = (uri || '').trim();
  if (!trimmed.startsWith('wc:')) throw new Error("Ce n'est pas un lien WalletConnect valide (doit commencer par \"wc:\").");
  const kit = await getWalletKit();
  await kit.core.pairing.pair({ uri: trimmed });
}

// Accepte une proposition de session pour l'adresse actuellement déverrouillée
// — n'annonce que les chaînes/méthodes qu'on sait vraiment signer, quelles
// que soient celles demandées par la dApp (buildApprovedNamespaces rejette
// proprement si la dApp exige une chaîne qu'on ne supporte pas).
async function approveSessionProposal(proposal, address) {
  const kit = await getWalletKit();
  const namespaces = buildApprovedNamespaces({
    proposal: proposal.params,
    supportedNamespaces: {
      eip155: {
        chains: Object.keys(SUPPORTED_EVM_CHAINS),
        methods: SUPPORTED_METHODS,
        events: SUPPORTED_EVENTS,
        accounts: Object.keys(SUPPORTED_EVM_CHAINS).map(chain => `${chain}:${address}`),
      },
    },
  });
  return kit.approveSession({ id: proposal.id, namespaces });
}

async function rejectSessionProposal(proposal, reason = 'Refusé par l\'utilisateur') {
  const kit = await getWalletKit();
  return kit.rejectSession({ id: proposal.id, reason: { code: 5000, message: reason } });
}

async function getActiveSessions() {
  const kit = await getWalletKit();
  return Object.values(kit.getActiveSessions() || {});
}

async function disconnectSession(topic) {
  const kit = await getWalletKit();
  return kit.disconnectSession({ topic, reason: { code: 6000, message: "Déconnecté par l'utilisateur" } });
}

async function respondToSessionRequest(topic, id, result) {
  const kit = await getWalletKit();
  return kit.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } });
}

async function rejectSessionRequest(topic, id, message = "Refusé par l'utilisateur") {
  const kit = await getWalletKit();
  return kit.respondSessionRequest({
    topic,
    response: { id, jsonrpc: '2.0', error: { code: 5000, message } },
  });
}

// Exécute réellement la demande (signature ou envoi de transaction) avec la
// clé privée déjà déverrouillée en mémoire — jamais persistée, jamais
// envoyée au relais WalletConnect. Lève une erreur pour toute méthode/chaîne
// non supportée, à charge de l'appelant de répondre par rejectSessionRequest.
async function executeSessionRequest({ chainId, method, params }, privateKey) {
  const network = SUPPORTED_EVM_CHAINS[chainId];
  if (!network) throw new Error(`Chaîne non supportée : ${chainId}`);
  const wallet = new ethers.Wallet(privateKey, getProvider(network));

  if (method === 'personal_sign') {
    const [messageHex, address] = params;
    if (address.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('Adresse demandée différente du compte actif.');
    const message = ethers.utils.isHexString(messageHex) ? ethers.utils.arrayify(messageHex) : messageHex;
    return wallet.signMessage(message);
  }

  if (method === 'eth_sign') {
    const [address, messageHex] = params;
    if (address.toLowerCase() !== wallet.address.toLowerCase()) throw new Error('Adresse demandée différente du compte actif.');
    return wallet.signMessage(ethers.utils.arrayify(messageHex));
  }

  if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
    const [, typedDataJson] = params;
    const typedData = typeof typedDataJson === 'string' ? JSON.parse(typedDataJson) : typedDataJson;
    const { domain, types, message } = typedData;
    const typesWithoutDomain = { ...types };
    delete typesWithoutDomain.EIP712Domain;
    return wallet._signTypedData(domain, typesWithoutDomain, message);
  }

  if (method === 'eth_sendTransaction') {
    const [tx] = params;
    const populated = await wallet.populateTransaction({
      to: tx.to,
      value: tx.value ? ethers.BigNumber.from(tx.value) : undefined,
      data: tx.data || '0x',
      gasLimit: tx.gas ? ethers.BigNumber.from(tx.gas) : undefined,
    });
    const signed = await wallet.signTransaction(populated);
    const sent = await wallet.provider.sendTransaction(signed);
    return sent.hash;
  }

  throw new Error(`Méthode non supportée : ${method}`);
}

module.exports = {
  SUPPORTED_EVM_CHAINS,
  getWalletKit,
  subscribeToWalletKitEvents,
  pairWithUri,
  approveSessionProposal,
  rejectSessionProposal,
  getActiveSessions,
  disconnectSession,
  respondToSessionRequest,
  rejectSessionRequest,
  executeSessionRequest,
};
