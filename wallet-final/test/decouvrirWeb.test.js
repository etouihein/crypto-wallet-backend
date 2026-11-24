'use strict';
// Version web : toucher une dApp de « Decouvrir » ne doit plus mener a un
// ecran vide (constate en ligne le 24/11/2026) ; il propose d'ouvrir le site
// dans un onglet (lien http(s) verifie) et de coller un lien WalletConnect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const debut = app.indexOf("<Text style={st.modal_title}>Navigateur Web3</Text>");
const blocWeb = app.slice(debut, app.indexOf(') : (', debut));

test('ecran web du navigateur dApp : bouton ouvrir le site (lien verifie) et bouton WalletConnect', () => {
  assert.ok(debut > 0);
  assert.match(blocWeb, /ouvrirLienExterne\(dappCurrentUrl\)/);
  assert.match(blocWeb, /lienExterneSur\(dappCurrentUrl\)/);
  assert.match(blocWeb, /setShowWalletConnect\(true\)/);
});

test('Decouvrir ne promet plus le navigateur integre sur le web', () => {
  assert.match(app, /Platform\.OS === 'web'\s*\n\s*\? 'Sur le web, les dApps/);
});
