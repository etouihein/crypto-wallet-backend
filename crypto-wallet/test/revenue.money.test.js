'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { numberToDecimalString, toScaled, fromScaled, formatUnits, fiatValue, sumFiat } = require('../src/revenue/money');

test('formatUnits convertit un montant brut sans perte', () => {
  assert.equal(formatUnits('1500000', 6), '1.5');
  assert.equal(formatUnits('1', 18), '0.000000000000000001');
  assert.equal(formatUnits('0', 18), '0');
  assert.equal(formatUnits('123456789012345678901234567890', 18), '123456789012.34567890123456789');
});

test('fiatValue calcule la valeur exacte au prix donné', () => {
  assert.equal(fiatValue('1000000000000000000', 18, '2313.45'), '2313.45'); // 1 ETH
  assert.equal(fiatValue('1500000', 6, '0.9998'), '1.4997'); // 1,5 USDT
  assert.equal(fiatValue('7500000000000000', 18, '2313.45'), '17.350875'); // 0,0075 ETH = 0,75 % d'1 ETH
});

test('fiatValue arrondit au plus proche à 8 décimales', () => {
  assert.equal(fiatValue('1', 18, '1'), '0'); // 1e-18 $ -> 0
  assert.equal(fiatValue('5', 9, '1'), '0.00000001'); // 5e-9 -> arrondi vers le haut
  assert.equal(fiatValue('4', 9, '1'), '0'); // 4e-9 -> arrondi vers le bas
});

test("sumFiat additionne sans l'erreur des flottants et ignore les valeurs absentes", () => {
  assert.equal(0.1 + 0.2 === 0.3, false); // rappel du problème évité
  assert.equal(sumFiat(['0.1', '0.2']), '0.3');
  assert.equal(sumFiat(['10.5', null, undefined, '0.00000001']), '10.50000001');
  assert.equal(sumFiat([]), '0');
});

test('numberToDecimalString développe la notation exponentielle des prix API', () => {
  assert.equal(numberToDecimalString(2313.45), '2313.45');
  assert.equal(numberToDecimalString(1.2e-7), '0.00000012');
  assert.equal(numberToDecimalString(1e21), '1000000000000000000000');
  assert.equal(numberToDecimalString(0), '0');
  assert.equal(numberToDecimalString('0.9998'), '0.9998');
  assert.throws(() => numberToDecimalString(NaN));
});

test('toScaled / fromScaled sont réciproques, y compris en négatif', () => {
  assert.equal(toScaled('12.345', 6), 12345000n);
  assert.equal(fromScaled(12345000n, 6), '12.345');
  assert.equal(fromScaled(-1500n, 3), '-1.5');
  assert.throws(() => toScaled('1e5', 2));
});
