'use strict';
// En-tetes de securite du site web (public/_headers, lu par Cloudflare Pages).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const texte = fs.readFileSync(path.join(__dirname, '..', 'public', '_headers'), 'utf8');
// en-tetes du bloc "/*" (toutes les pages)
function blocToutes() {
  const lignes = texte.split('\n');
  const i = lignes.findIndex((l) => l.trim() === '/*');
  assert.ok(i >= 0, 'bloc /* present');
  const out = {};
  for (const l of lignes.slice(i + 1)) {
    if (!/^\s+\S/.test(l)) break;
    const m = /^\s+([A-Za-z-]+):\s*(.*)$/.exec(l);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

test('toutes les pages : protections du navigateur presentes', () => {
  const h = blocToutes();
  for (const nom of ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'content-security-policy']) {
    assert.ok(h[nom], `${nom} manquant`);
  }
});

test("CSP : seul le code du site (et Umami) s'execute ; pas de script integre, pas d'eval, pas de plugin, pas de cadre", () => {
  const csp = blocToutes()['content-security-policy'];
  const d = Object.fromEntries(csp.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const [k, ...v] = x.split(/\s+/); return [k, v]; }));
  assert.deepEqual(d['script-src'], ["'self'", 'https://cloud.umami.is']);
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.ok(!d['script-src'].includes("'unsafe-inline'"));
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['frame-ancestors'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
  assert.deepEqual(d['default-src'], ["'self'"]);
  // l'app doit pouvoir joindre l'API, les noeuds et WalletConnect
  assert.ok(d['connect-src'].includes('https:') && d['connect-src'].includes('wss:'));
});

test("index.html : aucun script integre (il serait bloque par la CSP)", () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const integres = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].filter((m) => m[1].trim());
  assert.equal(integres.length, 0, integres.map((m) => m[0].slice(0, 80)).join('\n'));
  const externes = [...html.matchAll(/<script[^>]*\bsrc="(https?:\/\/[^"]+)"/gi)].map((m) => new URL(m[1]).origin);
  for (const o of externes) assert.equal(o, 'https://cloud.umami.is', `script externe non autorise par la CSP : ${o}`);
});
