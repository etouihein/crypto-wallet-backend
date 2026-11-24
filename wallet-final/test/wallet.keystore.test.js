'use strict';
// wallet-final/test/wallet.keystore.test.js
// ─────────────────────────────────────────────────────────────────
//  Chiffrement du wallet par le PIN (lib/wallet.js) : ce qui est chiffre
//  doit se rouvrir avec le meme PIN et donner EXACTEMENT le meme compte.
//  Cas vise : import d'un keystore du compte n°2 d'une phrase
//  (m/44'/60'/0'/0/1). Avant le 24/11/2026, le PIN chiffrait le compte n°1 :
//  le wallet ne se deverrouillait plus jamais ("Code incorrect").
//  Phrase de test PUBLIQUE : ne jamais y envoyer de vrais fonds.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const localWallet = require('../lib/wallet');

const PHRASE = 'test test test test test test test test test test test junk';
const RAPIDE = { scrypt: { N: 1024 } }; // keystore "exterieur" : chiffrement rapide pour le test

test('keystore importe du compte n°2 : le PIN rouvre bien le compte n°2', async () => {
  const source = ethers.Wallet.fromMnemonic(PHRASE, "m/44'/60'/0'/0/1");
  const exterieur = await source.encrypt('mot-de-passe-test', RAPIDE);

  const importe = await localWallet.decryptWalletKeystore(exterieur, 'mot-de-passe-test');
  assert.equal(importe.address, source.address);

  const chiffre = await localWallet.encryptWalletKeystore(importe, '482915');
  const rouvert = await localWallet.decryptWalletKeystore(chiffre, '482915');
  assert.equal(rouvert.address, source.address, 'le PIN doit rouvrir le compte importe, pas le compte n°1');
  assert.equal(rouvert.privateKey, source.privateKey);
  assert.equal(rouvert.mnemonic, PHRASE);
});

test('wallet cree ou importe par la phrase (compte n°1) : inchange', async () => {
  const w = localWallet.importLocalWallet(PHRASE, 'mnemonic');
  const chiffre = await localWallet.encryptWalletKeystore(w, '482915');
  const rouvert = await localWallet.decryptWalletKeystore(chiffre, '482915');
  assert.equal(rouvert.address, w.address);
  assert.equal(rouvert.mnemonic, PHRASE);
});

test('phrase et cle qui ne vont pas ensemble : refus, jamais un keystore qui ne se rouvrirait pas', async () => {
  const autre = ethers.Wallet.fromMnemonic(PHRASE, "m/44'/60'/0'/0/5");
  await assert.rejects(
    localWallet.encryptWalletKeystore({ privateKey: autre.privateKey, mnemonic: PHRASE }, '482915'),
    /ne correspond pas/,
  );
});
