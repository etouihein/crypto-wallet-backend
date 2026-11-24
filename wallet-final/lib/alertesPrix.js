// wallet-final/lib/alertesPrix.js
// ─────────────────────────────────────────────────────────────────
//  Liste des alertes de prix lue depuis le stockage de l'appareil ou
//  depuis l'import "Migration entre appareils" (JSON colle par
//  l'utilisateur). Sans dependance : testable en Node.
//
//  Avant le 24/11/2026, la liste etait reprise telle quelle. Une seule
//  entree abimee (null, texte...) faisait planter l'ecran d'accueil
//  (priceAlerts.some(a => a.symbol ...)) : page blanche, et comme la
//  liste est enregistree, page blanche a CHAQUE ouverture. Sur le web,
//  la seule sortie etait d'effacer les donnees du site, donc le wallet
//  chiffre de l'appareil.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Garde seulement les alertes completes et lisibles.
function nettoyerAlertes(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.filter((a) => a
    && typeof a === 'object'
    && typeof a.id === 'string' && a.id.length > 0
    && typeof a.symbol === 'string' && a.symbol.length > 0
    && typeof a.targetPrice === 'number' && Number.isFinite(a.targetPrice) && a.targetPrice > 0
    && (a.direction === 'above' || a.direction === 'below'));
}

module.exports = { nettoyerAlertes };
