'use strict';

// Source Alchemy pour Base et Polygon. Depuis le 1er octobre 2026, l'offre
// gratuite de Blockscout PRO ne couvre plus Base ni Polygon (HTTP 402), et les
// explorateurs publics bloquent les serveurs (403). Alchemy (cle deja utilisee
// pour les NFT : ALCHEMY_API_KEY) fournit l'historique des transferts recus via
// alchemy_getAssetTransfers, transferts internes compris sur Base et Polygon
// (https://www.alchemy.com/docs/reference/alchemy-getassettransfers).
// Categories : external (natif), internal, erc20 ; 1 000 resultats par page,
// pagination par pageKey. Identifiants : logIndex pour un ERC-20 (tire de
// uniqueId "hash:log:N"), ordinal stable dans la transaction pour l'interne.

const { NATIVE_TOKEN } = require('../chains');

function createAlchemySource({ fetchImpl = globalThis.fetch, apiKey = process.env.ALCHEMY_API_KEY, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), spacingMs = 250 } = {}) {
  let id = 0;
  const url = (chain) => `https://${chain.alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;

  async function call(chain, method, params) {
    await sleep(spacingMs);
    const res = await fetchImpl(url(chain), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'NexiaWallet-revenus/1.0' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (!res.ok) throw new Error(`Alchemy HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`Alchemy : ${data.error.message || 'erreur'}`);
    return data.result;
  }

  const hex = (n) => '0x' + Number(n).toString(16);
  const toInt = (v) => (typeof v === 'string' && v.startsWith('0x') ? parseInt(v, 16) : Number(v));
  const toDecString = (v) => {
    try { return v == null ? '0' : BigInt(v).toString(); } catch { return '0'; }
  };

  async function fetchAll(chain, address, fromBlock, toBlock) {
    const transfers = [];
    let pageKey;
    for (let page = 0; page < 1000; page++) {
      const result = await call(chain, 'alchemy_getAssetTransfers', [{
        category: ['external', 'internal', 'erc20'],
        fromBlock: hex(fromBlock),
        toBlock: hex(toBlock),
        toAddress: address,
        excludeZeroValue: true,
        withMetadata: true,
        order: 'asc',
        maxCount: '0x3e8',
        ...(pageKey ? { pageKey } : {}),
      }]);
      transfers.push(...(Array.isArray(result?.transfers) ? result.transfers : []));
      if (!result?.pageKey) break;
      pageKey = result.pageKey;
    }
    const ordinals = new Map();
    const out = [];
    for (const t of transfers) {
      if (String(t.to || '').toLowerCase() !== address.toLowerCase()) continue;
      const kind = t.category === 'erc20' ? 'erc20' : t.category === 'internal' ? 'internal' : t.category === 'external' ? 'native' : null;
      if (!kind) continue;
      const amount = toDecString(t.rawContract?.value);
      if (!/^[1-9]\d*$/.test(amount)) continue;
      const hash = String(t.hash).toLowerCase();
      let subIndex = '0';
      if (kind === 'erc20') {
        const m = /:log:(\d+)$/.exec(String(t.uniqueId || ''));
        subIndex = m ? m[1] : `ord-${ordinals.get(`${hash}:erc20`) || 0}`;
      }
      if (kind !== 'native') {
        const k = `${hash}:${kind}`;
        const n = ordinals.get(k) || 0;
        ordinals.set(k, n + 1);
        if (kind === 'internal') subIndex = `ord-${n}`;
      }
      const ts = t.metadata?.blockTimestamp ? Math.floor(Date.parse(t.metadata.blockTimestamp) / 1000) : null;
      out.push({
        chain_id: chain.chainId,
        tx_hash: hash,
        kind,
        sub_index: subIndex,
        block_number: toInt(t.blockNum),
        block_time: ts,
        from_address: String(t.from || '').toLowerCase(),
        token_address: kind === 'erc20' ? String(t.rawContract?.address || '').toLowerCase() : NATIVE_TOKEN,
        token_symbol: kind === 'erc20' ? (t.asset != null ? String(t.asset).slice(0, 64) : null) : chain.nativeSymbol,
        token_decimals: kind === 'erc20' ? (t.rawContract?.decimal != null ? toInt(t.rawContract.decimal) : 18) : 18,
        amount_raw: amount,
      });
    }
    return out.filter((r) => Number.isFinite(r.block_time) && r.block_time > 0);
  }

  async function getTransactionTarget(chain, txHash) {
    const tx = await call(chain, 'eth_getTransactionByHash', [txHash]);
    return tx && tx.to ? String(tx.to).toLowerCase() : null;
  }

  return {
    name: 'alchemy',
    getTransactionTarget,
    kinds: ['all'], // une seule requete couvre natif, interne et ERC-20
    isConfigured: (chain) => Boolean(apiKey && chain.alchemyNetwork),
    fetch(kind, chain, address, fromBlock, toBlock) {
      return fetchAll(chain, address, fromBlock, toBlock);
    },
  };
}

module.exports = { createAlchemySource };
