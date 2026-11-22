'use strict';
// wallet-final/test/stakeRefs.test.js
// ─────────────────────────────────────────────────────────────────
//  Staking Solana : la reference d'un compte de stake tout juste cree ne
//  doit pas etre effacee parce que le reseau ne le voit pas encore (le
//  serveur repond avant la confirmation). Sinon le stake disparait de
//  l'app pour toujours (adresse non recalculable).
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { refsAGarder, DELAI_GRACE_MS } = require('../lib/stakeRefs');

const MAINTENANT = 1_800_000_000_000;
const A = 'Stake1111111111111111111111111111111111111A';
const B = 'Stake1111111111111111111111111111111111111B';

test('compte vu sur le reseau -> reference gardee, meme ancienne', () => {
  const refs = [{ stakePubkey: A, createdAt: MAINTENANT - 30 * 24 * 3600e3 }];
  assert.deepEqual(refsAGarder(refs, [A], MAINTENANT), refs);
});

test('stake cree il y a 2 secondes, pas encore confirme -> reference GARDEE', () => {
  const refs = [{ stakePubkey: A, createdAt: MAINTENANT - 2000 }];
  assert.deepEqual(refsAGarder(refs, [], MAINTENANT), refs);
});

test('compte introuvable depuis plus d\'une heure (ferme ou jamais cree) -> reference effacee', () => {
  const refs = [{ stakePubkey: A, createdAt: MAINTENANT - DELAI_GRACE_MS - 1 }, { stakePubkey: B, createdAt: MAINTENANT - 1000 }];
  assert.deepEqual(refsAGarder(refs, [], MAINTENANT).map(r => r.stakePubkey), [B]);
});

test('donnees abimees (liste absente, entree vide, date illisible) -> pas de plantage', () => {
  assert.deepEqual(refsAGarder(null, null, MAINTENANT), []);
  assert.deepEqual(refsAGarder([null, {}, { stakePubkey: A, createdAt: 'x' }], [], MAINTENANT), []);
  assert.equal(refsAGarder([{ stakePubkey: A, createdAt: 'x' }], [A], MAINTENANT).length, 1);
});

test('App.js : liste relue avec refsAGarder, reference enregistree AVANT la diffusion du stake', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(src, /const prunedRefs = refsAGarder\(refs, accounts\.map\(a => a\.stakePubkey\)\);/);
  const corps = src.slice(src.indexOf('const handleCreateStake = useCallback'), src.indexOf('const handleDeactivateStake = useCallback'));
  const sauvegarde = corps.indexOf('await saveStakeRefs(walletAddr');
  const diffusion = corps.indexOf('/tx/broadcast-solana');
  assert.ok(sauvegarde > 0 && diffusion > 0 && sauvegarde < diffusion, 'la reference doit etre enregistree avant la diffusion');
  assert.match(corps, /if \(!diffusionIncertaine\(e\)\) throw e;/);
  assert.match(corps, /NE RECOMMENCE PAS/);
});
