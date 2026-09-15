'use strict';

// Rendu HTML de la page d'administration des revenus. Tout est généré côté
// serveur, sans aucun JavaScript : la CSP peut interdire tout script. Toute
// donnée dynamique (dont les symboles de tokens venus d'API tierces) passe par
// esc().

const { TZ } = require('../revenue/stats');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });

function money(decimal, currency) {
  if (decimal === null || decimal === undefined) return '<span class="muted">non valorisé</span>';
  const n = Number(decimal);
  const small = n !== 0 && Math.abs(n) < 0.01;
  return esc(new Intl.NumberFormat('fr-FR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: small ? 6 : 2 }).format(n));
}

function amount(decimalString) {
  const [i, f = ''] = String(decimalString).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return esc(f ? `${grouped},${f.slice(0, 8)}` : grouped);
}

const STYLE = `
:root { --bg:#f5f7f6; --surface:#fff; --ink:#0f1b16; --muted:#5a6a63; --line:#d9e2dd; --accent:#0a8f63; --accent-soft:#ddf3e8; --warn:#9a5b00; --warn-soft:#fdf1dc; --bad:#b42318; }
@media (prefers-color-scheme: dark) { :root { --bg:#0b110e; --surface:#121a16; --ink:#e4ece8; --muted:#8fa29a; --line:#223029; --accent:#3dd6a0; --accent-soft:#0f2a20; --warn:#f0b45a; --warn-soft:#2b2111; --bad:#f97066; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; padding:0 20px 60px; }
.wrap { max-width:1180px; margin:0 auto; }
header.top { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; padding:20px 0; border-bottom:1px solid var(--line); margin-bottom:24px; }
h1 { font-size:20px; margin:0; } h2 { font-size:16px; margin:32px 0 12px; }
.muted { color:var(--muted); } .num { font-variant-numeric:tabular-nums; }
.actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
button, .btn { font:inherit; font-size:14px; border:1px solid var(--line); background:var(--surface); color:var(--ink); border-radius:8px; padding:7px 12px; cursor:pointer; text-decoration:none; }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
a { color:var(--accent); }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
.kpi { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
.kpi .label { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
.kpi .usd { font-size:26px; font-weight:700; margin-top:4px; }
.kpi .eur { color:var(--muted); }
.panel { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px; overflow-x:auto; }
.grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }
table { width:100%; border-collapse:collapse; font-size:14px; }
th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); white-space:nowrap; }
th { font-size:12px; color:var(--muted); font-weight:600; }
td.r, th.r { text-align:right; }
.pill { display:inline-block; font-size:12px; padding:1px 8px; border-radius:99px; background:var(--accent-soft); color:var(--accent); }
.pill.warn { background:var(--warn-soft); color:var(--warn); }
.pill.bad { background:var(--warn-soft); color:var(--bad); }
form.filters { display:flex; flex-wrap:wrap; gap:8px; align-items:end; margin-bottom:12px; }
label { display:flex; flex-direction:column; font-size:12px; color:var(--muted); gap:2px; }
select, input { font:inherit; font-size:14px; padding:6px 8px; border:1px solid var(--line); border-radius:8px; background:var(--surface); color:var(--ink); }
.pager { display:flex; gap:8px; align-items:center; margin-top:12px; }
.chart svg { width:100%; height:auto; display:block; }
.chart .bar { fill:var(--accent); } .chart .axis { stroke:var(--line); } .chart text { fill:var(--muted); font-size:11px; }
.empty { padding:18px; text-align:center; color:var(--muted); }
.notice { background:var(--warn-soft); color:var(--warn); border-radius:8px; padding:10px 12px; margin:12px 0; }
.login { max-width:360px; margin:12vh auto; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:24px; }
.login input { width:100%; margin:8px 0 14px; }
`;

function layout({ nonce, title, body }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive"><title>${esc(title)}</title>
<style nonce="${esc(nonce)}">${STYLE}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

function loginPage({ base, nonce, error = null }) {
  return layout({
    nonce,
    title: 'Connexion',
    body: `<form class="login" method="post" action="${esc(base)}/login">
  <h1>NexiaWallet · Revenus</h1>
  <p class="muted">Accès réservé.</p>
  ${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ''}
  <label for="password">Mot de passe</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
  <button class="primary" type="submit">Se connecter</button>
</form>`,
  });
}

function errorPage({ nonce, message }) {
  return layout({ nonce, title: 'Erreur', body: `<p class="notice" role="alert">${esc(message)}</p>` });
}

function kpi(label, t) {
  return `<div class="kpi"><div class="label">${esc(label)}</div>
<div class="usd num">${money(t.usd, 'USD')}</div>
<div class="eur num">${money(t.eur, 'EUR')}</div>
<div class="muted num">${t.count} commission${t.count > 1 ? 's' : ''}${t.unpriced ? ` · <span class="pill warn">${t.unpriced} non valorisée${t.unpriced > 1 ? 's' : ''}</span>` : ''}</div></div>`;
}

function chart(days) {
  const w = 900; const h = 220; const padL = 56; const padB = 28; const padT = 12;
  const values = days.map((d) => Number(d.usd));
  const max = Math.max(...values, 0);
  const plotW = w - padL - 8; const plotH = h - padT - padB;
  const barW = plotW / days.length;
  const bars = days.map((d, i) => {
    const v = Number(d.usd);
    const bh = max > 0 ? Math.max((v / max) * plotH, v > 0 ? 2 : 0) : 0;
    const x = padL + i * barW + barW * 0.15;
    return `<rect class="bar" x="${x.toFixed(1)}" y="${(padT + plotH - bh).toFixed(1)}" width="${(barW * 0.7).toFixed(1)}" height="${bh.toFixed(1)}"><title>${esc(d.date)} : ${esc(Number(d.usd).toFixed(2))} $ · ${esc(Number(d.eur).toFixed(2))} € · ${d.count} commission(s)</title></rect>`;
  }).join('');
  const label = (i) => {
    const [y, m, dd] = days[i].date.split('-').map(Number);
    return esc(dayFmt.format(new Date(Date.UTC(y, m - 1, dd))));
  };
  const ticks = [0, Math.floor(days.length / 2), days.length - 1].map((i) => `<text x="${(padL + i * barW + barW / 2).toFixed(1)}" y="${h - 8}" text-anchor="middle">${label(i)}</text>`).join('');
  return `<div class="panel chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Revenu par jour en dollars sur 30 jours">
<line class="axis" x1="${padL}" y1="${padT + plotH}" x2="${w - 8}" y2="${padT + plotH}"/>
<text x="${padL - 6}" y="${padT + 10}" text-anchor="end">${esc(max > 0 ? max.toFixed(2) : '0')} $</text>
<text x="${padL - 6}" y="${padT + plotH}" text-anchor="end">0 $</text>
${bars}${ticks}</svg>
${max === 0 ? '<p class="empty">Aucune commission encaissée sur les 30 derniers jours.</p>' : ''}</div>`;
}

function summaryTable(title, rows) {
  if (!rows.length) return `<div class="panel"><h3>${esc(title)}</h3><p class="empty">Rien à afficher.</p></div>`;
  return `<div class="panel"><table><thead><tr><th>${esc(title)}</th><th class="r">USD</th><th class="r">EUR</th><th class="r">Nb</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="r num">${money(r.usd, 'USD')}</td><td class="r num">${money(r.eur, 'EUR')}</td><td class="r num">${r.count}</td></tr>`).join('')}
</tbody></table></div>`;
}

const REASONS = {
  direct_transfer: 'Envoi direct (virement, poussière)',
  unknown_contract: 'Contrat inconnu (faux jetons, spam)',
  zero_value: 'Valeur nulle',
  parent_unknown: 'Transaction parente introuvable',
};

function queryString(filters, overrides = {}) {
  const q = { period: filters.period, chain: filters.chainId || '', type: filters.type || '', sort: filters.sort, dir: filters.dir, page: filters.page, ...overrides };
  if (q.period === 'custom') { q.from = filters.fromDate || ''; q.to = filters.toDate || ''; }
  return new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
}

function revenueTable({ base, filters, table, chains }) {
  const sortLink = (key, label) => {
    const active = filters.sort === key;
    const dir = active && filters.dir === 'desc' ? 'asc' : 'desc';
    return `<a href="${esc(base)}/?${esc(queryString(filters, { sort: key, dir, page: 1 }))}">${esc(label)}${active ? (filters.dir === 'desc' ? ' ↓' : ' ↑') : ''}</a>`;
  };
  const opt = (value, label, selected) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
  const form = `<form class="filters" method="get" action="${esc(base)}/">
<label for="f-period">Période<select id="f-period" name="period">
${opt('today', "Aujourd'hui", filters.period === 'today')}${opt('7d', '7 jours', filters.period === '7d')}${opt('30d', '30 jours', filters.period === '30d')}${opt('all', 'Depuis le début', filters.period === 'all')}${opt('custom', 'Dates…', filters.period === 'custom')}
</select></label>
<label for="f-from">Du<input id="f-from" type="date" name="from" value="${esc(filters.fromDate || '')}"></label>
<label for="f-to">Au<input id="f-to" type="date" name="to" value="${esc(filters.toDate || '')}"></label>
<label for="f-chain">Chaîne<select id="f-chain" name="chain">${opt('', 'Toutes', !filters.chainId)}${chains.map((c) => opt(c.chainId, c.name, Number(filters.chainId) === c.chainId)).join('')}</select></label>
<label for="f-type">Type<select id="f-type" name="type">${opt('', 'Tous', !filters.type)}${opt('swap', 'Swap', filters.type === 'swap')}${opt('bridge', 'Pont', filters.type === 'bridge')}</select></label>
<input type="hidden" name="sort" value="${esc(filters.sort)}"><input type="hidden" name="dir" value="${esc(filters.dir)}">
<button type="submit">Filtrer</button>
<a class="btn" href="${esc(base)}/export.csv?${esc(queryString(filters, { page: '' }))}">Exporter en CSV</a>
</form>`;

  if (!table.total) {
    return `${form}<div class="panel"><p class="empty">Aucune commission encaissée pour ces filtres.</p></div>`;
  }
  const rows = table.rows.map((r) => {
    const link = /^0x[0-9a-f]{64}$/.test(r.txHash) && r.explorerUrl
      ? `<a href="${esc(r.explorerUrl)}" target="_blank" rel="noopener noreferrer">${esc(r.txHash.slice(0, 10))}…</a>`
      : esc(r.txHash);
    const match = r.matchMethod === 'tx_hash' ? '<span class="pill">devis (hash)</span>' : r.matchMethod === 'heuristic' ? '<span class="pill warn">devis (estimé)</span>' : '<span class="muted">—</span>';
    return `<tr><td class="num">${esc(dateFmt.format(new Date(r.dateMs)))}</td><td>${r.type === 'bridge' ? 'Pont' : 'Swap'}</td><td>${esc(r.chain)}</td><td>${esc(r.tokenSymbol)}</td>
<td class="r num">${amount(r.amount)}</td><td class="r num">${money(r.valueUsdAtReceipt, 'USD')}</td><td class="r num">${money(r.valueEurAtReceipt, 'EUR')}</td>
<td class="r num">${money(r.valueUsdNow, 'USD')}</td><td class="r num">${money(r.valueEurNow, 'EUR')}</td><td>${match}</td><td>${link}</td></tr>`;
  }).join('');
  const pager = `<div class="pager"><span class="muted num">${table.total} transaction${table.total > 1 ? 's' : ''} · page ${table.page}/${table.pages}</span>
${table.page > 1 ? `<a class="btn" href="${esc(base)}/?${esc(queryString(filters, { page: table.page - 1 }))}">← Précédente</a>` : ''}
${table.page < table.pages ? `<a class="btn" href="${esc(base)}/?${esc(queryString(filters, { page: table.page + 1 }))}">Suivante →</a>` : ''}</div>`;
  return `${form}<div class="panel"><table><thead><tr>
<th>${sortLink('date', 'Date (Paris)')}</th><th>${sortLink('type', 'Type')}</th><th>${sortLink('chain', 'Chaîne')}</th><th>${sortLink('token', 'Token')}</th>
<th class="r">Montant</th><th class="r">${sortLink('value_usd', 'USD à la réception')}</th><th class="r">${sortLink('value_eur', 'EUR à la réception')}</th>
<th class="r">USD actuel</th><th class="r">EUR actuel</th><th>Rapprochement</th><th>Transaction</th>
</tr></thead><tbody>${rows}</tbody></table>${pager}</div>`;
}

function dashboardPage(d) {
  const lastRun = d.runs[0];
  const runPill = !lastRun ? '<span class="pill warn">indexeur jamais lancé</span>'
    : lastRun.status === 'ok' ? '<span class="pill">dernier passage OK</span>'
    : lastRun.status === 'running' ? '<span class="pill warn">passage en cours</span>'
    : `<span class="pill bad">dernier passage : ${esc(lastRun.status)}</span>`;

  const balances = d.balances.chains.length ? d.balances.chains.map((c) => `<tr><td>${esc(c.name)}</td><td colspan="4">${c.error ? `<span class="pill bad">${esc(c.error)}</span>` : ''}</td></tr>
${c.lines.map((l) => `<tr><td></td><td>${esc(l.symbol)}</td><td class="r num">${amount(l.amount)}</td><td class="r num">${money(l.usd, 'USD')}</td><td class="r num">${money(l.eur, 'EUR')}</td></tr>`).join('')}`).join('') : '';

  const lifi = d.lifi.error
    ? `<p class="notice">Lecture impossible : ${esc(d.lifi.error)}</p>`
    : d.lifi.feeBalances.length
      ? `<table><thead><tr><th>Chaîne</th><th>Détail</th></tr></thead><tbody>${d.lifi.feeBalances.map((b) => `<tr><td class="num">${esc(b.chainId)}</td><td><code>${esc(JSON.stringify(b.tokenBalances || b))}</code></td></tr>`).join('')}</tbody></table><p class="muted">À réclamer sur portal.li.fi (non automatisé).</p>`
      : '<p class="empty">Aucun frais LI.FI en attente de réclamation. Les frais récents sont versés directement sur l\'adresse de collecte à chaque pont (FeeForwarder) et apparaissent dans le tableau.</p>';

  const unclassified = d.unclassified.length
    ? `<table><tbody>${d.unclassified.map((u) => `<tr><td>${esc(REASONS[u.reason] || u.reason)}</td><td class="r num">${u.n}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty">Aucune.</p>';

  const conv = (c) => `<td class="r num">${c.quotesDeduped}</td><td class="r num">${c.broadcast}</td><td class="r num">${c.settled}</td><td class="r num">${c.settledRatePct === null ? '—' : `${String(c.settledRatePct).replace('.', ',')} %`}</td>`;

  return layout({
    nonce: d.nonce,
    title: 'Revenus NexiaWallet',
    body: `<header class="top">
<div><h1>NexiaWallet · Revenus</h1><div class="muted">Commissions réellement encaissées on-chain · adresse de collecte <code>${esc(d.feeAddress)}</code></div></div>
<div class="actions">${runPill}
<form method="post" action="${esc(d.base)}/indexer/run"><button type="submit">Lancer l'indexeur</button></form>
<a class="btn" href="${esc(d.base)}/backup.db">Sauvegarde de la base</a>
<form method="post" action="${esc(d.base)}/logout"><button type="submit">Se déconnecter</button></form></div>
</header>
${d.indexerStarted ? '<p class="notice">Passage de l\'indexeur lancé. Recharge la page dans une minute.</p>' : ''}
${d.pricesError ? '<p class="notice">Prix actuels indisponibles pour le moment (CoinGecko) : colonnes « actuel » non valorisées.</p>' : ''}
<section class="kpis">${kpi("Aujourd'hui", d.totals.today)}${kpi('7 jours', d.totals.d7)}${kpi('30 jours', d.totals.d30)}${kpi('Depuis le début', d.totals.all)}</section>
<h2>Revenu par jour (30 jours, USD)</h2>${chart(d.days)}
<h2>Répartition (depuis le début)</h2>
<div class="grid2">${summaryTable('Source', [
    { label: 'Swap (0x, 0,75 %)', ...d.breakdown.bySource.swap },
    { label: 'Pont (LI.FI, 0,25 %)', ...d.breakdown.bySource.bridge },
  ])}${summaryTable('Chaîne', d.breakdown.byChain.map((c) => ({ label: c.name, ...c })))}</div>
<h2>Conversion devis → commission encaissée</h2>
<div class="panel"><table><thead><tr><th>Période</th><th class="r">Devis (dédoublonnés)</th><th class="r">Transactions diffusées</th><th class="r">Commissions encaissées</th><th class="r">Taux</th></tr></thead>
<tbody><tr><td>30 jours</td>${conv(d.conversion30)}</tr><tr><td>Depuis le début</td>${conv(d.conversionAll)}</tr></tbody></table></div>
<h2>Transactions qui ont rapporté</h2>
${revenueTable({ base: d.base, filters: d.filters, table: d.table, chains: d.chains })}
<div class="grid2">
<div><h2>Soldes actuels de l'adresse de collecte</h2><div class="panel">${d.balances.error ? `<p class="notice">${esc(d.balances.error)}</p>` : `<table><thead><tr><th>Chaîne</th><th>Token</th><th class="r">Solde</th><th class="r">USD</th><th class="r">EUR</th></tr></thead><tbody>${balances}</tbody></table>`}</div></div>
<div><h2>Frais LI.FI à réclamer</h2><div class="panel">${lifi}</div>
<h2>Entrées non comptées</h2><div class="panel"><p class="muted">Tout ce qui arrive sur l'adresse sans être une commission : jamais inclus dans les revenus.</p>${unclassified}</div></div>
</div>
<h2>État de l'indexeur</h2>
<div class="panel"><table><thead><tr><th>Chaîne</th><th>Type</th><th class="r">Dernier bloc traité</th><th>Mis à jour</th></tr></thead><tbody>
${d.cursors.length ? d.cursors.map((c) => `<tr><td>${esc(c.chainName)}</td><td>${esc(c.kind)}</td><td class="r num">${c.last_block}</td><td class="num">${esc(dateFmt.format(new Date(c.updated_at)))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Aucun passage réussi pour l\'instant.</td></tr>'}
</tbody></table>
${d.runs.length ? `<h3>Derniers passages</h3><table><tbody>${d.runs.map((r) => `<tr><td class="num">${esc(dateFmt.format(new Date(r.started_at)))}</td><td>${esc(r.status)}</td><td><code>${esc(r.errorsText)}</code></td></tr>`).join('')}</tbody></table>` : ''}
</div>`,
  });
}

module.exports = { esc, loginPage, errorPage, dashboardPage, queryString };
