'use strict';
// Import du carnet d'adresses : un fichier ne peut ni ajouter un 2e « Maman »
// avec une autre adresse, ni renommer un contact existant (24/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const memoire = new Map();
const chemin = require.resolve('@react-native-async-storage/async-storage');
require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: { __esModule: true, default: {
  getItem: async (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: async (k, v) => { memoire.set(k, String(v)); },
} } };
const p7 = require('../lib/phase7');

const MAMAN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ESCROC = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const AMI = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const base = [{ label: 'Maman', address: MAMAN, network: 'ethereum' }];

test('un 2e « Maman » avec une autre adresse est ignore (casse et espaces compris)', () => {
  const r = p7.importerContacts(base, [{ label: ' maman ', address: ESCROC, network: 'ethereum' }]);
  assert.equal(r.ajoutes, 0);
  assert.equal(r.ignores, 1);
  assert.deepEqual(r.liste.map((c) => c.address), [MAMAN]);
});

test('un contact existant n est pas renomme par l import', () => {
  const r = p7.importerContacts(base, [{ label: 'Binance', address: MAMAN.toLowerCase(), network: 'ethereum' }]);
  assert.equal(r.ignores, 1);
  assert.equal(r.liste[0].label, 'Maman');
});

test('nouveaux contacts valides ajoutes ; doublon dans le meme fichier ignore ; adresse invalide ignoree', () => {
  const r = p7.importerContacts(base, [
    { label: 'Ami', address: AMI, network: 'ethereum', favorite: true },
    { label: 'Ami', address: ESCROC, network: 'ethereum' },
    { label: 'Faux', address: '0x123', network: 'ethereum' },
    { label: 'Maman', address: MAMAN, network: 'ethereum' },
  ]);
  assert.equal(r.ajoutes, 1);
  assert.equal(r.ignores, 2);
  assert.equal(r.liste.find((c) => c.label === 'Ami').address, AMI);
  assert.equal(r.liste.find((c) => c.label === 'Ami').favorite, true);
});

test('App.js passe par importerContacts', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /phase7\.importerContacts\(addressBook, entries\)/);
});
