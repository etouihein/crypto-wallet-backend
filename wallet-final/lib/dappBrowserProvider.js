// wallet-final/lib/dappBrowserProvider.js
// ─────────────────────────────────────────────────────────────────
//  Script injecté dans la WebView du navigateur dApp intégré (voir App.js,
//  renderDappBrowser). Expose un provider EIP-1193 (`window.ethereum`) +
//  EIP-6963 (découverte multi-provider moderne, utilisée par wagmi/RainbowKit)
//  côté page web, qui relaie chaque appel vers le code natif via
//  `ReactNativeWebView.postMessage` puis attend la réponse renvoyée par
//  `injectJavaScript(...)` depuis App.js (voir handleDappBridgeMessage).
//
//  Ne signe/n'envoie RIEN ici : ce fichier tourne dans le contexte JS de la
//  page web chargée (non fiable), donc il ne fait que transporter la
//  requête/réponse. La signature réelle se fait côté natif avec la clé déjà
//  déverrouillée, via walletConnect.executeSessionRequest — exactement le
//  même code que pour les connexions WalletConnect classiques.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Méthodes read-only qu'on peut résoudre côté natif sans demander de
// confirmation à l'utilisateur (pas de signature, pas de transaction).
const READ_ONLY_METHODS = new Set([
  'eth_chainId',
  'eth_accounts',
  'net_version',
  'wallet_getPermissions',
]);

// Méthodes qui nécessitent une confirmation explicite (nouvelle connexion,
// signature ou transaction) — gérées via une modale côté App.js.
const CONFIRMATION_METHODS = new Set([
  'eth_requestAccounts',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_switchEthereumChain',
]);

function buildInjectedProvider({ chainId }) {
  // JSON.stringify pour échapper proprement les valeurs dans le script injecté.
  const chainIdJson = JSON.stringify(chainId || '0x1');

  return `
(function () {
  if (window.ethereum && window.ethereum.isNexiaWallet) return true;

  var requestId = 0;
  var pending = {};

  function post(method, params) {
    return new Promise(function (resolve, reject) {
      var id = ++requestId;
      pending[id] = { resolve: resolve, reject: reject };
      // window.location.origin est lu ICI, au moment de l'envoi, dans le
      // contexte JS du document reellement charge — une page ne peut pas
      // usurper l'origine d'une AUTRE page. C'est la seule source fiable :
      // un etat React cote natif (ex. l'URL au moment de l'ouverture) ne
      // suit pas les navigations internes (lien, redirection) dans la
      // meme WebView et peut donc mentir sur "qui" fait vraiment la
      // demande apres une navigation.
      window.ReactNativeWebView.postMessage(JSON.stringify({
        source: 'nexiawallet-provider',
        id: id,
        method: method,
        params: params || [],
        origin: window.location.origin,
      }));
    });
  }

  // Appelé depuis App.js via injectJavaScript() une fois la requête traitée
  // côté natif (approuvée/signée, ou refusée).
  window.__nexiaRespond = function (id, errorMessage, result) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (errorMessage) p.reject(new Error(errorMessage));
    else p.resolve(result);
  };

  var listeners = {};
  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }
  function removeListener(event, cb) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(function (f) { return f !== cb; });
  }
  // Appelé depuis App.js pour notifier un changement de compte/chaîne côté page.
  window.__nexiaEmit = function (event, data) {
    if (event === 'accountsChanged') {
      provider.selectedAddress = (data && data[0]) || null;
    }
    (listeners[event] || []).forEach(function (cb) { try { cb(data); } catch (e) {} });
  };

  var provider = {
    isNexiaWallet: true,
    chainId: ${chainIdJson},
    networkVersion: String(parseInt(${chainIdJson}, 16)),
    // Jamais pre-rempli a l'injection : l'adresse ne doit etre visible
    // qu'apres un round-trip eth_accounts/eth_requestAccounts verifie
    // par origine cote natif (voir handleDappMessage dans App.js). La
    // remplir ici depuis un etat React global ("une dApp est connectee
    // cette session") exposerait l'adresse a N'IMPORTE QUELLE page
    // chargee ensuite dans la meme WebView, sans confirmation.
    selectedAddress: null,
    isConnected: function () { return true; },
    request: function (args) {
      args = args || {};
      return post(args.method, args.params);
    },
    // Ancienne API — encore appelée par certaines dApps non migrées vers request().
    enable: function () { return post('eth_requestAccounts', []); },
    sendAsync: function (payload, callback) {
      post(payload.method, payload.params).then(
        function (result) { callback(null, { id: payload.id, jsonrpc: '2.0', result: result }); },
        function (err) { callback(err); }
      );
    },
    send: function (methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === 'string') return post(methodOrPayload, paramsOrCallback);
      return provider.sendAsync(methodOrPayload, paramsOrCallback);
    },
    on: on,
    removeListener: removeListener,
  };

  window.ethereum = provider;
  window.dispatchEvent(new Event('ethereum#initialized'));

  // EIP-6963 : découverte multi-wallet moderne (wagmi/RainbowKit/viem s'en
  // servent en priorité sur window.ethereum, qui reste réservé au premier
  // provider injecté — sans ça, si une autre wallet-app était déjà présente
  // dans ce même contexte, la nôtre pourrait ne jamais être proposée).
  var info = {
    uuid: 'nexiawallet-' + Math.random().toString(36).slice(2),
    name: 'NexiaWallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM3QzNBRUQiLz48L3N2Zz4=',
    rdns: 'fr.nexiawallet.app',
  };
  function announceProvider() {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({ info: info, provider: provider }),
    }));
  }
  window.addEventListener('eip6963:requestProvider', announceProvider);
  announceProvider();

  true;
})();
true;
`;
}

module.exports = { buildInjectedProvider, READ_ONLY_METHODS, CONFIRMATION_METHODS };
