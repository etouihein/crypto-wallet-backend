'use strict';

// Base SQLite du suivi des revenus. Un seul fichier, sur le Volume Railway
// monté (DATA_DIR=/data) : il survit aux redéploiements, contrairement au disque
// du conteneur. Une seule instance Railway écrit dedans (pas de montée en charge
// horizontale avec SQLite — c'est le compromis accepté pour rester simple).

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE_RE = /^(\d{3})_[a-z0-9_]+\.sql$/;

function defaultDbPath() {
  if (process.env.REVENUE_DB_PATH) return process.env.REVENUE_DB_PATH;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
  return path.join(dataDir, 'revenue.db');
}

// Applique, dans l'ordre et chacune dans sa propre transaction, les migrations
// pas encore enregistrées. Relancer ne rejoue rien. Une migration qui échoue
// n'est pas marquée appliquée (la transaction est annulée) et arrête le démarrage.
function migrate(db, dir = MIGRATIONS_DIR) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const files = fs.readdirSync(dir).filter((f) => MIGRATION_FILE_RE.test(f)).sort();
  const newlyApplied = [];
  for (const file of files) {
    const version = Number(file.match(MIGRATION_FILE_RE)[1]);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(version, file, Date.now());
    })();
    newlyApplied.push(file);
  }
  return newlyApplied;
}

function openRevenueDb(file = defaultDbPath()) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

let shared = null;
// Ouverture paresseuse : un serveur sans volume ni usage des revenus ne crée
// aucun fichier tant que rien ne l'appelle.
function getRevenueDb() {
  if (!shared) shared = openRevenueDb();
  return shared;
}

module.exports = { openRevenueDb, getRevenueDb, migrate, defaultDbPath, MIGRATIONS_DIR };
