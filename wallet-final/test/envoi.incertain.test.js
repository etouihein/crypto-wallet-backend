'use strict';
// wallet-final/test/envoi.incertain.test.js
// ─────────────────────────────────────────────────────────────────
//  Envoi signe, serveur muet (delai depasse) : la transaction est PEUT-ETRE
//  partie. L'app ne doit plus dire « reessaie » (double paiement possible)
//  mais suivre la transaction par son hash calcule sur l'appareil.
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const bitcoin = require('bitcoinjs-lib');
const { Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const { hashLocalTransaction } = require('../lib/wallet');
const { diffusionIncertaine, humanizeTxError } = require('../lib/txErrors');

// Cle publique de test Hardhat #0 (jamais de vrais fonds).
const CLE_TEST = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

test('hash EVM calcule avant diffusion = hash officiel de la transaction', async () => {
  const w = new ethers.Wallet(CLE_TEST);
  const raw = await w.signTransaction({ to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', value: 1, nonce: 0, gasLimit: 21000, gasPrice: 1, chainId: 1 });
  assert.equal(hashLocalTransaction(raw, 'evm'), ethers.utils.parseTransaction(raw).hash);
  assert.equal(hashLocalTransaction(raw, 'bsc'), ethers.utils.parseTransaction(raw).hash);
});

test('hash Solana = 1re signature en base58 (identifiant affiche par les explorateurs)', () => {
  const moi = Keypair.fromSeed(new Uint8Array(32).fill(7));
  const tx = new Transaction({ recentBlockhash: '11111111111111111111111111111111', feePayer: moi.publicKey })
    .add(SystemProgram.transfer({ fromPubkey: moi.publicKey, toPubkey: Keypair.fromSeed(new Uint8Array(32).fill(8)).publicKey, lamports: 1000 }));
  tx.sign(moi);
  const raw = tx.serialize().toString('base64');
  assert.equal(hashLocalTransaction(raw, 'solana'), ethers.utils.base58.encode(tx.signature));
});

test('hash Bitcoin = txid', () => {
  const t = new bitcoin.Transaction();
  t.addInput(Buffer.alloc(32, 1), 0);
  t.addOutput(bitcoin.address.toOutputScript('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'), 1000n);
  assert.equal(hashLocalTransaction(t.toHex(), 'bitcoin'), t.getId());
});

test('transaction illisible -> null, sans planter', () => {
  for (const [raw, net] of [['', 'evm'], [null, 'solana'], ['zz', 'bitcoin'], ['AAAA', 'solana'], ['0x12', 'evm']]) {
    assert.equal(hashLocalTransaction(raw, net), null, `${net} ${raw}`);
  }
});

test('diffusion incertaine : delai depasse, reseau coupe, passerelle 502/504', () => {
  assert.equal(diffusionIncertaine({ isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 25000ms exceeded' }), true);
  assert.equal(diffusionIncertaine({ isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error' }), true);
  assert.equal(diffusionIncertaine({ isAxiosError: true, response: { status: 504 } }), true);
  assert.equal(diffusionIncertaine({ isAxiosError: true, response: { status: 502 } }), true);
});

test('pas incertaine : le serveur a repondu un refus, ou erreur locale', () => {
  assert.equal(diffusionIncertaine({ isAxiosError: true, response: { status: 400, data: { error: 'Diffusion impossible.' } } }), false);
  assert.equal(diffusionIncertaine({ isAxiosError: true, response: { status: 429 } }), false);
  assert.equal(diffusionIncertaine(new Error('Échec du transfert')), false);
  assert.equal(diffusionIncertaine(null), false);
  // Le message d'avant invitait a recommencer : c'est pour ca qu'il ne faut
  // plus l'afficher apres une signature.
  assert.match(humanizeTxError({ message: 'timeout of 25000ms exceeded' }), /réessaie/);
});

test('App.js : les 3 envois (SOL, BTC, EVM) gerent la diffusion incertaine', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'App.js'), 'utf8');
  const corps = src.slice(src.indexOf('const confirmAndSend = async'), src.indexOf('// ── ÉCHANGE ENTRE ÉCOSYSTÈMES'));
  assert.equal((corps.match(/rawTxSigne && diffusionIncertaine\(e\)/g) || []).length, 3);
  assert.equal((corps.match(/rawTxSigne = null; \/\/ le serveur a répondu/g) || []).length, 3);
  assert.match(src, /const alerteEnvoiIncertain = /);
  assert.match(src, /localWallet\.hashLocalTransaction\(/);
});
