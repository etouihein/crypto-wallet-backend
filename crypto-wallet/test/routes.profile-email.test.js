'use strict';

// Profil e-mail (POST / DELETE /wallet/profile/email) : les e-mails de tous
// les utilisateurs sont dans UN fichier (DATA_DIR/email-profiles.json, sur le
// volume Railway). Un fichier abime (coupure pendant une ecriture,
// redeploiement) ne doit JAMAIS conduire a effacer les e-mails des autres.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
const FICHIER = path.join(process.env.DATA_DIR, 'email-profiles.json');
const walletRoutes = require('../src/routes/wallet');
const A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

async function appel(base, methode, corps) {
  const r = await fetch(`${base}/wallet/profile/email`, {
    method: methode, headers: { 'content-type': 'application/json', 'x-api-key': 'test-app-key' }, body: JSON.stringify(corps),
  });
  return { status: r.status, body: await r.json() };
}
const lire = () => JSON.parse(fs.readFileSync(FICHIER, 'utf8'));

test('enregistrement et suppression : chaque wallet garde son e-mail', async () => {
  try { fs.unlinkSync(FICHIER); } catch { /* absent */ }
  await helpers.withServer(walletRoutes, async (base) => {
    assert.equal((await appel(base, 'POST', { address: A, email: 'Moi@Exemple.FR' })).status, 200);
    assert.equal((await appel(base, 'POST', { address: B, email: 'b@exemple.fr' })).status, 200);
    assert.equal(lire()[A.toLowerCase()].email, 'moi@exemple.fr');
    assert.deepEqual(Object.keys(lire()).sort(), [A.toLowerCase(), B.toLowerCase()].sort());
    const del = await appel(base, 'DELETE', { address: A });
    assert.deepEqual(del.body, { success: true, deleted: true });
    assert.deepEqual(Object.keys(lire()), [B.toLowerCase()]);
    assert.deepEqual((await appel(base, 'DELETE', { address: A })).body, { success: true, deleted: false });
  });
});

test('e-mail ou adresse invalides : refuses', async () => {
  await helpers.withServer(walletRoutes, async (base) => {
    for (const corps of [{ address: A, email: 'pas-un-email' }, { address: A }, { email: 'a@b.fr' }, { address: 'x'.repeat(101), email: 'a@b.fr' },
      { address: '__proto__', email: 'a@b.fr' }, { address: 'constructor', email: 'a@b.fr' }]) {
      assert.equal((await appel(base, 'POST', corps)).status, 400, JSON.stringify(corps));
    }
  });
});

test('fichier abime (ecriture coupee) : on n ecrase JAMAIS les e-mails des autres', async () => {
  fs.writeFileSync(FICHIER, '{"0xaaa":{"email":"a@exemple.fr"},"0xbbb":{"email":"b@exem');
  const avant = fs.readFileSync(FICHIER, 'utf8');
  await helpers.withServer(walletRoutes, async (base) => {
    const err = console.error; console.error = () => {};
    try {
      const r = await appel(base, 'POST', { address: A, email: 'moi@exemple.fr' });
      assert.equal(r.status, 500, 'refus propre plutot que d effacer');
    } finally { console.error = err; }
  });
  assert.equal(fs.readFileSync(FICHIER, 'utf8'), avant, 'le fichier abime est garde tel quel (recuperable a la main)');
});

test('ecriture sans fichier temporaire laisse derriere', async () => {
  try { fs.unlinkSync(FICHIER); } catch { /* absent */ }
  await helpers.withServer(walletRoutes, async (base) => {
    await appel(base, 'POST', { address: A, email: 'moi@exemple.fr' });
  });
  assert.deepEqual(fs.readdirSync(process.env.DATA_DIR).filter((f) => f.startsWith('email-profiles')), ['email-profiles.json']);
});
