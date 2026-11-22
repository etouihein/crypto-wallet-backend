'use strict';

// Proxy d'images NFT (GET /wallet/nft/image-proxy) sur le serveur complet
// (server.js, avec helmet). Route publique (une balise <img> ne peut pas
// envoyer la cle de l'app), donc doublement surveillee :
// - jamais vers une adresse interne (SSRF), jamais autre chose qu'une image ;
// - l'image doit pouvoir s'afficher sur nexiawallet.com (autre domaine) ;
// - une image SVG piegee ouverte directement dans un navigateur ne doit pas
//   pouvoir executer de script sur le domaine du serveur.
// Le DNS et l'hebergeur de l'image sont simules en local.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const dns = require('dns');

process.env.NEXIA_NO_LISTEN = '1';
process.env.NODE_ENV = 'test';
process.env.APP_API_KEYS = 'test-app-key';

const IP_PUBLIQUE = '93.184.216.34';
let portImages;
const vraiLookup = dns.promises.lookup;
dns.promises.lookup = async (hote, ...r) => {
  if (hote === 'images.exemple') return { address: IP_PUBLIQUE, family: 4 };
  if (hote === 'interne.exemple') return { address: '169.254.169.254', family: 4 };
  return vraiLookup(hote, ...r);
};
const vraiRequest = http.request;
http.request = function (options, ...r) {
  if (options && options.host === IP_PUBLIQUE) options = { ...options, host: '127.0.0.1', port: portImages };
  return vraiRequest.call(this, options, ...r);
};

const app = require('../server');

const CONTENUS = {
  '/chat.png': ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
  '/piege.svg': ['image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/")</script></svg>')],
  '/page.html': ['text/html', Buffer.from('<html></html>')],
};
let serveurImages; let serveur; let base;

test.before(async () => {
  serveurImages = http.createServer((req, res) => {
    const c = CONTENUS[req.url];
    if (!c) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': c[0] }); res.end(c[1]);
  });
  await new Promise((r) => serveurImages.listen(0, '127.0.0.1', r));
  portImages = serveurImages.address().port;
  await new Promise((r) => { serveur = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${serveur.address().port}`;
});
test.after(async () => {
  await new Promise((r) => serveur.close(r));
  await new Promise((r) => serveurImages.close(r));
  dns.promises.lookup = vraiLookup;
  http.request = vraiRequest;
});

const proxy = (url) => fetch(`${base}/wallet/nft/image-proxy?url=${encodeURIComponent(url)}`);

test('image normale : relayee telle quelle, sans cle d app', async () => {
  const r = await proxy('http://images.exemple/chat.png');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), CONTENUS['/chat.png'][1]);
});

test('image affichable depuis nexiawallet.com (autre domaine que le serveur)', async () => {
  const r = await proxy('http://images.exemple/chat.png');
  // helmet met "same-origin" par defaut : le navigateur refuserait alors
  // d'afficher l'image dans l'app web (servie depuis un autre domaine).
  assert.equal(r.headers.get('cross-origin-resource-policy'), 'cross-origin');
});

test('SVG piege ouvert directement : aucun script ne peut tourner sur le domaine du serveur', async () => {
  const r = await proxy('http://images.exemple/piege.svg');
  assert.equal(r.status, 200, 'les NFT en SVG restent affichables');
  const csp = r.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /\bsandbox\b/);
  assert.doesNotMatch(csp, /script-src/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('adresse interne, protocole interdit, autre contenu qu une image : refuses', async () => {
  for (const url of ['http://interne.exemple/x.png', 'http://127.0.0.1/x.png', 'file:///etc/passwd', 'ftp://images.exemple/x.png', 'pas une url']) {
    const r = await proxy(url);
    assert.equal(r.status, 400, url);
  }
  const html = await proxy('http://images.exemple/page.html');
  assert.equal(html.status, 400);
  assert.match((await html.json()).error, /pas une image/);
  const absent = await proxy('http://images.exemple/absent.png');
  assert.equal(absent.status, 400);
});
