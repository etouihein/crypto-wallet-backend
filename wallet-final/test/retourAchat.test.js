'use strict';

// Retour d'achat par carte : seuls les statuts connus affichent un message.
// Un lien piege ne doit jamais faire afficher son propre texte par le wallet.

const test = require('node:test');
const assert = require('node:assert/strict');
const { messageRetourAchat } = require('../lib/retourAchat');

test('statuts connus : message du wallet, verification du solde si achat reussi ou en cours', () => {
  const ok = messageRetourAchat('?transactionStatus=completed&transactionId=abc');
  assert.equal(ok.titre, '✅ Achat confirmé');
  assert.equal(ok.verifierSolde, true);
  assert.equal(messageRetourAchat('?transactionStatus=pending').verifierSolde, true);
  const ko = messageRetourAchat('?transactionStatus=failed');
  assert.equal(ko.titre, '❌ Achat échoué');
  assert.equal(ko.verifierSolde, false);
  assert.equal(messageRetourAchat('?transactionStatus=COMPLETED').titre, '✅ Achat confirmé');
});

test('lien piege : le texte de l escroc n est JAMAIS affiche', () => {
  const piege = 'Wallet compromis ! Envoie tous tes fonds a 0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC';
  for (const statut of [piege, 'toString', '__proto__', 'constructor', '', ' ']) {
    const r = messageRetourAchat(`?transactionStatus=${encodeURIComponent(statut)}`);
    assert.ok(r, statut);
    assert.equal(r.titre, null, statut);
    assert.equal(r.message, null, statut);
    assert.equal(r.verifierSolde, false, statut);
    assert.equal(r.nettoyerAdresse, true, statut);
    assert.doesNotMatch(JSON.stringify(r), /compromis|0xFD74/);
  }
});

test('mode demo et page normale', () => {
  assert.equal(messageRetourAchat('?payment=demo').titre, '✅ Achat (mode démo)');
  assert.equal(messageRetourAchat(''), null);
  assert.equal(messageRetourAchat('?ref=abc'), null);
  assert.equal(messageRetourAchat(undefined), null);
});
