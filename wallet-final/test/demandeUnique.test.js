'use strict';
// Une seule demande de signature affichee a la fois (lib/demandeUnique.js +
// branchement dans App.js). Faille : une 2e demande remplacait la 1re juste
// avant le clic "Signer" -> l'utilisateur signait ce qu'il n'avait pas lu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { nouvelleDemandeAcceptee, MESSAGE_DEMANDE_OCCUPEE } = require('../lib/demandeUnique');

const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const entre = (debut, fin) => { const i = src.indexOf(debut); assert.ok(i >= 0, debut); return src.slice(i, src.indexOf(fin, i + debut.length)); };

test('regle : une demande ouverte bloque la suivante, aucune demande ouverte = acceptee', () => {
  assert.equal(nouvelleDemandeAcceptee(null), true);
  assert.equal(nouvelleDemandeAcceptee(undefined), true);
  assert.equal(nouvelleDemandeAcceptee({ id: 1, method: 'eth_sendTransaction' }), false);
  assert.match(MESSAGE_DEMANDE_OCCUPEE, /déjà affichée/);
});

test('WalletConnect : une 2e demande est refusee (rejectSessionRequest), jamais affichee a la place de la 1re', () => {
  const cb = entre('onSessionRequest: (request) => {', 'onSessionDelete');
  const garde = cb.indexOf('nouvelleDemandeAcceptee(wcRequestRef.current)');
  const rejet = cb.indexOf('rejectSessionRequest(request.topic, request.id, MESSAGE_DEMANDE_OCCUPEE)');
  const affichage = cb.indexOf('setWcRequest(request)');
  assert.ok(garde > 0 && rejet > garde && affichage > rejet, 'controle, puis refus, puis affichage');
  assert.match(cb, /wcRequestRef\.current = request;\s*setWcRequest\(request\)/);
});

test('navigateur dApp : une 2e demande recoit une erreur, la 1re reste affichee', () => {
  const h = entre('const handleDappMessage = useCallback', 'const handleDappBridgeApprove');
  const garde = h.indexOf('nouvelleDemandeAcceptee(dappBridgeRequestRef.current)');
  const reponse = h.indexOf('dappBridgeRespond(id, MESSAGE_DEMANDE_OCCUPEE, null)');
  const affichage = h.indexOf('setDappBridgeRequest(demande)');
  assert.ok(garde > 0 && reponse > garde && affichage > reponse);
  assert.match(h, /dappBridgeRequestRef\.current = demande;/);
});

test('la place se libere a chaque fermeture (signee ou refusee), sinon plus aucune demande ne passerait', () => {
  const nWc = (src.match(/setWcRequest\(null\)/g) || []).length;
  const nWcRef = (src.match(/wcRequestRef\.current = null;\s*setWcRequest\(null\)/g) || []).length;
  assert.equal(nWcRef, nWc, 'chaque setWcRequest(null) remet aussi la copie a zero');
  const nD = (src.match(/setDappBridgeRequest\(null\)/g) || []).length;
  const nDRef = (src.match(/dappBridgeRequestRef\.current = null;\s*setDappBridgeRequest\(null\)/g) || []).length;
  assert.equal(nDRef, nD);
  assert.ok(nWc >= 2 && nD >= 2);
});
