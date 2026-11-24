// wallet-final/lib/stakeRefs.js
// ─────────────────────────────────────────────────────────────────
//  Liste locale des comptes de stake Solana d'un wallet (voir
//  loadStakeRefs / saveStakeRefs dans App.js). L'adresse d'un compte de
//  stake est derivee d'un nombre (Date.now()) : si sa reference est perdue,
//  l'app ne le retrouve plus jamais (le SOL n'apparait plus, impossible de
//  le desactiver ou de le retirer depuis NexiaWallet).
//
//  Avant le 23/11/2026, une reference etait supprimee des que le reseau ne
//  connaissait pas (encore) le compte. Or l'app relit la liste juste apres
//  la diffusion, et le serveur repond des l'envoi, AVANT la confirmation :
//  le compte tout juste cree etait souvent introuvable, donc sa reference
//  effacee. Desormais, une reference recente (moins d'une heure) est gardee
//  meme si le compte n'est pas encore visible.
// ─────────────────────────────────────────────────────────────────

'use strict';

const DELAI_GRACE_MS = 60 * 60 * 1000; // 1 heure

// refs : [{ stakePubkey, createdAt }] ; existants : adresses vues sur le reseau.
function refsAGarder(refs, existants, maintenant = Date.now()) {
  const vus = new Set(Array.isArray(existants) ? existants : []);
  return (Array.isArray(refs) ? refs : []).filter((r) => {
    if (!r || typeof r.stakePubkey !== 'string') return false;
    if (vus.has(r.stakePubkey)) return true;
    const age = maintenant - Number(r.createdAt);
    return Number.isFinite(age) && age >= 0 && age < DELAI_GRACE_MS;
  });
}

module.exports = { refsAGarder, DELAI_GRACE_MS };
