#!/usr/bin/env node
// wallet-final/scripts/poids-site.js
// ─────────────────────────────────────────────────────────────────
//  Poids du site web construit (npx expo export -p web --source-maps) :
//  taille reelle des fichiers JavaScript envoyes aux visiteurs, puis ce qui
//  les compose (bibliotheques et fichiers de l'app), d'apres les cartes
//  de code (.map). Sert a savoir QUOI alleger quand l'agent SEO dit que
//  l'app est trop lourde. Aucune dependance : Node seul.
//
//  USAGE : node scripts/poids-site.js /tmp/site [fichier-resume.md]
//  (dans GitHub Actions, le resume va dans $GITHUB_STEP_SUMMARY)
// ─────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const dossier = process.argv[2] || '/tmp/site';
const sortie = process.argv[3] || process.env.GITHUB_STEP_SUMMARY;

function fichiers(d, filtre, res = []) {
  if (!fs.existsSync(d)) return res;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) fichiers(p, filtre, res);
    else if (filtre(e.name)) res.push(p);
  }
  return res;
}

const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
const mo = (n) => `${(n / 1024 / 1024).toFixed(2)} Mo`;

// Bloc de code d'un fichier source -> son "paquet" : la bibliotheque
// (node_modules/<nom> ou node_modules/@scope/<nom>) ou le fichier de l'app.
function paquet(source) {
  const s = source.replace(/\\/g, '/');
  const i = s.lastIndexOf('node_modules/');
  if (i >= 0) {
    const parts = s.slice(i + 'node_modules/'.length).split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const app = s.replace(/^.*?wallet-final\//, '').replace(/^\.\.?\//, '');
  return `app : ${app}`;
}

function analyser(d = dossier) {
  const js = fichiers(d, (n) => n.endsWith('.js'));
  if (!js.length) throw new Error(`aucun fichier .js dans ${d} (le site a-t-il ete construit ?)`);
  let brut = 0;
  let gzip = 0;
  for (const f of js) {
    const contenu = fs.readFileSync(f);
    brut += contenu.length;
    gzip += zlib.gzipSync(contenu, { level: 9 }).length;
  }
  const parPaquet = new Map();
  let totalSources = 0;
  for (const m of fichiers(d, (n) => n.endsWith('.js.map'))) {
    const carte = JSON.parse(fs.readFileSync(m, 'utf8'));
    (carte.sources || []).forEach((src, i) => {
      const taille = (carte.sourcesContent && carte.sourcesContent[i] ? carte.sourcesContent[i].length : 0);
      totalSources += taille;
      const p = paquet(src);
      parPaquet.set(p, (parPaquet.get(p) || 0) + taille);
    });
  }
  const classement = [...parPaquet.entries()].sort((a, b) => b[1] - a[1]);
  return { js, brut, gzip, totalSources, classement };
}

function resume({ js, brut, gzip, totalSources, classement }) {
  const L = [
    '## Poids du site (wallet-final)', '',
    `- JavaScript envoye aux visiteurs : **${mo(brut)}** (${mo(gzip)} compresse), ${js.length} fichier(s)`,
  ];
  if (classement.length) {
    L.push('', 'Plus gros contenus (taille du code source avant minification, pour comparer) :', '',
      '| | Contenu | Taille | Part |', '|:-:|---|--:|--:|');
    classement.slice(0, 20).forEach(([p, t], i) => {
      L.push(`| ${i + 1} | ${p} | ${ko(t)} | ${totalSources ? ((100 * t) / totalSources).toFixed(1) : '?'} % |`);
    });
  } else {
    L.push('', '_Pas de carte de code (.map) : construire avec --source-maps pour le detail._');
  }
  return L.join('\n') + '\n';
}

if (require.main === module) {
  const texte = resume(analyser());
  process.stdout.write(texte);
  if (sortie) fs.appendFileSync(sortie, texte);
}

module.exports = { paquet, analyser, resume };
