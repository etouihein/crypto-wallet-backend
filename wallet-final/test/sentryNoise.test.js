'use strict';
// wallet-final/test/sentryNoise.test.js : filtre du bruit envoye a Sentry
// (lib/sentryNoise.js). Le bruit reseau du SDK WalletConnect est ignore ;
// une vraie erreur de NOTRE code (avec une pile d'appels) n'est JAMAIS cachee.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isBenignThirdPartyNoise } = require('../lib/sentryNoise');

const evt = (value, frames) => ({ exception: { values: [{ type: 'Error', value, ...(frames ? { stacktrace: { frames } } : {}) }] } });

test('bruit reseau sans pile (forme relevee en ligne) : ignore', () => {
  assert.equal(isBenignThirdPartyNoise(evt('NetworkError: A network error occurred.')), true);
  assert.equal(isBenignThirdPartyNoise(evt('TypeError: Network request failed')), true);
  assert.equal(isBenignThirdPartyNoise(evt('Load failed')), true);
});

test('vraie erreur (avec pile, message different, plusieurs exceptions) : toujours envoyee', () => {
  assert.equal(isBenignThirdPartyNoise(evt('Network request failed', [{ filename: 'App.js', lineno: 10 }])), false);
  assert.equal(isBenignThirdPartyNoise(evt('Cannot read properties of undefined')), false);
  assert.equal(isBenignThirdPartyNoise({ exception: { values: [{ value: 'Load failed' }, { value: 'Load failed' }] } }), false);
});

test('evenement vide ou abime : jamais filtre, jamais de plantage', () => {
  for (const e of [null, undefined, {}, { exception: null }, { exception: { values: 'x' } }, { exception: { values: [null] } }]) {
    assert.equal(isBenignThirdPartyNoise(e), false);
  }
});
