// wallet-final/lib/venteMontant.js
// ─────────────────────────────────────────────────────────────────
//  Boutons 25 % / 50 % / Tout de l'ecran Vendre (Coinbase). Le montant
//  choisi est annonce a Coinbase, puis l'utilisateur envoie LUI-MEME ce
//  montant a l'adresse de depot : il doit donc pouvoir etre envoye, frais
//  compris. Sans dependance : testable en Node.
//
//  Avant le 24/11/2026, "Tout" sur SOL mettait le solde ENTIER (aucune
//  reserve pour les frais Solana, alors que la reserve existe pour le
//  natif EVM) : la vente etait annoncee a Coinbase pour un montant que
//  l'envoi refusait ensuite. Et le montant etait ecrit avec String(), qui
//  donne "0.30000000000000004" ou "1e-7".
// ─────────────────────────────────────────────────────────────────

'use strict';

const { montantVersTexte, decimalesEnvoi } = require('./saisie');
const { maxSolEnvoyableTexte } = require('./loyerSolana');

// pct : 0.25, 0.5 ou 1. solde : solde du jeton vendu. reserveNative :
// reserve de gas du reseau EVM actif (getNativeGasReserve). reserveSol :
// reserve de frais d'un envoi SOL (SOLANA_SEND_FEE_RESERVE).
function montantRapideVente({ pct, symbole, nativeSymbol, solde, reserveNative = 0, reserveSol = 0 }) {
  const s = Number(solde);
  const p = Number(pct);
  if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(p) || p <= 0) return '0';
  let montant = s * Math.min(p, 1);
  if (p >= 1) {
    // SOL : tout moins les frais exacts, le compte finit a 0 (24/11/2026 :
    // garder 0,00001 laissait 5 000 lamports, refuses par le reseau, voir
    // lib/loyerSolana.js). reserveSol n'est plus utilise.
    if (symbole === 'SOL') return maxSolEnvoyableTexte(s);
    else if (symbole === nativeSymbol) montant = s - (Number(reserveNative) || 0);
  }
  return montantVersTexte(Math.max(0, montant), decimalesEnvoi(symbole));
}

module.exports = { montantRapideVente };
