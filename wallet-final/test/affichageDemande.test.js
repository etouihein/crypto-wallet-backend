'use strict';
// Fenetre de signature : site demandeur affiche, montant illisible signale.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { siteDemandeur, montantNatifLisible } = require('../lib/affichageDemande');

const sessions = [
  { topic: 't1', peer: { metadata: { name: 'Uniswap', url: 'https://app.uniswap.org/swap' } } },
  { topic: 't2', peer: { metadata: { name: 'Uniswap', url: 'https://uniswap-airdrop.xyz' } } },
  { topic: 't3', peer: { metadata: { name: 'X', url: 'pas une url' } } },
];

test('site demandeur : le domaine reel est affiche, meme si le nom imite un autre site', () => {
  assert.deepEqual(siteDemandeur(sessions, 't1'), { connu: true, texte: 'app.uniswap.org (se présente comme « Uniswap »)' });
  assert.match(siteDemandeur(sessions, 't2').texte, /^uniswap-airdrop\.xyz /);
});

test('site inconnu ou URL illisible : dit clairement que le site est inconnu', () => {
  for (const [s, t] of [[sessions, 'absent'], [sessions, 't3'], [null, 't1'], [[{ topic: 't1' }], 't1']]) {
    const r = siteDemandeur(s, t);
    assert.equal(r.connu, false);
    assert.match(r.texte, /Site inconnu/);
  }
});

test("montant : lisible en ETH, et un montant illisible ne fait plus planter la fenetre", () => {
  assert.equal(montantNatifLisible('0xde0b6b3a7640000'), '1.0');
  assert.equal(montantNatifLisible(undefined), '0');
  assert.match(montantNatifLisible('abc'), /illisible/);
  assert.match(montantNatifLisible({ pas: 'un nombre' }), /illisible/);
});

test('App.js : la fenetre WalletConnect affiche le site, aucun formatEther brut sur tx.value', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(src, /siteDemandeur\(wcSessions, wcRequest\?\.topic\)/);
  assert.match(src, /Demandé par : \{site\.texte\}/);
  assert.doesNotMatch(src, /formatEther\(tx\.value\)/);
});
