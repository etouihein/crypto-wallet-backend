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

  // Premier bloc dont la date est >= unixSeconds (recherche dichotomique, ~30 appels).
  async function findFirstBlockAtOrAfter(chain, unixSeconds) {
    let lo = 0;
    let hi = await getBlockNumber(chain);
    if ((await getBlockTime(chain, hi)) < unixSeconds) return hi + 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if ((await getBlockTime(chain, mid)) < unixSeconds) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  return { call, getBlockNumber, getReceipt, getBlockTime, findFirstBlockAtOrAfter };
}

module.exports = { createRpc };
