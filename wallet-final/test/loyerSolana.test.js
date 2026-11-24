'use strict';
// wallet-final/test/loyerSolana.test.js
// ─────────────────────────────────────────────────────────────────
//  Loyer Solana (lib/loyerSolana.js) : le reseau refuse qu'un compte finisse
//  une transaction avec un solde entre 0 et son minimum (~0,00089 SOL).
//  Avant le 24/11/2026, MAX (envoi) et « Tout » (vente) laissaient 5 000
//  lamports : l'envoi etait toujours refuse.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { maxSolEnvoyableLamports, maxSolEnvoyableTexte, verifierLoyerSolana, FRAIS_SIGNATURE_LAMPORTS } = require('../lib/loyerSolana');

const LOYER = 890880;

test('MAX : tout le solde moins les frais exacts, le compte finit a 0 (accepte par le reseau)', () => {
  assert.equal(maxSolEnvoyableLamports(2_500_000_000), 2_499_995_000);
  assert.equal(maxSolEnvoyableTexte('2.5'), '2.499995');
  assert.equal(maxSolEnvoyableTexte('0.123456789'), '0.123451789');
  assert.equal(maxSolEnvoyableTexte('0.000005'), '0');
  assert.equal(maxSolEnvoyableTexte('abc'), '0');
  // le montant MAX passe la verification du loyer (reste = 0 exactement)
  for (const solde of [2_500_000_000, 123_456_789, 1_000_000, 900_001]) {
    const montant = maxSolEnvoyableLamports(solde);
    assert.equal(verifierLoyerSolana({ soldeLamports: solde, montantLamports: montant, loyerMinLamports: LOYER, soldeDestLamports: 5e9 }), null, String(solde));
    // et le texte affiche correspond au lamport pres
    assert.equal(Math.round(parseFloat(maxSolEnvoyableTexte(solde / 1e9)) * 1e9), montant);
  }
});

test('ancien MAX (garder 0,00001 SOL) : refuse par la regle du loyer', () => {
  const solde = 2_500_000_000;
  const ancienMontant = solde - 10_000;
  const refus = verifierLoyerSolana({ soldeLamports: solde, montantLamports: ancienMontant, loyerMinLamports: LOYER, soldeDestLamports: 5e9 });
  assert.match(refus, /refuse de laisser un compte/);
});

test('reste entre 0 et le minimum : refus clair ; reste >= minimum : accepte', () => {
  const solde = 1_000_000_000;
  assert.match(verifierLoyerSolana({ soldeLamports: solde, montantLamports: solde - FRAIS_SIGNATURE_LAMPORTS - 100, loyerMinLamports: LOYER }), /MAX/);
  assert.equal(verifierLoyerSolana({ soldeLamports: solde, montantLamports: solde - FRAIS_SIGNATURE_LAMPORTS - LOYER, loyerMinLamports: LOYER }), null);
  assert.match(verifierLoyerSolana({ soldeLamports: solde, montantLamports: solde, loyerMinLamports: LOYER }), /insuffisants/);
});

test('adresse vide : un premier envoi sous le minimum est refuse, au-dessus accepte, destinataire inconnu non bloque', () => {
  const base = { soldeLamports: 5e9, loyerMinLamports: LOYER };
  assert.match(verifierLoyerSolana({ ...base, montantLamports: 500_000, soldeDestLamports: 0 }), /adresse Solana est vide/);
  assert.equal(verifierLoyerSolana({ ...base, montantLamports: LOYER, soldeDestLamports: 0 }), null);
  assert.equal(verifierLoyerSolana({ ...base, montantLamports: 500_000, soldeDestLamports: 1 }), null);
  assert.equal(verifierLoyerSolana({ ...base, montantLamports: 500_000, soldeDestLamports: null }), null);
});

test('minimum inconnu (reseau muet) : repli sur 0,00089088 SOL', () => {
  assert.match(verifierLoyerSolana({ soldeLamports: 1e9, montantLamports: 1e9 - 5000 - 100, loyerMinLamports: null }), /0\.00089/);
});

test('App.js et lib/wallet.js utilisent bien ces regles (MAX et signature)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  assert.match(app, /setSendCryptoAmount\(maxSolEnvoyableTexte\(solanaBalance/);
  const wallet = fs.readFileSync(path.join(__dirname, '..', 'lib', 'wallet.js'), 'utf8');
  const signer = wallet.slice(wallet.indexOf('async function signSolanaTransferTx'), wallet.indexOf('const STAKE_ACCOUNT_SEED_PREFIX'));
  assert.match(signer, /verifierLoyerSolana\(/);
});
