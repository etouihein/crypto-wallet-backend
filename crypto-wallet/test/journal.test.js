'use strict';

// Journal du serveur sans secret ni donnee personnelle (src/journal.js).
// Avant le 24/11/2026 : l'erreur entiere d'ethers (avec l'adresse du noeud
// contenant la cle Alchemy) et l'adresse + le montant des achats MoonPay
// etaient ecrits en clair dans les journaux Railway.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const CLE = 'CLESECRETEalchemy1234567890abcd';
process.env.NEXIA_NO_LISTEN = '1';
process.env.NODE_ENV = 'test';
process.env.APP_API_KEYS = 'test-app-key';
process.env.ETHEREUM_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${CLE}`;
process.env.MOONPAY_WEBHOOK_KEY = 'cle-webhook-de-test';

const { ethers } = require('ethers');
const { masquerSecrets, erreurPourJournal } = require('../src/journal');
const app = require('../server');

let serveur; let base;
test.before(async () => { await new Promise((r) => { serveur = app.listen(0, '127.0.0.1', r); }); base = `http://127.0.0.1:${serveur.address().port}`; });
test.after(() => new Promise((r) => serveur.close(r)));

async function capturer(methode, fn) {
  const lignes = []; const vrai = console[methode];
  console[methode] = (...a) => { lignes.push(a.map((x) => (typeof x === 'string' ? x : require('util').inspect(x, { depth: 5 }))).join(' ')); };
  try { await fn(); } finally { console[methode] = vrai; }
  return lignes.join('\n');
}

test('masquerSecrets : cles dans le chemin, parametres et identifiants masques ; le reste lisible', () => {
  const t = masquerSecrets(`missing response (url="https://base-mainnet.g.alchemy.com/v2/${CLE}", x=https://mainnet.helius-rpc.com/?api-key=abc123def456&y=1 https://user:motdepasse@rpc.exemple/ https://mainnet.infura.io/v3/0123456789abcdef0123)`);
  assert.ok(!t.includes(CLE) && !t.includes('abc123def456') && !t.includes('motdepasse') && !t.includes('0123456789abcdef0123'), t);
  assert.match(t, /missing response/);
  assert.match(t, /alchemy\.com\/v2\/\*\*\*/);
  assert.equal(erreurPourJournal(null), '');
  assert.match(erreurPourJournal(Object.assign(new Error('boom'), { code: 'SERVER_ERROR' })), /boom \[SERVER_ERROR\]/);
});

test("diffusion qui echoue chez le noeud : la cle Alchemy n'apparait pas dans le journal", async () => {
  const vraiEnvoi = ethers.providers.JsonRpcProvider.prototype.sendTransaction;
  ethers.providers.JsonRpcProvider.prototype.sendTransaction = async function () {
    const e = new Error(`missing response (requestBody="{}", requestMethod="POST", url="${process.env.ETHEREUM_RPC_URL}", code=SERVER_ERROR)`);
    e.code = 'SERVER_ERROR'; e.url = process.env.ETHEREUM_RPC_URL;
    throw e;
  };
  try {
    const w = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const rawTx = await w.signTransaction({ to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', value: 1, nonce: 0, gasLimit: 21000, gasPrice: 1, chainId: 1 });
    let statut;
    const journal = await capturer('error', async () => {
      const r = await fetch(`${base}/wallet/tx/broadcast`, { method: 'POST', headers: { 'x-api-key': 'test-app-key', 'content-type': 'application/json' }, body: JSON.stringify({ rawTx, network: 'ethereum' }) });
      statut = r.status;
    });
    assert.equal(statut, 400);
    assert.match(journal, /Broadcast error/);
    assert.ok(!journal.includes(CLE), `cle presente dans le journal :\n${journal}`);
  } finally {
    ethers.providers.JsonRpcProvider.prototype.sendTransaction = vraiEnvoi;
  }
});

test("webhook MoonPay : ni l'adresse du wallet ni le montant dans le journal", async () => {
  const corps = JSON.stringify({ type: 'transaction_updated', data: { status: 'completed', walletAddress: '0xAbCdEf0123456789abcdef0123456789ABCDEF01', baseCurrencyAmount: 123.45, baseCurrencyCode: 'eur', quoteCurrencyAmount: 0.0421, currency: { code: 'eth' } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},s=${crypto.createHmac('sha256', 'cle-webhook-de-test').update(`${t}.${corps}`).digest('hex')}`;
  const journal = await capturer('log', async () => {
    const r = await fetch(`${base}/wallet/webhooks/moonpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'moonpay-signature-v2': sig }, body: corps });
    assert.equal(r.status, 200);
  });
  assert.match(journal, /MoonPay \[transaction_updated\] statut=completed/);
  assert.ok(!/0xAbCdEf0123456789/i.test(journal), journal);
  assert.ok(!journal.includes('123.45') && !journal.includes('0.0421'), journal);
});
