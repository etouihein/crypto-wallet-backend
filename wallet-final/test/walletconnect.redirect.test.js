'use strict';
// wallet-final/test/walletconnect.redirect.test.js
// ─────────────────────────────────────────────────────────────────
//  Apres une connexion ou une signature WalletConnect, l'app ouvre l'adresse
//  de "retour" que la dApp annonce elle-meme (metadata.redirect). Une dApp
//  malveillante ne doit jamais pouvoir faire ouvrir "javascript:..." (code
//  execute sur nexiawallet.com dans la version web), "data:", "file:"...
//  Sur le web : https seulement ; sur mobile : aussi le lien vers l'app de la
//  dApp (ex. "uniswap://"). WalletConnect et React Native sont simules.
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');

const ouverts = [];
const plateforme = { OS: 'web' };
function remplacer(nom, exportsFaux) {
  const chemin = require.resolve(nom);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: exportsFaux };
}
remplacer('@walletconnect/core', { Core: function Core() {} });
remplacer('@reown/walletkit', { WalletKit: { init: async () => ({
  approveSession: async () => ({ topic: 't' }),
  respondSessionRequest: async () => {},
  getActiveSessions: () => ({ t: { peer: { metadata: global.__metaPeer } } }),
}) } });
remplacer('@walletconnect/utils', { buildApprovedNamespaces: () => ({}) });
remplacer('react-native', { Linking: { openURL: async (u) => { ouverts.push(u); } }, Platform: plateforme });
remplacer(require.resolve('../lib/wallet'), { getProvider: () => ({}) });

const wc = require('../lib/walletconnect');
const ADRESSE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const proposition = (redirect) => ({ id: 1, params: { proposer: { metadata: { name: 'dApp', redirect } } } });

async function retourOuvert(redirect) {
  ouverts.length = 0;
  await wc.approveSessionProposal(proposition(redirect), ADRESSE);
  await new Promise((r) => setImmediate(r));
  return ouverts.slice();
}

test('web : seul un retour https est ouvert', async () => {
  plateforme.OS = 'web';
  assert.deepEqual(await retourOuvert({ universal: 'https://app.uniswap.org' }), ['https://app.uniswap.org']);
  for (const piege of ['javascript:alert(document.cookie)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'uniswap://', 'http://app.uniswap.org']) {
    assert.deepEqual(await retourOuvert({ native: piege }), [], piege);
  }
});

test('mobile : lien vers l app de la dApp permis, jamais javascript:/data:/file:', async () => {
  plateforme.OS = 'ios';
  assert.deepEqual(await retourOuvert({ native: 'uniswap://' }), ['uniswap://']);
  assert.deepEqual(await retourOuvert({ universal: 'https://app.uniswap.org' }), ['https://app.uniswap.org']);
  for (const piege of ['javascript:alert(1)', 'data:text/html,x', 'file:///x', 'vbscript:x', 'blob:https://x/1', 'about:blank', 'pas un lien']) {
    assert.deepEqual(await retourOuvert({ native: piege }), [], piege);
  }
  plateforme.OS = 'web';
});

test('sans retour annonce : rien n est ouvert, la connexion reussit', async () => {
  assert.deepEqual(await retourOuvert(undefined), []);
});
