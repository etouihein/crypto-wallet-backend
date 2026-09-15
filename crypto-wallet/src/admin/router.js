'use strict';

// Page d'administration des revenus. Servie par le backend, à une adresse
// secrète (ADMIN_PATH), protégée par mot de passe (ADMIN_PASSWORD_HASH).
// Aucun lien depuis l'app publique, en-têtes noindex, aucune mise en cache.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('./auth');
const views = require('./views');

const PERIODS = ['today', '7d', '30d', 'all', 'custom'];

function parseFilters(query, nowMs, stats, chains) {
  const period = PERIODS.includes(query.period) ? query.period : '30d';
  const p = stats.periods(nowMs);
  let range = { today: p.today, '7d': p.d7, '30d': p.d30, all: p.all }[period];
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromDate = dateRe.test(query.from || '') ? query.from : null;
  const toDate = dateRe.test(query.to || '') ? query.to : null;
  if (period === 'custom') {
    const dayStart = (d) => stats.parisMidnight(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), 12));
    range = {
      fromMs: fromDate ? dayStart(fromDate) : 0,
      toMs: toDate ? stats.addParisDays(dayStart(toDate), 1) : nowMs + 1,
    };
  }
  const chainId = chains.some((c) => String(c.chainId) === String(query.chain)) ? Number(query.chain) : null;
  return {
    period,
    fromDate,
    toDate,
    fromMs: range.fromMs,
    toMs: range.toMs,
    chainId,
    type: query.type === 'swap' || query.type === 'bridge' ? query.type : null,
    sort: Object.prototype.hasOwnProperty.call(stats.SORTS, query.sort) ? query.sort : 'date',
    dir: query.dir === 'asc' ? 'asc' : 'desc',
    page: Math.max(parseInt(query.page, 10) || 1, 1),
  };
}

function createAdminRouter({ passwordHash, getServices, now = () => Date.now(), loginMax = 5, globalLoginMax = 20 }) {
  const router = express.Router();
  let sessionStore = null;
  const sessions = () => sessionStore || (sessionStore = auth.createSessionStore(getServices().db, { now }));

  router.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.nonce = nonce;
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Cache-Control', 'no-store');
    // « same-origin », et surtout PAS « no-referrer » : cette dernière ferait
    // envoyer « Origin: null » par le navigateur sur le formulaire de connexion,
    // qu'isSameOrigin refuserait (explication complète dans admin/auth.js).
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
    next();
  });
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));
  router.use(express.urlencoded({ extended: false, limit: '4kb' }));

  const currentToken = (req) => {
    const token = auth.parseCookies(req.headers.cookie)[auth.COOKIE_NAME];
    return token && sessions().validate(token) ? token : null;
  };
  const requireAuth = (req, res, next) => {
    const token = currentToken(req);
    if (token) { res.locals.sessionToken = token; return next(); }
    if (req.method === 'GET') return res.redirect(303, `${req.baseUrl}/login`);
    return res.status(403).type('html').send(views.errorPage({ nonce: res.locals.nonce, message: 'Session expirée : reconnecte-toi.' }));
  };
  const requireSameOrigin = (req, res, next) => {
    if (auth.isSameOrigin(req)) return next();
    return res.status(403).type('html').send(views.errorPage({ nonce: res.locals.nonce, message: 'Requête refusée (origine).' }));
  };
  const tooMany = (message) => (req, res) => res.status(429).type('html').send(views.loginPage({ base: req.baseUrl, nonce: res.locals.nonce, error: message }));

  // Limites de connexion : seuls les échecs comptent (skipSuccessfulRequests).
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: loginMax, standardHeaders: true, legacyHeaders: false, skipSuccessfulRequests: true, handler: tooMany('Trop de tentatives. Réessaie dans 15 minutes.') });
  const globalLoginLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: globalLoginMax, standardHeaders: false, legacyHeaders: false, skipSuccessfulRequests: true, keyGenerator: () => 'global', handler: tooMany('Connexions temporairement bloquées. Réessaie plus tard.') });

  router.get('/login', (req, res) => {
    if (currentToken(req)) return res.redirect(303, `${req.baseUrl}/`);
    res.type('html').send(views.loginPage({ base: req.baseUrl, nonce: res.locals.nonce }));
  });

  router.post('/login', requireSameOrigin, globalLoginLimiter, loginLimiter, (req, res) => {
    if (!auth.verifyPassword(req.body && req.body.password, passwordHash)) {
      return res.status(401).type('html').send(views.loginPage({ base: req.baseUrl, nonce: res.locals.nonce, error: 'Mot de passe incorrect.' }));
    }
    res.setHeader('Set-Cookie', auth.sessionCookie(sessions().create()));
    return res.redirect(303, `${req.baseUrl}/`);
  });

  router.post('/logout', requireSameOrigin, requireAuth, (req, res) => {
    sessions().destroy(res.locals.sessionToken);
    res.setHeader('Set-Cookie', auth.clearedCookie());
    res.redirect(303, `${req.baseUrl}/login`);
  });

  async function withCurrentValues(services, rows) {
    const { fiatValue } = require('../revenue/money');
    const ids = rows.map((r) => r.coingeckoId).filter(Boolean);
    let prices = {};
    let pricesError = false;
    if (ids.length) {
      try { prices = await services.pricing.currentPrices(ids); } catch { pricesError = true; }
    }
    for (const r of rows) {
      const p = r.coingeckoId ? prices[r.coingeckoId] : null;
      r.valueUsdNow = p && p.usd !== null ? fiatValue(r.amountRaw, r.decimals, p.usd) : null;
      r.valueEurNow = p && p.eur !== null ? fiatValue(r.amountRaw, r.decimals, p.eur) : null;
    }
    return pricesError;
  }

  router.get('/', requireAuth, async (req, res, next) => {
    try {
      const services = getServices();
      const stats = require('../revenue/stats');
      const { conversionStats } = require('../revenue/reconcile');
      const { CHAINS, getChain } = require('../revenue/chains');
      const nowMs = now();
      const filters = parseFilters(req.query, nowMs, stats, CHAINS);
      const table = stats.listRevenue(services.db, filters);
      const pricesError = await withCurrentValues(services, table.rows);
      const [balances, lifi] = await Promise.all([
        services.balances.get().catch((error) => ({ error: error.message, chains: [] })),
        services.lifiFees.get(),
      ]);
      const p = stats.periods(nowMs);
      const runs = services.db.prepare('SELECT * FROM indexer_runs ORDER BY id DESC LIMIT 5').all().map((r) => {
        let errors = [];
        try { errors = JSON.parse(r.detail || '{}').errors || []; } catch { errors = []; }
        return { ...r, errorsText: errors.join(' | ') };
      });
      const cursors = services.db.prepare('SELECT * FROM indexer_cursors ORDER BY chain_id, kind').all()
        .map((c) => ({ ...c, chainName: getChain(c.chain_id)?.name || String(c.chain_id) }));
      res.type('html').send(views.dashboardPage({
        base: req.baseUrl,
        nonce: res.locals.nonce,
        feeAddress: services.feeAddress,
        totals: stats.totals(services.db, nowMs),
        days: stats.revenueByDay(services.db, nowMs, 30),
        breakdown: stats.breakdown(services.db, 0, nowMs + 1),
        conversion30: conversionStats(services.db, { fromMs: p.d30.fromMs, toMs: nowMs + 1 }),
        conversionAll: conversionStats(services.db),
        filters,
        table,
        chains: CHAINS,
        balances,
        lifi,
        unclassified: stats.unclassifiedSummary(services.db),
        runs,
        cursors,
        pricesError,
        indexerStarted: req.query.indexer === 'started',
      }));
    } catch (error) {
      next(error);
    }
  });

  router.get('/export.csv', requireAuth, async (req, res, next) => {
    try {
      const services = getServices();
      const stats = require('../revenue/stats');
      const { CHAINS } = require('../revenue/chains');
      const filters = parseFilters(req.query, now(), stats, CHAINS);
      const rows = stats.listAllRevenue(services.db, filters);
      await withCurrentValues(services, rows);
      const day = stats.parisDateKey(now());
      res.setHeader('Content-Disposition', `attachment; filename="nexiawallet-revenus-${day}.csv"`);
      res.type('text/csv; charset=utf-8').send(stats.toCsv(rows));
    } catch (error) {
      next(error);
    }
  });

  router.post('/indexer/run', requireSameOrigin, requireAuth, (req, res) => {
    getServices().indexer.runOnce().catch((error) => console.warn(`Indexeur des revenus (manuel) : ${error.message}`));
    res.redirect(303, `${req.baseUrl}/?indexer=started`);
  });

  router.get('/backup.db', requireAuth, async (req, res, next) => {
    const file = path.join(os.tmpdir(), `nexiawallet-revenus-${crypto.randomBytes(6).toString('hex')}.db`);
    try {
      await getServices().db.backup(file);
      res.download(file, 'nexiawallet-revenus.db', () => fs.rm(file, { force: true }, () => {}));
    } catch (error) {
      fs.rm(file, { force: true }, () => {});
      next(error);
    }
  });

  // Tout autre chemin sous l'adresse secrète : même 404 que le reste du serveur.
  router.use((req, res) => res.status(404).json({ success: false, error: 'Route inconnue.' }));

  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    console.error('Admin revenus :', err && err.message);
    if (res.headersSent) return;
    res.status(500).type('html').send(views.errorPage({ nonce: res.locals.nonce || '', message: 'Erreur serveur. Réessaie dans un instant.' }));
  });

  return router;
}

// Monte la page seulement si la configuration est complète et saine.
function mountAdminFromEnv(app, { env = process.env, logger = console } = {}) {
  const adminPath = env.ADMIN_PATH;
  const passwordHash = env.ADMIN_PASSWORD_HASH;
  if (!adminPath && !passwordHash) return false;
  if (!auth.isValidAdminPath(adminPath) || !auth.parseStoredHash(passwordHash)) {
    logger.warn('Page admin des revenus désactivée : ADMIN_PATH (au moins 16 caractères aléatoires) ou ADMIN_PASSWORD_HASH invalide.');
    return false;
  }
  app.use(adminPath, createAdminRouter({
    passwordHash,
    getServices: () => require('../revenue/services').getRevenueServices(),
  }));
  logger.log('Page admin des revenus active.');
  return true;
}

module.exports = { createAdminRouter, mountAdminFromEnv, parseFilters };
