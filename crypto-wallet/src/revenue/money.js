'use strict';

// Calculs monétaires exacts en BigInt. Jamais de flottant pour de l'argent :
// 0.1 + 0.2 !== 0.3 en JavaScript, et un montant de token à 18 décimales
// dépasse de loin la précision d'un Number.
//
// Représentation : chaîne décimale ("2313.45", "0.000123"). Les montants
// on-chain restent en unités brutes (chaîne d'entier) jusqu'au calcul.

const FIAT_SCALE = 8; // décimales conservées pour les valeurs en USD/EUR

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

// Convertit un prix renvoyé par une API (Number JSON, parfois en notation
// exponentielle comme 1.2e-7) en chaîne décimale sans perte visible.
function numberToDecimalString(n) {
  if (typeof n === 'string') {
    if (DECIMAL_RE.test(n)) return n;
    n = Number(n);
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`prix invalide : ${n}`);
  // toPrecision(15) garde les chiffres significatifs réels d'un double, puis on
  // développe l'éventuelle notation exponentielle à la main.
  const [mantissa, expPart] = n.toPrecision(15).split('e');
  const exp = expPart ? Number(expPart) : 0;
  const negative = mantissa.startsWith('-');
  const [intDigits, fracDigits = ''] = mantissa.replace('-', '').split('.');
  let digits = intDigits + fracDigits;
  let pointPos = intDigits.length + exp;
  if (pointPos <= 0) { digits = '0'.repeat(1 - pointPos) + digits; pointPos = 1; }
  if (pointPos > digits.length) digits = digits + '0'.repeat(pointPos - digits.length);
  let out = digits.slice(0, pointPos).replace(/^0+(?=\d)/, '') + (pointPos < digits.length ? '.' + digits.slice(pointPos) : '');
  if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return (negative && out !== '0' ? '-' : '') + out;
}

// "12.345" à l'échelle 6 -> 12345000n (troncature au-delà de l'échelle).
function toScaled(decimal, scale) {
  if (!DECIMAL_RE.test(decimal)) throw new Error(`décimal invalide : ${decimal}`);
  const negative = decimal.startsWith('-');
  const [i, f = ''] = decimal.replace('-', '').split('.');
  const scaled = BigInt(i + (f + '0'.repeat(scale)).slice(0, scale));
  return negative ? -scaled : scaled;
}

function fromScaled(value, scale) {
  const negative = value < 0n;
  const abs = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const intPart = abs.slice(0, abs.length - scale);
  const fracPart = scale ? abs.slice(abs.length - scale).replace(/0+$/, '') : '';
  return (negative ? '-' : '') + intPart + (fracPart ? '.' + fracPart : '');
}

// Division entière arrondie au plus proche (0,5 -> vers l'infini).
function divRound(numerator, denominator) {
  const q = numerator / denominator;
  const r = numerator % denominator;
  return 2n * (r < 0n ? -r : r) >= denominator ? q + (numerator < 0n ? -1n : 1n) : q;
}

// Montant brut on-chain -> chaîne décimale lisible ("1500000", 6 -> "1.5").
function formatUnits(amountRaw, decimals) {
  return fromScaled(BigInt(amountRaw), decimals);
}

// Valeur fiat d'un montant brut au prix donné, arrondie à FIAT_SCALE décimales.
function fiatValue(amountRaw, decimals, priceDecimal) {
  const PRICE_SCALE = 18;
  const numerator = BigInt(amountRaw) * toScaled(priceDecimal, PRICE_SCALE) * 10n ** BigInt(FIAT_SCALE);
  const denominator = 10n ** BigInt(decimals + PRICE_SCALE);
  return fromScaled(divRound(numerator, denominator), FIAT_SCALE);
}

// Somme exacte d'une liste de valeurs fiat (null/undefined ignorés).
function sumFiat(values) {
  let total = 0n;
  for (const v of values) if (v !== null && v !== undefined) total += toScaled(v, FIAT_SCALE);
  return fromScaled(total, FIAT_SCALE);
}

module.exports = { FIAT_SCALE, numberToDecimalString, toScaled, fromScaled, formatUnits, fiatValue, sumFiat };
