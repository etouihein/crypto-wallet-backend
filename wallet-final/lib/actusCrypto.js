// wallet-final/lib/actusCrypto.js
// Les bandeaux « Actu crypto en direct » (Accueil, Marche) ne montrent que
// les articles CRYPTO. Avant le 24/11/2026, ils prenaient les 10 plus
// recents toutes sources confondues : on y lisait « Ikea cherche la parade
// face a l'effritement du marche de la maison » (Le Monde Economie) ou
// « World Cup drove profits surge » (BBC Business). L'ecran Actus complet,
// avec son filtre Crypto / Economie, garde tout.

'use strict';

function actusCrypto(items, max = 10) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && (item.category || 'crypto') === 'crypto')
    .slice(0, max);
}

module.exports = { actusCrypto };
