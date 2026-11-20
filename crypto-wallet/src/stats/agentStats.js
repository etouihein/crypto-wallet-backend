'use strict';
// Statistiques pour l'agent "Nexia - Statistiques" (tableau de bord de Pablo dans Jarvis).
//
// 1. compteur de requetes : un middleware compte, par tranche de 10 minutes (24 h
//    gardees en memoire), les requetes recues par categorie (devis swap, devis
//    bridge, envois, achats...) et les erreurs. Rien n'est stocke sur la personne :
//    ni IP, ni adresse, ni parametre, seulement des compteurs.
// 2. GET /stats/agent : renvoie ces compteurs + les chiffres agreges de la base des
//    revenus (devis, conversions, revenus par jour, par reseau). Aucune adresse,
//    aucun hash de transaction, aucune donnee personnelle.
//    Protege par un jeton : en-tete "Authorization: Bearer <jeton>", dont l'empreinte
//    SHA-256 (64 caracteres hexadecimaux) est dans la variable STATS_TOKEN_SHA256.
//    Sans cette variable, la route n'existe pas (404).
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');

const TRANCHE_MS = 10 * 60 * 1000;
const TRANCHES_GARDEES = 144; // 24 h

const CATEGORIES = [
  ['devis_swap', (p) => p === '/wallet/swap/quote'],
  ['devis_bridge', (p) => p === '/wallet/swap/cross-quote' || p === '/wallet/bridge/quote'],
  ['envois', (p) => p.startsWith('/wallet/tx/broadcast')],
  ['achat_vente', (p) => p.startsWith('/wallet/payments/') || p === '/wallet/webhooks/moonpay'],
  ['historique', (p) => p === '/wallet/tx/history'],
  ['marche', (p) => p.startsWith('/wallet/market') || p.startsWith('/wallet/coin/') || p === '/wallet/news'],
  ['nft', (p) => p.startsWith('/wallet/nft/')],
  ['profil', (p) => p.startsWith('/wallet/profile/')],
  ['sante', (p) => p === '/health' || p === '/'],
];

function categorie(path) {
  for (const [nom, test] of CATEGORIES) if (test(path)) return nom;
  return 'autres';
}

// Stockage permanent des compteurs dans la base des revenus (volume Railway) :
// rien n'est perdu quand le serveur redemarre ou est mis a jour.
function stockageSqlite(getDb) {
  let ecrire;
  let lire;
  const db = () => {
    const d = getDb();
    if (!d) throw new Error('base indisponible');
    return d;
  };
  return {
    sauver(lignes) {
      const d = db();
      ecrire = ecrire || d.prepare(`INSERT INTO request_stats (bucket, total, erreurs4xx, erreurs5xx, refus429, categories)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (bucket) DO UPDATE SET total = excluded.total, erreurs4xx = excluded.erreurs4xx,
        erreurs5xx = excluded.erreurs5xx, refus429 = excluded.refus429, categories = excluded.categories`);
      d.transaction(() => {
        for (const [n, t] of lignes) ecrire.run(n, t.total, t.erreurs4xx, t.erreurs5xx, t.refus429, JSON.stringify(t.parCategorie));
      })();
    },
    charger(depuis) {
      lire = lire || db().prepare('SELECT * FROM request_stats WHERE bucket >= ? ORDER BY bucket');
      return lire.all(depuis).map((r) => [r.bucket, {
        total: r.total, erreurs4xx: r.erreurs4xx, erreurs5xx: r.erreurs5xx, refus429: r.refus429,
        parCategorie: (() => { try { return JSON.parse(r.categories) || {}; } catch { return {}; } })(),
      }]);
    },
  };
}

function creerCompteur({ now = () => Date.now(), stockage = null, logger = console } = {}) {
  const tranches = new Map(); // numero de tranche -> { total, erreurs4xx, erreurs5xx, refus429, parCategorie }
  const modifiees = new Set(); // tranches pas encore enregistrees dans la base
  const depart = now();
  let charge = false;

  // Au demarrage : on reprend les 24 dernieres heures depuis la base.
  function chargerSiBesoin() {
    if (charge || !stockage) return;
    charge = true;
    try {
      for (const [n, t] of stockage.charger(Math.floor(now() / TRANCHE_MS) - TRANCHES_GARDEES + 1)) {
        if (!tranches.has(n)) tranches.set(n, t);
      }
    } catch (e) {
      charge = false; // base pas encore prete : on reessaiera
    }
  }

  function enregistrerDansLaBase() {
    if (!stockage || !modifiees.size) return;
    chargerSiBesoin();
    const lignes = [...modifiees].filter((n) => tranches.has(n)).map((n) => [n, tranches.get(n)]);
    try {
      stockage.sauver(lignes);
      for (const [n] of lignes) modifiees.delete(n);
    } catch (e) {
      logger.warn(`Statistiques : enregistrement impossible (${e.message}), nouvel essai dans 1 min`);
    }
  }

  function tranche(n) {
    let t = tranches.get(n);
    if (!t) {
      t = { total: 0, erreurs4xx: 0, erreurs5xx: 0, refus429: 0, parCategorie: {} };
      tranches.set(n, t);
      for (const k of tranches.keys()) if (k <= n - TRANCHES_GARDEES) tranches.delete(k);
    }
    return t;
  }

  function enregistrer(path, status) {
    chargerSiBesoin();
    const n = Math.floor(now() / TRANCHE_MS);
    modifiees.add(n);
    const t = tranche(n);
    const c = categorie(path);
    t.total += 1;
    t.parCategorie[c] = (t.parCategorie[c] || 0) + 1;
    if (status === 429) t.refus429 += 1;
    else if (status >= 500) t.erreurs5xx += 1;
    else if (status >= 400) t.erreurs4xx += 1;
  }

  function middleware(req, res, next) {
    const path = req.path; // sans parametres
    res.on('finish', () => enregistrer(path, res.statusCode));
    next();
  }

  // Totaux longue duree (7 j, 30 j, depuis le debut) lus dans la base.
  function historique() {
    if (!stockage) return null;
    enregistrerDansLaBase();
    const actuelle = Math.floor(now() / TRANCHE_MS);
    const periodes = { sept_jours: actuelle - 7 * 144 + 1, trente_jours: actuelle - 30 * 144 + 1, depuis_le_debut: 0 };
    const sortie = {};
    let lignes;
    try { lignes = stockage.charger(0); } catch (e) { return null; }
    for (const [nom, de] of Object.entries(periodes)) {
      const r = { total: 0, erreurs4xx: 0, erreurs5xx: 0, refus429: 0, parCategorie: {} };
      for (const [n, t] of lignes) {
        if (n < de) continue;
        r.total += t.total; r.erreurs4xx += t.erreurs4xx; r.erreurs5xx += t.erreurs5xx; r.refus429 += t.refus429;
        for (const [c, v] of Object.entries(t.parCategorie)) r.parCategorie[c] = (r.parCategorie[c] || 0) + v;
      }
      sortie[nom] = r;
    }
    sortie.premier_enregistrement = lignes.length ? new Date(lignes[0][0] * TRANCHE_MS).toISOString() : null;
    return sortie;
  }

  // Enregistrement toutes les minutes, et juste avant l'arret du serveur
  // (Railway envoie SIGTERM a chaque mise a jour) : au pire 1 minute perdue sur un plantage.
  function demarrerEnregistrement(proc = process) {
    if (!stockage) return;
    setInterval(enregistrerDansLaBase, 60 * 1000).unref();
    const surArret = (signal) => {
      try { enregistrerDansLaBase(); } catch (e) { /* jamais bloquant */ }
      proc.kill(proc.pid, signal); // l'ecouteur (once) est retire : l'arret normal reprend
    };
    proc.once('SIGTERM', surArret);
    proc.once('SIGINT', surArret);
  }

  function resume() {
    chargerSiBesoin();
    const actuelle = Math.floor(now() / TRANCHE_MS);
    const vide = () => ({ total: 0, erreurs4xx: 0, erreurs5xx: 0, refus429: 0, parCategorie: {} });
    const cumul = (de) => {
      const r = vide();
      for (const [n, t] of tranches) {
        if (n < de || n > actuelle) continue;
        r.total += t.total; r.erreurs4xx += t.erreurs4xx; r.erreurs5xx += t.erreurs5xx; r.refus429 += t.refus429;
        for (const [c, v] of Object.entries(t.parCategorie)) r.parCategorie[c] = (r.parCategorie[c] || 0) + v;
      }
      return r;
    };
    const parTranche = [];
    for (let n = actuelle - 23; n <= actuelle; n++) parTranche.push((tranches.get(n) || vide()).total); // 4 dernieres heures
    return {
      depuis: new Date(depart).toISOString(),
      dix_dernieres_minutes: cumul(actuelle - 1), // tranche en cours + precedente (au moins 10 min completes)
      derniere_heure: cumul(actuelle - 5),
      dernieres_24h: cumul(actuelle - TRANCHES_GARDEES + 1),
      par_tranche_4h: parTranche,
      historique: historique(),
    };
  }

  return { middleware, resume, enregistrer, enregistrerDansLaBase, demarrerEnregistrement };
}

function empreinteValide(attendue, jeton) {
  if (!/^[0-9a-f]{64}$/.test(attendue) || typeof jeton !== 'string' || jeton.length < 32 || jeton.length > 200) return false;
  const recue = crypto.createHash('sha256').update(jeton, 'utf8').digest();
  return crypto.timingSafeEqual(recue, Buffer.from(attendue, 'hex'));
}

function chiffresRevenus(getServices, nowMs) {
  let services;
  try { services = getServices(); } catch (e) { return { disponible: false, raison: 'base des revenus indisponible' }; }
  if (!services || !services.db) return { disponible: false, raison: 'base des revenus non configuree' };
  const db = services.db;
  const stats = require('../revenue/stats');
  const { conversionStats } = require('../revenue/reconcile');
  const p = stats.periods(nowMs);
  const devis = (fromMs) => db.prepare(`SELECT type, COUNT(*) AS n FROM quote_events
    WHERE created_at >= ? GROUP BY type`).all(fromMs)
    .reduce((acc, r) => ({ ...acc, [r.type]: r.n }), { swap: 0, bridge: 0 });
  const parReseau = db.prepare(`SELECT chain_id, type, COUNT(*) AS n FROM quote_events
    WHERE created_at >= ? GROUP BY chain_id, type ORDER BY n DESC LIMIT 12`).all(p.d7.fromMs);
  const { getChain } = require('../revenue/chains');
  const derniers = db.prepare(`SELECT block_time, classification, chain_id, token_symbol, value_eur_at_receipt
    FROM inbound_transfers WHERE classification IN ('swap_fee', 'bridge_fee')
    ORDER BY block_time DESC LIMIT 5`).all().map((r) => ({
    quand: new Date(r.block_time * 1000).toISOString(),
    type: r.classification === 'swap_fee' ? 'swap' : 'bridge',
    reseau: getChain(r.chain_id)?.name || String(r.chain_id),
    jeton: r.token_symbol,
    eur: r.value_eur_at_receipt,
  }));
  const brut = db.prepare('SELECT started_at, finished_at, status, detail FROM indexer_runs ORDER BY id DESC LIMIT 1').get() || null;
  // erreurs du dernier calcul des revenus, nettoyees : jamais d'adresse web ni de cle
  let run = null;
  if (brut) {
    let erreurs = [];
    try { erreurs = (JSON.parse(brut.detail || '{}').errors || []).map(String); } catch (e) { erreurs = []; }
    erreurs = erreurs.slice(0, 12).map((x) => x.replace(/https?:\/\/\S+/g, '[lien]').replace(/(api[_-]?key|apikey|key|token)=\S+/gi, '$1=[masque]').slice(0, 160));
    run = { started_at: brut.started_at, finished_at: brut.finished_at, status: brut.status, erreurs };
  }
  return {
    disponible: true,
    revenus: stats.totals(db, nowMs),
    revenus_par_jour_14j: stats.revenueByDay(db, nowMs, 14),
    revenus_7j_detail: stats.breakdown(db, p.d7.fromMs, nowMs + 1),
    devis: { dix_minutes: devis(nowMs - TRANCHE_MS), aujourdhui: devis(p.today.fromMs), sept_jours: devis(p.d7.fromMs) },
    devis_par_reseau_7j: parReseau.map((r) => ({ reseau: getChain(r.chain_id)?.name || String(r.chain_id), type: r.type, n: r.n })),
    conversion_7j: conversionStats(db, { fromMs: p.d7.fromMs, toMs: nowMs + 1 }),
    derniers_revenus: derniers,
    indexeur: run,
  };
}

// Monte GET /stats/agent si STATS_TOKEN_SHA256 est defini (sinon : rien, 404).
function monterStats(app, compteur, { env = process.env, getServices, now = () => Date.now() } = {}) {
  const attendue = String(env.STATS_TOKEN_SHA256 || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(attendue)) return false;
  const router = express.Router();
  router.use(rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false }));
  router.get('/agent', (req, res) => {
    const m = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
    if (!m || !empreinteValide(attendue, m[1])) return res.status(401).json({ error: 'non autorise' });
    const nowMs = now();
    let revenus;
    try {
      revenus = chiffresRevenus(getServices || (() => require('../revenue/services').getRevenueServices()), nowMs);
    } catch (e) {
      revenus = { disponible: false, raison: 'erreur de lecture des revenus' };
    }
    res.set('Cache-Control', 'no-store');
    res.json({ genere_le: new Date(nowMs).toISOString(), requetes: compteur.resume(), ...revenus });
  });
  app.use('/stats', router);
  return true;
}

module.exports = { creerCompteur, stockageSqlite, monterStats, categorie, empreinteValide, TRANCHE_MS };
