'use strict';

// Profil e-mail (POST / DELETE /wallet/profile/email) : les e-mails de tous
// les utilisateurs sont dans UN fichier (DATA_DIR/email-profiles.json, sur le
// volume Railway). Un fichier abime (coupure pendant une ecriture,
// redeploiement) ne doit JAMAIS conduire a effacer les e-mails des autres.
// Depuis le 24/11/2026, seul le proprietaire de l'adresse (signature du
// wallet, horodatee) peut lier ou retirer un e-mail.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
const FICHIER = path.join(process.env.DATA_DIR, 'email-profiles.json');
const walletRoutes = require('../src/routes/wallet');
const { ethers } = require('ethers');
const { messageProfilEmail } = require('../../wallet-final/lib/profilEmail');
const A = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
// cles PUBLIQUES de test (comptes #0 et #1 de Hardhat), jamais de vrais fonds
const CLES = {
  [A]: new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'),
  [B]: new ethers.Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'),
};
const maintenant = () => Math.floor(Date.now() / 1000);
// corps signe exactement comme l'app (wallet-final/lib/profilEmail.js)
async function signe(action, address, email, { par = address, horodatage = maintenant() } = {}) {
  const signature = await CLES[par].signMessage(messageProfilEmail(action, address, email, horodatage));
  return action === 'supprimer' ? { address, signature, horodatage } : { address, email, signature, horodatage };
}

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
    assert.equal((await appel(base, 'POST', await signe('lier', A, 'Moi@Exemple.FR'))).status, 200);
    assert.equal((await appel(base, 'POST', await signe('lier', B, 'b@exemple.fr'))).status, 200);
    assert.equal(lire()[A.toLowerCase()].email, 'moi@exemple.fr');
    assert.deepEqual(Object.keys(lire()).sort(), [A.toLowerCase(), B.toLowerCase()].sort());
    const del = await appel(base, 'DELETE', await signe('supprimer', A));
    assert.deepEqual(del.body, { success: true, deleted: true });
    assert.deepEqual(Object.keys(lire()), [B.toLowerCase()]);
    assert.deepEqual((await appel(base, 'DELETE', await signe('supprimer', A))).body, { success: true, deleted: false });
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
      const r = await appel(base, 'POST', await signe('lier', A, 'moi@exemple.fr'));
      assert.equal(r.status, 500, 'refus propre plutot que d effacer');
    } finally { console.error = err; }
  });
  assert.equal(fs.readFileSync(FICHIER, 'utf8'), avant, 'le fichier abime est garde tel quel (recuperable a la main)');
});

test('ecriture sans fichier temporaire laisse derriere', async () => {
  try { fs.unlinkSync(FICHIER); } catch { /* absent */ }
  await helpers.withServer(walletRoutes, async (base) => {
    await appel(base, 'POST', await signe('lier', A, 'moi@exemple.fr'));
  });
  assert.deepEqual(fs.readdirSync(process.env.DATA_DIR).filter((f) => f.startsWith('email-profiles')), ['email-profiles.json']);
});

test("sans preuve de possession : impossible de lier ou d'effacer l'e-mail d'une adresse", async () => {
  try { fs.unlinkSync(FICHIER); } catch { /* absent */ }
  await helpers.withServer(walletRoutes, async (base) => {
    assert.equal((await appel(base, 'POST', await signe('lier', B, 'b@exemple.fr'))).status, 200);
    const attaques = [
      ['POST', { address: B, email: 'pirate@exemple.fr' }], // pas de signature (avant : accepte)
      ['POST', await signe('lier', B, 'pirate@exemple.fr', { par: A })], // signee par un autre wallet
      ['POST', { ...(await signe('lier', B, 'b@exemple.fr')), email: 'pirate@exemple.fr' }], // signature d'un autre e-mail reutilisee
      ['POST', await signe('lier', B, 'pirate@exemple.fr', { horodatage: maintenant() - 3600 })], // trop vieille
      ['POST', await signe('lier', B, 'pirate@exemple.fr', { horodatage: maintenant() + 3600 })], // dans le futur
      ['DELETE', { address: B }], // effacement sans signature (avant : accepte)
      ['DELETE', await signe('supprimer', B, null, { par: A })],
      ['DELETE', await signe('lier', B, 'b@exemple.fr')], // signature "lier" reutilisee pour supprimer
    ];
    for (const [methode, corps] of attaques) {
      assert.equal((await appel(base, methode, corps)).status, 400, `${methode} ${JSON.stringify(corps).slice(0, 80)}`);
    }
    assert.equal(lire()[B.toLowerCase()].email, 'b@exemple.fr', "l'e-mail du vrai proprietaire n'a pas bouge");
  });
});

test("le message signe par l'app et celui verifie par le serveur sont identiques", () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'wallet.js'), 'utf8');
  const debut = src.indexOf('function messageProfilEmail');
  const corpsServeur = src.slice(debut, src.indexOf('\n}\n', debut) + 3);
  const serveur = new Function(`${corpsServeur}; return messageProfilEmail;`)();
  for (const [action, email] of [['lier', ' Moi@Exemple.FR '], ['supprimer', null]]) {
    assert.equal(serveur(action, A, email, 1732460000), messageProfilEmail(action, A, email, 1732460000));
  }
});
