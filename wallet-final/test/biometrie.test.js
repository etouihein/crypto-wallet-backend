'use strict';
// Face ID / empreinte avec plusieurs comptes : chaque compte a son propre PIN
// memorise ; on n'essaie jamais le PIN d'un autre compte.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pinBiometriquePour, ajouterPinBiometrique, retirerPinBiometrique } = require('../lib/biometrie');

const A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const bloc = (debut, fin) => {
  const i = src.indexOf(debut);
  assert.ok(i >= 0, debut);
  const j = src.indexOf(fin, i);
  assert.ok(j > i, fin);
  return src.slice(i, j);
};

test('deux comptes, deux PIN : chacun retrouve le sien', () => {
  let v = ajouterPinBiometrique(null, A, '482915');
  v = ajouterPinBiometrique(v, B, '730264');
  assert.equal(pinBiometriquePour(v, A), '482915');
  assert.equal(pinBiometriquePour(v, B.toLowerCase()), '730264');
  assert.equal(pinBiometriquePour(v, '0x0000000000000000000000000000000000000001'), null);
});

test('supprimer un compte efface seulement son PIN', () => {
  let v = ajouterPinBiometrique(null, A, '482915');
  v = ajouterPinBiometrique(v, B, '730264');
  v = retirerPinBiometrique(v, B);
  assert.equal(pinBiometriquePour(v, B), null);
  assert.equal(pinBiometriquePour(v, A), '482915');
  assert.equal(retirerPinBiometrique(v, A), null);
});

test('ancien format (PIN seul) toujours accepte, valeur abimee ignoree', () => {
  assert.equal(pinBiometriquePour('482915', A), '482915');
  assert.equal(pinBiometriquePour('{pas du json', A), null);
  assert.equal(pinBiometriquePour(JSON.stringify({ v: 2, pins: { [A.toLowerCase()]: 'abc' } }), A), null);
  assert.equal(pinBiometriquePour(null, A), null);
  assert.equal(pinBiometriquePour(ajouterPinBiometrique(null, A, '482915'), ''), null);
});

test('App.js : Face ID lit le PIN du compte affiche, jamais un PIN commun', () => {
  const b = bloc('const handleBiometricUnlock = useCallback', '  const disableBiometric');
  assert.match(b, /loadBiometricPin\(walletSession\?\.address\)/);
  const enroll = bloc('const offerBiometricEnroll = useCallback', 'const handleBiometricUnlock');
  assert.match(enroll, /saveBiometricPin\(pin, address\)/);
  assert.match(src, /offerBiometricEnroll\(pin, pendingWalletForPin\.address\)/);
});

test('App.js : supprimer un compte oublie son PIN Face ID', () => {
  const b = bloc('const deleteAccount = useCallback', 'const addAccountGenerate');
  assert.match(b, /forgetBiometricPin\(target\.address\)/);
});
