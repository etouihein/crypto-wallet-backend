'use strict';

// Délai maximum pour chaque appel du suivi des revenus (nœuds RPC, Blockscout,
// NodeReal, Alchemy, CoinGecko, LI.FI).
//
// Avant le 22/11/2026, ces appels n'avaient aucun délai à eux (seules les
// routes de l'app en ont un, PATCH-004). Un service qui accepte la connexion
// puis ne répond plus, ou envoie sa réponse au compte-gouttes, gardait le
// passage de l'indexeur « en cours » plusieurs minutes : pendant ce temps,
// tous les passages suivants étaient sautés (« passage déjà en cours ») et
// la page d'administration attendait. Le délai couvre aussi la lecture du
// corps de la réponse (res.json()).

const DELAI_PAR_DEFAUT_MS = 20000;

function fetchAvecDelai(fetchImpl = globalThis.fetch, delaiMs = DELAI_PAR_DEFAUT_MS) {
  return async function fetchLimite(url, options = {}) {
    if (options.signal) return fetchImpl(url, options);
    try {
      return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(delaiMs) });
    } catch (error) {
      if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        let hote = 'service';
        try { hote = new URL(String(url)).host; } catch { /* adresse illisible */ }
        // Jamais l'adresse complète : certaines contiennent une clé d'API.
        throw new Error(`délai dépassé (${Math.round(delaiMs / 1000)} s) : ${hote}`);
      }
      throw error;
    }
  };
}

module.exports = { fetchAvecDelai, DELAI_PAR_DEFAUT_MS };
