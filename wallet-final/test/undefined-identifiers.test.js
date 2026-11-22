'use strict';
// wallet-final/test/undefined-identifiers.test.js
// ─────────────────────────────────────────────────────────────────
//  Filet de securite pour le decoupage d'App.js (chantier V3) : aucun
//  fichier de l'app ne doit utiliser un nom qui n'est defini nulle part
//  (import oublie en deplacant un ecran, faute de frappe dans un nom).
//  Sans ce test, l'erreur ne se verrait qu'au lancement de l'app
//  ("ReferenceError: X is not defined"), sur le telephone d'un utilisateur.
//  Analyse statique avec @babel/parser et @babel/traverse (deja installes
//  avec Expo, aucune nouvelle dependance) : pas d'execution du code.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const RACINE = path.join(__dirname, '..');

// Noms fournis par JavaScript, le navigateur, React Native ou Node.
const GLOBAUX = new Set(`
  Array ArrayBuffer Atomics BigInt BigInt64Array BigUint64Array Boolean DataView Date Error EvalError
  FinalizationRegistry Float32Array Float64Array Function Infinity Int8Array Int16Array Int32Array Intl JSON
  Map Math NaN Number Object Promise Proxy RangeError ReferenceError Reflect RegExp Set SharedArrayBuffer
  String Symbol SyntaxError TypeError URIError Uint8Array Uint8ClampedArray Uint16Array Uint32Array WeakMap
  WeakRef WeakSet AggregateError globalThis undefined isFinite isNaN parseFloat parseInt decodeURI
  decodeURIComponent encodeURI encodeURIComponent escape unescape eval
  window document navigator location history screen localStorage sessionStorage alert confirm prompt
  fetch Headers Request Response FormData Blob File FileReader URL URLSearchParams AbortController
  AbortSignal TextEncoder TextDecoder atob btoa crypto performance structuredClone queueMicrotask
  setTimeout clearTimeout setInterval clearInterval setImmediate clearImmediate requestAnimationFrame
  cancelAnimationFrame requestIdleCallback cancelIdleCallback console Notification Event EventTarget
  CustomEvent XMLHttpRequest WebSocket Image getComputedStyle matchMedia IntersectionObserver
  ResizeObserver MutationObserver HTMLElement Element Node NodeList
  __DEV__ global process Buffer require module exports __dirname __filename
`.split(/\s+/).filter(Boolean));

function nomsIndefinis(code, fichier = 'code') {
  const ast = parse(code, { sourceType: 'unambiguous', sourceFilename: fichier, plugins: ['jsx'] });
  let globaux = {};
  traverse(ast, { Program(p) { globaux = p.scope.globals; p.stop(); } });
  return Object.keys(globaux).filter((n) => !GLOBAUX.has(n)).sort();
}

// App.js, index.js, lib/ et les futurs dossiers issus du decoupage.
const DOSSIERS = ['lib', 'screens', 'components', 'hooks', 'src'];
function fichiersDeLApp() {
  const res = ['App.js', 'index.js'].filter((f) => fs.existsSync(path.join(RACINE, f)));
  const parcourir = (rel) => {
    for (const e of fs.readdirSync(path.join(RACINE, rel), { withFileTypes: true })) {
      const enfant = `${rel}/${e.name}`;
      if (e.isDirectory()) parcourir(enfant);
      else if (/\.jsx?$/.test(e.name)) res.push(enfant);
    }
  };
  for (const d of DOSSIERS) if (fs.existsSync(path.join(RACINE, d))) parcourir(d);
  return res;
}

test('le controle detecte bien un nom oublie (import manquant, faute de frappe)', () => {
  assert.deepEqual(nomsIndefinis('import React from "react";\nexport default function E() { return <View>{formatEur(1)}</View>; }'), ['View', 'formatEur']);
  assert.deepEqual(nomsIndefinis('const a = 1; function f(b) { return a + b + setTimeout; }'), []);
});

test('aucun fichier de l app n utilise un nom defini nulle part', () => {
  const fichiers = fichiersDeLApp();
  assert.ok(fichiers.includes('App.js') && fichiers.some((f) => f.startsWith('lib/')), 'App.js et lib/ sont bien analyses');
  const problemes = [];
  for (const f of fichiers) {
    const noms = nomsIndefinis(fs.readFileSync(path.join(RACINE, f), 'utf8'), f);
    if (noms.length) problemes.push(`${f} : ${noms.join(', ')}`);
  }
  assert.deepEqual(problemes, [], `Noms utilises sans etre definis ni importes :\n${problemes.join('\n')}`);
});
