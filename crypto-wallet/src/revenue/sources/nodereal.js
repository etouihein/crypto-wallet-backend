'use strict';

// Source NodeReal MegaNode pour BNB Chain (absente de Blockscout, et exclue de
// l'offre gratuite d'Etherscan V2). Méthode nr_getAssetTransfers
// (https://docs.nodereal.io/reference/nr_getassettransfers) : catégories
// external / internal / 20, plage de 100 000 blocs au plus, 1 000 résultats par
// page, pagination par pageKey. Clé : NODEREAL_API_KEY (offre gratuite).
//
// NodeReal ne donne ni logIndex ni index de trace. Pour un ERC-20, le logIndex
// est retrouvé dans le reçu de la transaction (log Transfer correspondant) ; à
// défaut, et pour les transferts internes, un ordinal stable dans la
// transaction sert d'identifiant.

const { NATIVE_TOKEN } = require('../chains');

const MAX_RANGE = 100000;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function createNodeRealSource({ fetchImpl = globalThis.fetch, apiKey = process.env.NODEREAL_API_KEY, rpc, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), spacingMs = 250 } = {}) {
  let id = 0;

  async function nrCall(params) {
    await sleep(spacingMs);
    const res = await fetchImpl(`https://bsc-mainnet.nodereal.io/v1/${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'nr_getAssetTransfers', params: [params] }),
    });
    if (!res.ok) throw new Error(`NodeReal HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`NodeReal : ${data.error.message || JSON.stringify(data.error)}`);
    return data.result || {};
  }

  const hex = (n) => '0x' + Number(n).toString(16);
  const toInt = (v) => (typeof v === 'string' && v.startsWith('0x') ? parseInt(v, 16) : Number(v));
  const toDecString = (v) => (typeof v === 'string' && v.startsWith('0x') ? BigInt(v).toString() : String(v ?? '0'));

  async function listRange(address, fromBlock, toBlock) {
    const out = [];
    let pageKey;
    for (let page = 0; page < 1000; page++) {
      const result = await nrCall({
        category: ['external', 'internal', '20'],
        fromBlock: hex(fromBlock),
        toBlock: hex(toBlock),
        toAddress: address,
        order: 'asc',
        maxCount: '0x3e8',
        ...(pageKey ? { pageKey } : {}),
      });
      out.push(...(Array.isArray(result.transfers) ? result.transfers : []));
      if (!result.pageKey) break;
      pageKey = result.pageKey;
    }
    return out;
  }

  async function erc20LogIndex(chain, t, address) {
    if (!rpc) return null;
    try {
      const receipt = await rpc.getReceipt(chain, t.hash);
      const want = BigInt(toDecString(t.value));
      const log = (receipt?.logs || []).find((l) => String(l.address).toLowerCase() === String(t.contractAddress).toLowerCase()
        && l.topics?.[0] === TRANSFER_TOPIC
        && String(l.topics?.[2] || '').toLowerCase().endsWith(address.slice(2).toLowerCase())
        && l.data && BigInt(l.data) === want);
      return log ? String(parseInt(log.logIndex, 16)) : null;
    } catch {
      return null;
    }
  }

  function blockTime(t) {
    const ts = t.blockTimeStamp;
    if (typeof ts === 'string' && !/^\d+$/.test(ts)) return Math.floor(Date.parse(ts) / 1000);
    const n = toInt(ts);
    return n > 1e12 ? Math.floor(n / 1000) : n; // secondes ou millisecondes selon l'API
  }

  async function fetchAll(chain, address, fromBlock, toBlock) {
    const transfers = [];
    for (let start = fromBlock; start <= toBlock; start += MAX_RANGE) {
      const end = Math.min(start + MAX_RANGE - 1, toBlock);
      transfers.push(...await listRange(address, start, end));
    }
    const ordinals = new Map();
    const out = [];
    for (const t of transfers) {
      if (String(t.to).toLowerCase() !== address.toLowerCase()) continue;
      if (t.receiptsStatus === 0 || t.receiptsStatus === '0') continue;
      const amount = toDecString(t.value);
      if (!/^[1-9]\d*$/.test(amount)) continue;
      const kind = t.category === '20' ? 'erc20' : t.category === 'internal' ? 'internal' : 'native';
      const hash = String(t.hash).toLowerCase();
      const ordinalKey = `${hash}:${kind}`;
      const ordinal = ordinals.get(ordinalKey) || 0;
      ordinals.set(ordinalKey, ordinal + 1);
      let subIndex = kind === 'native' ? '0' : `ord-${ordinal}`;
      if (kind === 'erc20') subIndex = (await erc20LogIndex(chain, t, address)) || subIndex;
      out.push({
        chain_id: chain.chainId,
        tx_hash: hash,
        kind,
        sub_index: subIndex,
        block_number: toInt(t.blockNum),
        block_time: blockTime(t),
        from_address: String(t.from).toLowerCase(),
        token_address: kind === 'erc20' ? String(t.contractAddress).toLowerCase() : NATIVE_TOKEN,
        token_symbol: kind === 'erc20' ? (t.asset != null ? String(t.asset).slice(0, 64) : null) : chain.nativeSymbol,
        token_decimals: kind === 'erc20' ? toInt(t.decimal ?? 18) : 18,
        amount_raw: amount,
      });
    }
    return out;
  }

  return {
    name: 'nodereal',
    kinds: ['all'], // une seule requête couvre natif, interne et ERC-20
    isConfigured: () => Boolean(apiKey),
    fetch(kind, chain, address, fromBlock, toBlock) {
      return fetchAll(chain, address, fromBlock, toBlock);
    },
  };
}

module.exports = { createNodeRealSource, MAX_RANGE };
