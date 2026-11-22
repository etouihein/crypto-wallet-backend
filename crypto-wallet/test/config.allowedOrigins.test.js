'use strict';

// Origines de confiance (src/config/allowedOrigins.js) : elles decident quel
// site peut appeler le serveur (CORS) et vers ou l'on renvoie apres un
// paiement Coinbase/MoonPay. En production, seuls les domaines NexiaWallet
// passent ; les pieges classiques (faux sous-domaine, suffixe, majuscules,
// port, http) sont refuses. NODE_ENV est lu a chaque appel.

const test = require('node:test');
const assert = require('node:assert/strict');
delete process.env.FRONTEND_URLS;
process.env.FRONTEND_URL = 'https://nexiawallet.com';
const { isTrustedOrigin, PRODUCTION_ORIGINS } = require('../src/config/allowedOrigins');

function enMode(mode, fn) {
  const avant = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  try { fn(); } finally { process.env.NODE_ENV = avant; }
}

test('production : les domaines NexiaWallet passent', () => {
  enMode('production', () => {
    for (const o of ['https://nexiawallet.com', 'https://www.nexiawallet.com', 'https://nexiawallet.fr', 'https://www.nexiawallet.fr', 'https://nexiawallet.pages.dev']) {
      assert.equal(isTrustedOrigin(o), true, o);
    }
    assert.ok(PRODUCTION_ORIGINS.includes('https://nexiawallet.com'));
  });
});

test('production : pieges refuses (faux sous-domaine, suffixe, http, port, local, tunnel)', () => {
  enMode('production', () => {
    for (const o of [
      'https://nexiawallet.com.evil.example', 'https://evil-nexiawallet.com', 'https://nexiawallet.com.', 'https://evilnexiawallet.com',
      'http://nexiawallet.com', 'https://nexiawallet.com:8443', 'https://NEXIAWALLET.COM.evil.example',
      'https://abc123.nexiawallet.pages.dev', 'http://localhost:8083', 'http://127.0.0.1:3000', 'http://192.168.1.10:8081',
      'https://abcd.exp.direct', 'null', '', undefined, 'https://nexiawallet.com/chemin',
    ]) {
      assert.equal(isTrustedOrigin(o), false, String(o));
    }
  });
});

test('developpement : le PC local et le tunnel Expo passent, un site quelconque non', () => {
  enMode('development', () => {
    assert.equal(isTrustedOrigin('http://localhost:8083'), true);
    assert.equal(isTrustedOrigin('http://192.168.1.10:8081'), true);
    assert.equal(isTrustedOrigin('https://abcd.exp.direct'), true);
    assert.equal(isTrustedOrigin('https://evil.example'), false);
    assert.equal(isTrustedOrigin('http://localhost'), false, 'sans port : pas le serveur de dev Expo');
  });
});
