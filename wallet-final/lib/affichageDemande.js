// wallet-final/lib/affichageDemande.js
// ─────────────────────────────────────────────────────────────────
//  Ce que la fenetre de signature affiche (WalletConnect, navigateur dApp).
//  Audit de securite total, 24/11/2026 :
//  - siteDemandeur : la fenetre WalletConnect n'indiquait PAS quel site
//    demandait la signature (seulement le reseau). Un site connecte pouvait
//    faire passer sa demande pour celle d'un autre. On affiche le domaine
//    (tire de l'URL declaree a la connexion) et le nom, et on le dit quand
//    le site est inconnu.
//  - montantNatifLisible : un montant illisible ("abc") faisait planter la
//    fenetre au lieu d'etre signale.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');

function siteDemandeur(sessions, topic) {
  const session = Array.isArray(sessions) ? sessions.find((s) => s && s.topic === topic) : null;
  const meta = session && session.peer && session.peer.metadata;
  let domaine = '';
  try { domaine = meta && meta.url ? new URL(String(meta.url)).host : ''; } catch { domaine = ''; }
  const nom = meta && typeof meta.name === 'string' ? meta.name.slice(0, 60) : '';
  if (!domaine) return { connu: false, texte: 'Site inconnu : vérifie que tu as bien lancé cette action toi-même.' };
  return { connu: true, texte: nom ? `${domaine} (se présente comme « ${nom} »)` : domaine };
}

function montantNatifLisible(value) {
  if (value === undefined || value === null || value === '') return '0';
  try { return ethers.utils.formatEther(ethers.BigNumber.from(value)); } catch { return '⚠️ montant illisible : refuse cette demande'; }
}

module.exports = { siteDemandeur, montantNatifLisible };
