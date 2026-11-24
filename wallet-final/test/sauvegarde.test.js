'use strict';
// wallet-final/test/sauvegarde.test.js
// ─────────────────────────────────────────────────────────────────
//  Export du keystore (lib/sauvegarde.js) : le PIN est obligatoire.
//  Sans lui, quelqu'un qui tient le telephone deverrouille pourrait sortir
//  la cle et la phrase de recuperation avec sa propre phrase de passe.
//  Phrase de test PUBLIQUE : ne jamais y envoyer de vrais fonds.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const localWallet = require('../lib/wallet');
const { exporterKeystoreAvecPin } = require('../lib/sauvegarde');

const PHRASE = 'test test test test test test test test test test test junk';
const PIN = '482915';

let enregistre;
let adresse;
test.before(async () => {
  const w = localWallet.importLocalWallet(PHRASE, 'mnemonic');
  adresse = w.address;
  enregistre = await localWallet.encryptWalletKeystore(w, PIN);
});

test('sans le bon PIN : aucun export', async () => {
  await assert.rejects(
    exporterKeystoreAvecPin({ encryptedKeystore: enregistre, address: adresse, pin: '739164', passphrase: 'phrase-de-passe-longue' }),
    /PIN incorrect/,
  );
  await assert.rejects(
    exporterKeystoreAvecPin({ encryptedKeystore: enregistre, address: adresse, pin: '', passphrase: 'phrase-de-passe-longue' }),
    /PIN incorrect/,
  );
});

test('phrase de passe trop courte : refus', async () => {
  await assert.rejects(
    exporterKeystoreAvecPin({ encryptedKeystore: enregistre, address: adresse, pin: PIN, passphrase: 'court' }),
    /8 caract/,
  );
});

test('bon PIN : le fichier exporte se rouvre avec la phrase de passe et donne le meme wallet', async () => {
  const exporte = await exporterKeystoreAvecPin({ encryptedKeystore: enregistre, address: adresse, pin: PIN, passphrase: 'phrase-de-passe-longue' });
  const rouvert = await localWallet.decryptWalletKeystore(exporte, 'phrase-de-passe-longue');
  assert.equal(rouvert.address, adresse);
  assert.equal(rouvert.mnemonic, PHRASE);
  await assert.rejects(localWallet.decryptWalletKeystore(exporte, PIN)); // le PIN n'ouvre PAS le fichier exporte
});
