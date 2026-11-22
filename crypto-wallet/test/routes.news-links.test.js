'use strict';

// Actualites (/wallet/news) et fiche d'une crypto (/wallet/coin/:id) : les
// liens viennent de sources exterieures (flux RSS, CoinGecko) et l'app les
// ouvre tels quels. Seuls http(s) doivent passer : un flux pirate ne doit
// jamais faire ouvrir "javascript:..." dans la version web.

const test = require('node:test');
const assert = require('node:assert/strict');
const helpers = require('./helpers/quoteRoutes');

helpers.prepareEnv();
const realFetch = global.fetch;
const RSS = (items) => `<?xml version="1.0"?><rss><channel>${items.map(([titre, lien, image]) => `<item><title>${titre}</title><link>${lien}</link><pubDate>Sun, 22 Nov 2026 10:00:00 GMT</pubDate><description>texte</description>${image ? `<media:content url="${image}"/>` : ''}</item>`).join('')}</channel></rss>`;
global.fetch = async (url, options) => {
  const u = String(url);
  if (u.startsWith('http://127.0.0.1')) return realFetch(url, options);
  if (u.includes('coindesk.com')) {
    return new Response(RSS([
      ['Article normal', 'https://www.coindesk.com/a', 'https://img.coindesk.com/a.jpg'],
      ['Article piege', 'javascript:alert(document.cookie)', 'javascript:alert(1)'],
      ['Article data', 'data:text/html,<script>x</script>', 'data:image/svg+xml,x'],
      ['  Lien avec espaces', '  https://www.coindesk.com/b  ', ''],
    ]));
  }
  if (u.includes('/coins/bitcoin?')) {
    return new Response(JSON.stringify({ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', links: { homepage: ['javascript:alert(1)'] }, market_data: {}, description: { en: '' }, image: {} }));
  }
  if (u.includes('/coins/ethereum?')) {
    return new Response(JSON.stringify({ id: 'ethereum', name: 'Ethereum', symbol: 'eth', links: { homepage: ['', 'https://ethereum.org'] }, market_data: {}, description: { en: '' }, image: {} }));
  }
  return new Response('indisponible', { status: 503 });
};
const walletRoutes = require('../src/routes/wallet');
const get = async (base, chemin) => (await realFetch(`${base}/wallet${chemin}`, { headers: { 'x-api-key': 'test-app-key' } })).json();

test('actualites : seuls les liens et images http(s) passent ; une source en panne ne casse rien', async () => {
  const err = console.error; console.error = () => {};
  try {
    await helpers.withServer(walletRoutes, async (base) => {
      const r = await get(base, '/news');
      assert.equal(r.success, true);
      const liens = r.items.map((i) => i.link);
      assert.ok(liens.includes('https://www.coindesk.com/a'));
      for (const i of r.items) {
        assert.match(i.link, /^https?:\/\//, i.title);
        assert.ok(i.image === '' || /^https?:\/\//.test(i.image), i.title);
      }
      assert.equal(r.items.some((i) => /piege|data/.test(i.title)), false, 'un article sans lien sur est retire');
    });
  } finally { console.error = err; }
});

test('fiche crypto : site officiel http(s) seulement', async () => {
  await helpers.withServer(walletRoutes, async (base) => {
    const btc = await get(base, '/coin/bitcoin');
    assert.equal(btc.success, true);
    assert.equal((btc.coin || btc.detail || btc).homepage ?? JSON.stringify(btc).match(/"homepage":"([^"]*)"/)?.[1], '');
    const eth = await get(base, '/coin/ethereum');
    assert.match(JSON.stringify(eth), /"homepage":"https:\/\/ethereum\.org"/);
  });
});
