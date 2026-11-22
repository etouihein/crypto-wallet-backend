'use strict';
// crypto-wallet/test/revenue.http-timeout.test.js
// Suivi des revenus : chaque appel exterieur a un delai maximum
// (src/revenue/http.js), et tous les services l'utilisent (services.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// Serveur qui accepte la connexion puis ne repond jamais (ou seulement les en-tetes).
async function serveurMuet({ enTetesSeulement = false } = {}) {
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    if (enTetesSeulement) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"result":'); }
  });
  server.on('connection', (s) => { s.unref(); sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  // Si le delai venait a disparaitre, le test echoue sans bloquer toute la suite.
  server.unref();
  const url = `http://127.0.0.1:${server.address().port}/v1/cle-secrete-123`;
  const fermer = () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); });
  return { url, fermer };
}

// Garde-fou du test : si aucun delai ne coupe l'appel, on echoue au bout de 3 s
// (au lieu d'attendre indefiniment), et le serveur muet est quand meme ferme.
function auPlus(promesse, ms = 3000) {
  let t;
  const garde = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('aucun delai : l appel attend toujours')), ms); });
  return Promise.race([promesse, garde]).finally(() => clearTimeout(t));
}

test('fetchAvecDelai : un service muet echoue vite, sans afficher l adresse complete', { timeout: 10000 }, async () => {
  const { fetchAvecDelai } = require('../src/revenue/http');
  const srv = await serveurMuet();
  try {
    const debut = Date.now();
    await assert.rejects(auPlus(fetchAvecDelai(globalThis.fetch, 300)(srv.url)), (e) => {
      assert.match(e.message, /délai dépassé/);
      assert.match(e.message, /127\.0\.0\.1/);
      assert.doesNotMatch(e.message, /cle-secrete/);
      return true;
    });
    assert.ok(Date.now() - debut < 3000);
  } finally { await srv.fermer(); }
});

test('fetchAvecDelai : une reponse au compte-gouttes (corps jamais fini) echoue aussi', { timeout: 10000 }, async () => {
  const { fetchAvecDelai } = require('../src/revenue/http');
  const srv = await serveurMuet({ enTetesSeulement: true });
  try {
    const res = await auPlus(fetchAvecDelai(globalThis.fetch, 300)(srv.url, { method: 'POST' }));
    await assert.rejects(auPlus(res.json()), (e) => { assert.doesNotMatch(e.message, /aucun delai/); return true; });
  } finally { await srv.fermer(); }
});

test('fetchAvecDelai : un signal fourni par l appelant est respecte, la reponse passe telle quelle', async () => {
  const { fetchAvecDelai } = require('../src/revenue/http');
  const vus = [];
  const faux = async (url, opts) => { vus.push(opts); return { ok: true, status: 200 }; };
  const signal = new AbortController().signal;
  assert.equal((await fetchAvecDelai(faux, 1000)('https://x.test', { signal })).status, 200);
  assert.equal(vus[0].signal, signal);
  await fetchAvecDelai(faux, 1000)('https://x.test', { method: 'POST', headers: { a: 'b' } });
  assert.ok(vus[1].signal instanceof AbortSignal);
  assert.equal(vus[1].method, 'POST');
  assert.deepEqual(vus[1].headers, { a: 'b' });
  // Une autre erreur (ex. refus de connexion) n est pas deguisee en delai.
  const casse = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(fetchAvecDelai(casse, 1000)('https://x.test'), /fetch failed/);
});

test('services.js : RPC et LI.FI utilisent bien le delai maximum', { timeout: 15000 }, async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'revenus-delai-'));
  const ancien = process.env.REVENUE_DB_PATH;
  process.env.REVENUE_DB_PATH = path.join(dossier, 'revenue.db');
  // Delai raccourci pour le test : on remplace le module ./http avant que services.js le charge.
  const httpPath = require.resolve('../src/revenue/http');
  const vrai = require(httpPath);
  const appels = [];
  const srv = await serveurMuet();
  // Aucun appel au vrai Internet : toute adresse exterieure est redirigee vers le serveur muet.
  require.cache[httpPath].exports = { ...vrai, fetchAvecDelai: () => { const f = vrai.fetchAvecDelai(globalThis.fetch, 300); return (u, o) => { appels.push(String(u)); return f(srv.url, o); }; } };
  try {
    const { getRevenueServices } = require('../src/revenue/services');
    const s = getRevenueServices();
    await assert.rejects(auPlus(s.rpc.call(srv.url, 'eth_blockNumber')), /délai dépassé/);
    assert.ok(appels.includes(srv.url));
    const lifi = await auPlus(s.lifiFees.get());
    assert.match(String(lifi.error), /délai dépassé/);
    assert.ok(appels.some((u) => u.startsWith('https://li.quest/')));
  } finally {
    require.cache[httpPath].exports = vrai;
    await srv.fermer();
    if (ancien === undefined) delete process.env.REVENUE_DB_PATH; else process.env.REVENUE_DB_PATH = ancien;
  }
});
