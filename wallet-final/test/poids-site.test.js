'use strict';
// wallet-final/test/poids-site.test.js : script du poids du site (scripts/poids-site.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { paquet, analyser, resume } = require('../scripts/poids-site');

test('poids du site : chaque morceau est range dans sa bibliotheque ou son fichier d app', () => {
  assert.equal(paquet('/home/runner/work/x/wallet-final/node_modules/ethers/lib/index.js'), 'ethers');
  assert.equal(paquet('../node_modules/@solana/web3.js/lib/index.browser.esm.js'), '@solana/web3.js');
  assert.equal(paquet('node_modules/a/node_modules/bn.js/lib/bn.js'), 'bn.js');
  assert.equal(paquet('/home/runner/work/x/wallet-final/App.js'), 'app : App.js');
  assert.equal(paquet('C:\\Users\\p\\wallet-final\\lib\\i18n.js'), 'app : lib/i18n.js');
});

test('poids du site : mesure un site construit (taille reelle, compressee, detail par bibliotheque)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.mkdirSync(path.join(d, '_expo/static/js/web'), { recursive: true });
  const js = path.join(d, '_expo/static/js/web/index-abc.js');
  fs.writeFileSync(js, 'x'.repeat(3000));
  fs.writeFileSync(js + '.map', JSON.stringify({
    sources: ['node_modules/ethers/a.js', 'node_modules/ethers/b.js', 'wallet-final/App.js'],
    sourcesContent: ['y'.repeat(200), 'y'.repeat(100), 'z'.repeat(100)],
  }));
  const r = analyser(d);
  assert.equal(r.js.length, 1);
  assert.equal(r.brut, 3000);
  assert.ok(r.gzip > 0 && r.gzip < 3000);
  assert.deepEqual(r.classement, [['ethers', 300], ['app : App.js', 100]]);
  assert.throws(() => analyser(path.join(d, 'absent')), /aucun fichier \.js/);
});

test('poids du site : le resume classe les plus gros contenus en premier', () => {
  const texte = resume({ js: ['a.js'], brut: 2 * 1024 * 1024, gzip: 600 * 1024, totalSources: 400, classement: [['ethers', 300], ['app : App.js', 100]] });
  assert.match(texte, /2\.00 Mo/);
  assert.match(texte, /\| 1 \| ethers \|.*75\.0 %/);
  assert.match(texte, /\| 2 \| app : App\.js \|.*25\.0 %/);
});
