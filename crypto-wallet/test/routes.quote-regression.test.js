'use strict';

// Non-régression de /swap/quote et /bridge/quote : le suivi des revenus ne doit
// RIEN changer à ce que l'app reçoit, ni à ce qui est envoyé à 0x / LI.FI.
// Les réponses de référence (test/golden/quote-routes.json) ont été capturées
// sur le code AVANT l'ajout du suivi (wallet.js non modifié). Pour les
// régénérer volontairement :
//   UPDATE_GOLDEN=1 node --test test/routes.quote-regression.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
helpers.installFakeUpstreams();
const walletRoutes = require('../src/routes/wallet');

test('les routes de devis répondent exactement comme avant, et les devis sont enregistrés', async () => {
  const results = await helpers.withServer(walletRoutes, helpers.runCases);

  if (process.env.UPDATE_GOLDEN === '1') {
    fs.mkdirSync(path.dirname(helpers.GOLDEN_FILE), { recursive: true });
    fs.writeFileSync(helpers.GOLDEN_FILE, JSON.stringify(results, null, 2) + '\n');
    return;
  }

  const golden = helpers.loadGolden();
  assert.equal(results.length, golden.length);
  for (let i = 0; i < golden.length; i++) {
    assert.deepEqual(results[i], golden[i], `écart sur le cas « ${golden[i].name} »`);
  }

  // Les enregistrements se font après la réponse (setImmediate) : on laisse la boucle tourner.
  await new Promise((r) => setTimeout(r, 50));
  const { getRevenueDb } = require('../src/revenue/db');
  const rows = getRevenueDb().prepare('SELECT type, chain_id, expected_fee_amount FROM quote_events ORDER BY type, chain_id').all();
  assert.deepEqual(rows, [
    { type: 'bridge', chain_id: 1, expected_fee_amount: '2500000000000' },
    { type: 'swap', chain_id: 1, expected_fee_amount: '3165000000000' },
    { type: 'swap', chain_id: 56, expected_fee_amount: '3165000000000' },
  ], 'seuls les devis réussis sont enregistrés');
});
