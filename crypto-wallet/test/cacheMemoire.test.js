'use strict';

// Cache memoire des routes /wallet : avant le 24/11/2026 il ne retirait
// jamais rien (entrees expirees comprises) et la memoire du serveur montait
// a chaque nouvelle adresse ou crypto consultee.

const test = require('node:test');
const assert = require('node:assert/strict');
const { creerCache } = require('../src/cacheMemoire');

function horloge() {
  let t = 1_000_000;
  return { maintenant: () => t, avancer: (ms) => { t += ms; } };
}

test('une valeur fraiche est servie depuis le cache, sans recharger', async () => {
  const h = horloge();
  const cache = creerCache({ max: 10, maintenant: h.maintenant });
  let appels = 0;
  const charger = async () => { appels += 1; return { n: appels }; };
  assert.deepEqual(await cache.obtenir('a', 1000, charger), { n: 1 });
  h.avancer(999);
  assert.deepEqual(await cache.obtenir('a', 1000, charger), { n: 1 });
  assert.equal(appels, 1);
  h.avancer(1);
  assert.deepEqual(await cache.obtenir('a', 1000, charger), { n: 2 }, 'expiree : rechargee');
});

test('la taille ne depasse jamais le maximum, les plus anciennes partent', async () => {
  const cache = creerCache({ max: 50 });
  for (let i = 0; i < 5000; i += 1) await cache.obtenir(`adresse-${i}`, 60_000, async () => i);
  assert.equal(cache.taille(), 50);
  assert.equal(cache.lire('adresse-0'), undefined, 'la plus ancienne est partie');
  assert.equal(cache.lire('adresse-4999').data, 4999, 'la plus recente est gardee');
});

test('les entrees expirees sont retirees avant les entrees encore valables', async () => {
  const h = horloge();
  const cache = creerCache({ max: 3, maintenant: h.maintenant });
  cache.ecrire('longue', 'L', 60_000); // la plus ancienne, mais valable
  cache.ecrire('courte1', 'c1', 10);
  cache.ecrire('courte2', 'c2', 10);
  h.avancer(20);
  cache.ecrire('nouvelle', 'N', 60_000);
  assert.equal(cache.taille(), 2);
  assert.equal(cache.lire('longue').data, 'L');
  assert.equal(cache.lire('nouvelle').data, 'N');
});

test('un chargement qui echoue ne met rien en cache', async () => {
  const cache = creerCache({ max: 10 });
  await assert.rejects(cache.obtenir('x', 1000, async () => { throw new Error('panne'); }), /panne/);
  assert.equal(cache.taille(), 0);
  assert.equal(await cache.obtenir('x', 1000, async () => 'ok'), 'ok');
});

test('les routes /wallet utilisent ce cache borne (plus de Map sans limite)', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'wallet.js'), 'utf8');
  assert.match(source, /const geckoCache = creerCache\(\{ max: \d+ \}\)/);
  assert.doesNotMatch(source, /geckoCache\.set\(/);
});
