'use strict';
// Montant d'une ligne de l'Activite (lib/montantActivite.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { montantActivite } = require('../lib/montantActivite');

test('poussiere et vrai zero ne s affichent plus tous les deux « 0.00000 »', () => {
  assert.equal(montantActivite('0'), '0');
  assert.equal(montantActivite('0.000001'), '<0.00001');
  assert.equal(montantActivite('0.002'), '0.00200');
  assert.equal(montantActivite('10535.416666'), '10535.41667');
  assert.equal(montantActivite('abc'), '?');
});

test('App.js utilise montantActivite pour les lignes de l Activite', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /\{isOut \? '-' : '\+'\}\{montantActivite\(item\.amount\)\}/);
  assert.doesNotMatch(app, /parseFloat\(item\.amount\)\.toFixed\(5\)/);
});
