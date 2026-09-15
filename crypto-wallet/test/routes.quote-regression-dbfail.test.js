'use strict';

// Même vérification que routes.quote-regression.test.js, mais avec une base des
// revenus IMPOSSIBLE à ouvrir (chemin sous un fichier ordinaire) : le suivi
// échoue, et l'app doit recevoir exactement les mêmes réponses qu'avant.
// node --test lance chaque fichier dans son propre processus : l'état de la
// base n'est pas partagé avec l'autre test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const helpers = require('./helpers/quoteRoutes');

const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nexia-dbfail-')), 'pas-un-dossier');
fs.writeFileSync(blocker, 'fichier ordinaire');
helpers.prepareEnv({ revenueDbPath: path.join(blocker, 'revenue.db') });
helpers.installFakeUpstreams();

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); };

const walletRoutes = require('../src/routes/wallet');

test('base des revenus inaccessible : réponses identiques, suivi simplement désactivé', async () => {
  try {
    const results = await helpers.withServer(walletRoutes, helpers.runCases);
    await new Promise((r) => setTimeout(r, 50));
    const golden = helpers.loadGolden();
    for (let i = 0; i < golden.length; i++) {
      assert.deepEqual(results[i], golden[i], `écart sur le cas « ${golden[i].name} »`);
    }
    assert.ok(warnings.some((w) => w.includes('Suivi des revenus désactivé')), 'la panne du suivi est signalée dans les logs');
    assert.equal(warnings.filter((w) => w.includes('Suivi des revenus désactivé')).length, 1, 'une seule fois, sans inonder les logs');
  } finally {
    console.warn = originalWarn;
  }
});
