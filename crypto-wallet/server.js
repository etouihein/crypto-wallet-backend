'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const walletRoutes = require('./src/routes/wallet');

// Filet de sécurité process-level : sans ça, une seule exception non
// rattrapée (une promesse rejetée sans .catch quelque part, par exemple)
// fait planter tout le serveur pour TOUS les utilisateurs en même temps,
// jusqu'au redémarrage automatique de Railway. On loggue toujours juste le
// message (jamais l'objet entier, qui pourrait contenir des en-têtes de
// requête ou un corps de requête sensible) et on ne quitte le process que
// sur uncaughtException (l'état de l'app peut être corrompu à ce stade —
// convention Node standard) : Railway relance le process automatiquement.
process.on('unhandledRejection', (reason) => {
  console.error('Promesse rejetée non gérée :', reason instanceof Error ? reason.message : String(reason));
});
process.on('uncaughtException', (err) => {
  console.error('Exception non rattrapée — arrêt pour redémarrage propre :', err.message);
  process.exit(1);
});

const app = express();

const PORT = process.env.PORT || 3000;
const ENV  = process.env.NODE_ENV || 'development';

if (ENV === 'production') {
  // Nécessaire pour que express-rate-limit voie la vraie IP du client
  // quand le serveur est derrière un reverse proxy (Caddy/Nginx/Cloudflare).
  app.set('trust proxy', 1);
  if (!process.env.HTTPS_TERMINATED_BY_PROXY) {
    console.warn(
      '⚠️  NODE_ENV=production sans HTTPS_TERMINATED_BY_PROXY=1 : ' +
      'ce serveur relaie des transactions signées et des données sensibles côté client. ' +
      'Ne l\'expose JAMAIS publiquement en HTTP brut — mets un reverse proxy ' +
      '(Caddy, Nginx, Cloudflare Tunnel...) qui termine le HTTPS devant lui, ' +
      'puis fixe HTTPS_TERMINATED_BY_PROXY=1 dans .env pour faire taire cet avertissement.'
    );
  }
  if ((process.env.PAYMENT_PROVIDER || '').toLowerCase() === 'moonpay' && !process.env.MOONPAY_WEBHOOK_KEY) {
    console.warn(
      '⚠️  PAYMENT_PROVIDER=moonpay sans MOONPAY_WEBHOOK_KEY en production : ' +
      'les webhooks MoonPay seront reçus mais jamais vérifiés (aucune confirmation ' +
      'd\'achat fiable côté serveur). Récupère la clé sur dashboard.moonpay.com > ' +
      'Developers > Webhooks et fixe MOONPAY_WEBHOOK_KEY dans .env.'
    );
  }
}

// Origines autorisées en CORS. En dev, Expo change souvent de port/IP (web
// sur 8081, parfois 8083, IP LAN pour le téléphone, tunnel *.exp.direct qui
// change de sous-domaine à chaque session...) — plutôt que de se faire
// bloquer silencieusement à chaque changement, on accepte toujours
// localhost/IP privée et les tunnels Expo, même en production : ce backend
// sert à la fois de backend de dev et de prod, et ces routes sont déjà
// protégées par x-api-key, donc l'origine n'est pas la seule barrière.
// En plus de ça, la liste explicite FRONTEND_URLS (voir
// src/config/allowedOrigins.js, partagé avec la validation de returnUrl
// dans src/routes/wallet.js) reste vérifiée pour un vrai domaine de prod.
const { isTrustedOrigin } = require('./src/config/allowedOrigins');

function corsOriginCheck(origin, callback) {
  if (!origin) return callback(null, true); // apps natives / requêtes serveur à serveur : pas d'en-tête Origin
  if (isTrustedOrigin(origin)) return callback(null, true);
  return callback(new Error(`Origine non autorisée par CORS : ${origin}`));
}

// Filet de sécurité HTTPS : sur Render/Railway/Fly, le TLS est terminé par la
// plateforme puis relayé en HTTP interne — `trust proxy` fait que req.secure
// reflète le X-Forwarded-Proto envoyé par cette plateforme. Si jamais une
// requête arrive quand même en clair, on redirige plutôt que de la traiter.
if (ENV === 'production') {
  app.use((req, res, next) => {
    if (req.secure || req.method === 'OPTIONS') return next();
    res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Configuration des Middlewares globaux
app.use(cors({ origin: corsOriginCheck }));
app.use(express.json({
  // Garde le corps brut pour vérifier la signature des webhooks MoonPay
  // (le HMAC se calcule sur les octets exacts reçus, pas sur du JSON re-sérialisé).
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); },
}));

// Anti-bruteforce : limite le nombre de requêtes par IP (voir RATE_LIMIT_MAX dans .env)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Sécurité HTTP minimale pour le développement
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc:    ["'self'", 'fonts.gstatic.com'],
      imgSrc:     ["'self'", 'data:'],
      connectSrc: ["'self'"]
    }
  }
}));

// Activation des routes du Wallet
app.use('/wallet', walletRoutes);

// Route de test pour vérifier que le serveur vit
app.get('/', (req, res) => {
  res.json({ status: "OK", message: "Le serveur du Crypto Wallet fonctionne parfaitement !" });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', network: 'mainnet-ready', timestamp: new Date().toISOString() });
});

// Erreur CORS (origine refusée) → 403 propre, jamais de stack trace exposée.
app.use((err, req, res, next) => {
  if (err && /CORS/.test(err.message || '')) {
    return res.status(403).json({ success: false, error: 'Origine non autorisée.' });
  }
  next(err);
});

// Route inconnue → 404 JSON propre (au lieu du HTML par défaut d'Express).
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route inconnue.' });
});

// Filet de sécurité final : toute erreur qui arrive jusqu'ici (pas déjà
// traitée par un try/catch de route ou le handler CORS ci-dessus) reçoit une
// réponse JSON générique — jamais le message d'erreur brut ni une stack
// trace, qui pourraient révéler des détails d'implémentation à un attaquant.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Erreur non gérée sur une route :', err?.message);
  if (res.headersSent) return;
  res.status(500).json({ success: false, error: 'Erreur serveur, réessaie dans un instant.' });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`🚀 SERVEUR DÉMARRÉ SUR LE PORT : ${PORT}`);
  console.log(`📡 En attente des requêtes du téléphone...`);
  console.log(`==========================================`);
});