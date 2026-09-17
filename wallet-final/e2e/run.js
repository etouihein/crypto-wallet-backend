'use strict';
// wallet-final/e2e/run.js
// ─────────────────────────────────────────────────────────────────
//  Orchestrateur pour `npm run test:e2e` : build le web, sert `dist/`
//  (server.js, comme en prod), attend que ça réponde, lance smoke.js
//  contre ce serveur, puis l'arrête proprement — que le test réussisse ou
//  non. Un seul point d'entrée, pas besoin de retenir 3 commandes dans le
//  bon ordre.
// ─────────────────────────────────────────────────────────────────

const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3099; // port dédié au test, pour ne pas entrer en conflit avec un serveur de dev déjà lancé sur 3000
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - start > timeoutMs) reject(new Error(`Le serveur ne répond toujours pas après ${timeoutMs}ms`));
          else setTimeout(attempt, 300);
        });
    };
    attempt();
  });
}

async function main() {
  console.log('1/4 — Build du web (expo export -p web)...');
  const build = spawnSync('npx', ['expo', 'export', '-p', 'web'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });
  if (build.status !== 0) {
    console.error('Le build web a échoué — arrêt.');
    process.exit(1);
  }

  console.log(`\n2/4 — Démarrage de server.js sur le port ${PORT}...`);
  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  let exitCode = 1;
  try {
    console.log('3/4 — Attente que le serveur réponde...');
    await waitForServer(BASE_URL, 20000);

    // Tous les tests tournent, même si l'un échoue : un rapport complet vaut
    // mieux qu'un arrêt au premier rouge qui cache les suivants.
    const TESTS = ['e2e/smoke.js', 'e2e/qrScanner.js', 'e2e/receiveAddress.js'];
    console.log(`4/4 — Lancement des tests (${TESTS.length})...\n`);
    const echoues = [];
    for (const fichier of TESTS) {
      const test = spawnSync('node', [fichier], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env, BASE_URL },
        stdio: 'inherit',
        shell: true,
      });
      if (test.status !== 0) echoues.push(fichier);
      console.log('');
    }
    console.log(echoues.length ? `En échec : ${echoues.join(', ')}` : 'Tous les tests sont verts.');
    exitCode = echoues.length ? 1 : 0;
  } catch (err) {
    console.error('Erreur pendant l\'orchestration:', err.message);
  } finally {
    server.kill();
  }
  process.exit(exitCode);
}

main();
