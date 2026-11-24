'use strict';
// wallet-final/test/pont.diffusion-incertaine.test.js
// ─────────────────────────────────────────────────────────────────
//  Pont (LI.FI, ETH entre Ethereum / Arbitrum / Optimism / Base) signe,
//  serveur muet : le pont est PEUT-ETRE parti. L'app ne doit pas afficher
//  « reessaie » (un second clic = un second pont) mais suivre la
//  transaction par son hash calcule sur l'appareil.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { diffusionIncertaine, humanizeTxError } = require('../lib/txErrors');

const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const debut = src.indexOf('const handleExecuteBridge = async');
const corps = debut < 0 ? '' : src.slice(debut, src.indexOf('// Résolution ENS', debut));

test('delai depasse : le message generique invite a recommencer (d\'ou ce garde-fou)', () => {
  const delai = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 25000ms exceeded' };
  assert.equal(diffusionIncertaine(delai), true);
  assert.match(humanizeTxError(delai), /réessaie/);
});

test('pont : diffusion incertaine -> suivi par hash et « NE RECOMMENCE PAS »', () => {
  assert.ok(corps.length > 100, 'handleExecuteBridge introuvable');
  assert.match(corps, /if \(!diffusionIncertaine\(e\)\) throw e;/);
  assert.match(corps, /localWallet\.hashLocalTransaction\(rawTx, 'evm'\)/);
  assert.match(corps, /NE RECOMMENCE PAS/);
});

test('pont : la diffusion incertaine est traitee AVANT le message d\'erreur generique', () => {
  const garde = corps.indexOf('diffusionIncertaine(e)');
  const generique = corps.indexOf("setBridgeError(humanizeTxError(err)");
  assert.ok(garde > 0 && generique > garde);
});
