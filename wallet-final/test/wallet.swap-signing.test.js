'use strict';
// wallet-final/test/wallet.swap-signing.test.js
// ─────────────────────────────────────────────────────────────────
//  Signature des échanges entre écosystèmes (lib/wallet.js).
//
//  Ces deux fonctions signent de l'ARGENT à partir d'une transaction
//  construite ailleurs (LI.FI) : on ne se contente pas de vérifier qu'elles
//  ne plantent pas, on vérifie la signature elle-même.
//
//  lib/wallet.js est volontairement sans dépendance React Native : il se
//  teste donc directement en Node.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, TransactionMessage,
} = require('@solana/web3.js');
const bitcoin = require('bitcoinjs-lib');
const { BIP32Factory } = require('bip32');
const bitcoinEcc = require('@bitcoinerlab/secp256k1');
const bip39 = require('bip39');

const localWallet = require('../lib/wallet');

// Mnémonique de test PUBLIQUE et bien connue (compte #0 Hardhat/Anvil) — ne
// JAMAIS y envoyer de vrais fonds.
const MNEMONIC = 'test test test test test test test test test test test junk';
const DESTINATAIRE_SOL = '8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p';
// Empreinte de bloc quelconque mais valide (32 octets en base58).
const BLOCKHASH = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';

const adresseSol = () => localWallet.getSolanaAddress(MNEMONIC);

// Ce que LI.FI renvoie pour un départ Solana : une transaction sérialisée en
// base64, NON signée, dont nous sommes le payeur de frais.
function transactionSolanaNonSignee({ versionnee }) {
  const payeur = new PublicKey(adresseSol());
  const instruction = SystemProgram.transfer({
    fromPubkey: payeur,
    toPubkey: new PublicKey(DESTINATAIRE_SOL),
    lamports: 1000,
  });
  if (!versionnee) {
    const tx = new Transaction({ recentBlockhash: BLOCKHASH, feePayer: payeur }).add(instruction);
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  }
  const message = new TransactionMessage({
    payerKey: payeur,
    recentBlockhash: BLOCKHASH,
    instructions: [instruction],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString('base64');
}

test('Solana : une transaction versionnée (v0) est signée, et la signature est valide', async () => {
  const base64Tx = transactionSolanaNonSignee({ versionnee: true });
  const { rawTx } = await localWallet.signSolanaSwapTx({ mnemonic: MNEMONIC, base64Tx });

  const signee = VersionedTransaction.deserialize(Buffer.from(rawTx, 'base64'));
  const signature = signee.signatures[0];
  assert.ok(signature && signature.some((o) => o !== 0), 'une signature est présente');

  // Vérification cryptographique : la signature doit correspondre au message
  // ET à notre clé publique.
  const nacl = require('tweetnacl');
  const valide = nacl.sign.detached.verify(
    signee.message.serialize(),
    signature,
    new PublicKey(adresseSol()).toBytes(),
  );
  assert.ok(valide, 'la signature correspond bien à notre clé publique');
});

test('Solana : l\'ancien format de transaction est signé lui aussi', async () => {
  const base64Tx = transactionSolanaNonSignee({ versionnee: false });
  const { rawTx } = await localWallet.signSolanaSwapTx({ mnemonic: MNEMONIC, base64Tx });
  const signee = Transaction.from(Buffer.from(rawTx, 'base64'));
  assert.equal(signee.verifySignatures(), true, 'toutes les signatures requises sont valides');
  assert.equal(signee.feePayer.toBase58(), adresseSol());
});

test('Solana : une transaction manquante est refusée clairement', async () => {
  await assert.rejects(() => localWallet.signSolanaSwapTx({ mnemonic: MNEMONIC, base64Tx: '' }), /Transaction Solana manquante/);
});

// ── Bitcoin ──────────────────────────────────────────────────────────────
// Ce que LI.FI renvoie pour un départ Bitcoin : un PSBT hexadécimal, dont les
// entrées nous appartiennent.
function psbtNonSigne() {
  const bip32 = BIP32Factory(bitcoinEcc);
  const graine = bip39.mnemonicToSeedSync(MNEMONIC);
  const noeud = bip32.fromSeed(graine).derivePath("m/84'/0'/0'/0/0");
  const { address, output } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(noeud.publicKey), network: bitcoin.networks.bitcoin });
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  psbt.addInput({
    hash: 'a'.repeat(64),
    index: 0,
    witnessUtxo: { script: output, value: 200000n },
  });
  psbt.addOutput({ address, value: 190000n }); // 10 000 sats de frais
  return { hex: psbt.toHex(), adresse: address };
}

test('Bitcoin : un PSBT est signé, finalisé, et donne une transaction diffusable', async () => {
  const { hex, adresse } = psbtNonSigne();
  assert.ok(hex.startsWith('70736274ff'), 'le PSBT de départ a bien la signature « psbt » attendue');
  assert.equal(adresse, localWallet.getBitcoinAddress(MNEMONIC), 'le PSBT porte bien sur notre adresse');

  const { rawTx } = await localWallet.signBitcoinSwapPsbt({ mnemonic: MNEMONIC, psbtHex: hex });
  const tx = bitcoin.Transaction.fromHex(rawTx);
  assert.equal(tx.ins.length, 1);
  assert.ok(tx.ins[0].witness && tx.ins[0].witness.length === 2, 'entrée signée (témoin signature + clé publique)');
  assert.ok(tx.getId().length === 64, 'la transaction a un identifiant valide');
});

// Régression : bitcoinjs-lib 7 exige des BigInt pour les montants (un nombre
// passait en v6). L'envoi de BTC les passait en nombres : TOUT envoi échouait
// sur « Data for input key witnessUtxo is incorrect ». Découvert en écrivant
// les tests ci-dessus ; ce test-ci garde la porte fermée.
test('Bitcoin : un envoi normal produit bien une transaction signée', async () => {
  const vraiFetch = global.fetch;
  const adresse = localWallet.getBitcoinAddress(MNEMONIC);
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/fee-estimates')) return new Response(JSON.stringify({ 3: 12, 6: 8 }), { status: 200 });
    if (u.includes(`/address/${adresse}/utxo`)) {
      return new Response(JSON.stringify([{ txid: 'b'.repeat(64), vout: 0, value: 500000, status: { confirmed: true } }]), { status: 200 });
    }
    throw new Error(`appel réseau inattendu : ${u}`);
  };
  try {
    const { rawTx } = await localWallet.signBitcoinTransferTx({
      mnemonic: MNEMONIC,
      to: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
      amountBtc: '0.001',
    });
    const tx = bitcoin.Transaction.fromHex(rawTx);
    assert.equal(tx.ins.length, 1, 'une entrée dépensée');
    assert.ok(tx.outs.length >= 1 && tx.outs.length <= 2, 'destination, et rendu de monnaie si besoin');
    assert.equal(tx.outs[0].value, 100000n, '0,001 BTC = 100 000 satoshis envoyés');
    assert.ok(tx.ins[0].witness.length === 2, 'entrée réellement signée');
  } finally {
    global.fetch = vraiFetch;
  }
});

test('Bitcoin : ce qui n\'est pas un PSBT est refusé, avec un message clair', async () => {
  for (const mauvais of ['', '0xdeadbeef', 'deadbeef', '02000000010000']) {
    await assert.rejects(
      () => localWallet.signBitcoinSwapPsbt({ mnemonic: MNEMONIC, psbtHex: mauvais }),
      /pas un PSBT Bitcoin valide/,
      `refusé : ${mauvais || '(vide)'}`,
    );
  }
});
