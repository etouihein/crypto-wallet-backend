// wallet-final/lib/leurreDetresse.js
// ─────────────────────────────────────────────────────────────────
//  PIN de detresse : « affiche un wallet vide si on te force a l'ouvrir ».
//  Avant le 24/11/2026, seul le SOLDE etait mis a zero. L'adresse affichee
//  restait la VRAIE : l'Activite montrait le vrai historique (« Recu +2 ETH »),
//  la galerie NFT les vrais NFT, Parametres la liste des vrais comptes (avec
//  le bouton de suppression). Celui qui te force voyait donc que le wallet
//  n'est pas vide, et pouvait retrouver le vrai solde sur un explorateur.
//
//  En mode detresse, l'app utilise maintenant une adresse LEURRE : une vraie
//  adresse Ethereum bien formee, toujours la meme pour un wallet donne,
//  calculee par hachage de la vraie (impossible de remonter a la vraie), et
//  sans aucun historique. Personne n'en a la cle : rien ne peut etre signe
//  en mode detresse de toute facon (aucune cle dechiffree).
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');

function adresseLeurre(adresseReelle) {
  const graine = `nexia-detresse:v1:${String(adresseReelle || '').toLowerCase()}`;
  const empreinte = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(graine));
  return ethers.utils.getAddress(`0x${empreinte.slice(-40)}`);
}

module.exports = { adresseLeurre };
