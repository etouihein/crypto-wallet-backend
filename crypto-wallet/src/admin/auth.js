'use strict';

// Authentification de la page d'administration des revenus.
//
//   - Mot de passe : empreinte scrypt dans ADMIN_PASSWORD_HASH (générée par
//     scripts/admin-password-hash.js), jamais APP_API_KEYS (clé publique,
//     embarquée dans l'app). Comparaison en temps constant.
//   - Session : identifiant aléatoire de 256 bits, dont seule l'empreinte
//     SHA-256 est stockée en base (révocable, une fuite de la base ne permet
//     pas de se connecter). Expiration absolue 8 h, inactivité 1 h.
//   - Cookie __Host- : Secure, HttpOnly, SameSite=Strict, Path=/, sans domaine.
//   - Requêtes qui modifient quelque chose (POST) : origine vérifiée en plus du
//     SameSite=Strict.

const crypto = require('crypto');

const COOKIE_NAME = '__Host-nw_admin';
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 32 };
const SCRYPT_MAXMEM = 128 * 1024 * 1024;
const SESSION_TTL_MS = 8 * 3600 * 1000;
const SESSION_IDLE_MS = 3600 * 1000;
const ADMIN_PATH_RE = /^\/[A-Za-z0-9_-]{16,64}$/;

function hashPassword(password, { salt = crypto.randomBytes(16) } = {}) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('mot de passe trop court (12 caractères minimum)');
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT_MAXMEM });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function parseStoredHash(stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, N, r, p, saltB64, hashB64] = parts;
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  const salt = Buffer.from(saltB64, 'base64');
  const hash = Buffer.from(hashB64, 'base64');
  if (!Number.isInteger(params.N) || params.N < 16384 || !Number.isInteger(params.r) || !Number.isInteger(params.p) || salt.length < 16 || hash.length < 32) return null;
  return { params, salt, hash };
}

const DUMMY = { params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, salt: Buffer.alloc(16), hash: Buffer.alloc(SCRYPT.keylen) };

// Toujours un calcul scrypt complet, même si l'empreinte stockée est invalide :
// la durée de réponse ne révèle rien.
function verifyPassword(password, stored) {
  const parsed = parseStoredHash(stored);
  const target = parsed || DUMMY;
  const candidate = crypto.scryptSync(typeof password === 'string' ? password : '', target.salt, target.hash.length, { ...target.params, maxmem: SCRYPT_MAXMEM });
  const equal = candidate.length === target.hash.length && crypto.timingSafeEqual(candidate, target.hash);
  return Boolean(parsed) && equal;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createSessionStore(db, { now = () => Date.now(), ttlMs = SESSION_TTL_MS, idleMs = SESSION_IDLE_MS } = {}) {
  return {
    create() {
      const token = crypto.randomBytes(32).toString('base64url');
      const t = now();
      db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ? OR last_seen_at <= ?').run(t, t - idleMs);
      db.prepare('INSERT INTO admin_sessions (id_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), t, t, t + ttlMs);
      return token;
    },
    validate(token) {
      if (typeof token !== 'string' || token.length < 32) return false;
      const t = now();
      const row = db.prepare('SELECT id_hash, last_seen_at, expires_at FROM admin_sessions WHERE id_hash = ?').get(sha256(token));
      if (!row) return false;
      if (row.expires_at <= t || t - row.last_seen_at > idleMs) {
        db.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').run(row.id_hash);
        return false;
      }
      if (t - row.last_seen_at > 60 * 1000) db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id_hash = ?').run(t, row.id_hash);
      return true;
    },
    destroy(token) {
      if (typeof token === 'string') db.prepare('DELETE FROM admin_sessions WHERE id_hash = ?').run(sha256(token));
    },
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function sessionCookie(token, maxAgeMs = SESSION_TTL_MS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}`;
}

function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

// Une requête POST légitime vient de la page admin elle-même : son en-tête
// Origin doit être exactement l'origine de ce serveur.
//
// ATTENTION : la politique de référent de cette page ne doit JAMAIS être
// « no-referrer ». La spécification Fetch (« Append a request Origin header »)
// impose alors au navigateur de remplacer l'Origin par la chaîne « null » sur
// toute soumission de formulaire — et il n'envoie pas de Referer non plus. La
// page devient inutilisable : toute connexion est refusée. Constaté en réel le
// 15/09/2026. La page annonce donc « same-origin » : rien ne fuit vers un
// tiers, et l'Origin nous parvient intact.
function isSameOrigin(req) {
  const expected = `${req.protocol}://${req.get('host')}`;
  const origin = req.get('origin');
  if (origin) return origin === expected; // « null » compris, donc refusé
  // Certains navigateurs omettent l'Origin sur un formulaire : le Referer de la
  // même origine fait alors foi. Un site tiers ne peut pas le forger.
  const referer = req.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

function isValidAdminPath(p) {
  return ADMIN_PATH_RE.test(String(p || ''));
}

module.exports = {
  COOKIE_NAME, SESSION_TTL_MS, SESSION_IDLE_MS,
  hashPassword, verifyPassword, parseStoredHash, createSessionStore,
  parseCookies, sessionCookie, clearedCookie, isSameOrigin, isValidAdminPath,
};
