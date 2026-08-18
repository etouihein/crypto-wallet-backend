// wallet-final/lib/sentry.js
// ─────────────────────────────────────────────────────────────────
//  Rapport de crash / erreurs (Sentry) — no-op tant qu'aucun DSN n'est
//  configuré (EXPO_PUBLIC_SENTRY_DSN), pour que ce fichier soit sans danger
//  à committer avant même que Pablo ait créé un projet Sentry. Une fois un
//  DSN ajouté à .env (dashboard.sentry.io -> Create Project -> React Native),
//  le rapport d'erreurs s'active automatiquement, aucun autre changement de
//  code nécessaire.
// ─────────────────────────────────────────────────────────────────

'use strict';

const Sentry = require('@sentry/react-native');

const DSN = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SENTRY_DSN) || '';

let initialized = false;

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
  });
  initialized = true;
}

// Enveloppe le composant racine pour capturer les erreurs de rendu React —
// no-op (retourne le composant tel quel) si Sentry n'est pas configuré.
function wrapRootComponent(RootComponent) {
  return DSN ? Sentry.wrap(RootComponent) : RootComponent;
}

module.exports = { initSentry, wrapRootComponent, Sentry };
