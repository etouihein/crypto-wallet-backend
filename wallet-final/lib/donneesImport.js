// wallet-final/lib/donneesImport.js
// « Importer mes donnees » (Parametres) : le texte colle est verifie AVANT
// d'etre enregistre (24/11/2026). Avant, tout etait pris tel quel :
//  - une « adresse recente » piegee (celle d'un escroc, etiquetee « Maman »)
//    apparaissait dans les raccourcis de l'ecran Envoyer ET comptait comme
//    adresse connue pour la detection d'adresse piegee ;
//  - une adresse qui n'est pas du texte faisait planter l'ecran Envoyer
//    (a.address.toLowerCase()).
// Ici : adresses valides seulement, etiquettes courtes, listes limitees.

'use strict';

const ETIQUETTES_TX = ['Perso', 'Pro', 'Cadeau'];

// estAdresse : fonction (texte) -> bool fournie par l'app (EVM, Solana, Bitcoin).
function nettoyerImport(parsed, { estAdresse, maxRecentes = 8 } = {}) {
  const sortie = {};
  if (!parsed || typeof parsed !== 'object') return sortie;
  if (Array.isArray(parsed.favorites)) {
    sortie.favorites = [...new Set(parsed.favorites.filter((f) => typeof f === 'string' && f.length > 0 && f.length <= 80))].slice(0, 200);
  }
  if (Array.isArray(parsed.recentAddresses)) {
    const vues = new Set();
    sortie.recentAddresses = [];
    for (const a of parsed.recentAddresses) {
      const adresse = a && typeof a.address === 'string' ? a.address.trim() : '';
      if (!adresse || typeof estAdresse !== 'function' || !estAdresse(adresse)) continue;
      const cle = adresse.toLowerCase();
      if (vues.has(cle)) continue;
      vues.add(cle);
      const label = typeof a.label === 'string' ? a.label.trim().slice(0, 40) : '';
      sortie.recentAddresses.push({ address: adresse, label });
      if (sortie.recentAddresses.length >= maxRecentes) break;
    }
  }
  if (Array.isArray(parsed.priceAlerts)) sortie.priceAlerts = parsed.priceAlerts; // nettoyees par nettoyerAlertes dans l'app
  if (parsed.txTags && typeof parsed.txTags === 'object' && !Array.isArray(parsed.txTags)) {
    sortie.txTags = {};
    for (const [hash, tag] of Object.entries(parsed.txTags)) {
      if (typeof hash === 'string' && hash.length <= 120 && ETIQUETTES_TX.includes(tag)) sortie.txTags[hash] = tag;
    }
  }
  return sortie;
}

module.exports = { nettoyerImport };
