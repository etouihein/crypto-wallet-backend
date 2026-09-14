// wallet-final/lib/sentryNoise.js
// ─────────────────────────────────────────────────────────────────
//  Filtre de bruit pour Sentry, isolé ici SANS aucune dépendance (surtout
//  pas @sentry/react-native, qui ne se charge pas hors bundler Metro) —
//  c'est ce qui permet de le tester pour de vrai en Node.
//
//  Ce qu'on filtre, mesuré en prod : le SDK WalletConnect envoie ses propres
//  évènements d'analytics vers pulse.walletconnect.org dès qu'il s'initialise
//  (à chaque déverrouillage du wallet). Quand cette requête "fire and forget"
//  est annulée ou bloquée, elle ressort en promesse rejetée non gérée,
//  impossible à rattraper depuis notre code puisqu'elle naît à l'intérieur du
//  SDK. Forme exacte relevée sur nexiawallet.com :
//
//    value:     "NetworkError: A network error occurred."
//    type:      "Error"
//    stacktrace: absente
//    mechanism: { type: "auto.browser.global_handlers.onunhandledrejection" }
//
//  Coût : 1 évènement Sentry PAR SESSION utilisateur sur un quota gratuit de
//  5 000/mois — saturé en quelques centaines d'utilisateurs, et surtout ce
//  bruit noyait les vraies erreurs.
// ─────────────────────────────────────────────────────────────────

'use strict';

// Sous-chaînes (pas égalité stricte : le message réel porte un préfixe
// "NetworkError: " que la première version de ce filtre avait manqué).
const BENIGN_PATTERNS = [
  'A network error occurred.',
  'Network request failed',
  'Load failed',
];

// Volontairement étroit : une seule exception, AUCUNE pile d'appel, et un
// message réseau générique connu. Une vraie erreur de notre code porte
// toujours une pile qui pointe vers notre code — donc jamais filtrée.
function isBenignThirdPartyNoise(event) {
  const values = event && event.exception && event.exception.values;
  if (!Array.isArray(values) || values.length !== 1) return false;
  const err = values[0] || {};
  const frames = err.stacktrace && err.stacktrace.frames;
  if (Array.isArray(frames) && frames.length > 0) return false;
  const value = String(err.value || '').trim();
  return BENIGN_PATTERNS.some((pattern) => value.includes(pattern));
}

module.exports = { isBenignThirdPartyNoise, BENIGN_PATTERNS };
