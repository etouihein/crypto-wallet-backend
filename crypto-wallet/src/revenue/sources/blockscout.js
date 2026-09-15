'use strict';

// Source Blockscout (Ethereum, Polygon, Arbitrum, Optimism, Base).
//
// Choix par type, vérifiés sur l'adresse réelle le 2026-09-15 :
//   - native   : ancienne API compatible Etherscan, action=txlist ;
//   - internal : ancienne API, action=txlistinternal (champ `index` = trace).
//                L'API REST v2 équivalente a répondu 524 (délai dépassé) ;
//   - erc20    : API REST v2 /token-transfers, seule à fournir le `log_index`
//                (l'ancienne action tokentx ne le donne pas).
//
// Chaque transfert est ramené au format commun :
//   { chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address,
//     token_address, token_symbol, token_decimals, amount_raw }
// Les transferts de valeur nulle, sortants ou échoués sont écartés : ils ne
// portent aucun argent reçu.

const { NATIVE_TOKEN } = require('../chains');

const PAGE_SIZE = 1000;
const MAX_PAGES = 200;

function createBlockscoutSource({ fetchImpl = globalThis.fetch, apiKey = process.env.BLOCKSCOUT_API_KEY, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), spacingMs = 250, retries = 3 } = {}) {
  async function getJson(url) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      await sleep(spacingMs * (attempt + 1));
      try {
        const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
        if (res.status >= 500 || res.status === 429) { lastError = new Error(`Blockscout HTTP ${res.status}`); continue; }
        if (!res.ok) throw new Error(`Blockscout HTTP ${res.status}`);
        return await res.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  function withKey(params) {
    return apiKey ? { ...params, apikey: apiKey } : params;
  }

  async function legacyList(chain, action, address, fromBlock, toBlock) {
    const all = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams(withKey({ module: 'account', action, address, startblock: fromBlock, endblock: toBlock, page, offset: PAGE_SIZE, sort: 'asc' }));
      const data = await getJson(`${chain.blockscoutHost}/api?${qs}`);
      if (data.status === '0' && !/no (transactions|internal transactions|token transfers) found/i.test(String(data.message)) && !Array.isArray(data.result)) {
        throw new Error(`Blockscout ${action} : ${data.message || data.result}`);
      }
      const items = Array.isArray(data.result) ? data.result : [];
      all.push(...items);
      if (items.length < PAGE_SIZE) break;
    }
    return all;
  }

  function normalizeNative(chain, address, t) {
    return {
      chain_id: chain.chainId,
      tx_hash: t.hash.toLowerCase(),
      kind: 'native',
      sub_index: '0',
      block_number: Number(t.blockNumber),
      block_time: Number(t.timeStamp),
      from_address: String(t.from).toLowerCase(),
      token_address: NATIVE_TOKEN,
      token_symbol: chain.nativeSymbol,
      token_decimals: 18,
      amount_raw: String(t.value),
    };
  }

  function normalizeInternal(chain, t, ordinal) {
    return {
      chain_id: chain.chainId,
      tx_hash: String(t.transactionHash || t.hash).toLowerCase(),
      kind: 'internal',
      sub_index: t.index != null && t.index !== '' ? String(t.index) : `ord-${ordinal}`,
      block_number: Number(t.blockNumber),
      block_time: Number(t.timeStamp),
      from_address: String(t.from).toLowerCase(),
      token_address: NATIVE_TOKEN,
      token_symbol: chain.nativeSymbol,
      token_decimals: 18,
      amount_raw: String(t.value),
    };
  }

  function normalizeTokenTransferV2(chain, item) {
    const token = item.token || {};
    const total = item.total || {};
    return {
      chain_id: chain.chainId,
      tx_hash: String(item.transaction_hash).toLowerCase(),
      kind: 'erc20',
      sub_index: String(item.log_index),
      block_number: Number(item.block_number),
      block_time: Math.floor(Date.parse(item.timestamp) / 1000),
      from_address: String(item.from?.hash || item.from).toLowerCase(),
      token_address: String(token.address_hash || token.address).toLowerCase(),
      token_symbol: token.symbol != null ? String(token.symbol).slice(0, 64) : null,
      token_decimals: Number(total.decimals ?? token.decimals ?? 0),
      amount_raw: String(total.value ?? '0'),
    };
  }

  const isPositive = (v) => /^[1-9]\d*$/.test(String(v));
  const isInbound = (to, address) => String(to?.hash || to || '').toLowerCase() === address.toLowerCase();

  async function fetchNative(chain, address, fromBlock, toBlock) {
    const rows = await legacyList(chain, 'txlist', address, fromBlock, toBlock);
    return rows
      .filter((t) => isInbound(t.to, address) && isPositive(t.value) && t.isError !== '1' && t.txreceipt_status !== '0')
      .map((t) => normalizeNative(chain, address, t));
  }

  async function fetchInternal(chain, address, fromBlock, toBlock) {
    const rows = await legacyList(chain, 'txlistinternal', address, fromBlock, toBlock);
    const ordinals = new Map();
    return rows
      .filter((t) => isInbound(t.to, address) && isPositive(t.value) && String(t.isError) !== '1')
      .map((t) => {
        const key = String(t.transactionHash || t.hash).toLowerCase();
        const n = ordinals.get(key) || 0;
        ordinals.set(key, n + 1);
        return normalizeInternal(chain, t, n);
      });
  }

  // REST v2 : du plus récent au plus ancien, on s'arrête dès qu'on passe sous fromBlock.
  async function fetchErc20(chain, address, fromBlock, toBlock) {
    const out = [];
    let params = { type: 'ERC-20', filter: 'to' };
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams(withKey(params));
      const data = await getJson(`${chain.blockscoutHost}/api/v2/addresses/${address}/token-transfers?${qs}`);
      const items = Array.isArray(data.items) ? data.items : [];
      let reachedOlder = false;
      for (const item of items) {
        const block = Number(item.block_number);
        if (block < fromBlock) { reachedOlder = true; continue; }
        if (block > toBlock) continue;
        if (!isInbound(item.to, address)) continue;
        const transfer = normalizeTokenTransferV2(chain, item);
        if (isPositive(transfer.amount_raw)) out.push(transfer);
      }
      if (reachedOlder || !data.next_page_params) break;
      params = { type: 'ERC-20', filter: 'to', ...data.next_page_params };
    }
    return out;
  }

  // Contrat visé par la transaction (son `to`), qui dit qui a payé la
  // commission. Demandé à Blockscout plutôt qu'au RPC : certains nœuds publics
  // refusent eth_getTransactionReceipt (constaté en réel sur Optimism : 403).
  async function getTransactionTarget(chain, txHash) {
    const data = await getJson(`${chain.blockscoutHost}/api/v2/transactions/${txHash}`);
    const to = data && data.to && (data.to.hash || data.to);
    return to ? String(to).toLowerCase() : null;
  }

  return {
    name: 'blockscout',
    getTransactionTarget,
    kinds: ['native', 'internal', 'erc20'],
    isConfigured: (chain) => Boolean(chain.blockscoutHost),
    fetch(kind, chain, address, fromBlock, toBlock) {
      if (kind === 'native') return fetchNative(chain, address, fromBlock, toBlock);
      if (kind === 'internal') return fetchInternal(chain, address, fromBlock, toBlock);
      if (kind === 'erc20') return fetchErc20(chain, address, fromBlock, toBlock);
      throw new Error(`type inconnu : ${kind}`);
    },
    // exposés pour les tests de normalisation sur données réelles
    _normalizeNative: normalizeNative,
    _normalizeInternal: normalizeInternal,
    _normalizeTokenTransferV2: normalizeTokenTransferV2,
  };
}

module.exports = { createBlockscoutSource };
