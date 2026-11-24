'use strict';
// Identite du wallet annoncee aux sites via WalletConnect : la vraie adresse
// du site, pas l'ancienne nexiawallet.pages.dev (constate en console le
// 24/11/2026 : « metadata.url differs from the actual page url »).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('WalletConnect annonce https://www.nexiawallet.com (url et icone)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'walletconnect.js'), 'utf8');
  const bloc = src.slice(src.indexOf('metadata: {'), src.indexOf('}).then('));
  assert.match(bloc, /url: 'https:\/\/www\.nexiawallet\.com'/);
  assert.match(bloc, /icons: \['https:\/\/www\.nexiawallet\.com\/favicon\.ico'\]/);
  assert.doesNotMatch(bloc, /pages\.dev/);
});
