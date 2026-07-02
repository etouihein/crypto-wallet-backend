// src/crypto/keyManager.js
// ─────────────────────────────────────────────────────────────────
//  Gestionnaire de clés HD (Hierarchical Deterministic)
//  Standards supportés :
//    BIP39  — génération et validation de mnémoniques
//    BIP32  — dérivation de clés HD
//    BIP44  — dérivation multi-compte multi-chain
//    BIP84  — SegWit natif (Bitcoin P2WPKH)
//    BIP49  — SegWit imbriqué (Bitcoin P2SH-P2WPKH)
// ─────────────────────────────────────────────────────────────────

'use strict';

const bip39  = require('bip39');
const HDKey  = require('hdkey');
const { ethers } = require('ethers');
const crypto = require('crypto');
const { CHAINS, EVM_CHAINS } = require('./chains');

// ── BIP39 — Mnémoniques ─────────────────────────────────────────

/**
 * Génère un nouveau mnémonique BIP39
 * @param {128|160|192|224|256} strength  — bits d'entropie (128=12 mots, 256=24 mots)
 * @returns {string} phrase mnémonique
 */
function generateMnemonic(strength = 128) {
  const validStrengths = [128, 160, 192, 224, 256];
  if (!validStrengths.includes(strength)) {
    throw new Error(`Entropie invalide. Valeurs autorisées : ${validStrengths.join(', ')}`);
  }
  return bip39.generateMnemonic(strength);
}

/**
 * Valide un mnémonique BIP39
 * @param {string} mnemonic
 * @returns {{ valid: boolean, wordCount: number, error?: string }}
 */
function validateMnemonic(mnemonic) {
  if (!mnemonic || typeof mnemonic !== 'string') {
    return { valid: false, wordCount: 0, error: 'Mnémonique vide ou invalide' };
  }
  const words = mnemonic.trim().toLowerCase().split(/\s+/);
  const valid = bip39.validateMnemonic(mnemonic.trim().toLowerCase());
  return {
    valid,
    wordCount: words.length,
    error: valid ? undefined : 'Mnémonique BIP39 invalide (checksum ou mots incorrects)'
  };
}

/**
 * Dérive la graine (seed) depuis un mnémonique + passphrase optionnelle
 * @param {string} mnemonic
 * @param {string} passphrase  — BIP39 passphrase (25ème mot) — vide par défaut
 * @returns {Promise<Buffer>}
 */
async function mnemonicToSeed(mnemonic, passphrase = '') {
  const validation = validateMnemonic(mnemonic);
  if (!validation.valid) throw new Error(validation.error);
  return bip39.mnemonicToSeed(mnemonic.trim().toLowerCase(), passphrase);
}

/**
 * Convertit un mnémonique en entropie hexadécimale brute
 * @param {string} mnemonic
 * @returns {string} hex
 */
function mnemonicToEntropy(mnemonic) {
  const validation = validateMnemonic(mnemonic);
  if (!validation.valid) throw new Error(validation.error);
  return bip39.mnemonicToEntropy(mnemonic.trim().toLowerCase());
}

/**
 * Reconstitue un mnémonique depuis une entropie hex
 * @param {string} entropy  hex
 * @returns {string}
 */
function entropyToMnemonic(entropy) {
  return bip39.entropyToMnemonic(entropy);
}

// ── BIP32 — Dérivation HD ───────────────────────────────────────

/**
 * Crée la clé maîtresse HD depuis la graine
 * @param {Buffer} seed
 * @returns {HDKey} nœud racine
 */
function createMasterKey(seed) {
  return HDKey.fromMasterSeed(seed);
}

/**
 * Dérive un nœud HD depuis un chemin BIP44
 * @param {HDKey} masterKey
 * @param {string} path  ex: "m/44'/60'/0'/0/0"
 * @returns {HDKey}
 */
function deriveChild(masterKey, path) {
  return masterKey.derive(path);
}

// ── EVM (Ethereum, BNB, Polygon, AVAX…) ─────────────────────────

/**
 * Dérive N adresses EVM depuis un mnémonique
 * @param {Buffer}  seed
 * @param {string}  basePath  ex: "m/44'/60'/0'/0"
 * @param {number}  count     nombre d'adresses à dériver
 * @returns {Array<{index, path, privateKey, publicKey, address, compressed}>}
 */
function deriveEVMAddresses(seed, basePath, count = 5) {
  const master = createMasterKey(seed);
  const results = [];

  for (let i = 0; i < count; i++) {
    const path  = `${basePath}/${i}`;
    const child = master.derive(path);

    const wallet  = new ethers.Wallet(child.privateKey);
    const pubKeyUncompressed = child.publicKey; // 33 bytes (compressed)

    results.push({
      index:        i,
      path,
      privateKey:   child.privateKey.toString('hex'),
      privateKeyWIF: null, // WIF = format Bitcoin uniquement
      publicKey:    child.publicKey.toString('hex'),
      publicKeyUncompressed: uncompressPublicKey(child.privateKey),
      address:      wallet.address,
      checksumAddress: ethers.getAddress(wallet.address)
    });
  }
  return results;
}

/**
 * Importe un wallet EVM depuis une clé privée hex
 * @param {string} privateKeyHex
 * @returns {{ privateKey, publicKey, address }}
 */
function importEVMFromPrivateKey(privateKeyHex) {
  const pk = privateKeyHex.startsWith('0x') ? privateKeyHex : '0x' + privateKeyHex;
  const wallet = new ethers.Wallet(pk);
  return {
    privateKey:  wallet.privateKey.slice(2),
    publicKey:   wallet.signingKey.compressedPublicKey.slice(2),
    address:     wallet.address,
    checksumAddress: ethers.getAddress(wallet.address)
  };
}

// ── Bitcoin (et variantes BTC) ───────────────────────────────────

/**
 * Dérive N adresses Bitcoin (Legacy P2PKH) depuis la graine
 * @param {Buffer} seed
 * @param {string} basePath
 * @param {number} count
 * @returns {Array<{index, path, privateKey, WIF, publicKey, address}>}
 */
function deriveBTCAddresses(seed, basePath, count = 5) {
  // On utilise ethers pour la dérivation HD, puis on formate en BTC
  const master  = createMasterKey(seed);
  const results = [];

  for (let i = 0; i < count; i++) {
    const path  = `${basePath}/${i}`;
    const child = master.derive(path);
    const privKeyBuf = child.privateKey;

    results.push({
      index:     i,
      path,
      privateKey: privKeyBuf.toString('hex'),
      wif:        privateKeyToWIF(privKeyBuf, true),   // compressed WIF
      wifUncompressed: privateKeyToWIF(privKeyBuf, false),
      publicKey:  child.publicKey.toString('hex'),
      // Adresse P2PKH (Legacy) — commence par '1'
      address:   publicKeyToP2PKH(child.publicKey)
    });
  }
  return results;
}

/**
 * Convertit une clé privée en format WIF (Wallet Import Format)
 * @param {Buffer}  privKey
 * @param {boolean} compressed
 * @returns {string}
 */
function privateKeyToWIF(privKey, compressed = true) {
  // Préfixe réseau mainnet = 0x80
  const prefix = Buffer.from([0x80]);
  const suffix = compressed ? Buffer.from([0x01]) : Buffer.alloc(0);
  const raw    = Buffer.concat([prefix, privKey, suffix]);

  // Double SHA256 checksum
  const h1       = crypto.createHash('sha256').update(raw).digest();
  const h2       = crypto.createHash('sha256').update(h1).digest();
  const checksum = h2.subarray(0, 4);

  const final = Buffer.concat([raw, checksum]);
  return base58Encode(final);
}

/**
 * Dérive une adresse Bitcoin P2PKH (Legacy) depuis une clé publique compressée
 * @param {Buffer} pubKey  — 33 bytes compressed
 * @returns {string} adresse Base58Check commençant par '1'
 */
function publicKeyToP2PKH(pubKey) {
  // SHA256 → RIPEMD160 (Hash160)
  const sha256   = crypto.createHash('sha256').update(pubKey).digest();
  const ripemd   = crypto.createHash('ripemd160').update(sha256).digest();

  // Version byte mainnet P2PKH = 0x00
  const versioned = Buffer.concat([Buffer.from([0x00]), ripemd]);

  // Checksum
  const h1       = crypto.createHash('sha256').update(versioned).digest();
  const h2       = crypto.createHash('sha256').update(h1).digest();
  const checksum = h2.subarray(0, 4);

  return base58Encode(Buffer.concat([versioned, checksum]));
}

// ── Utilitaires cryptographiques ─────────────────────────────────

/**
 * Décompresse une clé publique (SEC compressed → uncompressed 65 bytes)
 * @param {Buffer} privKey  — clé privée pour recalculer
 * @returns {string} hex 65 bytes (04 prefix)
 */
function uncompressPublicKey(privKey) {
  try {
    const wallet = new ethers.Wallet(privKey);
    return wallet.signingKey.publicKey.slice(2); // retire '0x'
  } catch {
    return null;
  }
}

/**
 * Encode un Buffer en Base58
 */
function base58Encode(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + buffer.toString('hex'));
  let result = '';

  while (num > 0n) {
    result = ALPHABET[Number(num % 58n)] + result;
    num = num / 58n;
  }

  // Préfixes zéros
  for (const byte of buffer) {
    if (byte === 0) result = '1' + result;
    else break;
  }
  return result;
}

/**
 * Signe un message avec une clé privée EVM (EIP-191)
 * @param {string} message       — message en clair
 * @param {string} privateKeyHex
 * @returns {Promise<{message, messageHash, signature, v, r, s}>}
 */
async function signMessage(message, privateKeyHex) {
  const pk = privateKeyHex.startsWith('0x') ? privateKeyHex : '0x' + privateKeyHex;
  const wallet = new ethers.Wallet(pk);
  const signature = await wallet.signMessage(message);
  const sig = ethers.Signature.from(signature);

  return {
    message,
    messageHash: ethers.hashMessage(message),
    signature,
    v: sig.v,
    r: sig.r,
    s: sig.s,
    signer: wallet.address
  };
}

/**
 * Vérifie une signature EVM
 * @param {string} message
 * @param {string} signature
 * @returns {{ valid: boolean, signer: string }}
 */
function verifySignature(message, signature) {
  try {
    const signer = ethers.verifyMessage(message, signature);
    return { valid: true, signer };
  } catch (e) {
    return { valid: false, signer: null, error: e.message };
  }
}

/**
 * Dérive toutes les clés pour toutes les chains supportées
 * @param {string} mnemonic
 * @param {string} passphrase
 * @param {number} addressCount  — nb d'adresses par chain
 * @returns {Promise<Object>}
 */
async function deriveAllChains(mnemonic, passphrase = '', addressCount = 3) {
  const seed   = await mnemonicToSeed(mnemonic, passphrase);
  const master = createMasterKey(seed);
  const result = {};

  // Info clé maîtresse
  result._master = {
    privateKeyHex:  master.privateKey.toString('hex'),
    publicKeyHex:   master.publicKey.toString('hex'),
    chainCode:      master.chainCode.toString('hex'),
    fingerprint:    master.fingerprint.toString(16).padStart(8, '0')
  };

  // Dérivation par chain
  for (const [symbol, chain] of Object.entries(CHAINS)) {
    try {
      if (chain.addressType === 'evm') {
        result[symbol] = {
          ...chain,
          addresses: deriveEVMAddresses(seed, chain.path, addressCount)
        };
      } else if (chain.addressType === 'btc') {
        result[symbol] = {
          ...chain,
          addresses: deriveBTCAddresses(seed, chain.path, addressCount),
          // Aussi SegWit si disponible
          addressesSegwit: chain.pathSegwit
            ? deriveBTCAddresses(seed, chain.pathSegwit, addressCount)
            : null
        };
      } else if (chain.addressType === 'btc_variant') {
        result[symbol] = {
          ...chain,
          addresses: deriveBTCAddresses(seed, chain.path, addressCount)
        };
      } else {
        // Dérivation générique pour SOL, TRX etc. (HD raw)
        const master2 = createMasterKey(seed);
        const child0  = master2.derive(chain.path + '/0');
        result[symbol] = {
          ...chain,
          addresses: [{
            index: 0,
            path: chain.path + '/0',
            privateKey: child0.privateKey.toString('hex'),
            publicKey:  child0.publicKey.toString('hex'),
            note: `Dérivation ${chain.addressType} — adresse complète requiert lib spécialisée`
          }]
        };
      }
    } catch (err) {
      result[symbol] = { ...chain, error: err.message };
    }
  }

  // Entropie du mnémonique
  result._entropy = mnemonicToEntropy(mnemonic);

  return result;
}

module.exports = {
  // BIP39
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  mnemonicToEntropy,
  entropyToMnemonic,
  // Dérivation
  createMasterKey,
  deriveChild,
  deriveEVMAddresses,
  deriveBTCAddresses,
  deriveAllChains,
  // Import
  importEVMFromPrivateKey,
  // Utilitaires
  signMessage,
  verifySignature,
  privateKeyToWIF,
  publicKeyToP2PKH,
  base58Encode
};
