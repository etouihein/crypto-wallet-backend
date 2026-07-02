'use strict';

require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const walletRoutes = require('./src/routes/wallet');

const app = express();

const PORT = process.env.PORT || 3000;
const ENV  = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8083';

if (ENV === 'production') {
  // Nécessaire pour que express-rate-limit voie la vraie IP du client
  // quand le serveur est derrière un reverse proxy (Caddy/Nginx/Cloudflare).
  app.set('trust proxy', 1);
  if (!process.env.HTTPS_TERMINATED_BY_PROXY) {
    console.warn(
      '⚠️  NODE_ENV=production sans HTTPS_TERMINATED_BY_PROXY=1 : ' +
      'ce serveur transmet mnémoniques, clés privées et tokens de session. ' +
      'Ne l\'expose JAMAIS publiquement en HTTP brut — mets un reverse proxy ' +
      '(Caddy, Nginx, Cloudflare Tunnel...) qui termine le HTTPS devant lui, ' +
      'puis fixe HTTPS_TERMINATED_BY_PROXY=1 dans .env pour faire taire cet avertissement.'
    );
  }
}

// Configuration des Middlewares globaux
app.use(cors({ origin: FRONTEND_URL }));
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

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`🚀 SERVEUR DÉMARRÉ SUR LE PORT : ${PORT}`);
  console.log(`📡 En attente des requêtes du téléphone...`);
  console.log(`==========================================`);
});