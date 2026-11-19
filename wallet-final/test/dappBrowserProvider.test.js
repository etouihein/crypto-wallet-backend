'use strict';
// wallet-final/test/dappBrowserProvider.test.js
// ─────────────────────────────────────────────────────────────────
//  Script injecte dans le navigateur dApp (lib/dappBrowserProvider.js),
//  execute en Node dans un faux "window" (module vm), sans React Native.
//  Ce script tourne dans la page web (non fiable) : il ne doit QUE
//  transporter les demandes vers l'app, sans jamais exposer l'adresse
//  d'avance ni se laisser injecter du code via le chainId.
//  (L'origine de confiance est recalculee cote natif dans App.js,
//  dappTrustedOrigin : ce fichier-ci n'en est pas la garantie.)
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');

const { buildInjectedProvider, READ_ONLY_METHODS, CONFIRMATION_METHODS } = require('../lib/dappBrowserProvider');

function fausseFenetre(origin = 'https://app.uniswap.org') {
  const messages = [];
  const evenements = [];
  const ecouteurs = {};
  const window = {
    location: { origin },
    ReactNativeWebView: { postMessage: (m) => messages.push(JSON.parse(m)) },
    dispatchEvent: (e) => { evenements.push(e); (ecouteurs[e.type] || []).forEach((cb) => cb(e)); },
    addEventListener: (type, cb) => { (ecouteurs[type] = ecouteurs[type] || []).push(cb); },
  };
  class Event { constructor(type) { this.type = type; } }
  class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init && init.detail; } }
  const contexte = vm.createContext({ window, Event, CustomEvent, Promise, JSON, Error, Math, String, parseInt, Object });
  return { window, messages, evenements, contexte };
}

function injecter(f, chainId = '0x1') {
  return vm.runInContext(buildInjectedProvider({ chainId }), f.contexte);
}

test('le provider est installe, sans adresse exposee avant connexion', () => {
  const f = fausseFenetre();
  assert.equal(injecter(f, '0x89'), true);
  const p = f.window.ethereum;
  assert.equal(p.isNexiaWallet, true);
  assert.equal(p.selectedAddress, null);
  assert.equal(p.chainId, '0x89');
  assert.equal(p.networkVersion, '137');
});

test('chainId absent -> Ethereum (0x1) par defaut', () => {
  const f = fausseFenetre();
  vm.runInContext(buildInjectedProvider({}), f.contexte);
  assert.equal(f.window.ethereum.chainId, '0x1');
});

test('un chainId piege ne peut pas injecter de code dans la page', () => {
  const f = fausseFenetre();
  const piege = '0x1"; window.pwned = true; "';
  injecter(f, piege);
  assert.equal(f.window.pwned, undefined);
  assert.equal(f.window.ethereum.chainId, piege);
});

test('une 2e injection ne remplace pas le provider deja installe', () => {
  const f = fausseFenetre();
  injecter(f);
  const premier = f.window.ethereum;
  injecter(f, '0x38');
  assert.equal(f.window.ethereum, premier);
  assert.equal(f.window.ethereum.chainId, '0x1');
});

test('request() transmet methode, parametres et origine REELLE de la page au moment de l\'appel', async () => {
  const f = fausseFenetre('https://app.uniswap.org');
  injecter(f);
  f.window.ethereum.request({ method: 'personal_sign', params: ['0xdead', '0xbeef'] });
  f.window.location.origin = 'https://autre-site.example';
  f.window.ethereum.request({ method: 'eth_accounts' });
  assert.equal(f.messages.length, 2);
  assert.deepEqual(
    { source: f.messages[0].source, method: f.messages[0].method, params: f.messages[0].params, origin: f.messages[0].origin },
    { source: 'nexiawallet-provider', method: 'personal_sign', params: ['0xdead', '0xbeef'], origin: 'https://app.uniswap.org' },
  );
  assert.equal(f.messages[1].origin, 'https://autre-site.example');
  assert.deepEqual(f.messages[1].params, []);
  assert.notEqual(f.messages[0].id, f.messages[1].id);
});

test('reponse de l\'app : resolution, refus, identifiant inconnu ou deja traite ignore', async () => {
  const f = fausseFenetre();
  injecter(f);
  const ok = f.window.ethereum.request({ method: 'eth_chainId' });
  const ko = f.window.ethereum.request({ method: 'eth_sendTransaction', params: [{}] });
  const [m1, m2] = f.messages;
  f.window.__nexiaRespond(999, null, 'ignore');
  f.window.__nexiaRespond(m1.id, null, '0x1');
  f.window.__nexiaRespond(m1.id, 'trop tard', null);
  f.window.__nexiaRespond(m2.id, "Refusé par l'utilisateur.", null);
  assert.equal(await ok, '0x1');
  await assert.rejects(ko, /Refusé par l'utilisateur/);
});

test('anciennes API enable / send / sendAsync passent par le meme canal', async () => {
  const f = fausseFenetre();
  injecter(f);
  f.window.ethereum.enable();
  f.window.ethereum.send('eth_chainId', []);
  let retour;
  f.window.ethereum.sendAsync({ id: 7, method: 'net_version', params: [] }, (err, res) => { retour = { err, res }; });
  assert.deepEqual(f.messages.map((m) => m.method), ['eth_requestAccounts', 'eth_chainId', 'net_version']);
  f.window.__nexiaRespond(f.messages[2].id, null, '1');
  await new Promise((r) => setImmediate(r));
  assert.equal(retour.err, null);
  assert.deepEqual(JSON.parse(JSON.stringify(retour.res)), { id: 7, jsonrpc: '2.0', result: '1' });
});

test('accountsChanged met a jour selectedAddress et previent les ecouteurs', () => {
  const f = fausseFenetre();
  injecter(f);
  const recus = [];
  const cb = (d) => recus.push(d);
  f.window.ethereum.on('accountsChanged', cb);
  f.window.__nexiaEmit('accountsChanged', ['0xabc']);
  assert.equal(f.window.ethereum.selectedAddress, '0xabc');
  f.window.ethereum.removeListener('accountsChanged', cb);
  f.window.__nexiaEmit('accountsChanged', []);
  assert.equal(f.window.ethereum.selectedAddress, null);
  assert.deepEqual(JSON.parse(JSON.stringify(recus)), [['0xabc']]);
});

test('EIP-6963 : NexiaWallet s\'annonce a l\'injection et sur demande', () => {
  const f = fausseFenetre();
  injecter(f);
  const annonces = () => f.evenements.filter((e) => e.type === 'eip6963:announceProvider');
  assert.equal(annonces().length, 1);
  assert.equal(annonces()[0].detail.info.rdns, 'fr.nexiawallet.app');
  assert.equal(annonces()[0].detail.provider, f.window.ethereum);
  f.window.dispatchEvent({ type: 'eip6963:requestProvider' });
  assert.equal(annonces().length, 2);
});

test('listes de methodes : eth_sign jamais relaye, aucune signature en "lecture seule"', () => {
  assert.equal(CONFIRMATION_METHODS.has('eth_sign'), false);
  assert.equal(READ_ONLY_METHODS.has('eth_sign'), false);
  for (const m of ['personal_sign', 'eth_signTypedData', 'eth_signTypedData_v4', 'eth_sendTransaction', 'eth_requestAccounts', 'wallet_switchEthereumChain']) {
    assert.ok(CONFIRMATION_METHODS.has(m), `${m} doit demander une confirmation`);
    assert.equal(READ_ONLY_METHODS.has(m), false, `${m} ne doit pas etre en lecture seule`);
  }
  for (const m of READ_ONLY_METHODS) assert.equal(CONFIRMATION_METHODS.has(m), false, m);
});
