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
//  meme si le compte n'est pas encore visible, et une reference n'est effacee
//  qu'apres 7 jours d'absence continue (voir plus bas).
// ─────────────────────────────────────────────────────────────────

'use strict';

const DELAI_GRACE_MS = 60 * 60 * 1000; // 1 heure
// Audit de securite total (24/11/2026) : avant, une reference de plus d'une
// heure etait effacee au PREMIER relevé ou le noeud Solana ne voyait pas le
// compte. Un noeud public en retard ou mal synchronise suffisait donc a
// effacer pour toujours la reference d'un stake existant (son SOL disparaissait
// de l'app, sans moyen de le retrouver dans NexiaWallet). Desormais un compte
// doit etre introuvable a chaque relevé pendant 7 jours d'affilee avant que
// sa reference soit effacee (cas normal : stake entierement retire).
const DELAI_ABSENCE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

// refs : [{ stakePubkey, createdAt, absentDepuis? }] ; existants : adresses vues
// sur le reseau. Renvoie la liste a enregistrer (references mises a jour).
function refsAGarder(refs, existants, maintenant = Date.now()) {
  const vus = new Set(Array.isArray(existants) ? existants : []);
  const out = [];
  for (const r of (Array.isArray(refs) ? refs : [])) {
    if (!r || typeof r.stakePubkey !== 'string') continue;
    if (vus.has(r.stakePubkey)) {
      // revu sur le reseau : on oublie toute absence passee
      if (r.absentDepuis !== undefined) { const { absentDepuis, ...propre } = r; out.push(propre); } else out.push(r);
      continue;
    }
    const age = maintenant - Number(r.createdAt);
    if (Number.isFinite(age) && age >= 0 && age < DELAI_GRACE_MS) { out.push(r); continue; }
    const depuis = Number(r.absentDepuis);
    if (!Number.isFinite(depuis) || depuis > maintenant) { out.push({ ...r, absentDepuis: maintenant }); continue; }
    if (maintenant - depuis < DELAI_ABSENCE_MS) out.push(r);
    // sinon : introuvable depuis 7 jours -> reference effacee
  }
  return out;
}

// true si la liste a change (a enregistrer).
function refsModifiees(avant, apres) {
  return JSON.stringify(avant || []) !== JSON.stringify(apres || []);
}

module.exports = { refsAGarder, refsModifiees, DELAI_GRACE_MS, DELAI_ABSENCE_MS };
