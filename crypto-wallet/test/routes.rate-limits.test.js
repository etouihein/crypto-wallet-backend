'use strict';

// Limites anti-abus PAR FAMILLE de routes (24/11/2026). Avant, une seule
// limite de 20 requetes / 15 min / IP etait partagee par toutes les routes
// sensibles : une galerie de NFT (1 requete par image) ou quelques devis de
// swap bloquaient la diffusion de la transaction suivante. On verifie :
//  - naviguer (images, devis) ne bloque jamais une diffusion ;
//  - les images ne consomment pas le quota global de l'app ;
//  - chaque famille reste bien limitee (protection anti-abus conservee).

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NEXIA_NO_LISTEN = '1';
process.env.NODE_ENV = 'test';
process.env.APP_API_KEYS = 'test-app-key';
delete process.env.SENSITIVE_RATE_LIMIT_MAX;
delete process.env.RATE_LIMIT_MAX;
delete process.env.ZEROX_API_KEY;

const app = require('../server');
let serveur; let base;

test.before(async () => {
  await new Promise((r) => { serveur = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${serveur.address().port}`;
});
test.after(async () => { await new Promise((r) => serveur.close(r)); });

const CLE = { 'x-api-key': 'test-app-key', 'content-type': 'application/json' };
const image = () => fetch(`${base}/wallet/nft/image-proxy?url=ftp%3A%2F%2Fx`).then((r) => r.status);
const devis = () => fetch(`${base}/wallet/swap/quote?network=ethereum`, { headers: CLE }).then((r) => r.status);
const diffusion = () => fetch(`${base}/wallet/tx/broadcast`, { method: 'POST', headers: CLE, body: '{}' }).then((r) => r.status);
const email = () => fetch(`${base}/wallet/profile/email`, { method: 'POST', headers: CLE, body: '{}' }).then((r) => r.status);

test('galerie NFT puis devis de swap : la diffusion de la transaction passe toujours', async () => {
  for (let i = 0; i < 25; i++) assert.equal(await image(), 400);
  for (let i = 0; i < 25; i++) assert.equal(await devis(), 503); // pas de cle 0x en test
  const s = await diffusion();
  assert.notEqual(s, 429, 'diffusion bloquee par la navigation');
  assert.equal(s, 400); // corps vide : refuse pour sa vraie raison
});

test('les images ne consomment pas le quota global : /health repond apres 110 images', async () => {
  for (let i = 0; i < 110; i++) assert.notEqual(await image(), 429);
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
});

test('chaque famille reste limitee : diffusion 30, e-mail 20, images 300', async () => {
  // la diffusion du 1er test compte deja pour 1
  const diff = [];
  for (let i = 0; i < 30; i++) diff.push(await diffusion());
  assert.equal(diff.filter((s) => s === 429).length, 1, 'la 31e diffusion est refusee');
  const mails = [];
  for (let i = 0; i < 21; i++) mails.push(await email());
  assert.equal(mails.filter((s) => s === 429).length, 1, 'le 21e e-mail est refuse');
  // 25 + 110 images deja faites : encore 165 permises, la suivante refusee
  let refus = 0;
  for (let i = 0; i < 166; i++) if ((await image()) === 429) refus++;
  assert.equal(refus, 1, 'la 301e image est refusee');
});
