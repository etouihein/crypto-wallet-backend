'use strict';
// L'app signe la liaison de l'e-mail avec le wallet (lib/profilEmail.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { messageProfilEmail } = require('../lib/profilEmail');

test('message : action, e-mail normalise, adresse en minuscules, horodatage', () => {
  assert.equal(messageProfilEmail('lier', '0xAbC', ' Moi@Exemple.FR ', 1732460000), "NexiaWallet: lier l'email moi@exemple.fr au wallet 0xabc (horodatage 1732460000)");
  assert.equal(messageProfilEmail('supprimer', '0xAbC', null, 5), "NexiaWallet: supprimer l'email du wallet 0xabc (horodatage 5)");
});

test("App.js : l'e-mail est envoye avec la signature du wallet et l'horodatage", () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const f = src.slice(src.indexOf('const submitProfileEmail = useCallback'), src.indexOf('const shareTransactionReceipt'));
  assert.match(f, /signMessage\(messageProfilEmail\('lier', walletAddr, email, horodatage\)\)/);
  assert.match(f, /\{ address: walletAddr, email, signature, horodatage \}/);
  assert.match(f, /if \(!unlockedPrivateKey\)/);
});
