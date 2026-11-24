'use strict';
// Constats du test en vrai du site (24/11/2026) :
// - sur ordinateur, taper le PIN au clavier ne faisait rien ;
// - « Phase 6 / Phase 7 » (vocabulaire interne) s'affichaient dans Parametres ;
// - « Wallet cree le » affichait la date d'IMPORT pour un wallet importe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('PIN : les chiffres et Retour arriere du clavier sont pris en compte sur le web', () => {
  const debut = app.indexOf('const pinClavierActif');
  assert.ok(debut > 0, 'effet clavier present');
  const bloc = app.slice(debut, debut + 1200);
  assert.match(bloc, /Platform\.OS === 'web'/);
  assert.match(bloc, /window\.addEventListener\('keydown'/);
  assert.match(bloc, /handlePinRef\.current\(e\.key\)/);
  assert.match(bloc, /'Backspace'/);
  assert.match(bloc, /removeEventListener\('keydown'/);
  // l'effet est declare avant le premier ecran (regle des hooks React)
  assert.ok(debut < app.indexOf('if (!sessionLoaded) {'));
});

test('aucun « Phase N » visible par l utilisateur dans les textes affiches', () => {
  assert.doesNotMatch(app, /Centre de sécurité — Phase/);
  assert.doesNotMatch(app, /refusés à la création \(Phase/);
});

test('Stats : libelle juste pour un wallet importe', () => {
  assert.match(app, />Sur cet appareil depuis le</);
});
