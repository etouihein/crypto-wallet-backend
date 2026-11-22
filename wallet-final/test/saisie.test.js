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

test('montant MAX ecrit dans le champ : arrondi vers le bas, jamais "1e-7"', () => {
  const { montantVersTexte } = require('../lib/saisie');
  assert.equal(montantVersTexte(0.0000001, 8), '0.0000001');
  assert.equal(montantVersTexte(1.23456789123, 8), '1.23456789');
  assert.equal(montantVersTexte(0.999999999, 6), '0.999999', 'jamais arrondi au-dessus du solde');
  assert.equal(montantVersTexte(2, 9), '2');
  assert.equal(montantVersTexte(0.1 + 0.2, 8), '0.3');
  for (const v of [0, -1, NaN, undefined, 'abc']) assert.equal(montantVersTexte(v, 8), '0');
  assert.doesNotMatch(montantVersTexte(1e-9, 9), /e/);
});

test('montant de swap -> unites exactes du token, sans bruit de virgule flottante', () => {
  const { montantEnUnites } = require('../lib/saisie');
  // Avant : parseUnits(parseFloat('0.1').toFixed(18)) = 100000000000000006 (un peu plus que tape)
  assert.equal(montantEnUnites('0.1', 18), '100000000000000000');
  assert.equal(montantEnUnites('0.3', 18), '300000000000000000');
  assert.equal(montantEnUnites('1234.5678', 18), '1234567800000000000000');
  assert.equal(montantEnUnites('0,1', 18), '100000000000000000');
  assert.equal(montantEnUnites('1 000,5', 6), '1000500000');
  assert.equal(montantEnUnites('.5', 9), '500000000');
  assert.equal(montantEnUnites('2', 8), '200000000');
  // Decimales en trop : coupees, jamais arrondies vers le haut (USDC = 6 decimales)
  assert.equal(montantEnUnites('1.9999999', 6), '1999999');
  assert.equal(montantEnUnites('0.0000009', 6), '0');
  // Grand montant : pas de notation scientifique ni de perte de precision
  assert.equal(montantEnUnites('123456789012345678.123456789012345678', 18), '123456789012345678123456789012345678');
  for (const mauvais of ['', '.', 'abc', '1.2.3', '-1', '1e5', null, undefined]) {
    assert.throws(() => montantEnUnites(mauvais, 18), /Montant invalide/, String(mauvais));
  }
  assert.throws(() => montantEnUnites('1', -1), /Montant invalide/);
});

test('envoi : montant venant du mode euros ou des boutons 25/50/75 % accepte a la signature', () => {
  const { montantVersTexte, decimalesEnvoi } = require('../lib/saisie');
  const { parseAmountUnits } = require('../lib/wallet');
  const { ethers } = require('ethers');
  // Avant le 23/11/2026 l'app ecrivait String(nombre) : trop de decimales.
  const cas = [
    ['BTC', 50 / 0.92 / 91000, (t) => parseAmountUnits(t, 8)],
    ['BTC', 0.0000123 * 0.75, (t) => parseAmountUnits(t, 8)],
    ['SOL', 20 / 0.92 / 137.3, (t) => parseAmountUnits(t, 9)],
    ['USDC', 20 / 0.92 / 1, (t) => ethers.utils.parseUnits(t, 6)],
    ['USDT', 10.123457 * 0.25, (t) => ethers.utils.parseUnits(t, 6)],
    ['ETH', 1.1 * 0.75, (t) => ethers.utils.parseEther(t)],
    ['ETH', 0.00000012345 * 0.5, (t) => ethers.utils.parseEther(t)],
  ];
  for (const [jeton, valeur, signer] of cas) {
    const texte = montantVersTexte(valeur, decimalesEnvoi(jeton));
    assert.doesNotThrow(() => signer(texte), `${jeton} ${texte}`);
    assert.ok(Number(texte) <= valeur && Number(texte) > 0, `${jeton} ${texte} jamais au-dessus`);
  }
  // Le probleme d'origine existe bien : String() donne un texte refuse.
  assert.throws(() => parseAmountUnits(String(50 / 0.92 / 91000), 8));
  assert.throws(() => ethers.utils.parseUnits(String(10.123457 * 0.25), 6));
  assert.equal(decimalesEnvoi('BTC'), 8);
  assert.equal(decimalesEnvoi('SOL'), 9);
  assert.equal(decimalesEnvoi('USDC'), 6);
  assert.equal(decimalesEnvoi('BNB'), 18);
});

test("App.js : le mode euros et les boutons 25/50/75 % n'ecrivent plus String(nombre)", () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'App.js'), 'utf8');
  assert.doesNotMatch(src, /setSendAmount\(cryptoVal \? String\(cryptoVal\)/);
  assert.doesNotMatch(src, /setSendCryptoAmount\(String\(sendableBalance \* pct\)\)/);
  assert.match(src, /montantVersTexte\(cryptoVal, decimalesEnvoi\(sendToken\)\)/);
  assert.match(src, /montantVersTexte\(sendableBalance \* pct, decimalesEnvoi\(sendToken\)\)/);
});
