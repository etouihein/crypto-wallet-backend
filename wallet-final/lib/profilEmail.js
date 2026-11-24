// wallet-final/lib/profilEmail.js
// ─────────────────────────────────────────────────────────────────
//  Message signe par le wallet pour lier (ou retirer) un e-mail a son
//  adresse. Le serveur (crypto-wallet/src/routes/wallet.js) reconstruit
//  EXACTEMENT le meme texte et verifie la signature : seul le proprietaire
//  de l'adresse peut y lier son e-mail ou l'en retirer (avant le 24/11/2026,
//  n'importe qui pouvait le faire pour n'importe quelle adresse).
//  L'horodatage (secondes) limite la reutilisation d'une signature a 10 min.
// ─────────────────────────────────────────────────────────────────

'use strict';

function messageProfilEmail(action, adresse, email, horodatage) {
  const a = String(adresse || '').toLowerCase();
  if (action === 'supprimer') return `NexiaWallet: supprimer l'email du wallet ${a} (horodatage ${horodatage})`;
  return `NexiaWallet: lier l'email ${String(email || '').trim().toLowerCase()} au wallet ${a} (horodatage ${horodatage})`;
}

module.exports = { messageProfilEmail };
