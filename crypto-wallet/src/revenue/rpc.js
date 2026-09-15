'use strict';

// Appels JSON-RPC minimaux vers les nœuds publics déjà utilisés par le backend
// (publicnode) : dernier bloc, reçu d'une transaction, date d'un bloc.

function createRpc({ fetchImpl = globalThis.fetch } = {}) {
  let id = 0;

  async function call(url, method, params = []) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method} HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`RPC ${method} : ${data.error.message || JSON.stringify(data.error)}`);
    return data.result;
  }

  async function getBlockNumber(chain) {
    return parseInt(await call(chain.rpcUrl, 'eth_blockNumber'), 16);
  }

  // Le reçu donne à la fois le contrat visé par la transaction (to) et ses logs.
  async function getReceipt(chain, txHash) {
    return call(chain.rpcUrl, 'eth_getTransactionReceipt', [txHash]);
  }

  async function getBlockTime(chain, blockNumber) {
    const block = await call(chain.rpcUrl, 'eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false]);
    if (!block) throw new Error(`bloc ${blockNumber} introuvable`);
    return parseInt(block.timestamp, 16);
  }

  // Premier bloc dont la date est >= unixSeconds.
  //
  // Pas de dichotomie depuis le bloc 0 : les nœuds RPC ne servent pas toujours
  // l'historique ancien (constaté sur Optimism : les blocs d'avant la migration
  // Bedrock sont introuvables). On estime donc le bloc à partir du rythme des
  // blocs récents, on encadre la cible autour de l'estimation, puis on affine
  // uniquement dans cet intervalle récent.
  async function findFirstBlockAtOrAfter(chain, unixSeconds) {
    const head = await getBlockNumber(chain);
    const headTime = await getBlockTime(chain, head);
    if (headTime < unixSeconds) return head + 1;

    const span = Math.min(50000, head);
    const sampleTime = span > 0 ? await getBlockTime(chain, head - span) : headTime;
    const secondsPerBlock = span > 0 ? Math.max((headTime - sampleTime) / span, 0.01) : 1;
    const guess = Math.max(0, Math.min(head, Math.floor(head - (headTime - unixSeconds) / secondsPerBlock)));
    const baseStep = Math.max(100, Math.ceil(3600 / secondsPerBlock)); // environ une heure de blocs

    let lo = Math.max(0, guess - baseStep);
    for (let step = baseStep; lo > 0 && (await getBlockTime(chain, lo)) >= unixSeconds; step *= 2) lo = Math.max(0, lo - step);
    let hi = Math.min(head, guess + baseStep);
    for (let step = baseStep; hi < head && (await getBlockTime(chain, hi)) < unixSeconds; step *= 2) hi = Math.min(head, hi + step);

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await getBlockTime(chain, mid)) < unixSeconds) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  return { call, getBlockNumber, getReceipt, getBlockTime, findFirstBlockAtOrAfter };
}

module.exports = { createRpc };
