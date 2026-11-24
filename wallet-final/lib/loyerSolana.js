// wallet-final/lib/loyerSolana.js
// ─────────────────────────────────────────────────────────────────
//  Regle du « loyer » Solana pour un envoi de SOL. Le reseau refuse
//  qu'un compte termine une transaction avec un solde STRICTEMENT entre
//  0 et son minimum (« rent-exempt », ~0,00089 SOL pour un compte simple,
//  valeur demandee au reseau : getMinimumBalanceForRentExemption(0)).
//  Un compte peut en revanche finir a 0 exactement (il est ferme).
//
//  Avant le 24/11/2026 :
//  - le bouton MAX laissait 0,00001 SOL - 0,000005 de frais = 5 000
//    lamports sur le compte : l'envoi etait TOUJOURS refuse par le reseau
//    (« insufficient funds for rent ») avec un message incomprehensible ;
//  - un envoi laissant quelques milliemes de SOL, ou un premier envoi de
//    moins de ~0,00089 SOL vers une adresse vide, echouait de la meme facon.
//  Ces cas sont maintenant detectes AVANT de signer, avec un message clair.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Frais de base d'une transaction a une signature (5 000 lamports).
const FRAIS_SIGNATURE_LAMPORTS = 5000;
// Repli si le reseau ne repond pas : minimum d'un compte sans donnees.
const LOYER_MIN_DEFAUT_LAMPORTS = 890880;

const enSol = (lamports) => (Number(lamports) / 1e9).toFixed(6).replace(/\.?0+$/, '');

// Montant maximum envoyable (en lamports) : tout le solde moins les frais,
// le compte finit a 0 exactement, ce que le reseau accepte.
function maxSolEnvoyableLamports(soldeLamports) {
  const solde = Math.floor(Number(soldeLamports) || 0);
  return Math.max(0, solde - FRAIS_SIGNATURE_LAMPORTS);
}

// Meme calcul, depuis un solde affiche en SOL (texte ou nombre), rendu en
// TEXTE exact au lamport pres (calcul en entiers : un arrondi de virgule
// flottante qui laisserait 1 lamport retomberait dans la zone interdite).
function maxSolEnvoyableTexte(soldeSol) {
  const lamports = maxSolEnvoyableLamports(Math.round((parseFloat(soldeSol) || 0) * 1e9));
  if (lamports <= 0) return '0';
  const entier = Math.floor(lamports / 1e9);
  const fraction = String(lamports % 1e9).padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${entier}.${fraction}` : String(entier);
}

// Renvoie null si l'envoi est acceptable, sinon un message clair.
// soldeDestLamports : null/undefined si inconnu (pas de verification).
function verifierLoyerSolana({ soldeLamports, montantLamports, loyerMinLamports, soldeDestLamports }) {
  const solde = Number(soldeLamports);
  const montant = Number(montantLamports);
  const loyer = Number(loyerMinLamports) > 0 ? Number(loyerMinLamports) : LOYER_MIN_DEFAUT_LAMPORTS;
  const reste = solde - montant - FRAIS_SIGNATURE_LAMPORTS;
  if (reste < 0) return 'Fonds SOL insuffisants (montant + frais du réseau).';
  if (reste > 0 && reste < loyer) {
    return `Il te resterait ${enSol(reste)} SOL : le réseau Solana refuse de laisser un compte avec moins de ${enSol(loyer)} SOL. Envoie tout (bouton MAX) ou garde au moins ${enSol(loyer)} SOL.`;
  }
  if (soldeDestLamports !== null && soldeDestLamports !== undefined && Number(soldeDestLamports) === 0 && montant < loyer) {
    return `Cette adresse Solana est vide : le réseau exige un premier envoi d'au moins ${enSol(loyer)} SOL.`;
  }
  return null;
}

module.exports = {
  FRAIS_SIGNATURE_LAMPORTS,
  LOYER_MIN_DEFAUT_LAMPORTS,
  maxSolEnvoyableLamports,
  maxSolEnvoyableTexte,
  verifierLoyerSolana,
};
