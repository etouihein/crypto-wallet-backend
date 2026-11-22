'use strict';
// wallet-final/test/swap.psbt-btc.test.js
// ─────────────────────────────────────────────────────────────────
//  Echange BTC -> autre reseau (LI.FI) : le PSBT recu est controle AVANT
//  d'etre affiche puis signe (lib/swapSecurity.js).
//  Structure LI.FI : 1) montant vers l'adresse de depot du pont,
//  2) OP_RETURN (memo), 3) rendu de monnaie vers l'emetteur,
//  puis eventuelles commissions.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const bitcoin = require('bitcoinjs-lib');
const { decodeBitcoinPsbtOutputs, validateBitcoinPsbt } = require('../lib/swapSecurity');
const { getBitcoinAddress } = require('../lib/wallet');

// Phrase de test PUBLIQUE (jamais de vrais fonds).
const MOI = getBitcoinAddress('test test test test test test test test test test test junk');
const PONT = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const COMMISSION = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

function psbt({ entrees, sorties }) {
  const p = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  entrees.forEach((valeur, i) => p.addInput({
    hash: String(i + 1).padStart(64, '0'),
    index: 0,
    witnessUtxo: { script: bitcoin.address.toOutputScript(MOI, bitcoin.networks.bitcoin), value: BigInt(valeur) },
  }));
  for (const [adresse, valeur] of sorties) {
    if (adresse === 'MEMO') p.addOutput({ script: bitcoin.payments.embed({ data: [Buffer.from('=:ETH.ETH:0xabc')] }).output, value: 0n });
    else p.addOutput({ address: adresse, value: BigInt(valeur) });
  }
  return p.toHex();
}

test('PSBT normal : totaux, frais et montant sortant exacts, accepte', () => {
  const hex = psbt({ entrees: [60000, 40000], sorties: [[PONT, 50000], ['MEMO', 0], [MOI, 45000], [COMMISSION, 125]] });
  const d = decodeBitcoinPsbtOutputs(hex, MOI);
  assert.equal(d.ok, true);
  assert.equal(d.totalOutSats, 95125, 'avant le 23/11/2026 : toujours 0');
  assert.equal(d.totalInSats, 100000);
  assert.equal(d.feeSats, 4875);
  assert.equal(d.sentToOthersSats, 50125);
  assert.equal(d.foreignInputs, 0);
  assert.equal(typeof d.outputs[0].valueSats, 'number');
  assert.deepEqual(validateBitcoinPsbt({ decoded: d, requestedSats: '50000' }), { ok: true, errors: [] });
});

test('PSBT qui fait sortir bien plus que le montant demande -> bloque', () => {
  const hex = psbt({ entrees: [100000], sorties: [[PONT, 90000], ['MEMO', 0], [MOI, 5000]] });
  const r = validateBitcoinPsbt({ decoded: decodeBitcoinPsbtOutputs(hex, MOI), requestedSats: '50000' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /90000 sats/);
});

test('rendu de monnaie envoye a un tiers (pas a moi) -> compte comme sortant -> bloque', () => {
  const hex = psbt({ entrees: [100000], sorties: [[PONT, 50000], ['MEMO', 0], [COMMISSION, 45000]] });
  assert.equal(validateBitcoinPsbt({ decoded: decodeBitcoinPsbtOutputs(hex, MOI), requestedSats: '50000' }).ok, false);
});

test('frais du reseau plus eleves que le montant echange -> bloque', () => {
  const hex = psbt({ entrees: [100000], sorties: [[PONT, 10000], ['MEMO', 0]] });
  const r = validateBitcoinPsbt({ decoded: decodeBitcoinPsbtOutputs(hex, MOI), requestedSats: '10000' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /Frais du réseau anormaux : 90000 sats/);
});

test('PSBT illisible ou montant demande absent -> bloque, sans planter', () => {
  assert.equal(validateBitcoinPsbt({ decoded: decodeBitcoinPsbtOutputs('zz', MOI), requestedSats: '1000' }).ok, false);
  assert.equal(validateBitcoinPsbt({ decoded: null, requestedSats: '1000' }).ok, false);
  const hex = psbt({ entrees: [100000], sorties: [[PONT, 50000], [MOI, 45000]] });
  assert.equal(validateBitcoinPsbt({ decoded: decodeBitcoinPsbtOutputs(hex, MOI), requestedSats: '' }).ok, false);
});

test('App.js : le PSBT est controle avant l affichage ET avant la signature', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'App.js'), 'utf8');
  assert.equal((src.match(/swapSecurity\.validateBitcoinPsbt\(/g) || []).length, 2);
  const exec = src.slice(src.indexOf('const executeCrossFromQuote = async'));
  assert.ok(exec.indexOf('validateBitcoinPsbt(') < exec.indexOf('signBitcoinSwapPsbt('), 'controle avant signature');
});
