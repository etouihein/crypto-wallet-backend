'use strict';

// Liste des origines de confiance du frontend, partagée entre le CORS
// (server.js) et toute route qui accepte une URL de redirection fournie par
// le client (payments/create-checkout-session, create-sell-session) — un
// module séparé plutôt qu'un require() de server.js pour éviter une
// dépendance circulaire (server.js require déjà src/routes/wallet.js).
//
// PRODUCTION_ORIGINS est un filet de sécurité en dur : si jamais la variable
// Railway FRONTEND_URLS est absente, mal configurée ou réinitialisée, le
// site public ne se retrouve pas entièrement cassé (cf. incident du
// 2026-07-05). nexiawallet.fr (+ www) ajouté le 2026-07-11, nexiawallet.com
// (+ www) ajouté le 2026-08-12 — garder tous tant que le DNS/rattachement
// Cloudflare Pages de chaque domaine n'est pas confirmé stable.
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8083';

const PRODUCTION_ORIGINS = [
  'https://nexiawallet.pages.dev',
  'https://nexiawallet.fr',
  'https://www.nexiawallet.fr',
  'https://nexiawallet.com',
  'https://www.nexiawallet.com',
];

const FRONTEND_URLS = (process.env.FRONTEND_URLS || FRONTEND_URL)
  .split(',').map(s => s.trim()).filter(Boolean);
for (const origin of PRODUCTION_ORIGINS) {
  if (!FRONTEND_URLS.includes(origin)) FRONTEND_URLS.push(origin);
}

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;
const EXPO_TUNNEL_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.exp\.direct$/i;

function isTrustedOrigin(origin) {
  if (!origin) return false;
  if (FRONTEND_URLS.includes(origin)) return true;
  return LOCAL_ORIGIN_RE.test(origin) || EXPO_TUNNEL_ORIGIN_RE.test(origin);
}

module.exports = { FRONTEND_URL, FRONTEND_URLS, PRODUCTION_ORIGINS, LOCAL_ORIGIN_RE, EXPO_TUNNEL_ORIGIN_RE, isTrustedOrigin };
