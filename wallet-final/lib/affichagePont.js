// wallet-final/lib/affichagePont.js
// Ecran « Pont cross-chain » : montants lisibles et frais en francais.
// Constate en ligne le 24/11/2026 : « Tu recevras ≈ 0.009944484182001425 ETH »
// (18 decimales) et des frais en anglais brut (« LIFI Fixed Fee »,
// « Relayerfee : 0.000009907459405183 ETH »).

'use strict';

// Montant (texte decimal deja converti, ex. formatUnits) tronque a 6
// decimales -- tronque, jamais arrondi vers le haut : on n'annonce pas plus
// que ce qui sera recu. Une valeur non nulle mais minuscule -> « <0.000001 ».
function montantCourt(texte, decimales = 6) {
  const s = String(texte ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return '?';
  const [entier, frac = ''] = s.split('.');
  const coupe = frac.slice(0, decimales).replace(/0+$/, '');
  const resultat = coupe ? `${entier}.${coupe}` : entier;
  if (resultat === '0' && /[1-9]/.test(frac)) return `<0.${'0'.repeat(decimales - 1)}1`;
  return resultat;
}

// Nom de frais LI.FI -> libelle francais (inconnu : nom d'origine).
function libelleFraisPont(nom) {
  const n = String(nom || '').toLowerCase().replace(/[^a-z]/g, '');
  if (n.includes('integrator')) return 'Frais NexiaWallet';
  if (n.includes('lifi')) return 'Frais LI.FI';
  if (n.includes('relayergas')) return 'Gas du relais';
  if (n.includes('relayer')) return 'Frais du relais';
  if (n.includes('gas')) return 'Frais de réseau';
  return String(nom || 'Frais');
}

module.exports = { montantCourt, libelleFraisPont };
