'use strict';
// Bandeaux « Actu crypto en direct » : seulement des articles crypto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { actusCrypto } = require('../lib/actusCrypto');

test('les articles economie (Le Monde, BBC) ne sont pas dans le bandeau crypto', () => {
  const items = [
    { title: 'Ikea cherche la parade', category: 'economy' },
    { title: 'Bitcoin oversold', category: 'crypto' },
    { title: 'World Cup drove profits', category: 'economy' },
    { title: 'ancien format sans categorie' },
  ];
  assert.deepEqual(actusCrypto(items).map((i) => i.title), ['Bitcoin oversold', 'ancien format sans categorie']);
  assert.equal(actusCrypto(Array.from({ length: 30 }, () => ({ category: 'crypto' }))).length, 10);
  assert.deepEqual(actusCrypto(null), []);
});

test('App.js : les deux bandeaux (Accueil, Marche) passent par actusCrypto', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.equal((app.match(/\{actusCrypto\(newsItems\)\.map\(/g) || []).length, 2);
  assert.doesNotMatch(app, /newsItems\.slice\(0, 10\)\.map/);
});
