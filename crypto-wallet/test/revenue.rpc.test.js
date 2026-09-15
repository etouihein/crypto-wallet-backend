'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRpc } = require('../src/revenue/rpc');

// Faux nœud JSON-RPC : un bloc toutes les `secondsPerBlock` secondes à partir de
// `genesisTime`, et, comme un vrai nœud Optimism, aucun bloc servi en dessous de
// `oldestServed` (historique d'avant la migration Bedrock).
function fakeNode({ head, genesisTime, secondsPerBlock, oldestServed = 0, jitter = () => 0 }) {
  const requested = [];
  const timeOf = (n) => Math.floor(genesisTime + n * secondsPerBlock + jitter(n));
  const fetchImpl = async (url, options) => {
    const { id, method, params } = JSON.parse(options.body);
    let result;
    if (method === 'eth_blockNumber') result = '0x' + head.toString(16);
    if (method === 'eth_getBlockByNumber') {
      const n = parseInt(params[0], 16);
      requested.push(n);
      result = n < oldestServed || n > head ? null : { number: params[0], timestamp: '0x' + timeOf(n).toString(16) };
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { status: 200 });
  };
  return { fetchImpl, requested, timeOf };
}

function firstBlockBruteForce(node, head, ts) {
  for (let n = 0; n <= head; n++) if (node.timeOf(n) >= ts) return n;
  return head + 1;
}

const chain = { rpcUrl: 'https://rpc.test' };

test("trouve le premier bloc à une date donnée sans jamais lire l'historique ancien non servi", async () => {
  const head = 156_944_073;
  const node = fakeNode({ head, genesisTime: 1_636_000_000, secondsPerBlock: 2, oldestServed: 105_235_063 });
  const ts = node.timeOf(head) - 5 * 24 * 3600 - 17; // il y a 5 jours
  const rpc = createRpc({ fetchImpl: node.fetchImpl });
  const block = await rpc.findFirstBlockAtOrAfter(chain, ts);
  assert.ok(node.timeOf(block) >= ts);
  assert.ok(node.timeOf(block - 1) < ts);
  assert.ok(Math.min(...node.requested) >= 105_235_063, 'aucun bloc ancien demandé');
  assert.ok(node.requested.length < 60, `peu d'appels (${node.requested.length})`);
});

test('reste exact quand le rythme des blocs varie', async () => {
  const head = 200_000;
  const node = fakeNode({ head, genesisTime: 1_700_000_000, secondsPerBlock: 3, jitter: (n) => (n > 150_000 ? (n - 150_000) * 1.5 : 0) });
  const rpc = createRpc({ fetchImpl: node.fetchImpl });
  for (const ts of [node.timeOf(10) + 1, node.timeOf(120_000), node.timeOf(170_000) - 1, node.timeOf(head)]) {
    assert.equal(await rpc.findFirstBlockAtOrAfter(chain, ts), firstBlockBruteForce(node, head, ts));
  }
});

test('date future : renvoie le bloc suivant la tête de chaîne', async () => {
  const node = fakeNode({ head: 1000, genesisTime: 1_700_000_000, secondsPerBlock: 12 });
  const rpc = createRpc({ fetchImpl: node.fetchImpl });
  assert.equal(await rpc.findFirstBlockAtOrAfter(chain, node.timeOf(1000) + 60), 1001);
});
