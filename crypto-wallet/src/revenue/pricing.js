'use strict';

// Prix CoinGecko : historique (au moment de la réception) et actuel.
//
// Historique : /coins/{id}/market_chart/range, granularité horaire sur le passé
// (doc CoinGecko). On retient le point le plus proche de l'heure du bloc, à
// 90 minutes au plus, sinon « non valorisé » (null) — jamais un prix inventé.
// Tous les points reçus sont mis en cache (price_points) : une réception à la
// même heure ne coûte plus aucun appel. L'offre Demo (10 000 appels/mois) suffit.

const { numberToDecimalString } = require('./money');
const { NATIVE_TOKEN } = require('./chains');

const CG_BASE = 'https://api.coingecko.com/api/v3';
const MAX_DISTANCE_S = 90 * 60;
const FETCH_WINDOW_S = 3 * 3600;
const MIN_SPACING_MS = 1500; // espace les appels : reste loin de la limite par minute
const TOKEN_ID_RECHECK_MS = 7 * 24 * 3600 * 1000;

function cgHeaders() {
  return process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY, accept: 'application/json' } : { accept: 'application/json' };
}

function createPricing({ db, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() }) {
  let lastCallAt = 0;

  async function cgGet(pathAndQuery) {
    const wait = lastCallAt + MIN_SPACING_MS - now();
    if (wait > 0) await sleep(wait);
    lastCallAt = now();
    const res = await fetchImpl(`${CG_BASE}${pathAndQuery}`, { headers: cgHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    return res.json();
  }

  const nearestStmt = db.prepare(`SELECT price, hour_ts FROM price_points
    WHERE coingecko_id = ? AND currency = ? AND hour_ts BETWEEN ? AND ?
    ORDER BY ABS(hour_ts - ?) LIMIT 1`);
  const insertPoint = db.prepare('INSERT OR IGNORE INTO price_points (coingecko_id, currency, hour_ts, price) VALUES (?, ?, ?, ?)');

  function nearestCached(coingeckoId, currency, ts) {
    const row = nearestStmt.get(coingeckoId, currency, ts - MAX_DISTANCE_S, ts + MAX_DISTANCE_S, ts);
    return row ? row.price : null;
  }

  // Prix d'une pièce, dans une devise, au plus près de l'instant ts (secondes Unix).
  async function historicalPrice(coingeckoId, currency, ts) {
    const cached = nearestCached(coingeckoId, currency, ts);
    if (cached !== null) return cached;
    const data = await cgGet(`/coins/${encodeURIComponent(coingeckoId)}/market_chart/range?vs_currency=${currency}&from=${ts - FETCH_WINDOW_S}&to=${ts + FETCH_WINDOW_S}`);
    const points = Array.isArray(data?.prices) ? data.prices : [];
    db.transaction(() => {
      for (const [ms, price] of points) {
        if (Number.isFinite(ms) && Number.isFinite(price)) insertPoint.run(coingeckoId, currency, Math.round(ms / 1000), numberToDecimalString(price));
      }
    })();
    return nearestCached(coingeckoId, currency, ts);
  }

  async function historicalPrices(coingeckoId, ts) {
    return { usd: await historicalPrice(coingeckoId, 'usd', ts), eur: await historicalPrice(coingeckoId, 'eur', ts) };
  }

  // Identifiant CoinGecko d'un token (natif via la config de chaîne, ERC-20 via
  // l'adresse du contrat). Un token inconnu de CoinGecko renvoie null et n'est
  // revérifié qu'au bout d'une semaine.
  async function resolveCoingeckoId(chain, tokenAddress) {
    const token = String(tokenAddress).toLowerCase();
    if (token === NATIVE_TOKEN) return chain.nativeCoingeckoId;
    const row = db.prepare('SELECT coingecko_id, checked_at FROM token_ids WHERE chain_id = ? AND token_address = ?').get(chain.chainId, token);
    if (row && (row.coingecko_id || now() - row.checked_at < TOKEN_ID_RECHECK_MS)) return row.coingecko_id;
    const data = await cgGet(`/coins/${chain.coingeckoPlatform}/contract/${token}`);
    const id = data && typeof data.id === 'string' ? data.id : null;
    db.prepare(`INSERT INTO token_ids (chain_id, token_address, coingecko_id, checked_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (chain_id, token_address) DO UPDATE SET coingecko_id = excluded.coingecko_id, checked_at = excluded.checked_at`)
      .run(chain.chainId, token, id, now());
    return id;
  }

  // Prix actuels (USD et EUR), en cache mémoire 5 minutes.
  const currentCache = new Map();
  async function currentPrices(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    const missing = unique.filter((id) => !(currentCache.get(id)?.expiresAt > now()));
    if (missing.length) {
      const data = await cgGet(`/simple/price?ids=${missing.map(encodeURIComponent).join(',')}&vs_currencies=usd,eur`);
      for (const id of missing) {
        const p = data?.[id];
        currentCache.set(id, {
          usd: Number.isFinite(p?.usd) ? numberToDecimalString(p.usd) : null,
          eur: Number.isFinite(p?.eur) ? numberToDecimalString(p.eur) : null,
          expiresAt: now() + 5 * 60 * 1000,
        });
      }
    }
    return Object.fromEntries(unique.map((id) => [id, { usd: currentCache.get(id)?.usd ?? null, eur: currentCache.get(id)?.eur ?? null }]));
  }

  return { historicalPrice, historicalPrices, resolveCoingeckoId, currentPrices };
}

module.exports = { createPricing, MAX_DISTANCE_S };
