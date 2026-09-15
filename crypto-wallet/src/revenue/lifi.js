'use strict';

// Frais intégrateur LI.FI en attente de réclamation.
//
// Depuis la mise à jour FeeForwarder, LI.FI verse les frais directement au
// wallet configuré au moment de chaque transaction (doc : docs.li.fi/faqs/
// fees-monetization) : ils arrivent on-chain et sont donc vus par l'indexeur.
// Seuls d'éventuels frais « legacy », accumulés avant cette mise à jour dans le
// contrat FeeCollector, restent à réclamer. Cette lecture les affiche ; la
// réclamation n'est volontairement PAS automatisée (portal.li.fi).
// Vérifié le 2026-09-15 : GET /v1/integrators/nexiawallet -> feeBalances: [].

const CACHE_MS = 10 * 60 * 1000;

function createLifiFees({ fetchImpl = globalThis.fetch, integrator = process.env.LIFI_INTEGRATOR || 'nexiawallet', apiKey = process.env.LIFI_API_KEY, now = () => Date.now() } = {}) {
  let cache = null;

  async function get() {
    if (cache && cache.expiresAt > now()) return cache.value;
    let value;
    try {
      const res = await fetchImpl(`https://li.quest/v1/integrators/${encodeURIComponent(integrator)}`, {
        headers: apiKey ? { 'x-lifi-api-key': apiKey } : {},
      });
      if (!res.ok) throw new Error(`LI.FI HTTP ${res.status}`);
      const data = await res.json();
      value = { integratorId: data.integratorId || integrator, feeBalances: Array.isArray(data.feeBalances) ? data.feeBalances : [], error: null, fetchedAt: now() };
    } catch (error) {
      value = { integratorId: integrator, feeBalances: [], error: error.message, fetchedAt: now() };
    }
    cache = { value, expiresAt: now() + CACHE_MS };
    return value;
  }

  return { get };
}

module.exports = { createLifiFees };
