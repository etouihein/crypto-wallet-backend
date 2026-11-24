// wallet-final/lib/prixMarche.js
// ─────────────────────────────────────────────────────────────────
//  Quels prix de GET /market l'app a le droit d'utiliser pour ses calculs
//  (valeur du portefeuille, envoi saisi en euros, achat, estimation de
//  swap). Sans dependance : testable en Node.
//
//  Quand CoinGecko ne repond pas, le serveur renvoie des prix de SECOURS
//  ecrits en dur dans son code (ETH 3500 $, BTC 64000 $...), marques
//  stale:true. Avant le 24/11/2026, l'app les recopiait comme de vrais
//  prix : un envoi saisi en euros etait alors converti avec un prix faux
//  (ex. BTC reel 95000 $ : 100 EUR tapes = 0,00156 BTC envoyes, soit
//  environ 148 EUR partis). Ces prix restent affichables dans la liste du
//  Marche (marquee "prix differes"), mais ne servent plus a aucun calcul.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Garde seulement les entrees avec un vrai prix recu de CoinGecko :
// pas de drapeau stale, prix numerique strictement positif.
function prixUtilisables(tokensData) {
  if (!Array.isArray(tokensData)) return [];
  return tokensData.filter((t) => t
    && t.stale !== true
    && typeof t.current_price === 'number'
    && Number.isFinite(t.current_price)
    && t.current_price > 0);
}

module.exports = { prixUtilisables };
