'use strict';

// Petit cache en memoire avec duree de vie ET taille maximale.
//
// Avant le 24/11/2026, le cache des routes /wallet (prix, graphiques,
// fiches crypto, historique de chaque adresse...) ne supprimait jamais rien :
// une entree expiree restait en memoire pour toujours. Chaque nouvelle
// adresse qui ouvrait son Activite, chaque crypto consultee ajoutait une
// entree, et la memoire du serveur Railway ne faisait que monter jusqu'au
// redemarrage. Ici : les entrees expirees sont retirees, et au-dela de
// `max` entrees, les plus anciennes partent en premier.

function creerCache({ max = 1000, maintenant = () => Date.now() } = {}) {
  const entrees = new Map(); // cle -> { data, expiresAt }

  function lire(cle) {
    const hit = entrees.get(cle);
    if (!hit) return undefined;
    if (hit.expiresAt > maintenant()) return hit;
    entrees.delete(cle);
    return undefined;
  }

  function purgerExpirees() {
    const t = maintenant();
    for (const [cle, e] of entrees) if (e.expiresAt <= t) entrees.delete(cle);
  }

  function ecrire(cle, data, ttlMs) {
    entrees.delete(cle); // reinsertion = devient la plus recente
    entrees.set(cle, { data, expiresAt: maintenant() + ttlMs });
    if (entrees.size > max) {
      purgerExpirees();
      // Map garde l'ordre d'insertion : la premiere cle est la plus ancienne.
      while (entrees.size > max) entrees.delete(entrees.keys().next().value);
    }
  }

  async function obtenir(cle, ttlMs, charger) {
    const hit = lire(cle);
    if (hit) return hit.data;
    const data = await charger();
    ecrire(cle, data, ttlMs);
    return data;
  }

  return { obtenir, lire, ecrire, taille: () => entrees.size };
}

module.exports = { creerCache };
