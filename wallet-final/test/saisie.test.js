'use strict';
// wallet-final/test/saisie.test.js : montants tapes au clavier et liens exterieurs (lib/saisie.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDecimalInput, lienExterneSur } = require('../lib/saisie');

test('montant : toutes les virgules et espaces normalises, lisible par parseFloat', () => {
  assert.equal(normalizeDecimalInput('12,5'), '12.5');
  assert.equal(normalizeDecimalInput('1 000,5'), '1000.5');
  assert.equal(normalizeDecimalInput('1 000,25'), '1000.25');
  assert.equal(normalizeDecimalInput('1 234,5'), '1234.5');
  assert.equal(normalizeDecimalInput(' 0,001 '), '0.001');
  assert.equal(normalizeDecimalInput('0.5'), '0.5');
  assert.equal(normalizeDecimalInput(''), '');
  assert.equal(normalizeDecimalInput(undefined), '');
  // "1,000,5" ne devient plus "1.000,5" (lu 1) : il devient "1.000.5", refuse au moment de signer
  assert.equal(normalizeDecimalInput('1,000,5'), '1.000.5');
  assert.equal(parseFloat(normalizeDecimalInput('1 000,5')), 1000.5);
});

test('liens exterieurs : seuls http(s) s ouvrent', () => {
  assert.equal(lienExterneSur('https://bitcoin.org'), 'https://bitcoin.org');
  assert.equal(lienExterneSur('  http://exemple.fr/a  '), 'http://exemple.fr/a');
  for (const mauvais of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'vbscript:x', '', null, 42, 'pas un lien']) {
    assert.equal(lienExterneSur(mauvais), '', String(mauvais));
  }
});
