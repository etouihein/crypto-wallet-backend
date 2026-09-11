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

    console.log('4/4 — Lancement du smoke test...\n');
    const test = spawnSync('node', ['e2e/smoke.js'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, BASE_URL },
      stdio: 'inherit',
      shell: true,
    });
    exitCode = test.status ?? 1;
  } catch (err) {
    console.error('Erreur pendant l\'orchestration:', err.message);
  } finally {
    server.kill();
  }
  process.exit(exitCode);
}

main();
