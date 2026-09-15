'use strict';

// Page d'administration, testée sur un vrai serveur Express et une vraie base
// SQLite (en mémoire), avec des soldes / prix / indexeur simulés.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { openRevenueDb } = require('../src/revenue/db');
const { createAdminRouter, mountAdminFromEnv } = require('../src/admin/router');
const { hashPassword } = require('../src/admin/auth');
const { NATIVE_TOKEN } = require('../src/revenue/chains');

const ADMIN_PATH = '/Xy7_aB3kLm9QpR2sTu';
const PASSWORD = 'mot-de-passe-de-test-solide';
const PASSWORD_HASH = hashPassword(PASSWORD);

async function startAdmin({ loginMax = 5, globalLoginMax = 20, seed } = {}) {
  const db = openRevenueDb(':memory:');
  if (seed) seed(db);
  const calls = { runOnce: 0 };
  const services = {
    db,
    feeAddress: '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC',
    pricing: { currentPrices: async (ids) => Object.fromEntries(ids.map((id) => [id, { usd: '2000', eur: '1800' }])) },
    balances: { get: async () => ({ fetchedAt: Date.now(), chains: [{ chainId: 1, name: 'Ethereum', error: null, lines: [{ token: NATIVE_TOKEN, symbol: 'ETH', decimals: 18, raw: '0', amount: '0', usd: '0', eur: '0' }] }] }) },
    lifiFees: { get: async () => ({ integratorId: 'nexiawallet', feeBalances: [], error: null }) },
    indexer: { runOnce: async () => { calls.runOnce += 1; return { status: 'ok' }; } },
  };
  const app = express();
  app.use(ADMIN_PATH, createAdminRouter({ passwordHash: PASSWORD_HASH, getServices: () => services, loginMax, globalLoginMax }));
  app.use((req, res) => res.status(404).json({ success: false, error: 'Route inconnue.' }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = 'GET', cookie, body, withOrigin = true, headers = {} } = {}) => fetch(`${origin}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(withOrigin && method !== 'GET' ? { origin } : {}),
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...headers,
    },
    body,
  });
  const login = async (password = PASSWORD) => request(`${ADMIN_PATH}/login`, { method: 'POST', body: `password=${encodeURIComponent(password)}` });
  const loggedInCookie = async () => {
    const res = await login();
    assert.equal(res.status, 303);
    return res.headers.get('set-cookie').split(';')[0];
  };
  const close = () => new Promise((r) => server.close(r));
  return { db, calls, request, login, loggedInCookie, close, origin };
}

test("sans configuration complète et saine, la page n'existe pas", () => {
  const warnings = [];
  const logger = { warn: (m) => warnings.push(m), log() {} };
  assert.equal(mountAdminFromEnv(express(), { env: {}, logger }), false);
  assert.equal(mountAdminFromEnv(express(), { env: { ADMIN_PATH: '/admin', ADMIN_PASSWORD_HASH: PASSWORD_HASH }, logger }), false);
  assert.equal(mountAdminFromEnv(express(), { env: { ADMIN_PATH, ADMIN_PASSWORD_HASH: 'x' }, logger }), false);
  assert.equal(warnings.length, 2);
  assert.equal(mountAdminFromEnv(express(), { env: { ADMIN_PATH, ADMIN_PASSWORD_HASH: PASSWORD_HASH }, logger }), true);
});

test('non connecté : redirection vers la connexion, en-têtes de protection partout', async () => {
  const a = await startAdmin();
  try {
    const res = await a.request(`${ADMIN_PATH}/`);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `${ADMIN_PATH}/login`);
    for (const r of [res, await a.request(`${ADMIN_PATH}/login`)]) {
      assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
      assert.equal(r.headers.get('cache-control'), 'no-store');
      assert.equal(r.headers.get('x-frame-options'), 'DENY');
      assert.match(r.headers.get('content-security-policy'), /default-src 'none'.*frame-ancestors 'none'/);
    }
    const page = await (await a.request(`${ADMIN_PATH}/login`)).text();
    assert.ok(page.includes('name="robots" content="noindex'));
    assert.ok(!/<script/i.test(page), 'aucun script dans la page');
    assert.equal((await a.request(`${ADMIN_PATH}/export.csv`)).status, 303);
    assert.equal((await a.request(`${ADMIN_PATH}/backup.db`)).status, 303);
  } finally { await a.close(); }
});

test('connexion : origine exigée, mauvais mot de passe refusé, cookie de session sûr', async () => {
  const a = await startAdmin();
  try {
    const noOrigin = await a.request(`${ADMIN_PATH}/login`, { method: 'POST', body: `password=${PASSWORD}`, withOrigin: false });
    assert.equal(noOrigin.status, 403);
    assert.equal((await a.login('mauvais-mot-de-passe')).status, 401);
    const ok = await a.login();
    assert.equal(ok.status, 303);
    const cookie = ok.headers.get('set-cookie');
    for (const flag of ['__Host-nw_admin=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(flag), flag);
  } finally { await a.close(); }
});

// Régression : la page annonçait « Referrer-Policy: no-referrer ». La
// spécification Fetch impose alors au navigateur d'envoyer « Origin: null » sur
// une soumission de formulaire (et aucun Referer), donc la connexion était
// refusée avec « Requête refusée (origine) » — page totalement inutilisable,
// constaté en production le 15/09/2026. Un test posant l'en-tête Origin à la
// main ne pouvait pas le voir : c'est la politique de référent qu'il faut
// vérifier, en même temps que le comportement qu'elle provoque.
test("la politique de référent n'empêche pas le navigateur d'envoyer son Origin", async () => {
  const a = await startAdmin();
  try {
    const page = await a.request(`${ADMIN_PATH}/login`);
    const policy = page.headers.get('referrer-policy');
    assert.notEqual(policy, 'no-referrer', 'no-referrer rendrait la connexion impossible depuis un navigateur');
    assert.equal(policy, 'same-origin', "rien ne fuit vers un tiers, mais l'Origin nous parvient");

    // Ce que le navigateur envoyait à cause de no-referrer : toujours refusé,
    // c'est bien le rôle du contrôle.
    const spoofed = await a.request(`${ADMIN_PATH}/login`, { method: 'POST', body: `password=${PASSWORD}`, withOrigin: false, headers: { origin: 'null' } });
    assert.equal(spoofed.status, 403);

    // Navigateur qui omet l'Origin mais envoie son Referer : connexion acceptée.
    const viaReferer = await a.request(`${ADMIN_PATH}/login`, { method: 'POST', body: `password=${PASSWORD}`, withOrigin: false, headers: { referer: `${a.origin}${ADMIN_PATH}/login` } });
    assert.equal(viaReferer.status, 303);

    // Referer d'un autre site : refusé.
    const foreign = await a.request(`${ADMIN_PATH}/login`, { method: 'POST', body: `password=${PASSWORD}`, withOrigin: false, headers: { referer: 'https://evil.example.com/piege' } });
    assert.equal(foreign.status, 403);
  } finally { await a.close(); }
});

test('au-delà de 5 échecs, la connexion est bloquée (une connexion réussie ne compte pas)', async () => {
  const a = await startAdmin({ loginMax: 5 });
  try {
    assert.equal((await a.login()).status, 303);
    for (let i = 0; i < 5; i++) assert.equal((await a.login('faux')).status, 401);
    assert.equal((await a.login('faux')).status, 429);
    assert.equal((await a.login()).status, 429, 'même le bon mot de passe attend la fin du blocage');
  } finally { await a.close(); }
});

test('limite globale : bloque aussi une attaque répartie sur plusieurs adresses IP', async () => {
  const a = await startAdmin({ loginMax: 100, globalLoginMax: 3 });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await a.login('faux')).status, 401);
    assert.equal((await a.login('faux')).status, 429);
  } finally { await a.close(); }
});

test('dashboard sur base vide : des zéros, aucune donnée d\'exemple', async () => {
  const a = await startAdmin();
  try {
    const cookie = await a.loggedInCookie();
    const res = await a.request(`${ADMIN_PATH}/`, { cookie });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('NexiaWallet · Revenus'));
    assert.ok(html.includes('Aucune commission encaissée sur les 30 derniers jours.'));
    assert.ok(html.includes('Aucune commission encaissée pour ces filtres.'));
    assert.ok(html.includes('0 commission'));
    assert.ok(html.includes('Aucun frais LI.FI en attente de réclamation'));
  } finally { await a.close(); }
});

test('dashboard avec une commission : valeurs, lien explorateur, symbole malveillant échappé', async () => {
  const txHash = '0x' + 'ab'.repeat(32);
  const a = await startAdmin({
    seed: (db) => db.prepare(`INSERT INTO inbound_transfers (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_symbol,
      token_decimals, amount_raw, classification, value_usd_at_receipt, value_eur_at_receipt, coingecko_id, indexed_at)
      VALUES (1, ?, 'erc20', '4', 1, ?, '0xfrom', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '<script>alert(1)</script>', 6, '750000', 'swap_fee', '0.75', '0.675', 'usd-coin', 0)`)
      .run(txHash, Math.floor(Date.now() / 1000) - 3600),
  });
  try {
    const cookie = await a.loggedInCookie();
    const html = await (await a.request(`${ADMIN_PATH}/?period=all`, { cookie })).text();
    assert.ok(!html.includes('<script>alert(1)</script>'), 'symbole injecté non interprété');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes(`https://etherscan.io/tx/${txHash}`));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(html.includes('0,75'));

    const csv = await a.request(`${ADMIN_PATH}/export.csv?period=all`, { cookie });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.headers.get('content-disposition'), /attachment; filename="nexiawallet-revenus-\d{4}-\d{2}-\d{2}\.csv"/);
    const body = await csv.text();
    assert.ok(body.includes(txHash));
    assert.ok(body.includes(',0.75,0.675,'));
  } finally { await a.close(); }
});

test("actions : indexeur (origine exigée), sauvegarde, 404 identique, déconnexion", async () => {
  const a = await startAdmin();
  try {
    const cookie = await a.loggedInCookie();
    assert.equal((await a.request(`${ADMIN_PATH}/indexer/run`, { method: 'POST', cookie, withOrigin: false })).status, 403);
    assert.equal(a.calls.runOnce, 0);
    const run = await a.request(`${ADMIN_PATH}/indexer/run`, { method: 'POST', cookie });
    assert.equal(run.status, 303);
    assert.equal(a.calls.runOnce, 1);

    const backup = await a.request(`${ADMIN_PATH}/backup.db`, { cookie });
    assert.equal(backup.status, 200);
    const bytes = Buffer.from(await backup.arrayBuffer());
    assert.equal(bytes.subarray(0, 15).toString('latin1'), 'SQLite format 3');

    const unknown = await a.request(`${ADMIN_PATH}/nexiste-pas`, { cookie });
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { success: false, error: 'Route inconnue.' });

    const out = await a.request(`${ADMIN_PATH}/logout`, { method: 'POST', cookie });
    assert.equal(out.status, 303);
    assert.ok(out.headers.get('set-cookie').includes('Max-Age=0'));
    assert.equal((await a.request(`${ADMIN_PATH}/`, { cookie })).status, 303, 'session révoquée côté serveur');
  } finally { await a.close(); }
});
