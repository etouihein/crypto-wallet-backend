'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { openRevenueDb } = require('../src/revenue/db');
const auth = require('../src/admin/auth');

test('mot de passe : empreinte scrypt, vérification exacte, formats invalides refusés', () => {
  const stored = auth.hashPassword('un-mot-de-passe-solide');
  assert.match(stored, /^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!stored.includes('un-mot-de-passe-solide'));
  assert.equal(auth.verifyPassword('un-mot-de-passe-solide', stored), true);
  assert.equal(auth.verifyPassword('un-mot-de-passe-solidE', stored), false);
  assert.equal(auth.verifyPassword('', stored), false);
  assert.equal(auth.verifyPassword(undefined, stored), false);
  assert.equal(auth.verifyPassword('un-mot-de-passe-solide', 'pas-une-empreinte'), false);
  assert.equal(auth.verifyPassword('un-mot-de-passe-solide', 'scrypt$1024$8$1$AAAA$BBBB'), false); // paramètres trop faibles
  assert.throws(() => auth.hashPassword('court'));
});

test("sessions : seule l'empreinte est stockée, déconnexion, expiration et inactivité", () => {
  const db = openRevenueDb(':memory:');
  let clock = 1_000_000;
  const store = auth.createSessionStore(db, { now: () => clock });

  const token = store.create();
  assert.ok(token.length >= 43);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_sessions WHERE id_hash = ?').get(token).n, 0, 'jeton jamais stocké en clair');
  assert.equal(store.validate(token), true);
  store.destroy(token);
  assert.equal(store.validate(token), false);

  const idle = store.create();
  clock += auth.SESSION_IDLE_MS + 1;
  assert.equal(store.validate(idle), false, 'inactivité > 1 h');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_sessions').get().n, 0, 'session inactive supprimée');

  assert.equal(store.validate('trop-court'), false);
  assert.equal(store.validate(undefined), false);
  db.close();
});

test('expiration absolue à 8 h même avec une activité régulière', () => {
  const db = openRevenueDb(':memory:');
  let clock = 0;
  const store = auth.createSessionStore(db, { now: () => clock });
  const token = store.create();
  for (let minutes = 50; minutes < 8 * 60; minutes += 50) {
    clock = minutes * 60 * 1000;
    assert.equal(store.validate(token), true, `encore valide à ${minutes} min`);
  }
  clock = 8 * 3600 * 1000;
  assert.equal(store.validate(token), false);
  db.close();
});

test('cookie : __Host-, Secure, HttpOnly, SameSite=Strict, Path=/, sans domaine', () => {
  const c = auth.sessionCookie('abc');
  assert.ok(c.startsWith('__Host-nw_admin=abc;'));
  for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) assert.ok(c.includes(flag), flag);
  assert.ok(!/Domain=/i.test(c));
  assert.ok(auth.clearedCookie().includes('Max-Age=0'));
  assert.deepEqual(auth.parseCookies('a=1; __Host-nw_admin=tok; b=2'), { a: '1', '__Host-nw_admin': 'tok', b: '2' });
});

test("origine et chemin secret", () => {
  const req = (origin, { host = 'api.example.com', protocol = 'https', referer } = {}) => ({
    protocol,
    get: (h) => (h === 'origin' ? origin : h === 'referer' ? referer : host),
  });
  assert.equal(auth.isSameOrigin(req('https://api.example.com')), true);
  assert.equal(auth.isSameOrigin(req('https://evil.example.com')), false);
  assert.equal(auth.isSameOrigin(req(undefined)), false);
  assert.equal(auth.isSameOrigin(req('http://api.example.com')), false);
  // Ce que le navigateur envoie sous « Referrer-Policy: no-referrer » : refusé.
  assert.equal(auth.isSameOrigin(req('null')), false);
  // Sans Origin, le Referer de la même origine fait foi.
  assert.equal(auth.isSameOrigin(req(undefined, { referer: 'https://api.example.com/Xy7_aB3kLm9QpR2s/login' })), true);
  assert.equal(auth.isSameOrigin(req(undefined, { referer: 'https://evil.example.com/piege' })), false);
  assert.equal(auth.isSameOrigin(req(undefined, { referer: 'pas-une-url' })), false);
  assert.equal(auth.isValidAdminPath('/Xy7_aB3kLm9QpR2s'), true);
  assert.equal(auth.isValidAdminPath('/admin'), false);
  assert.equal(auth.isValidAdminPath('Xy7_aB3kLm9QpR2sT'), false);
  assert.equal(auth.isValidAdminPath('/Xy7_aB3kLm9QpR2s/../x'), false);
});
