'use strict';
// « Importer mes donnees » : rien de piege n'est enregistre (24/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { nettoyerImport } = require('../lib/donneesImport');

const estAdresse = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
const OK = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test('adresses recentes : seules les adresses valides passent, sans doublon, etiquette coupee, liste limitee', () => {
  const r = nettoyerImport({ recentAddresses: [
    { address: OK, label: 'Maman' },
    { address: OK.toLowerCase(), label: 'doublon' },
    { address: 12345 },
    { address: '0xpas-une-adresse' },
    null,
    { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', label: 'x'.repeat(500) },
  ] }, { estAdresse, maxRecentes: 8 });
  assert.equal(r.recentAddresses.length, 2);
  assert.equal(r.recentAddresses[0].label, 'Maman');
  assert.equal(r.recentAddresses[1].label.length, 40);
  const beaucoup = Array.from({ length: 20 }, (_, i) => ({ address: `0x${String(i).padStart(40, '0')}` }));
  assert.equal(nettoyerImport({ recentAddresses: beaucoup }, { estAdresse, maxRecentes: 8 }).recentAddresses.length, 8);
});

test('favoris et etiquettes : types verifies', () => {
  const r = nettoyerImport({ favorites: ['bitcoin', 3, { a: 1 }, 'bitcoin'], txTags: { '0xabc': 'Pro', '0xdef': '<script>', '0x1': 42 } }, { estAdresse });
  assert.deepEqual(r.favorites, ['bitcoin']);
  assert.deepEqual(r.txTags, { '0xabc': 'Pro' });
  assert.deepEqual(nettoyerImport(null, { estAdresse }), {});
  assert.equal(nettoyerImport({ txTags: [] }, { estAdresse }).txTags, undefined);
});

test('App.js : import passe par nettoyerImport ; libelle d export exact', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /const propre = nettoyerImport\(parsed,/);
  assert.doesNotMatch(app, /setRecentAddresses\(parsed\.recentAddresses\)/);
  assert.doesNotMatch(app, /Favoris, carnet d'adresses, alertes/);
});
