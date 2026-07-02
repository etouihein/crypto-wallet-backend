// src/crypto/encryption.js
// ─────────────────────────────────────────────────────────────────
//  Module de chiffrement sécurisé
//  • AES-256-GCM  (chiffrement authentifié — protège intégrité + confidentialité)
//  • PBKDF2-SHA512 (dérivation de clé depuis mot de passe)
//  • IV aléatoire de 12 bytes par opération (jamais réutilisé)
//  • Salt aléatoire de 32 bytes par portefeuille
// ─────────────────────────────────────────────────────────────────

'use strict';

const crypto = require('crypto');

// ── Constantes ──────────────────────────────────────────────────
const ALGORITHM      = 'aes-256-gcm';
const KEY_LEN        = 32;          // 256 bits
const IV_LEN         = 12;          // 96 bits — recommandé pour GCM
const SALT_LEN       = 32;          // 256 bits
const AUTH_TAG_LEN   = 16;          // 128 bits
const PBKDF2_ITER    = 310_000;     // OWASP 2023 recommendation pour SHA-512
const PBKDF2_DIGEST  = 'sha512';
const ENCODING       = 'hex';

/**
 * Dérive une clé AES-256 depuis un mot de passe + salt via PBKDF2-SHA512
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Promise<Buffer>} clé de 32 bytes
 */
async function deriveKey(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      PBKDF2_ITER,
      KEY_LEN,
      PBKDF2_DIGEST,
      (err, key) => {
        if (err) reject(new Error('Échec dérivation clé: ' + err.message));
        else resolve(key);
      }
    );
  });
}

/**
 * Chiffre une donnée sensible avec AES-256-GCM
 * @param {string} plaintext   — texte clair (ex: mnemonic, clé privée)
 * @param {string} password    — mot de passe utilisateur
 * @returns {Promise<string>}  — payload chiffré (hex encodé) : salt|iv|authTag|ciphertext
 */
async function encrypt(plaintext, password) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('plaintext doit être une chaîne non vide');
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new Error('Mot de passe requis (min 8 caractères)');
  }

  const salt = crypto.randomBytes(SALT_LEN);
  const iv   = crypto.randomBytes(IV_LEN);
  const key  = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LEN
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  // Format: salt(32) | iv(12) | authTag(16) | ciphertext(n)
  const payload = Buffer.concat([salt, iv, authTag, encrypted]);
  return payload.toString(ENCODING);
}

/**
 * Déchiffre un payload AES-256-GCM
 * @param {string} encryptedHex  — payload hex (salt|iv|authTag|ciphertext)
 * @param {string} password
 * @returns {Promise<string>}    — texte déchiffré
 */
async function decrypt(encryptedHex, password) {
  if (!encryptedHex || typeof encryptedHex !== 'string') {
    throw new Error('Payload chiffré invalide');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Mot de passe requis');
  }

  const payload = Buffer.from(encryptedHex, ENCODING);

  // Taille minimale = salt + iv + authTag = 32 + 12 + 16 = 60 bytes
  if (payload.length < 60) {
    throw new Error('Payload trop court — corrompu ou invalide');
  }

  let offset = 0;
  const salt       = payload.subarray(offset, offset += SALT_LEN);
  const iv         = payload.subarray(offset, offset += IV_LEN);
  const authTag    = payload.subarray(offset, offset += AUTH_TAG_LEN);
  const ciphertext = payload.subarray(offset);

  const key = await deriveKey(password, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LEN
  });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Ne pas révéler pourquoi le déchiffrement a échoué (timing attack / oracle)
    throw new Error('Déchiffrement échoué — mot de passe incorrect ou données corrompues');
  }
}

/**
 * Hache un mot de passe pour vérification (stockage sûr, sans clé privée)
 * Utilise PBKDF2 avec un salt dédié
 * @param {string} password
 * @returns {Promise<string>} hash hex (salt|hash)
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = await deriveKey(password, salt);
  return salt.toString(ENCODING) + hash.toString(ENCODING);
}

/**
 * Vérifie un mot de passe contre un hash stocké
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, storedHash) {
  const stored = Buffer.from(storedHash, ENCODING);
  const salt   = stored.subarray(0, SALT_LEN);
  const hash   = stored.subarray(SALT_LEN);
  const candidate = await deriveKey(password, salt);

  // Comparaison en temps constant (protection contre timing attacks)
  return crypto.timingSafeEqual(hash, candidate);
}

/**
 * Génère un token de session aléatoire
 * @param {number} bytes
 * @returns {string}
 */
function generateSessionToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateSessionToken
};
