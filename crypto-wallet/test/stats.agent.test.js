'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const { openRevenueDb } = require('../src/revenue/db');
const { creerCompteur, monterStats, categorie, empreinteValide, TRANCHE_MS } = require('../src/stats/agentStats');

const JETON = 'jeton-de-test-0123456789abcdefghijklmnop';
const EMPREINTE = crypto.createHash('sha256').update(JETON).digest('hex');

async function demarrer(app) {
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('categories : chaque route du wallet tombe dans la bonne case', () => {
  assert.equal(categorie('/wallet/swap/quote'), 'devis_swap');
  assert.equal(categorie('/wallet/swap/cross-quote'), 'devis_bridge');
  assert.equal(categorie('/wallet/bridge/quote'), 'devis_bridge');
  assert.equal(categorie('/wallet/tx/broadcast-solana'), 'envois');
  assert.equal(categorie('/wallet/payments/create-checkout-session'), 'achat_vente');
  assert.equal(categorie('/wallet/market/overview'), 'marche');
  assert.equal(categorie('/health'), 'sante');
  assert.equal(categorie('/n-importe-quoi'), 'autres');
});

test('compteur : totaux par tranche de 10 min, erreurs separees, 24 h maximum', () => {
  let t = 1_800_000_000_000;
  const c = creerCompteur({ now: () => t });
  c.enregistrer('/wallet/swap/quote', 200);
  c.enregistrer('/wallet/swap/quote', 429);
  c.enregistrer('/wallet/tx/broadcast', 500);
  c.enregistrer('/wallet/market', 404);
  let r = c.resume();
  assert.equal(r.dix_dernieres_minutes.total, 4);
  assert.deepEqual(r.dix_dernieres_minutes.parCategorie, { devis_swap: 2, envois: 1, marche: 1 });
  assert.equal(r.dix_dernieres_minutes.refus429, 1);
  assert.equal(r.dix_dernieres_minutes.erreurs5xx, 1);
  assert.equal(r.dix_dernieres_minutes.erreurs4xx, 1);
  t += 2 * 60 * 60 * 1000; // 2 h plus tard
  c.enregistrer('/health', 200);
  r = c.resume();
  assert.equal(r.dix_dernieres_minutes.total, 1, 'les anciennes requetes ne sont plus dans les 10 dernieres minutes');
  assert.equal(r.dernieres_24h.total, 5);
  assert.equal(r.par_tranche_4h.length, 24);
  t += 25 * 60 * 60 * 1000; // plus de 24 h
  c.enregistrer('/health', 200);
  assert.equal(c.resume().dernieres_24h.total, 1, 'rien n est garde au-dela de 24 h');
});

test('jeton : empreinte SHA-256 comparee en temps constant, jetons courts refuses', () => {
  assert.equal(empreinteValide(EMPREINTE, JETON), true);
  assert.equal(empreinteValide(EMPREINTE, JETON + 'x'), false);
  assert.equal(empreinteValide(EMPREINTE, 'court'), false);
  assert.equal(empreinteValide('pas-une-empreinte', JETON), false);
});

test('GET /stats/agent absente (404) tant que STATS_TOKEN_SHA256 n est pas defini', async () => {
  const app = express();
  assert.equal(monterStats(app, creerCompteur(), { env: {} }), false);
  const { server, base } = await demarrer(app);
  try {
    assert.equal((await fetch(`${base}/stats/agent`, { headers: { authorization: `Bearer ${JETON}` } })).status, 404);
  } finally { server.close(); }
});

test('GET /stats/agent : 401 sans le bon jeton, chiffres agreges avec, sans adresse ni hash', async () => {
  const db = openRevenueDb(':memory:');
  const now = Date.now();
  db.prepare(`INSERT INTO quote_events (id, created_at, type, chain_id, token_in, token_out, amount_in, user_hash)
    VALUES ('q1', ?, 'swap', 1, '0xin', '0xout', '1', 'u1'), ('q2', ?, 'bridge', 10, '0xin', '0xout', '1', 'u2')`).run(now - 60_000, now - 120_000);
  db.prepare(`INSERT INTO inbound_transfers (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_symbol, token_decimals, amount_raw, classification, value_eur_at_receipt, value_usd_at_receipt, indexed_at)
    VALUES (1, '0xHASHSECRET', 'internal', '0', 1, ?, '0xADRESSECLIENT', '0x0', 'ETH', 18, '1', 'swap_fee', '1.50', '1.60', 0)`).run(Math.floor(now / 1000) - 30);
  const compteur = creerCompteur();
  const app = express();
  app.use(compteur.middleware);
  assert.equal(monterStats(app, compteur, { env: { STATS_TOKEN_SHA256: EMPREINTE }, getServices: () => ({ db }) }), true);
  const { server, base } = await demarrer(app);
  try {
    assert.equal((await fetch(`${base}/stats/agent`)).status, 401);
    assert.equal((await fetch(`${base}/stats/agent`, { headers: { authorization: 'Bearer mauvais-jeton-0123456789abcdefghijkl' } })).status, 401);
    const r = await fetch(`${base}/stats/agent`, { headers: { authorization: `Bearer ${JETON}` } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const texte = await r.text();
    assert.ok(!texte.includes('0xHASHSECRET') && !texte.includes('0xADRESSECLIENT') && !texte.includes('u1'), 'aucune donnee personnelle');
    const d = JSON.parse(texte);
    assert.equal(d.disponible, true);
    assert.deepEqual(d.devis.dix_minutes, { swap: 1, bridge: 1 });
    assert.equal(d.revenus.today.count, 1);
    assert.equal(d.derniers_revenus[0].type, 'swap');
    assert.equal(d.derniers_revenus[0].jeton, 'ETH');
    assert.equal(d.revenus_par_jour_14j.length, 14);
    assert.ok(d.requetes.dix_dernieres_minutes.total >= 2, 'les appels precedents sont comptes');
  } finally { server.close(); db.close(); }
});

test('GET /stats/agent : base des revenus absente -> chiffres de requetes quand meme', async () => {
  const compteur = creerCompteur();
  const app = express();
  monterStats(app, compteur, { env: { STATS_TOKEN_SHA256: EMPREINTE }, getServices: () => null });
  const { server, base } = await demarrer(app);
  try {
    const d = await (await fetch(`${base}/stats/agent`, { headers: { authorization: `Bearer ${JETON}` } })).json();
    assert.equal(d.disponible, false);
    assert.ok(d.requetes);
  } finally { server.close(); }
});
