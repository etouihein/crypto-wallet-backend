'use strict';

// Empreintes : aucune adresse d'utilisateur ni aucun calldata n'est stocké en
// clair dans la base des revenus.

const crypto = require('crypto');

// HMAC-SHA256 avec un secret serveur (ANALYTICS_HASH_SECRET) : sans le secret,
// impossible de recalculer l'empreinte d'une adresse connue pour la retrouver
// dans la base (ce que permettrait un simple SHA-256, les adresses étant
// publiques). Renvoie null si le secret manque : l'appelant n'enregistre alors
// rien plutôt que d'utiliser une empreinte faible.
function userHash(address, secret = process.env.ANALYTICS_HASH_SECRET) {
  if (!secret || secret.length < 32 || typeof address !== 'string') return null;
  return crypto.createHmac('sha256', secret).update(address.trim().toLowerCase()).digest('hex');
}

// Empreinte des données d'une transaction : permet de reconnaître, au moment de
// la diffusion, la transaction signée qui correspond à un devis, sans garder le
// calldata (qui contient l'adresse de l'utilisateur).
function calldataHash(data) {
  if (typeof data !== 'string' || !/^0x[0-9a-fA-F]*$/.test(data) || data.length <= 2) return null;
  return crypto.createHash('sha256').update(data.toLowerCase()).digest('hex');
}

module.exports = { userHash, calldataHash };
