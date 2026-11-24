'use strict';
// La phrase de recuperation en cours de sauvegarde ne reste jamais affichee
// par-dessus l'ecran du code PIN apres un verrouillage (App.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const bloc = (debut, fin) => { const i = src.indexOf(debut); assert.ok(i >= 0, debut); return src.slice(i, src.indexOf(fin, i)); };

test('le verrouillage masque la phrase affichee', () => {
  assert.match(bloc('const lockWallet = useCallback', '}, []);'), /setPhraseMasqueeParVerrou\(true\)/);
});

test("l'ecran de sauvegarde ne s'affiche pas tant que la phrase est masquee", () => {
  assert.match(bloc('const renderMnemonicBackup = () => {', 'const words'), /if \(!pendingMnemonic \|\| phraseMasqueeParVerrou\) return null;/);
});

test('apres le code PIN, la phrase revient (sauvegarde jamais perdue)', () => {
  assert.match(src, /useEffect\(\(\) => \{ if \(isUnlocked\) setPhraseMasqueeParVerrou\(false\); \}, \[isUnlocked\]\);/);
});
