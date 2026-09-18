'use strict';

// Sources de l'historique des transactions, testées sur de vraies réponses
// capturées le 16/09/2026 (test/fixtures/history-*.json).
//
// Ce qui compte ici : les trois réseaux qu'Etherscan a retirés de son offre
// gratuite doivent rendre exactement la même forme de données que les trois
// autres, sans quoi l'écran Activité de l'app casse ou ment.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createHistorySources, PRIMARY_SOURCE } = require('../src/history');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `history-${name}.json`), 'utf8'));
const ADDRESS = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

// Champs dont la route a besoin pour bâtir la réponse envoyée à l'app.
const NATIVE_FIELDS = ['hash', 'from', 'to', 'value', 'timeStamp', 'gasUsed', 'gasPrice'];
const TOKEN_FIELDS = [...NATIVE_FIELDS, 'tokenSymbol', 'tokenDecimal'];

function assertShape(list, fields, label) {
  for (const item of list) {
    for (const f of fields) {
      assert.ok(item[f] !== undefined && item[f] !== null, `${label} : champ ${f} manquant`);
      assert.equal(typeof item[f], 'string', `${label} : ${f} doit être une chaîne, comme chez Etherscan`);
    }
    assert.match(item.value, /^\d+$/, `${label} : montant en unités entières, jamais en hexadécimal`);
    assert.match(item.timeStamp, /^\d+$/, `${label} : horodatage en secondes`);
  }
}

test('chaque réseau a une source, et les trois exclus par Etherscan ne passent plus par lui', () => {
  assert.equal(PRIMARY_SOURCE.ethereum, 'etherscan');
  assert.equal(PRIMARY_SOURCE.polygon, 'etherscan');
  assert.equal(PRIMARY_SOURCE.arbitrum, 'etherscan');
  // Etherscan V2 : « Free API access is not supported for this chain » sur 56, 10 et 8453.
  assert.equal(PRIMARY_SOURCE.bsc, 'nodereal');
  assert.equal(PRIMARY_SOURCE.optimism, 'blockscout');
  assert.equal(PRIMARY_SOURCE.base, 'blockscout');
});

test('Optimism et Base : Blockscout est interrogé et rend le format Etherscan', async () => {
  for (const network of ['optimism', 'base']) {
    const called = [];
    const sources = createHistorySources({
      env: {},
      fetchImpl: async (url) => {
        called.push(String(url));
        const action = new URL(url).searchParams.get('action');
        return json(fixture(`blockscout-${network}-${action}`));
      },
    });
    const result = await sources.fetchRawHistory({ network, address: ADDRESS, limit: 25 });
    assert.equal(result.source, 'blockscout');
    assert.ok(called.every((u) => !u.includes('etherscan.io')), 'aucun appel à Etherscan');
    assert.ok(called.some((u) => u.includes('action=txlist')) && called.some((u) => u.includes('action=tokentx')));
    assert.ok(result.native.length > 0 && result.tokens.length > 0, 'les deux listes sont remplies');
    assertShape(result.native, NATIVE_FIELDS, `${network} natif`);
    assertShape(result.tokens, TOKEN_FIELDS, `${network} jetons`);
  }
});

// Régression : l'appel envoyait endblock=99999999, hérité d'Etherscan.
// Blockscout applique cette borne à la lettre — Optimism en est au bloc
// 156 000 000 et Arbitrum au bloc 505 000 000, donc la requête ne renvoyait
// respectivement RIEN et rien après juin 2023, sans la moindre erreur.
test("aucune borne de blocs n'est envoyée à Blockscout", async () => {
  const urls = [];
  const sources = createHistorySources({
    env: {},
    fetchImpl: async (url) => {
      urls.push(String(url));
      return json(fixture(`blockscout-optimism-${new URL(url).searchParams.get('action')}`));
    },
  });
  await sources.fetchRawHistory({ network: 'optimism', address: ADDRESS, limit: 25 });
  assert.ok(urls.length > 0);
  for (const url of urls) {
    const params = new URL(url).searchParams;
    assert.equal(params.get('endblock'), null, 'endblock masquerait tout au-delà du bloc borné');
    assert.equal(params.get('startblock'), null);
    assert.equal(params.get('sort'), 'desc', 'les plus récentes d\'abord');
  }
});

test('Etherscan garde exactement les paramètres qui fonctionnaient', async () => {
  const urls = [];
  const sources = createHistorySources({
    env: { ETHERSCAN_API_KEY: 'cle-de-test' },
    fetchImpl: async (url) => { urls.push(String(url)); return json({ status: '1', result: [] }); },
  });
  await sources.fetchRawHistory({ network: 'arbitrum', address: ADDRESS, limit: 25 });
  const params = new URL(urls[0]).searchParams;
  assert.equal(params.get('chainid'), '42161');
  assert.equal(params.get('startblock'), '0');
  assert.equal(params.get('endblock'), '99999999');
  assert.equal(params.get('offset'), '25');
  assert.equal(params.get('sort'), 'desc');
});

// Optimism et Base n'ont aucune source de rechange : Etherscan les refuse en
// offre gratuite et Routescan répond « chain not supported ». L'API REST v2 de
// Blockscout répond encore quand l'ancienne est bridée (429 constaté sur l'une,
// 200 sur l'autre au même instant) : c'est le seul filet possible.
test("Blockscout bridé : l'API REST v2 de la même instance prend le relais", async () => {
  const urls = [];
  const sources = createHistorySources({
    env: {},
    logger: { warn() {} },
    sleep: async () => {},
    fetchImpl: async (url) => {
      urls.push(String(url));
      if (!String(url).includes('/api/v2/')) return new Response('trop de requêtes', { status: 429 });
      return json(fixture(String(url).includes('token-transfers') ? 'blockscout-v2-token-transfers' : 'blockscout-v2-transactions'));
    },
  });
  const result = await sources.fetchRawHistory({ network: 'base', address: ADDRESS, limit: 25 });
  assert.equal(result.source, 'blockscout-v2');
  assert.ok(urls.some((u) => u.includes('/api/v2/addresses/')), 'REST v2 interrogée');
  assert.ok(result.native.length > 0 && result.tokens.length > 0);
  assertShape(result.native, NATIVE_FIELDS, 'base v2 natif');
  assertShape(result.tokens, TOKEN_FIELDS, 'base v2 jetons');
  // Les dates ISO de v2 deviennent des secondes, comme partout ailleurs.
  assert.ok(Number(result.native[0].timeStamp) > 1_600_000_000, 'horodatage converti en secondes');
  // v2 fournit le gaz des transactions natives : les frais restent justes.
  assert.ok(result.native.some((t) => t.gasUsed !== '0' && t.gasPrice !== '0'));
});

test('BNB Chain : NodeReal interrogé dans les deux sens, converti au format Etherscan', async () => {
  const bodies = [];
  const sources = createHistorySources({
    env: { NODEREAL_API_KEY: 'cle-de-test' },
    fetchImpl: async (url, options) => {
      assert.ok(String(url).includes('bsc-mainnet.nodereal.io'), 'appelle bien NodeReal');
      const body = JSON.parse(options.body);
      bodies.push(body.params[0]);
      return json(fixture(body.params[0].fromAddress ? 'nodereal-from' : 'nodereal-to'));
    },
  });
  const result = await sources.fetchRawHistory({ network: 'bsc', address: ADDRESS, limit: 25 });
  assert.equal(result.source, 'nodereal');
  assert.equal(bodies.length, 2, 'un appel par sens');
  assert.ok(bodies.some((p) => p.fromAddress === ADDRESS), 'sortants demandés');
  assert.ok(bodies.some((p) => p.toAddress === ADDRESS), 'entrants demandés');
  assert.ok(result.native.length > 0);
  assertShape(result.native, NATIVE_FIELDS, 'bsc natif');
  assertShape(result.tokens, TOKEN_FIELDS, 'bsc jetons');
  // Les frais de gaz viennent de la réponse elle-même : sans eux, la page
  // « Mes stats » de l'app afficherait 0 de frais payés sur BNB Chain.
  assert.ok(result.native.some((t) => t.gasUsed !== '0' && t.gasPrice !== '0'), 'gasUsed et gasPrice présents');
  assert.ok(result.native.every((t) => t.isError === '0' || t.isError === '1'), 'échec/succès renseigné');
});

test('BNB Chain : montants hexadécimaux convertis, doublons écartés, plus récents en tête', async () => {
  const transfer = (o) => ({ hash: '0xaaa', category: 'external', from: ADDRESS.toLowerCase(), to: '0xbbb', value: '0x0de0b6b3a7640000', blockTimeStamp: 1787000000, gasUsed: 21000, gasPrice: 100000000, receiptsStatus: 1, ...o });
  const sent = [transfer({}), transfer({ hash: '0xccc', blockTimeStamp: 1787999999 })];
  const sources = createHistorySources({
    env: { NODEREAL_API_KEY: 'cle-de-test' },
    fetchImpl: async (url, options) => {
      const params = JSON.parse(options.body).params[0];
      // Le même envoi à soi-même revient dans les deux sens.
      return json({ result: { transfers: params.fromAddress ? sent : [transfer({})] } });
    },
  });
  const { native } = await sources.fetchRawHistory({ network: 'bsc', address: ADDRESS, limit: 25 });
  assert.equal(native.length, 2, "l'envoi présent dans les deux sens n'est compté qu'une fois");
  assert.equal(native[0].hash, '0xccc', 'le plus récent en premier');
  assert.equal(native[0].value, '1000000000000000000', '0x0de0b6b3a7640000 = 1 BNB');
  assert.equal(native[0].gasUsed, '21000');
  assert.equal(native[0].timeStamp, '1787999999');
});

test('BNB Chain sans clé NodeReal : erreur claire, jamais un historique faux', async () => {
  const sources = createHistorySources({ env: {}, fetchImpl: async () => { throw new Error('ne doit pas être appelé'); } });
  await assert.rejects(() => sources.fetchRawHistory({ network: 'bsc', address: ADDRESS, limit: 25 }), /NODEREAL_API_KEY manquante/);
});

test('Ethereum : Etherscan sert normalement, et Blockscout prend le relais s\'il refuse', async () => {
  const calls = [];
  const sources = createHistorySources({
    env: { ETHERSCAN_API_KEY: 'cle-de-test' },
    logger: { warn() {} },
    fetchImpl: async (url) => {
      calls.push(String(url));
      const action = new URL(url).searchParams.get('action');
      if (String(url).includes('etherscan.io')) {
        return json({ status: '0', message: 'NOTOK', result: 'Max daily rate limit reached' });
      }
      return json(fixture(`blockscout-base-${action}`));
    },
  });
  const result = await sources.fetchRawHistory({ network: 'ethereum', address: ADDRESS, limit: 25 });
  assert.equal(result.source, 'blockscout', 'repli effectué');
  assert.ok(calls.some((u) => u.includes('api.etherscan.io')), 'Etherscan essayé en premier');
  assert.ok(calls.some((u) => u.includes('eth.blockscout.com')), 'repli sur le Blockscout Ethereum');
});

test('adresse sans aucune transaction : liste vide, pas une erreur', async () => {
  const sources = createHistorySources({
    env: { ETHERSCAN_API_KEY: 'cle-de-test' },
    fetchImpl: async () => json({ status: '0', message: 'No transactions found', result: [] }),
  });
  const result = await sources.fetchRawHistory({ network: 'ethereum', address: ADDRESS, limit: 25 });
  assert.deepEqual(result.native, []);
  assert.deepEqual(result.tokens, []);
});

test('une vraie panne remonte, elle ne se déguise pas en historique vide', async () => {
  const sources = createHistorySources({
    env: {},
    logger: { warn() {} },
    sleep: async () => {},
    fetchImpl: async () => new Response('erreur passerelle', { status: 502 }),
  });
  await assert.rejects(() => sources.fetchRawHistory({ network: 'optimism', address: ADDRESS, limit: 25 }), /HTTP 502/);
});

// Constaté en essai réel : explorer.optimism.io répond 429 quand plusieurs
// appels se suivent. Un à-coup ne doit pas vider l'écran Activité.
test('une limite de débit est réessayée, pas renvoyée à l\'app', async () => {
  let appels = 0;
  const sources = createHistorySources({
    env: {},
    sleep: async () => {},
    fetchImpl: async (url) => {
      appels += 1;
      if (appels <= 2) return new Response('trop de requêtes', { status: 429 });
      return json(fixture(`blockscout-optimism-${new URL(url).searchParams.get('action')}`));
    },
  });
  const result = await sources.fetchRawHistory({ network: 'optimism', address: ADDRESS, limit: 25 });
  assert.ok(result.native.length > 0, 'les données finissent par arriver');
  assert.ok(appels > 2, 'il y a bien eu des réessais');
});

test('une erreur définitive ne déclenche aucun réessai inutile', async () => {
  let appels = 0;
  const sources = createHistorySources({
    env: {},
    logger: { warn() {} },
    sleep: async () => {},
    fetchImpl: async () => { appels += 1; return new Response('introuvable', { status: 404 }); },
  });
  await assert.rejects(() => sources.fetchRawHistory({ network: 'base', address: ADDRESS, limit: 25 }), /HTTP 404/);
  // 2 appels pour l'API classique (txlist, tokentx) puis 2 pour le secours
  // REST v2. Aucun réessai : un 404 n'est pas un à-coup, il serait inutile de
  // le retenter 3 fois (on en compterait 12).
  assert.equal(appels, 4, 'un appel par action et par API, sans réessai');
});

// ── Dernier filet : api.blockscout.com (DevPortal, payant) ───────────────────
// Blockscout annonce le retrait de Base, Polygon et ZkSync de son offre DevPortal
// gratuite au 01/10/2026. Les instances publiques par réseau, elles, restent
// gratuites et sans clé (vérifié le 18/09/2026 : 200 sur base.blockscout.com et
// explorer.optimism.io). Ce niveau n'existe que pour le jour où ça changerait.

const KEY = 'cle-devportal-de-test';
const estMultichaine = (u) => String(u).includes('api.blockscout.com');

test("le chemin normal n'appelle JAMAIS l'API payante", async () => {
  for (const network of ['optimism', 'base']) {
    const called = [];
    const sources = createHistorySources({
      env: { BLOCKSCOUT_API_KEY: KEY }, // clé présente : elle ne doit rien changer
      fetchImpl: async (url) => {
        called.push(String(url));
        return json(fixture(`blockscout-${network}-${new URL(url).searchParams.get('action')}`));
      },
    });
    const result = await sources.fetchRawHistory({ network, address: ADDRESS, limit: 25 });
    assert.equal(result.source, 'blockscout', `${network} : l'instance publique doit servir`);
    assert.ok(!called.some(estMultichaine), `${network} : aucun crédit consommé tant que le gratuit répond`);
  }
});

test("instance publique morte et clé présente : api.blockscout.com prend le relais, au bon format", async () => {
  const called = [];
  const sources = createHistorySources({
    retries: 1,
    env: { BLOCKSCOUT_API_KEY: KEY },
    fetchImpl: async (url) => {
      called.push(String(url));
      // Le jour redouté : l'instance publique passe au payant, sur ses deux API.
      if (!estMultichaine(url)) return new Response('{"error":"Proceed with API key"}', { status: 402 });
      return json(fixture(`blockscout-base-${new URL(url).searchParams.get('action')}`));
    },
  });
  const result = await sources.fetchRawHistory({ network: 'base', address: ADDRESS, limit: 25 });

  assert.equal(result.source, 'blockscout-devportal');
  assert.ok(result.native.length > 0, 'un historique réel, pas une liste vide déguisée');
  assertShape(result.native, NATIVE_FIELDS, 'devportal natif');
  assertShape(result.tokens, TOKEN_FIELDS, 'devportal jetons');

  const payants = called.filter(estMultichaine);
  assert.ok(payants.length > 0, 'le secours a bien été tenté');
  // Adressage par identifiant de chaîne, et la clé est transmise — sans elle
  // l'API répond 402 et le secours ne servirait à rien.
  for (const u of payants) {
    assert.ok(u.includes('api.blockscout.com/8453/api?'), `chaîne 8453 attendue dans ${u}`);
    assert.equal(new URL(u).searchParams.get('apikey'), KEY);
  }
});

test("sans clé, c'est la panne réelle qui remonte, pas l'absence d'un secours facultatif", async () => {
  const called = [];
  const sources = createHistorySources({
    retries: 1,
    env: {}, // aucune BLOCKSCOUT_API_KEY
    fetchImpl: async (url) => {
      called.push(String(url));
      return new Response('{"error":"Proceed with API key"}', { status: 402 });
    },
  });
  await assert.rejects(
    () => sources.fetchRawHistory({ network: 'base', address: ADDRESS, limit: 25 }),
    (err) => {
      assert.match(err.message, /402/, 'le message doit décrire la vraie panne');
      assert.doesNotMatch(err.message, /BLOCKSCOUT_API_KEY/, "ne pas masquer la panne derrière une variable manquante");
      return true;
    },
  );
  assert.ok(!called.some(estMultichaine), 'sans clé, ne pas frapper une porte qui répondra 402');
});

test("BNB Chain n'emprunte jamais ce chemin : api.blockscout.com ne la couvre pas", async () => {
  // « Network not supported » sur api.blockscout.com/56, vérifié le 18/09/2026.
  assert.equal(PRIMARY_SOURCE.bsc, 'nodereal');
  const sources = createHistorySources({ env: { BLOCKSCOUT_API_KEY: KEY }, fetchImpl: async () => { throw new Error('aucun appel attendu'); } });
  await assert.rejects(
    () => sources.blockscoutDevPortal('bsc', ADDRESS, 25),
    /ne couvre pas le reseau bsc/,
  );
});
