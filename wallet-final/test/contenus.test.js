'use strict';
// wallet-final/test/contenus.test.js : documents legaux et FAQ de l'accueil (lib/contenus.js).
// Ils sont affiches tels quels : aucun ne doit etre vide, et les points
// essentiels d'un wallet non-custodial doivent y rester.
const test = require('node:test');
const assert = require('node:assert/strict');
const { LEGAL_DOCS, LANDING_FAQ } = require('../lib/contenus');

test('documents legaux : les 4 pages existent, avec titre, date et texte', () => {
  assert.deepEqual(Object.keys(LEGAL_DOCS).sort(), ['about', 'cgu', 'mentions', 'privacy']);
  for (const [cle, doc] of Object.entries(LEGAL_DOCS)) {
    for (const champ of ['title', 'updated', 'body']) {
      assert.equal(typeof doc[champ], 'string', `${cle}.${champ}`);
      assert.ok(doc[champ].trim().length > 0, `${cle}.${champ} vide`);
    }
    assert.ok(doc.body.length > 200, `${cle} : texte trop court`);
  }
});

test('les points essentiels du non-custodial restent ecrits', () => {
  const tout = Object.values(LEGAL_DOCS).map((d) => d.body).join('\n').toLowerCase();
  assert.match(tout, /phrase de r[ée]cup[ée]ration/);
  assert.match(tout, /non-custodial/);
});

test('FAQ de l accueil : chaque question a sa reponse', () => {
  assert.ok(LANDING_FAQ.length >= 5);
  for (const item of LANDING_FAQ) {
    const valeurs = Object.values(item).filter((v) => typeof v === 'string');
    assert.ok(valeurs.length >= 2 && valeurs.every((v) => v.trim().length > 0), JSON.stringify(item).slice(0, 80));
  }
});
