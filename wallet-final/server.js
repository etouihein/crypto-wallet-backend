'use strict';

// Sert le build web statique (généré par `npm run build:web`, dossier
// `dist/`) en production — utilisé par Railway, pas par le dev local
// (`npm run web` reste le serveur Expo habituel).
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

app.use(express.static(DIST_DIR));

// SPA : toute route inconnue retombe sur index.html (nécessaire pour le
// retour MoonPay/Stripe avec des paramètres dans l'URL, ex. ?transactionStatus=...).
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NexiaWallet web build servi sur le port ${PORT}`);
});
