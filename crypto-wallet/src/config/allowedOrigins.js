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
// Domaine principal de prod, utilisé comme fallback de redirection quand
// aucune origine de confiance n'est fournie par le client (voir FRONTEND_URL
// plus bas) — référencé depuis PRODUCTION_ORIGINS ci-dessous plutôt que
// dupliqué en litéral, pour n'avoir qu'une seule source de vérité si ce
// domaine change un jour (cf. historique des migrations dans le commentaire
// au-dessus de PRODUCTION_ORIGINS).
const PRIMARY_ORIGIN = 'https://nexiawallet.com';

const PRODUCTION_ORIGINS = [
  'https://nexiawallet.pages.dev',
  'https://nexiawallet.fr',
  'https://www.nexiawallet.fr',
  PRIMARY_ORIGIN,
  'https://www.nexiawallet.com',
];

// process.env.FRONTEND_URL a déjà été trouvée mal configurée sur Railway par
// le passé (contenant la même liste multi-domaines que FRONTEND_URLS,
// virgules et retour à la ligne compris, au lieu d'une seule origine) — ne
// jamais l'utiliser telle quelle comme cible de redirection de secours.
const FRONTEND_URLS = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:8083')
  .split(',').map(s => s.trim()).filter(Boolean);
for (const origin of PRODUCTION_ORIGINS) {
  if (!FRONTEND_URLS.includes(origin)) FRONTEND_URLS.push(origin);
}

// FRONTEND_URL sert de fallback de redirection (Stripe/MoonPay) quand aucune
// origine de confiance n'est fournie par le client — voir wallet.js. On
// n'accepte process.env.FRONTEND_URL brute que si c'est une SEULE URL http(s)
// bien formée (ex. FRONTEND_URL=http://192.168.1.2:8083 pour tester sur un
// device physique en LAN, cf. .env.example) ; toute valeur qui contient une
// virgule ou un retour à la ligne (comme la liste multi-domaines mal
// configurée sur Railway) est ignorée au profit du domaine principal de prod,
// garanti bien formé.
const SINGLE_WELL_FORMED_ORIGIN_RE = /^https?:\/\/[^\s,]+$/;
const rawFrontendUrl = (process.env.FRONTEND_URL || '').trim();
const FRONTEND_URL = SINGLE_WELL_FORMED_ORIGIN_RE.test(rawFrontendUrl) ? rawFrontendUrl : PRIMARY_ORIGIN;

const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/;
const EXPO_TUNNEL_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.exp\.direct$/i;

function isTrustedOrigin(origin) {
  if (!origin) return false;
  if (FRONTEND_URLS.includes(origin)) return true;
  return LOCAL_ORIGIN_RE.test(origin) || EXPO_TUNNEL_ORIGIN_RE.test(origin);
}

module.exports = { FRONTEND_URL, FRONTEND_URLS, PRODUCTION_ORIGINS, LOCAL_ORIGIN_RE, EXPO_TUNNEL_ORIGIN_RE, isTrustedOrigin };
