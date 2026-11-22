'use strict';
// wallet-final/test/approvals.test.js
// ─────────────────────────────────────────────────────────────────
//  Suivi local des autorisations de tokens (lib/approvals.js) :
//  enregistrement, remplacement, revocation marquee, suppression,
//  separation par wallet, et robustesse (adresse vide, stockage abime).
//  AsyncStorage est remplace par une fausse memoire en Node.
//  revokeApproval (signature) n'est PAS teste ici : il signe une vraie
//  transaction et depend du reseau.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');

const memoire = new Map();
const fauxStockage = {
  getItem: async (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: async (k, v) => { memoire.set(k, String(v)); },
};
const cheminStockage = require.resolve('@react-native-async-storage/async-storage');
require.cache[cheminStockage] = {
  id: cheminStockage, filename: cheminStockage, loaded: true,
  exports: { __esModule: true, default: fauxStockage },
};

const approvals = require('../lib/approvals');

const CLE = 'wallet-pro-approvals-v1';
const WALLET = '0xAbCdEf0000000000000000000000000000000001';
const AUTRE_WALLET = '0x1111111111111111111111111111111111111111';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ROUTEUR = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF';

function autorisation(extra = {}) {
  return { network: 'ethereum', tokenAddress: USDC, tokenSymbol: 'USDC', spender: ROUTEUR, amount: '115792089237316195423570985008687907853269984665640564039457584007913129639935', isNft: false, txHash: '0xabc', ...extra };
}

test.beforeEach(() => memoire.clear());

test('une autorisation enregistree est relue, quelle que soit la casse de l adresse du wallet', async () => {
  const entree = await approvals.recordApproval(WALLET, autorisation());
  assert.equal(entree.revoked, false);
  assert.equal(entree.tokenSymbol, 'USDC');
  const liste = await approvals.getApprovals(WALLET.toUpperCase().replace('0X', '0x'));
  assert.equal(liste.length, 1);
  assert.equal(liste[0].id, entree.id);
});

test('le montant uint256 maximal est garde exact (texte, pas un nombre arrondi)', async () => {
  await approvals.recordApproval(WALLET, autorisation());
  const [e] = await approvals.getApprovals(WALLET);
  assert.equal(typeof e.amount, 'string');
  assert.equal(e.amount, autorisation().amount);
});

test('une nouvelle autorisation sur le meme token et le meme spender remplace l ancienne', async () => {
  await approvals.recordApproval(WALLET, autorisation({ amount: '1', txHash: '0x1' }));
  await approvals.recordApproval(WALLET, autorisation({ amount: '2', txHash: '0x2' }));
  const liste = await approvals.getApprovals(WALLET);
  assert.equal(liste.length, 1);
  assert.equal(liste[0].amount, '2');
});

test('les autorisations d un wallet ne sont pas visibles depuis un autre wallet', async () => {
  await approvals.recordApproval(WALLET, autorisation());
  assert.deepEqual(await approvals.getApprovals(AUTRE_WALLET), []);
});

test('markRevoked marque seulement l autorisation visee', async () => {
  const a = await approvals.recordApproval(WALLET, autorisation());
  const b = await approvals.recordApproval(WALLET, autorisation({ spender: AUTRE_WALLET }));
  await approvals.markRevoked(WALLET, a.id);
  const liste = await approvals.getApprovals(WALLET);
  assert.equal(liste.find((e) => e.id === a.id).revoked, true);
  assert.equal(typeof liste.find((e) => e.id === a.id).revokedAt, 'number');
  assert.equal(liste.find((e) => e.id === b.id).revoked, false);
});

test('removeApproval retire seulement l autorisation visee', async () => {
  const a = await approvals.recordApproval(WALLET, autorisation());
  const b = await approvals.recordApproval(WALLET, autorisation({ spender: AUTRE_WALLET }));
  await approvals.removeApproval(WALLET, a.id);
  const liste = await approvals.getApprovals(WALLET);
  assert.deepEqual(liste.map((e) => e.id), [b.id]);
});

test('adresse de wallet vide : aucune fonction ne plante et rien n est ecrit', async () => {
  for (const vide of [undefined, null, '']) {
    assert.deepEqual(await approvals.getApprovals(vide), []);
    assert.equal(await approvals.recordApproval(vide, autorisation()), undefined);
    await approvals.markRevoked(vide, 'x');
    await approvals.removeApproval(vide, 'x');
  }
  assert.equal(memoire.has(CLE), false);
});

test('stockage abime (texte invalide, null, tableau) : liste vide, puis enregistrement possible', async () => {
  for (const abime of ['{pas du json', 'null', '[]', '"texte"']) {
    memoire.set(CLE, abime);
    assert.deepEqual(await approvals.getApprovals(WALLET), [], `getApprovals avec ${abime}`);
    await approvals.markRevoked(WALLET, 'x');
    await approvals.removeApproval(WALLET, 'x');
    memoire.set(CLE, abime);
    await approvals.recordApproval(WALLET, autorisation());
    assert.equal((await approvals.getApprovals(WALLET)).length, 1, `recordApproval avec ${abime}`);
  }
});

test('liste d un wallet abimee (objet, texte, nombre) : liste vide, aucune fonction ne plante', async () => {
  for (const abime of [{ a: 1 }, 'texte', 42, true]) {
    memoire.set(CLE, JSON.stringify({ [WALLET.toLowerCase()]: abime }));
    assert.deepEqual(await approvals.getApprovals(WALLET), [], `getApprovals avec ${JSON.stringify(abime)}`);
    await approvals.markRevoked(WALLET, 'x');
    await approvals.removeApproval(WALLET, 'x');
    memoire.set(CLE, JSON.stringify({ [WALLET.toLowerCase()]: abime }));
    await approvals.recordApproval(WALLET, autorisation());
    assert.equal((await approvals.getApprovals(WALLET)).length, 1, `recordApproval avec ${JSON.stringify(abime)}`);
  }
});
