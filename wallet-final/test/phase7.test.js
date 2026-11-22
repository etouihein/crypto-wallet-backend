'use strict';
// wallet-final/test/phase7.test.js
// ─────────────────────────────────────────────────────────────────
//  lib/phase7.js : carnet d'adresses (affiche "contact connu" a l'envoi),
//  verification d'allowance avant un swap, conversions de devises,
//  historique de solde, etiquettes. AsyncStorage remplace par un faux.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');

const memoire = new Map();
const chemin = require.resolve('@react-native-async-storage/async-storage');
require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: { __esModule: true, default: {
  getItem: async (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: async (k, v) => { memoire.set(k, String(v)); },
} } };

const p7 = require('../lib/phase7');

const A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const SOL = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';

test('carnet : ajout, doublon remplace (casse EVM ignoree), adresse invalide refusee', () => {
  let l = p7.addAddressBookEntry([], { label: ' Maman ', address: A, network: 'ethereum' });
  assert.deepEqual(l, [{ label: 'Maman', address: A, network: 'ethereum' }]);
  l = p7.addAddressBookEntry(l, { label: 'Maman 2', address: A.toLowerCase(), network: 'ethereum' });
  assert.equal(l.length, 1);
  assert.equal(l[0].label, 'Maman 2');
  assert.equal(p7.addAddressBookEntry(l, { label: 'X', address: '0x123', network: 'ethereum' }), l);
  assert.equal(p7.addAddressBookEntry(l, { label: '  ', address: B, network: 'ethereum' }), l);
  assert.equal(p7.addAddressBookEntry(l, { label: 'Y', address: B, network: 'polygon' }).length, 2, 'meme adresse, autre reseau = autre contact');
});

test('carnet : recherche et suppression (EVM insensible a la casse, Solana exact)', () => {
  let l = p7.addAddressBookEntry([], { label: 'Moi', address: A, network: 'ethereum' });
  l = p7.addAddressBookEntry(l, { label: 'Sol', address: SOL, network: 'solana' });
  assert.equal(p7.findAddressBookEntry(l, A.toLowerCase(), 'ethereum').label, 'Moi');
  assert.equal(p7.findAddressBookEntry(l, A, 'polygon'), null);
  assert.equal(p7.findAddressBookEntry(l, SOL, 'solana').label, 'Sol');
  assert.equal(p7.findAddressBookEntry(l, SOL.toLowerCase(), 'solana'), null);
  assert.deepEqual(p7.removeAddressBookEntry(l, A.toLowerCase(), 'ethereum').map((e) => e.label), ['Sol']);
});

test('carnet abime (entree null, texte, objet sans adresse) : rien ne plante, les bonnes entrees restent', () => {
  const abime = [null, 'texte', 42, { label: 'sans adresse' }, { label: 'Moi', address: A, network: 'ethereum' }];
  assert.equal(p7.findAddressBookEntry(abime, A, 'ethereum').label, 'Moi');
  assert.equal(p7.findAddressBookEntry(abime, B, 'ethereum'), null);
  assert.deepEqual(p7.removeAddressBookEntry(abime, A, 'ethereum').filter((e) => e && e.address), []);
  const ajout = p7.addAddressBookEntry(abime, { label: 'B', address: B, network: 'ethereum' });
  assert.equal(p7.findAddressBookEntry(ajout, B, 'ethereum').label, 'B');
});

test('carnet : stockage aller-retour, stockage abime = liste vide', async () => {
  memoire.clear();
  assert.deepEqual(await p7.loadAddressBook(), []);
  await p7.saveAddressBook([{ label: 'Moi', address: A, network: 'ethereum' }]);
  assert.equal((await p7.loadAddressBook())[0].label, 'Moi');
  memoire.set('wallet-pro-address-book-v1', '{abime');
  assert.deepEqual(await p7.loadAddressBook(), []);
  memoire.set('wallet-pro-address-book-v1', '{"pas":"une liste"}');
  assert.deepEqual(await p7.loadAddressBook(), []);
});

test('allowance avant swap : suffisante, insuffisante, illimitee, inconnue', () => {
  assert.deepEqual(p7.checkAllowanceSufficient('100', '100'), { ok: true, unlimited: false, reason: 'suffisante' });
  assert.deepEqual(p7.checkAllowanceSufficient('99', '100'), { ok: false, unlimited: false, reason: 'insuffisante' });
  const max = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
  assert.deepEqual(p7.checkAllowanceSufficient(max, '1' + '0'.repeat(70)), { ok: true, unlimited: true, reason: 'illimitee' });
  assert.equal(p7.checkAllowanceSufficient(null, '1').reason, 'allowance-inconnue');
  assert.equal(p7.checkAllowanceSufficient('abc', '1').reason, 'montant-invalide');
});

test('scan d allowances : une lecture ratee n arrete pas le scan, adresses invalides ignorees', async () => {
  const r = await p7.scanAllowances({ provider: null, owner: A, checks: [{ tokenAddress: B, spender: A, symbol: 'USDC' }, null] });
  assert.equal(r.length, 2);
  assert.equal(r[0].ok, false);
  assert.equal(r[1].symbol, '?');
});

test('devises : conversions exactes, et null (jamais une valeur inventee) si un taux manque', () => {
  const fx = { EUR: 0.9, CHF: 0.8 };
  assert.equal(p7.convertUsdToFiat(10, 'EUR', fx), 9);
  assert.equal(p7.convertUsdToFiat(10, 'USD', fx), 10);
  assert.equal(p7.convertUsdToFiat(10, 'EUR', {}), null);
  assert.equal(p7.convertUsdToFiat(10, 'GBP', fx), null);
  assert.equal(p7.convertFiatToUsd(9, 'EUR', fx), 10);
  assert.equal(p7.convertFiatToUsd(9, 'EUR', { EUR: 0 }), null);
  assert.equal(p7.convertFiatToCrypto(90, 'EUR', 50, fx), 2);
  assert.equal(p7.convertCryptoToFiat(2, 50, 'CHF', fx), 80);
  assert.equal(p7.formatFiat(10, 'XYZ', fx), null);
  assert.match(p7.formatFiat(10, 'EUR', fx), /9,00/);
});

test('historique de solde : dernier prix connu, pas de prix invente, variation en %', () => {
  const h = p7.computeBalanceHistory(
    [{ cgId: 'ethereum', amount: '2' }, { cgId: 'bitcoin', amount: 1 }, { cgId: '', amount: 5 }],
    { ethereum: [[2000, 110], [1000, 100]], bitcoin: [[2000, 50]] },
  );
  assert.deepEqual(h.map((x) => [x.t, x.totalUsd]), [[1000, 200], [2000, 270]]);
  assert.equal(h[0].perToken.bitcoin, undefined, 'bitcoin sans prix a t=1000 : ignore');
  assert.equal(p7.balanceHistoryChange(h), 35);
  assert.equal(p7.balanceHistoryChange([h[0]]), null);
});

test('etiquettes d historique : type connu, repli, et jamais une fonction ("toString")', () => {
  assert.equal(p7.historyLabel('swap'), 'Échange');
  assert.equal(p7.historyLabel('inconnu', 'Mon libelle'), 'Mon libelle');
  assert.equal(p7.historyLabel('inconnu'), 'Transaction');
  for (const piege of ['toString', 'constructor', '__proto__']) {
    assert.equal(typeof p7.historyLabel(piege), 'string', piege);
  }
});

test('gas : classement par reseau, jamais de blocage sur une valeur absurde', () => {
  assert.equal(p7.classifyGasPrice(10, 'ethereum'), 'normal');
  assert.equal(p7.classifyGasPrice(60, 'ethereum'), 'eleve');
  assert.equal(p7.classifyGasPrice(200, 'ethereum'), 'tres-eleve');
  assert.equal(p7.classifyGasPrice(2, 'base'), 'eleve');
  assert.equal(p7.classifyGasPrice(-1, 'ethereum'), null);
  assert.equal(p7.classifyGasPrice('abc', 'ethereum'), null);
  assert.equal(p7.classifyGasPrice(60, 'constructor'), 'eleve', 'reseau piege = seuil par defaut');
});
