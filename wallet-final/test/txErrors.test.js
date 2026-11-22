'use strict';
// wallet-final/test/txErrors.test.js
// ─────────────────────────────────────────────────────────────────
//  Messages d'erreur montres a l'utilisateur (lib/txErrors.js) : un vrai
//  utilisateur ne doit jamais voir un pave JSON ou "status code 503", et
//  les cas frequents (solde, transaction en cours, reseau) ont un message
//  clair. Utilise a 25 endroits de l'app (envoi, swap, pont, NFT...).
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { humanizeTxError } = require('../lib/txErrors');

test('rien a dire : null (l ecran garde son propre message)', () => {
  for (const e of [null, undefined, '', '   ', {}, { message: 42 }]) assert.equal(humanizeTxError(e), null);
});

test('solde insuffisant (montant + gas)', () => {
  assert.match(humanizeTxError(new Error('insufficient funds for intrinsic transaction cost')), /Solde insuffisant/);
});

test('transaction deja en cours (nonce)', () => {
  for (const m of ['nonce too low', 'already known', 'replacement transaction underpriced']) {
    assert.match(humanizeTxError(new Error(m)), /déjà en cours/, m);
  }
});

test('reseau qui ne repond pas', () => {
  for (const m of ['timeout of 20000ms exceeded', 'Network Error', 'network error', 'ECONNABORTED']) {
    assert.match(humanizeTxError(new Error(m)), /réseau ne répond pas/, m);
  }
});

test('serveur en panne ou surcharge (5xx, 429) : message rassurant, jamais "status code"', () => {
  const axios503 = Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } });
  assert.match(humanizeTxError(axios503), /Tes fonds ne sont pas concernés/);
  assert.match(humanizeTxError(new Error('Request failed with status code 429')), /ne répond pas pour le moment/);
});

test('erreur 4xx : l explication du serveur est montree telle quelle (si courte)', () => {
  const e = Object.assign(new Error('Request failed with status code 400'), { response: { status: 400, data: { error: '  Montant trop faible pour ce swap.  ' } } });
  assert.equal(humanizeTxError(e), 'Montant trop faible pour ce swap.');
  const long = Object.assign(new Error('Request failed with status code 400'), { response: { status: 400, data: { error: 'x'.repeat(250) } } });
  assert.equal(humanizeTxError(long), 'Request failed with status code 400');
});

test('pave JSON d ethers : on garde la phrase utile, jamais le JSON', () => {
  const dump = 'execution reverted: TRANSFER_FAILED [ See: https://links.ethers.org/v5-errors-CALL_EXCEPTION ] (error={"jsonrpc":"2.0","code":3})';
  assert.equal(humanizeTxError(new Error(dump)), 'execution reverted: TRANSFER_FAILED');
  assert.equal(humanizeTxError(new Error('processing response error (body="{\\"jsonrpc\\":\\"2.0\\"}")' + 'x'.repeat(250))), null);
});

test('nos propres messages metier passent tels quels', () => {
  assert.equal(humanizeTxError(new Error('Wallet verrouillé.')), 'Wallet verrouillé.');
  assert.equal(humanizeTxError('Réseau non supporté.'), 'Réseau non supporté.');
});
