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

// Partie FIXE du debut d'une adresse, la meme pour tout le monde : "0x"
// (EVM), "bc1q"/"bc1p" (Bitcoin). Elle ne prouve rien, on compare les
// caracteres QUI SUIVENT.
function partieFixe(adresse) {
  if (/^0x/i.test(adresse)) return 2;
  const m = /^(bc1[qp]|tb1[qp])/i.exec(adresse);
  return m ? m[1].length : 0;
}

// Forme a comparer : EVM et Bitcoin bc1 ne tiennent pas compte de la casse ;
// une adresse Solana (base58) SI : deux casses differentes = deux adresses.
function formeComparable(adresse) {
  return /^(0x|bc1|tb1)/i.test(adresse) ? adresse.toLowerCase() : adresse;
}

// Retourne l'adresse connue qu'elle imite si `candidate` partage le meme
// debut et la meme fin qu'une adresse deja connue sans lui etre identique,
// sinon null.
//  - EVM (0x...) : 6 caracteres hex de chaque cote (au-dela du "0x"),
//    longueurs identiques (toujours 42).
//  - Solana, Bitcoin : 4 caracteres de chaque cote (au-dela de "bc1q"),
//    comme les fausses adresses fabriquees contre Phantom et les wallets
//    Bitcoin. Longueur libre (une adresse Solana fait 32 a 44 caracteres).
// Avant le 23/11/2026, seul le cas EVM etait vraiment couvert : une
// fausse adresse Solana ou Bitcoin aux 4 memes premiers et derniers
// caracteres passait sans alerte.
function looksLikePoisonedAddress(candidate, knownAddresses, options = {}) {
  if (!candidate || typeof candidate !== 'string') return null;
  const c = formeComparable(candidate.trim());
  const fixeC = partieFixe(c);
  const evm = fixeC === 2;
  const prefixLen = options.prefixLen ?? (evm ? 6 : 4);
  const suffixLen = options.suffixLen ?? (evm ? 6 : 4);
  for (const known of knownAddresses || []) {
    if (!known || typeof known !== 'string') continue;
    const k = formeComparable(known.trim());
    if (!k || k === c) continue;
    if (partieFixe(k) !== fixeC) continue;
    if (evm && k.length !== c.length) continue;
    if (k.length < fixeC + prefixLen + suffixLen || c.length < fixeC + prefixLen + suffixLen) continue;
    if (k.slice(0, fixeC + prefixLen) === c.slice(0, fixeC + prefixLen) && k.slice(-suffixLen) === c.slice(-suffixLen)) {
      return known;
    }
  }
  return null;
}

module.exports = { looksLikePoisonedAddress };
