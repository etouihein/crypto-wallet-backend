'use strict';
// wallet-final/test/swap.diffusion-incertaine.test.js
// ─────────────────────────────────────────────────────────────────
//  Echange (swap 0x et echange entre ecosystemes) signe, serveur muet :
//  la transaction est PEUT-ETRE partie. L'app ne doit pas afficher
//  « reessaie » (un second clic = un second echange) mais suivre la
//  transaction par son hash calcule sur l'appareil.
//  Meme principe que test/envoi.incertain.test.js pour les envois.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { diffusionIncertaine, humanizeTxError } = require('../lib/txErrors');

const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const corpsDe = (debut, fin) => {
  const i = src.indexOf(debut);
  const j = src.indexOf(fin, i + 1);
  assert.ok(i >= 0 && j > i, `bloc introuvable : ${debut}`);
  return src.slice(i, j);
};

test('le message d\'erreur generique d\'un delai depasse invite a recommencer (d\'ou ce garde-fou)', () => {
  const delai = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 25000ms exceeded' };
  assert.equal(diffusionIncertaine(delai), true);
  assert.match(humanizeTxError(delai), /réessaie/);
});

test('swap 0x : diffusion incertaine -> suivi par hash, pas de « reessaie »', () => {
  const corps = corpsDe('const executeZeroXFromQuote = async', 'const handleSwapConfirm = async');
  assert.match(corps, /if \(diffusionIncertaine\(e\)\) \{ alerteEchangeIncertain\(swapRawTx, network, confirm\); return; \}/);
});

test('echange entre ecosystemes : diffusion incertaine -> suivi par hash, pas de « reessaie »', () => {
  const corps = corpsDe('const executeCrossFromQuote = async', 'const fetchZeroXQuoteForConfirm = async');
  assert.match(corps, /if \(diffusionIncertaine\(e\)\) \{ alerteEchangeIncertain\(rawTx, /);
});

test('alerteEchangeIncertain calcule le hash localement et dit de ne pas recommencer', () => {
  const corps = corpsDe('const alerteEchangeIncertain = ', 'const executeCrossFromQuote = async');
  assert.match(corps, /localWallet\.hashLocalTransaction\(rawTx,/);
  assert.match(corps, /trackTransaction\(/);
  assert.match(corps, /NE RECOMMENCE PAS/);
});
