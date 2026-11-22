'use strict';

// Webhook MoonPay (POST /wallet/webhooks/moonpay) sur le serveur complet :
// appele par MoonPay sans la cle de l'app, sa seule protection est la
// signature HMAC. Un faux message, une signature d'une autre cle, un corps
// modifie ou un VIEUX message rejoue doivent etre refuses.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.NEXIA_NO_LISTEN = '1';
process.env.NODE_ENV = 'test';
process.env.MOONPAY_WEBHOOK_KEY = 'cle-webhook-de-test';
const app = require('../server');

let serveur; let base;
test.before(async () => { await new Promise((r) => { serveur = app.listen(0, '127.0.0.1', r); }); base = `http://127.0.0.1:${serveur.address().port}`; });
test.after(() => new Promise((r) => serveur.close(r)));

const signer = (corps, t, cle = 'cle-webhook-de-test') => `t=${t},s=${crypto.createHmac('sha256', cle).update(`${t}.${corps}`).digest('hex')}`;
const maintenant = () => Math.floor(Date.now() / 1000);
async function envoyer(corps, signature) {
  const r = await fetch(`${base}/wallet/webhooks/moonpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature ? { 'moonpay-signature-v2': signature } : {}) },
    body: corps,
  });
  return { status: r.status, body: await r.json() };
}
const CORPS = JSON.stringify({ type: 'transaction_updated', data: { status: 'completed' } });

test('message signe par MoonPay, recent : accepte', async () => {
  const log = console.log; console.log = () => {};
  try {
    const r = await envoyer(CORPS, signer(CORPS, maintenant()));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { received: true, verified: true });
  } finally { console.log = log; }
});

test('sans signature, signature fausse, autre cle ou corps modifie : refuse', async () => {
  const t = maintenant();
  for (const sig of [undefined, 'n importe quoi', `t=${t},s=abcd`, signer(CORPS, t, 'autre-cle')]) {
    assert.equal((await envoyer(CORPS, sig)).status, 401, String(sig));
  }
  const modifie = CORPS.replace('completed', 'refunded');
  assert.equal((await envoyer(modifie, signer(CORPS, t))).status, 401);
});

test('vieux message rejoue (plus de 5 minutes) ou date dans le futur : refuse', async () => {
  for (const t of [maintenant() - 3600, maintenant() - 301, maintenant() + 3600, 'pas-un-nombre']) {
    assert.equal((await envoyer(CORPS, signer(CORPS, t))).status, 401, String(t));
  }
});
