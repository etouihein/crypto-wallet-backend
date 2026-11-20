'use strict';
// Parcours anonyme des visiteurs (version web uniquement) : envoie a Umami le NOM
// d'une etape franchie ("wallet_cree", "swap_envoye"...), pour savoir a quelle
// etape les visiteurs abandonnent. RIEN d'autre n'est envoye : ni adresse, ni
// montant, ni jeton, ni reseau, ni identifiant — seulement le nom de l'etape,
// pris dans la liste fermee ci-dessous (tout autre nom est ignore).
// Sur mobile (pas de window.umami) et si Umami est bloque, ne fait rien.

const ETAPES = Object.freeze([
  'creer_wallet_clic', // bouton "Creer mon wallet"
  'importer_clic', // bouton "J'ai deja un wallet"
  'wallet_cree', // PIN choisi : nouveau wallet enregistre
  'wallet_importe', // PIN choisi : wallet importe enregistre
  'ecran_swap', // onglet Swap ouvert
  'swap_devis', // devis de swap obtenu et affiche
  'swap_envoye', // swap signe et envoye au reseau
  'bridge_devis', // devis de bridge obtenu
  'bridge_envoye', // bridge envoye au reseau
  'envoi_crypto', // envoi de crypto reussi
  'achat_carte', // page d'achat par carte ouverte
  'vente_carte', // page de vente ouverte
]);

let dejaEnvoye = new Set();

function etape(nom, env = typeof window !== 'undefined' ? window : undefined) {
  if (!ETAPES.includes(nom)) return false;
  try {
    const umami = env && env.umami;
    if (!umami || typeof umami.track !== 'function') return false;
    // une seule fois par chargement de page pour les etapes d'ecran (evite de
    // compter 10 fois un aller-retour sur l'onglet Swap)
    if (nom === 'ecran_swap') {
      if (dejaEnvoye.has(nom)) return false;
      dejaEnvoye.add(nom);
    }
    umami.track(nom); // nom seul : aucune donnee jointe
    return true;
  } catch (e) {
    return false; // la mesure d'audience ne doit jamais casser l'app
  }
}

function _reinitialiserPourTests() { dejaEnvoye = new Set(); }

module.exports = { etape, ETAPES, _reinitialiserPourTests };
