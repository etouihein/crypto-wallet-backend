'use strict';
// Le frein contre les essais de PIN au hasard s'applique a TOUTES les
// saisies du PIN (deverrouillage, "Afficher la phrase", export du keystore),
// avec le meme compteur persiste.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { delaiApresEchecs, messageAttentePin } = require('../lib/essaisPin');

const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const bloc = (debut, fin) => {
  const i = src.indexOf(debut);
  assert.ok(i >= 0, debut);
  const j = src.indexOf(fin, i);
  assert.ok(j > i, fin);
  return src.slice(i, j);
};

test('delai : 2 erreurs gratuites, puis 5 s, 10 s, 20 s, 40 s, 60 s maximum', () => {
  assert.equal(delaiApresEchecs(0), 0);
  assert.equal(delaiApresEchecs(2), 0);
  assert.equal(delaiApresEchecs(3), 5000);
  assert.equal(delaiApresEchecs(4), 10000);
  assert.equal(delaiApresEchecs(6), 40000);
  assert.equal(delaiApresEchecs(7), 60000);
  assert.equal(delaiApresEchecs(500), 60000);
  assert.equal(delaiApresEchecs(undefined), 0);
});

test("message d'attente seulement tant que le delai court", () => {
  assert.equal(messageAttentePin(0, 1000), null);
  assert.equal(messageAttentePin(1000, 1000), null);
  assert.match(messageAttentePin(11000, 1000), /10s/);
  assert.match(messageAttentePin(1500, 1000), /1s/);
});

test('"Afficher la phrase" : attente respectee et erreur comptee', () => {
  const b = bloc('const handleMnemonicReauthConfirm = useCallback', '  }, [walletSession, isDuressMode, mnemonicReauthPin');
  const attente = b.indexOf('messageAttentePin(pinLockedUntil)');
  const dechiffre = b.indexOf('decryptWalletKeystore');
  assert.ok(attente >= 0 && attente < dechiffre, "l'attente doit etre verifiee avant tout essai");
  assert.match(b, /noterEchecPin\(\)/);
  assert.match(b, /effacerEchecsPin\(\)/);
});

test('export du keystore : attente respectee et erreur de PIN comptee', () => {
  const b = bloc('const confirmExportKeystore = useCallback', '  }, [unlockedPrivateKey, walletSession');
  const attente = b.indexOf('messageAttentePin(pinLockedUntil)');
  const essai = b.indexOf('exporterKeystoreAvecPin(');
  assert.ok(attente >= 0 && attente < essai, "l'attente doit etre verifiee avant tout essai");
  assert.match(b, /if \(pinFaux\) noterEchecPin\(\)/);
});

test('deverrouillage : meme compteur (noterEchecPin)', () => {
  const b = bloc('const attemptUnlock = useCallback', 'const initWallet = useCallback');
  assert.match(b, /noterEchecPin\(\)/);
  const n = bloc('const noterEchecPin = useCallback', '}, []);');
  assert.match(n, /savePinFailRecord\(/);
  assert.match(n, /delaiApresEchecs\(next\)/);
});
