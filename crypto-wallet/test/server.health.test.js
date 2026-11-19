'use strict';

// Serveur complet (server.js) : route GET /health, route inconnue, en-tetes
// de securite, et reponses aux corps de requete invalides.
//
// La surveillance (Jarvis) interroge /health : si cette route disparait ou
// change de forme, l'alerte "serveur en panne" se declenche a tort.
//
// server.js ne demarre pas l'ecoute quand NEXIA_NO_LISTEN=1 (tests
// uniquement) : on lance alors l'app nous-memes sur un port libre.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NEXIA_NO_LISTEN = '1';
process.env.NODE_ENV = 'test';
const app = require('../server');

let serveur;
let base;

test.before(async () => {
  await new Promise((resolve) => { serveur = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

test.after(() => new Promise((resolve) => serveur.close(resolve)));

test('server.js exporte l application Express sans ouvrir de port', () => {
  assert.equal(typeof app, 'function');
  assert.equal(typeof app.listen, 'function');
});

test('GET /health repond 200 avec status OK et une date valide', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /application\/json/);
  const corps = await r.json();
  assert.equal(corps.status, 'OK');
  assert.ok(!Number.isNaN(Date.parse(corps.timestamp)), 'timestamp lisible');
});

test('GET / repond 200 (page de vie du serveur)', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'OK');
});

test('route inconnue : 404 en JSON, sans page HTML d Express', async () => {
  const r = await fetch(`${base}/cette-route-n-existe-pas`);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { success: false, error: 'Route inconnue.' });
});

test('en-tetes de securite presents (helmet), X-Powered-By absent', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.ok(r.headers.get('content-security-policy'), 'CSP presente');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('origine web non autorisee : 403 propre', async () => {
  const r = await fetch(`${base}/health`, { headers: { Origin: 'https://site-pirate.example' } });
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { success: false, error: 'Origine non autorisée.' });
});

test('JSON mal forme : 400 (erreur du client), pas 500, et aucun detail technique', async () => {
  const r = await fetch(`${base}/wallet/inexistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":',
  });
  assert.equal(r.status, 400);
  const corps = await r.json();
  assert.equal(corps.success, false);
  assert.doesNotMatch(JSON.stringify(corps), /Unexpected|SyntaxError|at /);
});

test('corps trop gros (> 100 Ko) : 413, pas 500', async () => {
  const r = await fetch(`${base}/wallet/inexistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x: 'a'.repeat(200 * 1024) }),
  });
  assert.equal(r.status, 413);
  assert.equal((await r.json()).success, false);
});

test('GET /health donne la version deployee (commit court) pour la surveillance', async () => {
  const avant = process.env.RAILWAY_GIT_COMMIT_SHA;
  try {
    process.env.RAILWAY_GIT_COMMIT_SHA = 'A9385EB0123456789abcdef0123456789abcdef0';
    let corps = await (await fetch(`${base}/health`)).json();
    assert.equal(corps.version, 'a9385eb');
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    corps = await (await fetch(`${base}/health`)).json();
    assert.equal(corps.version, 'inconnue');
    process.env.RAILWAY_GIT_COMMIT_SHA = '<script>';
    corps = await (await fetch(`${base}/health`)).json();
    assert.equal(corps.version, 'inconnue', 'jamais de valeur non hexadecimale renvoyee');
  } finally {
    if (avant === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
    else process.env.RAILWAY_GIT_COMMIT_SHA = avant;
  }
});
