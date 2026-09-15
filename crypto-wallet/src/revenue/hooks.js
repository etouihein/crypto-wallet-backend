'use strict';

// Points d'accroche du suivi des revenus dans les routes existantes.
//
// Règle absolue : ne JAMAIS changer ce que l'app reçoit. Chaque fonction est
// appelée après l'envoi de la réponse (setImmediate), avale toute erreur, et ne
// fait rien si le suivi n'est pas configuré (ANALYTICS_HASH_SECRET absent) ou
// si la base est inaccessible. Le test test/routes.quote-regression.test.js le
// vérifie contre les réponses capturées avant l'ajout du suivi.
//
// La base (et son module natif better-sqlite3) n'est chargée qu'au premier
// usage, jamais au démarrage : si le module natif manquait sur le serveur, seul
// le suivi serait désactivé — le backend, lui, démarrerait normalement.

let warned = false;
function safely(label, fn) {
  setImmediate(() => {
    try {
      if (!process.env.ANALYTICS_HASH_SECRET) return;
      const { getRevenueDb } = require('./db');
      fn(getRevenueDb(), require('./intents'));
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn(`Suivi des revenus désactivé pour ce processus (${label}) : ${error.message}`);
      }
    }
  });
}

function onSwapQuote(payload) {
  safely('devis swap', (db, intents) => intents.recordSwapQuote(db, payload));
}

function onBridgeQuote(payload) {
  safely('devis pont', (db, intents) => intents.recordBridgeQuote(db, payload));
}

function onBroadcast(payload) {
  safely('diffusion', (db, intents) => intents.attachBroadcast(db, payload));
}

module.exports = { onSwapQuote, onBridgeQuote, onBroadcast };
