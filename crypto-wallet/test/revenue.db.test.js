'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { openRevenueDb, migrate, MIGRATIONS_DIR } = require('../src/revenue/db');

test('les migrations s\'appliquent une seule fois', () => {
  const db = openRevenueDb(':memory:');
  const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
  assert.deepEqual(versions, [1]);
  assert.deepEqual(migrate(db), []); // relancer ne rejoue rien
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of ['quote_events', 'inbound_transfers', 'indexer_cursors', 'indexer_runs', 'price_points', 'token_ids', 'admin_sessions']) {
    assert.ok(tables.includes(t), `table ${t} absente`);
  }
  db.close();
});

test('un même transfert ne peut pas être enregistré deux fois', () => {
  const db = openRevenueDb(':memory:');
  const insert = db.prepare(`INSERT OR IGNORE INTO inbound_transfers
    (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_decimals, amount_raw, indexed_at)
    VALUES (1, '0xabc', 'erc20', '12', 100, 1700000000, '0xfrom', '0xtoken', 6, '1000', 0)`);
  assert.equal(insert.run().changes, 1);
  assert.equal(insert.run().changes, 0);
  // Même tx, autre log : c'est un transfert différent, il doit passer.
  const other = db.prepare(`INSERT OR IGNORE INTO inbound_transfers
    (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_decimals, amount_raw, indexed_at)
    VALUES (1, '0xabc', 'erc20', '13', 100, 1700000000, '0xfrom', '0xtoken', 6, '1000', 0)`);
  assert.equal(other.run().changes, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM inbound_transfers').get().n, 2);
  db.close();
});

test('une migration en échec est annulée et non enregistrée', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'revenue-migrations-'));
  fs.copyFileSync(path.join(MIGRATIONS_DIR, '001_init.sql'), path.join(dir, '001_init.sql'));
  fs.writeFileSync(path.join(dir, '002_broken.sql'), 'CREATE TABLE half_done (id INTEGER); THIS IS NOT SQL;');
  const db = new Database(':memory:');
  assert.throws(() => migrate(db, dir));
  const versions = db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version);
  assert.deepEqual(versions, [1]);
  const leftover = db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get();
  assert.equal(leftover, undefined);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
