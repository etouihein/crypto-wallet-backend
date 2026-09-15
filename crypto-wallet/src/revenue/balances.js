'use strict';

// Soldes actuels de l'adresse de collecte, par chaîne et par token, lus en
// direct sur les nœuds RPC. Tokens suivis : le natif de chaque chaîne, plus
// ceux dans lesquels une commission a été reçue ou attendue (jamais les faux
// jetons d'empoisonnement, qui ne sont pas des commissions).

const { ethers } = require('ethers');
const { CHAINS, NATIVE_TOKEN } = require('./chains');
const { formatUnits, fiatValue } = require('./money');

const CACHE_MS = 5 * 60 * 1000;
const abi = ethers.utils.defaultAbiCoder;

function createBalances({ db, rpc, pricing, feeAddress, chains = CHAINS, now = () => Date.now() }) {
  const address = String(feeAddress).toLowerCase();
  let cache = null;

  function trackedTokens(chainId) {
    const seen = new Map();
    for (const r of db.prepare(`SELECT DISTINCT token_address, token_symbol, token_decimals FROM inbound_transfers
      WHERE chain_id = ? AND classification IN ('swap_fee', 'bridge_fee') AND token_address != ?`).all(chainId, NATIVE_TOKEN)) {
      seen.set(r.token_address, { symbol: r.token_symbol, decimals: r.token_decimals });
    }
    for (const r of db.prepare(`SELECT DISTINCT expected_fee_token AS token_address FROM quote_events
      WHERE chain_id = ? AND expected_fee_token IS NOT NULL AND expected_fee_token != ?`).all(chainId, NATIVE_TOKEN)) {
      if (!seen.has(r.token_address)) seen.set(r.token_address, { symbol: null, decimals: null });
    }
    return seen;
  }

  async function erc20Call(chain, token, data) {
    return rpc.call(chain.rpcUrl, 'eth_call', [{ to: token, data }, 'latest']);
  }

  async function tokenMeta(chain, token, known) {
    let { symbol, decimals } = known;
    if (decimals === null || decimals === undefined) decimals = Number(BigInt(await erc20Call(chain, token, '0x313ce567')));
    if (!symbol) {
      try { symbol = abi.decode(['string'], await erc20Call(chain, token, '0x95d89b41'))[0]; } catch { symbol = '?'; }
    }
    return { symbol: String(symbol).slice(0, 32), decimals };
  }

  async function chainBalances(chain) {
    const nativeRaw = BigInt(await rpc.call(chain.rpcUrl, 'eth_getBalance', [address, 'latest'])).toString();
    const lines = [{ token: NATIVE_TOKEN, symbol: chain.nativeSymbol, decimals: 18, raw: nativeRaw, coingeckoId: chain.nativeCoingeckoId }];
    for (const [token, known] of trackedTokens(chain.chainId)) {
      const meta = await tokenMeta(chain, token, known);
      const raw = BigInt(await erc20Call(chain, token, '0x70a08231' + address.slice(2).padStart(64, '0'))).toString();
      lines.push({ token, symbol: meta.symbol, decimals: meta.decimals, raw, coingeckoId: await pricing.resolveCoingeckoId(chain, token) });
    }
    return lines;
  }

  async function get({ force = false } = {}) {
    if (!force && cache && cache.expiresAt > now()) return cache.value;
    const perChain = [];
    for (const chain of chains) {
      try {
        perChain.push({ chainId: chain.chainId, name: chain.name, lines: await chainBalances(chain), error: null });
      } catch (error) {
        perChain.push({ chainId: chain.chainId, name: chain.name, lines: [], error: error.message });
      }
    }
    let prices = {};
    try {
      prices = await pricing.currentPrices(perChain.flatMap((c) => c.lines.map((l) => l.coingeckoId)));
    } catch {
      prices = {};
    }
    for (const c of perChain) {
      for (const l of c.lines) {
        const p = l.coingeckoId ? prices[l.coingeckoId] : null;
        l.amount = formatUnits(l.raw, l.decimals);
        l.usd = p && p.usd !== null ? fiatValue(l.raw, l.decimals, p.usd) : null;
        l.eur = p && p.eur !== null ? fiatValue(l.raw, l.decimals, p.eur) : null;
      }
    }
    const value = { fetchedAt: now(), chains: perChain };
    cache = { value, expiresAt: now() + CACHE_MS };
    return value;
  }

  return { get };
}

module.exports = { createBalances };
