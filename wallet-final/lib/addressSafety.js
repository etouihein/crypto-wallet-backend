// wallet-final/lib/addressSafety.js
// ─────────────────────────────────────────────────────────────────
//  Détection heuristique de "address poisoning" : un attaquant envoie un
//  virement de 0 (ou quasi 0) depuis une adresse choisie pour ressembler
//  visuellement à un contact déjà connu de la victime (même début ET même
//  fin, milieu différent), dans l'espoir qu'elle la recopie plus tard depuis
//  son historique sans comparer chaque caractère. Purement local — compare
//  juste l'adresse saisie à celles déjà dans le carnet d'adresses de l'app.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Retourne l'adresse connue qu'elle imite si `candidate` partage le même
// préfixe/suffixe qu'une adresse déjà connue sans lui être identique, sinon
// null. 6 caractères hex de chaque côté (au-delà du "0x") = ce qu'un
// utilisateur vérifie réellement d'un coup d'œil, en pratique.
function looksLikePoisonedAddress(candidate, knownAddresses, { prefixLen = 6, suffixLen = 6 } = {}) {
  if (!candidate) return null;
  const c = candidate.toLowerCase();
  for (const known of knownAddresses || []) {
    const k = (known || '').toLowerCase();
    if (!k || k === c) continue;
    if (k.length !== c.length) continue;
    if (k.slice(0, 2 + prefixLen) === c.slice(0, 2 + prefixLen) && k.slice(-suffixLen) === c.slice(-suffixLen)) {
      return known;
    }
  }
  return null;
}

module.exports = { looksLikePoisonedAddress };
