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
const { refsAGarder, refsModifiees, DELAI_GRACE_MS, DELAI_ABSENCE_MS } = require('../lib/stakeRefs');

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

test("compte introuvable apres l'heure de grace : reference GARDEE, date de premiere absence notee", () => {
  const refs = [{ stakePubkey: A, createdAt: MAINTENANT - DELAI_GRACE_MS - 1 }, { stakePubkey: B, createdAt: MAINTENANT - 1000 }];
  const r = refsAGarder(refs, [], MAINTENANT);
  assert.deepEqual(r.map(x => x.stakePubkey), [A, B]);
  assert.equal(r[0].absentDepuis, MAINTENANT);
  assert.equal(refsModifiees(refs, r), true, 'a enregistrer');
});

test("noeud en retard un jour : le stake n'est JAMAIS oublie (avant : reference effacee au 1er releve)", () => {
  const ref = { stakePubkey: A, createdAt: MAINTENANT - 30 * 24 * 3600e3 };
  const jour1 = refsAGarder([ref], [], MAINTENANT); // le noeud ne le voit pas
  assert.equal(jour1.length, 1);
  const jour2 = refsAGarder(jour1, [A], MAINTENANT + 24 * 3600e3); // le revoit
  assert.deepEqual(jour2, [ref], 'absence oubliee');
});

test('introuvable a chaque releve pendant 7 jours (stake retire) : reference effacee', () => {
  const ref = { stakePubkey: A, createdAt: MAINTENANT - 30 * 24 * 3600e3, absentDepuis: MAINTENANT - DELAI_ABSENCE_MS + 1000 };
  assert.equal(refsAGarder([ref], [], MAINTENANT).length, 1, 'pas encore 7 jours');
  assert.equal(refsAGarder([ref], [], MAINTENANT + 2000).length, 0, '7 jours passes');
});

test('donnees abimees (liste absente, entree vide, date illisible) -> pas de plantage', () => {
  assert.deepEqual(refsAGarder(null, null, MAINTENANT), []);
  assert.deepEqual(refsAGarder([null, {}], [], MAINTENANT), []);
  assert.equal(refsAGarder([{ stakePubkey: A, createdAt: 'x' }], [], MAINTENANT)[0].absentDepuis, MAINTENANT, 'date illisible : gardee, absence notee');
  assert.equal(refsAGarder([{ stakePubkey: A, createdAt: 'x' }], [A], MAINTENANT).length, 1);
});

test('App.js : liste relue avec refsAGarder, reference enregistree AVANT la diffusion du stake', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(src, /const prunedRefs = refsAGarder\(refs, accounts\.map\(a => a\.stakePubkey\)\);\s*if \(refsModifiees\(refs, prunedRefs\)\) await saveStakeRefs/);
  const corps = src.slice(src.indexOf('const handleCreateStake = useCallback'), src.indexOf('const handleDeactivateStake = useCallback'));
  const sauvegarde = corps.indexOf('await saveStakeRefs(walletAddr');
  const diffusion = corps.indexOf('/tx/broadcast-solana');
  assert.ok(sauvegarde > 0 && diffusion > 0 && sauvegarde < diffusion, 'la reference doit etre enregistree avant la diffusion');
  assert.match(corps, /if \(!diffusionIncertaine\(e\)\) throw e;/);
  assert.match(corps, /NE RECOMMENCE PAS/);
});
