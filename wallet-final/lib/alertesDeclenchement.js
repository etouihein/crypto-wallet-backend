// wallet-final/lib/alertesDeclenchement.js
// ─────────────────────────────────────────────────────────────────
//  Quelles alertes de prix sont atteintes avec les prix du moment.
//  Sans dependance (hors lib/prixMarche.js) : testable en Node.
//
//  Avant le 24/11/2026, les prix de la liste du Marche etaient utilises
//  tels quels, y compris les prix de SECOURS figes du serveur (stale:true,
//  CoinGecko en panne : BTC 64000 $, ETH 3500 $...). Exemple : alerte
//  "BTC en dessous de 70000 $" alors que le BTC vaut 95000 $ ; panne de
//  CoinGecko -> "BTC a chute sous 70000 $" affiche et notifie, faux, et
//  l'alerte etait supprimee. De quoi pousser a vendre dans la panique.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { prixUtilisables } = require('./prixMarche');

// alertes : [{ id, symbol, targetPrice, direction }]
// tokens : { SYM: { price } } (prix deja filtres par fetchMarket)
// marketCoins : reponse brute de GET /market (peut contenir des prix figes)
function alertesAtteintes(alertes, tokens, marketCoins) {
  const prix = {};
  Object.entries(tokens || {}).forEach(([sym, t]) => {
    if (t && typeof t.price === 'number' && Number.isFinite(t.price) && t.price > 0) prix[sym] = t.price;
  });
  prixUtilisables(marketCoins).forEach((c) => {
    const sym = typeof c.symbol === 'string' ? c.symbol.toUpperCase() : null;
    if (sym) prix[sym] = c.current_price;
  });
  return (Array.isArray(alertes) ? alertes : []).filter((a) => {
    const p = a && prix[a.symbol];
    if (!p) return false;
    return a.direction === 'above' ? p >= a.targetPrice : p <= a.targetPrice;
  });
}

module.exports = { alertesAtteintes };
