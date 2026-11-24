// wallet-final/lib/retourAchat.js
// ─────────────────────────────────────────────────────────────────
//  Retour sur nexiawallet.com apres un achat par carte (MoonPay ajoute
//  ?transactionStatus=... a l'adresse de retour) ou en mode demo
//  (?payment=demo). Sans dependance : testable en Node.
//
//  L'adresse de la page peut venir de N'IMPORTE QUI : un lien
//  nexiawallet.com/?transactionStatus=<texte> envoye par un escroc. Avant
//  le 24/11/2026, un statut inconnu etait affiche tel quel dans une alerte
//  officielle du wallet ("Statut Coinbase : <texte de l'escroc>"), par
//  exemple "Wallet compromis, envoie tes fonds a 0x...". Seuls les statuts
//  connus donnent un message ; tout le reste est ignore.
// ─────────────────────────────────────────────────────────────────

'use strict';

const MESSAGES = {
  completed: { titre: '✅ Achat confirmé', message: 'Ton solde se met à jour dès que la transaction est confirmée sur la blockchain — vérification automatique en cours.', verifierSolde: true },
  pending: { titre: '⏳ Achat en cours', message: 'Ton solde se met à jour dès que la transaction est confirmée sur la blockchain — vérification automatique en cours.', verifierSolde: true },
  failed: { titre: '❌ Achat échoué', message: "La transaction d'achat n'a pas abouti.", verifierSolde: false },
};

const DEMO = { titre: '✅ Achat (mode démo)', message: 'Aucun vrai paiement effectué — configure un fournisseur de paiement pour un achat réel.', verifierSolde: false };

// search : window.location.search (ex. "?transactionStatus=completed").
// Retourne null s'il n'y a rien a annoncer, sinon { titre, message,
// verifierSolde, nettoyerAdresse }. nettoyerAdresse = true des qu'un des
// parametres est present (meme inconnu) : on l'efface de la barre d'adresse.
function messageRetourAchat(search) {
  let params;
  try { params = new URLSearchParams(typeof search === 'string' ? search : ''); } catch { return null; }
  const statut = params.get('transactionStatus');
  const demo = params.get('payment') === 'demo';
  if (statut === null && !demo) return null;
  if (statut !== null) {
    const cle = String(statut).trim().toLowerCase();
    const connu = Object.prototype.hasOwnProperty.call(MESSAGES, cle) ? MESSAGES[cle] : null;
    return connu ? { ...connu, nettoyerAdresse: true } : { titre: null, message: null, verifierSolde: false, nettoyerAdresse: true };
  }
  return { ...DEMO, nettoyerAdresse: true };
}

module.exports = { messageRetourAchat };
