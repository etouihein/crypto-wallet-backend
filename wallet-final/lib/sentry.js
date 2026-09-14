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

// Filtre de bruit tiers (WalletConnect analytics) — logique isolée dans
// lib/sentryNoise.js pour être testable en Node, voir les détails là-bas.
const { isBenignThirdPartyNoise } = require('./sentryNoise');

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
