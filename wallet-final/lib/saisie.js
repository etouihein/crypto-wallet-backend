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

// Nombre de decimales qu'un montant d'ENVOI peut avoir pour ce jeton (le
// minimum, toutes chaines confondues : USDC/USDT ont 6 decimales sur
// Ethereum). Au-dela, la signature refuse le montant ("8 decimales au
// maximum" pour BTC, "fractional component exceeds decimals" pour USDC).
function decimalesEnvoi(symbole) {
  if (symbole === 'BTC') return 8;
  if (symbole === 'SOL') return 9;
  if (symbole === 'USDC' || symbole === 'USDT') return 6;
  return 18;
}

// Montant tape -> unites entieres EXACTES du token (wei, lamports, satoshis),
// en texte, pour un devis de swap. Avant le 22/11/2026, l'app faisait
// parseUnits(parseFloat(montant).toFixed(decimales)) : la virgule flottante
// ajoutait du "bruit" ("0.1" en 18 decimales donnait 0.100000000000000006,
// soit un peu PLUS que le montant tape, et plus que le solde avec le bouton
// MAX), et toFixed ARRONDISSAIT les decimales en trop vers le haut. Ici le
// calcul se fait sur le texte, chiffre par chiffre : les decimales en trop
// sont coupees (jamais plus que ce qui est tape). Montant illisible -> erreur.
function montantEnUnites(texte, decimales) {
  const d = Math.floor(Number(decimales));
  if (!Number.isFinite(d) || d < 0 || d > 36) throw new Error('Montant invalide.');
  const txt = normalizeDecimalInput(texte);
  const m = /^(\d*)(?:\.(\d*))?$/.exec(txt);
  if (!m || (m[1] === '' && (m[2] || '') === '')) throw new Error('Montant invalide.');
  const fraction = ((m[2] || '') + '0'.repeat(d)).slice(0, d);
  const unites = BigInt(m[1] || '0') * (10n ** BigInt(d)) + BigInt(fraction || '0');
  return unites.toString();
}

module.exports = { normalizeDecimalInput, lienExterneSur, montantVersTexte, montantEnUnites, decimalesEnvoi };
