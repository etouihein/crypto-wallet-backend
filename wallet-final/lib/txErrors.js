// wallet-final/lib/txErrors.js
// ─────────────────────────────────────────────────────────────────
//  Messages d'erreur clairs pour l'utilisateur (sorti d'App.js, chantier
//  V3 de decoupage, sans changement de comportement).
// ─────────────────────────────────────────────────────────────────

'use strict';

// ethers.js (v5) colle parfois le JSON-RPC brut ENTIER dans error.message
// (utile en debug, mais un vrai utilisateur a fini par voir un pavé JSON
// illisible dans une alerte "Erreur" — cas réel remonté par Pablo sur un
// swap qui a échoué faute de marge pour le gas). On reconnaît les cas
// fréquents pour un message clair, et on réduit tout le reste à un message
// court plutôt que d'afficher le JSON brut. Utiliser partout où une erreur
// de transaction (send/swap/bridge/stake/NFT/paiement...) est affichée.
function humanizeTxError(err) {
  const raw = String((typeof err?.message === 'string' && err.message) || (typeof err === 'string' && err) || '').trim();
  if (!raw) return null;
  if (/insufficient funds/i.test(raw)) {
    return 'Solde insuffisant pour couvrir le montant ET les frais de réseau (gas) — laisse un peu de marge.';
  }
  if (/nonce too low|already known|replacement transaction underpriced/i.test(raw)) {
    return 'Une transaction est déjà en cours sur ce wallet — réessaie dans quelques secondes.';
  }
  if (/timeout|network ?error|ECONNABORTED/i.test(raw)) {
    return 'Le réseau ne répond pas — réessaie dans un instant.';
  }
  // Erreur HTTP d'axios : « Request failed with status code 503 » s'affichait
  // tel quel à l'utilisateur. Serveur en panne ou surchargé → message clair.
  const httpStatus = err?.response?.status || Number((raw.match(/status code (\d{3})/i) || [])[1]);
  if (httpStatus >= 500 || httpStatus === 429) {
    return 'Le service ne répond pas pour le moment — réessaie dans un instant. Tes fonds ne sont pas concernés.';
  }
  // Sinon (400, 404...), le backend explique POURQUOI dans sa réponse — la
  // raison de l'agrégateur de swap, par exemple. « Request failed with status
  // code 400 » n'apprend rien ; cette explication-là, si.
  const duServeur = err?.response?.data?.error;
  if (typeof duServeur === 'string' && duServeur.trim() && duServeur.trim().length < 200) {
    return duServeur.trim();
  }
  // Ethers ajoute parfois "[ See: https://... ]" ou "(error={...})" avec le
  // JSON-RPC complet à la suite d'un message par ailleurs correct — nos
  // propres `throw new Error(...)` (messages métier) n'ont jamais ça.
  const looksLikeRawDump = /\[\s*See:|\(error=\{|"jsonrpc"/i.test(raw) || raw.length > 200;
  if (looksLikeRawDump) {
    const cleaned = raw.split(/\s*\[\s*See:|\s*\(error=/)[0].trim();
    return cleaned && cleaned.length < 120 ? cleaned : null;
  }
  return raw;
}

module.exports = { humanizeTxError };
