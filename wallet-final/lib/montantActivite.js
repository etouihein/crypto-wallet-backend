// wallet-final/lib/montantActivite.js
// Montant d'une ligne de l'Activite. Avant le 24/11/2026 : toFixed(5),
// donc une poussiere (0,000001 ETH, technique de l'adresse piegee) et un
// vrai 0 s'affichaient pareil, « +0.00000 ETH », ce qui ne voulait rien dire.

'use strict';

function montantActivite(montant) {
  const n = Number(montant);
  if (!Number.isFinite(n)) return '?';
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a < 0.00001) return '<0.00001';
  return a.toFixed(5);
}

module.exports = { montantActivite };
