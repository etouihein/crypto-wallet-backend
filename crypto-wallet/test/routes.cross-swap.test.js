'use strict';

// GET /wallet/swap/cross-quote — échange entre écosystèmes (EVM ↔ Solana ↔
// Bitcoin) via LI.FI.
//
// Né du constat que BTC et SOL n'étaient pas échangeables : l'agrégateur 0x
// utilisé par /swap/quote ne fait que de l'EVM, sur une seule chaîne.
//
// Constaté en appelant LI.FI pour de vrai (17/09/2026) : la commission
// d'intégrateur est REFUSÉE tant qu'aucune adresse de collecte n'est
// configurée pour la chaîne de départ sur portal.li.fi — c'est le cas de
// Solana et Bitcoin. D'où le repli sans commission, testé ici : mieux vaut un
// échange qui marche sans commission qu'un échange impossible.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const API_KEY = 'test-app-key';
process.env.APP_API_KEYS = API_KEY;
process.env.LIFI_API_KEY = 'lifi-test-key';
process.env.LIFI_INTEGRATOR = 'nexiawallet';
process.env.LIFI_FEE = '0.0025';
process.env.SENSITIVE_RATE_LIMIT_MAX = '10000';

const ADR_EVM = '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC';
const ADR_SOL = '8wyRx8JZMDqSsr55VMS3hBBDHJSuXSvrsmaXNqC3Cf9p';
const ADR_BTC = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

const DEVIS = (surcharge = {}) => ({
  tool: 'near',
  estimate: { toAmount: '20466222860377189', feeCosts: [] },
  transactionRequest: { data: 'AQAAAAAAAAA=' },
  ...surcharge,
});

const realFetch = global.fetch;
const appels = [];

function installerLifi({ refuserCommission = false, echec = false } = {}) {
  global.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
    if (!u.startsWith('https://li.quest/')) throw new Error(`appel réseau inattendu : ${u}`);
    const params = new URL(u).searchParams;
    appels.push(Object.fromEntries(params));
    if (echec) {
      return new Response(JSON.stringify({ message: 'No available quotes' }), { status: 404 });
    }
    if (refuserCommission && params.get('fee')) {
      return new Response(JSON.stringify({
        message: 'Integrator "nexiawallet" is not configured for collecting fees on chain 1151111081099710',
      }), { status: 400 });
    }
    return new Response(JSON.stringify(DEVIS()), { status: 200 });
  };
}

async function avecServeur(fn) {
  const app = express();
  app.use('/wallet', require('../src/routes/wallet'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const demander = (base, query) => realFetch(`${base}/wallet/swap/cross-quote?${new URLSearchParams(query)}`, {
  headers: { 'x-api-key': API_KEY },
});

const SOL_VERS_ETH = {
  fromNetwork: 'solana', toNetwork: 'ethereum', fromToken: 'SOL', toToken: 'ETH',
  fromAmount: '500000000', fromAddress: ADR_SOL, toAddress: ADR_EVM,
};
const ETH_VERS_SOL = {
  fromNetwork: 'ethereum', toNetwork: 'solana', fromToken: 'ETH', toToken: 'SOL',
  fromAmount: '20000000000000000', fromAddress: ADR_EVM, toAddress: ADR_SOL,
};
const BTC_VERS_ETH = {
  fromNetwork: 'bitcoin', toNetwork: 'ethereum', fromToken: 'BTC', toToken: 'ETH',
  fromAmount: '1000000', fromAddress: ADR_BTC, toAddress: ADR_EVM,
};

test('Solana, Bitcoin et EVM sont acceptés, avec les identifiants de chaîne de LI.FI', async () => {
  installerLifi();
  await avecServeur(async (base) => {
    for (const [cas, attendu] of [
      [SOL_VERS_ETH, { fromChain: '1151111081099710', toChain: '1', ecosysteme: 'solana' }],
      [BTC_VERS_ETH, { fromChain: '20000000000001', toChain: '1', ecosysteme: 'bitcoin' }],
      [ETH_VERS_SOL, { fromChain: '1', toChain: '1151111081099710', ecosysteme: 'evm' }],
    ]) {
      appels.length = 0;
      const res = await demander(base, cas);
      const body = await res.json();
      assert.equal(res.status, 200, `${cas.fromNetwork} -> ${cas.toNetwork}`);
      assert.equal(body.success, true);
      assert.equal(appels[0].fromChain, attendu.fromChain);
      assert.equal(appels[0].toChain, attendu.toChain);
      assert.equal(appels[0].toAddress, cas.toAddress, "l'adresse de destination est transmise : les écosystèmes ont des formats différents");
      assert.equal(body.ecosystemeDepart, attendu.ecosysteme, "l'app doit savoir quoi signer");
      assert.ok(body.quote.transactionRequest, 'une transaction à signer est renvoyée');
    }
  });
});

test('commission demandée par défaut, et repli sans commission si LI.FI la refuse', async () => {
  installerLifi({ refuserCommission: true });
  await avecServeur(async (base) => {
    appels.length = 0;
    const res = await demander(base, SOL_VERS_ETH);
    const body = await res.json();
    assert.equal(res.status, 200, "l'échange reste possible");
    assert.equal(appels.length, 2, 'un premier appel avec commission, un second sans');
    assert.equal(appels[0].fee, '0.0025', 'la commission est bien demandée en premier');
    assert.equal(appels[1].fee, undefined, 'le repli ne la demande plus');
    assert.equal(body.commissionAppliquee, false, "l'app sait que rien n'a été prélevé");
    assert.equal(body.feePct, 0);
  });
});

test('commission conservée quand LI.FI l\'accepte', async () => {
  installerLifi();
  await avecServeur(async (base) => {
    appels.length = 0;
    const res = await demander(base, ETH_VERS_SOL);
    const body = await res.json();
    assert.equal(appels.length, 1, 'aucun second appel inutile');
    assert.equal(appels[0].fee, '0.0025');
    assert.equal(body.commissionAppliquee, true);
    assert.equal(body.feePct, 0.25);
  });
});

test('entrées invalides refusées avant tout appel réseau', async () => {
  installerLifi();
  await avecServeur(async (base) => {
    const cas = [
      [{ ...SOL_VERS_ETH, fromNetwork: 'dogecoin' }, 'réseau inconnu'],
      [{ ...SOL_VERS_ETH, fromAddress: ADR_EVM }, 'adresse EVM donnée pour un départ Solana'],
      [{ ...ETH_VERS_SOL, toAddress: ADR_EVM }, 'adresse EVM donnée pour une arrivée Solana'],
      [{ ...BTC_VERS_ETH, fromAddress: 'pas-une-adresse' }, 'adresse Bitcoin invalide'],
      [{ ...SOL_VERS_ETH, fromAmount: '0' }, 'montant nul'],
      [{ ...SOL_VERS_ETH, fromAmount: '1.5' }, 'montant décimal'],
      [{ ...SOL_VERS_ETH, fromToken: 'SOL; DROP' }, 'jeton fantaisiste'],
      [{ fromNetwork: 'solana', toNetwork: 'solana', fromToken: 'SOL', toToken: 'sol', fromAmount: '1', fromAddress: ADR_SOL, toAddress: ADR_SOL }, 'même jeton des deux côtés'],
    ];
    for (const [query, nom] of cas) {
      appels.length = 0;
      const res = await demander(base, query);
      assert.equal(res.status, 400, nom);
      assert.equal(appels.length, 0, `${nom} : aucun appel à LI.FI`);
      const body = await res.json();
      assert.equal(body.success, false);
    }
  });
});

test('aucune route disponible : message clair, pas de 500', async () => {
  installerLifi({ echec: true });
  await avecServeur(async (base) => {
    const res = await demander(base, BTC_VERS_ETH);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.error, /No available quotes|Aucune route/);
  });
});

test('la clé de l\'app reste exigée', async () => {
  installerLifi();
  await avecServeur(async (base) => {
    const res = await realFetch(`${base}/wallet/swap/cross-quote?${new URLSearchParams(SOL_VERS_ETH)}`);
    assert.equal(res.status, 401);
  });
});

test.after(() => { global.fetch = realFetch; });
