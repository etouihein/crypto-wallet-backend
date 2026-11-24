// wallet-final/lib/demandeUnique.js
// ─────────────────────────────────────────────────────────────────
//  Une seule demande de signature affichee a la fois (WalletConnect et
//  navigateur dApp).
//
//  Faille corrigee le 24/11/2026 (audit de securite total) : une nouvelle
//  demande REMPLACAIT celle deja affichee. Une dApp malveillante pouvait
//  envoyer une demande anodine, attendre que l'utilisateur la lise, puis en
//  envoyer une autre juste avant son clic : la fenetre changeait de contenu
//  (et l'analyse de risque affichee pouvait etre encore celle de la premiere)
//  et l'utilisateur signait la seconde sans l'avoir lue. Desormais, tant
//  qu'une demande est ouverte, toute nouvelle demande est refusee tout de
//  suite (la dApp recoit une erreur et peut la renvoyer plus tard).
// ─────────────────────────────────────────────────────────────────

'use strict';

const MESSAGE_DEMANDE_OCCUPEE = "Une autre demande est déjà affichée dans NexiaWallet : valide-la ou refuse-la d'abord, puis réessaie.";

// true si la nouvelle demande peut etre affichee (aucune n'est ouverte).
function nouvelleDemandeAcceptee(demandeOuverte) {
  return demandeOuverte === null || demandeOuverte === undefined;
}

module.exports = { MESSAGE_DEMANDE_OCCUPEE, nouvelleDemandeAcceptee };
