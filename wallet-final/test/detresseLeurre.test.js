'use strict';
// PIN de detresse : l'app ne doit montrer NI la vraie adresse, NI son
// historique, NI la liste des vrais comptes (24/11/2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { adresseLeurre } = require('../lib/leurreDetresse');

const VRAIE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

test('adresse leurre : valide, differente de la vraie, stable, independante de la casse', () => {
  const l = adresseLeurre(VRAIE);
  assert.ok(ethers.utils.isAddress(l));
  assert.notEqual(l.toLowerCase(), VRAIE.toLowerCase());
  assert.equal(adresseLeurre(VRAIE.toLowerCase()), l);
  assert.equal(adresseLeurre(VRAIE), l);
  assert.notEqual(adresseLeurre('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'), l);
});

const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');

test('code de detresse : walletAddr devient le leurre ; vrai PIN : walletAddr redevient la vraie adresse', () => {
  const detresse = app.slice(app.indexOf('setIsDuressMode(true);'), app.indexOf('setIsDuressMode(true);') + 400);
  assert.match(detresse, /setWalletAddr\(adresseLeurre\(walletSession\.address\)\)/);
  const vrai = app.slice(app.indexOf('setIsDuressMode(false);\n      // Vraie adresse'), app.indexOf('setIsDuressMode(false);\n      // Vraie adresse') + 300);
  assert.match(vrai, /setWalletAddr\(walletSession\.address\)/);
});

test('mode detresse : liste des comptes masquee, suppression et changement de compte bloques', () => {
  assert.match(app, /\{!!walletSession && !isDuressMode && \(\s*<>\s*<Text style=\{\[st\.settings_section, \{ marginTop: 24 \}\]\}>👤 \{t\('settings_accounts'\)\}/);
  const suppr = app.slice(app.indexOf('const deleteAccount = useCallback'), app.indexOf('const deleteAccount = useCallback') + 300);
  assert.match(suppr, /if \(isDuressMode\) return;/);
  const changer = app.slice(app.indexOf('const switchAccount = useCallback'), app.indexOf('const switchAccount = useCallback') + 200);
  assert.match(changer, /if \(isDuressMode\) return;/);
});
