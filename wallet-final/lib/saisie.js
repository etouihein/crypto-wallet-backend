// wallet-final/lib/saisie.js
// ─────────────────────────────────────────────────────────────────
//  Petites protections sur ce qui vient de l'utilisateur ou de l'exterieur.
//  Sans dependance : testable en Node.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Montant tape au clavier : le clavier francais met une virgule, et l'on
// ecrit parfois "1 000,50". parseFloat s'arrete au premier caractere
// inattendu ("1 000,5" -> 1). On met donc TOUTES les virgules en points et
// on retire les espaces (y compris insecables) des la saisie. Avant le
// 22/11/2026, seule la premiere virgule etait remplacee.
function normalizeDecimalInput(v) {
  return String(v == null ? '' : v).replace(/[\s  ]/g, '').replace(/,/g, '.');
}

// Lien venant d'une source exterieure (actualites, fiche CoinGecko...) :
// on ne l'ouvre que s'il est http(s). Un "javascript:..." ou "data:..."
// glisse dans un flux ne doit jamais etre ouvert par l'app web.
function lienExterneSur(url) {
  if (typeof url !== 'string') return '';
  const u = url.trim();
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:' ? u : '';
  } catch { return ''; }
}

// Nombre -> texte de montant pour un champ de saisie : arrondi VERS LE BAS
// (jamais plus que le solde) a `decimales` chiffres, sans zeros inutiles, et
// jamais en notation scientifique (String(0.0000001) = "1e-7", illisible).
function montantVersTexte(n, decimales = 8) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return '0';
  const d = Math.max(0, Math.min(18, Math.floor(decimales)));
  const facteur = 10 ** Math.min(d, 15);
  const tronque = Math.floor(x * facteur + 1e-9) / facteur;
  return tronque.toFixed(Math.min(d, 15)).replace(/\.?0+$/, '') || '0';
}

module.exports = { normalizeDecimalInput, lienExterneSur, montantVersTexte };
