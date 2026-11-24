// wallet-final/lib/prixCible.js
// ─────────────────────────────────────────────────────────────────
//  Prix cible d'une alerte de prix : saisi dans la devise d'affichage de
//  l'utilisateur (EUR par defaut), compare aux prix du marche en dollars.
//  Sans dependance : testable en Node.
//
//  Avant le 24/11/2026, le nombre tape etait pris pour des dollars alors
//  que tout l'ecran est en euros : "BTC au-dessus de 100000" (euros dans
//  la tete de l'utilisateur) etait enregistre a 100000 $ = 92 200 EUR, la
//  pastille affichait "92 200 EUR" et l'alerte sonnait 8 % trop tot. En
//  yens (taux 149,5), l'ecart etait enorme.
// ─────────────────────────────────────────────────────────────────

'use strict';

// saisie : texte du champ (deja passe par normalizeDecimalInput) ;
// tauxDevise : unites de la devise d'affichage pour 1 dollar.
// Retourne le prix cible en dollars, ou null si la saisie est invalide.
function prixCibleEnUsd(saisie, tauxDevise) {
  const texte = typeof saisie === 'string' ? saisie.trim() : '';
  if (!/^\d+(\.\d+)?$/.test(texte)) return null;
  const v = Number(texte);
  const taux = Number(tauxDevise);
  if (!Number.isFinite(v) || v <= 0 || !Number.isFinite(taux) || taux <= 0) return null;
  return v / taux;
}

module.exports = { prixCibleEnUsd };
