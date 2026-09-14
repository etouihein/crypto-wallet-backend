// wallet-final/lib/sentry.js
// ─────────────────────────────────────────────────────────────────
//  Rapport de crash / erreurs (Sentry). Projet "react-native" de
//  l'organisation nexia-wallet sur sentry.io (plan gratuit).
//
//  Le DSN Sentry n'est PAS un secret : il est conçu pour être embarqué
//  dans le bundle client public (il ne permet QUE d'envoyer des
//  événements, jamais d'en lire) — même logique que
//  EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID. On le code donc en dur ici
//  comme fallback, pour que les builds déployés (Cloudflare Pages,
//  builds natifs) reportent automatiquement sans avoir à configurer
//  une variable d'environnement sur chaque plateforme de déploiement.
//
//  Résolution du DSN :
//    1. EXPO_PUBLIC_SENTRY_DSN si défini (permet de pointer un autre
//       projet, ou de forcer l'activation en dev local pour tester) ;
//    2. sinon, le DSN en dur — mais UNIQUEMENT hors dev (__DEV__ faux),
//       pour ne pas cramer le quota gratuit (5k évènements/mois) avec
//       les erreurs de `expo start` pendant le développement.
// ─────────────────────────────────────────────────────────────────

'use strict';

const Sentry = require('@sentry/react-native');

const FALLBACK_DSN = 'https://f73fa5f0a8fabefe4b5d181446783c3c@o4512062719590400.ingest.de.sentry.io/4512062728306768';
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const DSN =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SENTRY_DSN) ||
  (isDev ? '' : FALLBACK_DSN);

let initialized = false;

// Bruit de fond de librairies tierces, mesuré en prod : le SDK WalletConnect
// envoie des évènements d'analytics en "fire and forget" vers
// pulse.walletconnect.org dès qu'il s'initialise (à chaque déverrouillage du
// wallet). Quand cette requête est annulée/bloquée — navigation, bloqueur de
// pub, réseau capricieux — elle ressort en promesse rejetée non gérée
// ("A network error occurred.", sans pile d'appel) que personne ne peut
// rattraper depuis notre code : elle naît à l'intérieur du SDK.
// Résultat mesuré : 1 évènement Sentry gaspillé PAR SESSION utilisateur, sur
// un quota gratuit de 5 000/mois — de quoi le saturer dès quelques centaines
// d'utilisateurs et surtout noyer les vraies erreurs.
// On ne filtre que ce cas précis : message générique de réseau ET aucune pile
// d'appel. Une vraie erreur réseau de notre code (axios vers le backend, RPC)
// est soit déjà rattrapée et affichée à l'utilisateur, soit accompagnée d'une
// pile qui pointe vers notre code — donc jamais concernée par ce filtre.
const BENIGN_MESSAGES = [
  'A network error occurred.',
  'Network request failed',
  'Load failed',
];

function isBenignThirdPartyNoise(event) {
  const values = event?.exception?.values;
  if (!Array.isArray(values) || values.length !== 1) return false;
  const [err] = values;
  const hasStack = !!err?.stacktrace?.frames?.length;
  return !hasStack && BENIGN_MESSAGES.includes((err?.value || '').trim());
}

function initSentry() {
  if (!DSN || initialized) return;
  Sentry.init({
    dsn: DSN,
    // Pas de PII (adresse email, IP...) envoyée par défaut — un wallet crypto
    // n'a pas d'email/compte utilisateur de toute façon, mais san garder ce
    // réflexe explicite plutôt que de compter sur le défaut du SDK.
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
    environment: (typeof process !== 'undefined' && process.env.NODE_ENV) || 'production',
    beforeSend: (event) => (isBenignThirdPartyNoise(event) ? null : event),
  });
  initialized = true;
}

// Enveloppe le composant racine pour capturer les erreurs de rendu React —
// no-op (retourne le composant tel quel) si Sentry n'est pas configuré.
function wrapRootComponent(RootComponent) {
  return DSN ? Sentry.wrap(RootComponent) : RootComponent;
}

module.exports = { initSentry, wrapRootComponent, Sentry, isBenignThirdPartyNoise };
