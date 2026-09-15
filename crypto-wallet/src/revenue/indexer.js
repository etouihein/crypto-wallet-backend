'use strict';

// Indexeur des commissions réellement reçues on-chain sur l'adresse de collecte.
//
// Un passage :
//   1. pour chaque chaîne et chaque type, lit les transferts entrants depuis le
//      dernier bloc traité (moins une marge de relecture, contre les
//      réorganisations) jusqu'au dernier bloc confirmé ;
//   2. les insère sans doublon (clé unique chain_id + tx_hash + kind + sub_index)
//      et avance le curseur dans la même transaction SQL ;
//   3. classe les nouveaux transferts (commission ou non), valorise les
//      commissions au prix du moment de la réception, puis réconcilie avec les
//      devis.
// Relancer un passage ne crée jamais de doublon ; une chaîne en erreur n'empêche
// pas les autres d'avancer (statut « partial »).

const { CHAINS, getChain } = require('./chains');
const { classifyTransfer } = require('./classify');
const { fiatValue } = require('./money');
const { reconcile } = require('./reconcile');

// Les commissions sont actives depuis le 10/09/2026 : rien d'antérieur ne peut en être une.
const DEFAULT_START_TIME = Date.parse('2026-09-10T00:00:00Z') / 1000;
const REORG_OVERLAP_BLOCKS = 50;

function createIndexer({ db, sources, rpc, pricing, feeAddress, chains = CHAINS, startTime = DEFAULT_START_TIME, now = () => Date.now(), logger = console }) {
  const address = String(feeAddress).toLowerCase();

  // Contrat visé par la transaction qui a produit un transfert : c'est lui qui
  // distingue une commission (0x, LI.FI) d'un envoi quelconque. On demande
  // d'abord à la source d'indexation (Blockscout / NodeReal), et on ne retombe
  // sur le RPC qu'en dernier recours : certains nœuds publics refusent
  // eth_getTransactionReceipt (Optimism répond 403).
  async function parentTarget(chain, txHash) {
    const source = chain.source === 'nodereal' ? sources.nodereal : sources.blockscout;
    if (source && typeof source.getTransactionTarget === 'function') {
      try {
        const target = await source.getTransactionTarget(chain, txHash);
        if (target) return target;
      } catch (error) {
        logger.warn(`transaction ${txHash} introuvable via ${source.name} : ${error.message}`);
      }
    }
    const receipt = await rpc.getReceipt(chain, txHash);
    return receipt && receipt.to ? String(receipt.to).toLowerCase() : null;
  }

  const getCursor = db.prepare('SELECT last_block FROM indexer_cursors WHERE chain_id = ? AND kind = ?');
  const setCursor = db.prepare(`INSERT INTO indexer_cursors (chain_id, kind, last_block, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (chain_id, kind) DO UPDATE SET last_block = excluded.last_block, updated_at = excluded.updated_at`);
  const insertTransfer = db.prepare(`INSERT OR IGNORE INTO inbound_transfers
    (chain_id, tx_hash, kind, sub_index, block_number, block_time, from_address, token_address, token_symbol, token_decimals, amount_raw, indexed_at)
    VALUES (@chain_id, @tx_hash, @kind, @sub_index, @block_number, @block_time, @from_address, @token_address, @token_symbol, @token_decimals, @amount_raw, @indexed_at)`);

  async function indexChain(chain) {
    const source = chain.source === 'nodereal' ? sources.nodereal : sources.blockscout;
    if (!source || !source.isConfigured(chain)) return { chainId: chain.chainId, skipped: `${chain.source} non configuré` };

    const head = await rpc.getBlockNumber(chain);
    const safeHead = head - chain.confirmations;
    let inserted = 0;
    let progressed = 0;
    const errors = [];
    // Chaque type avance indépendamment : une panne sur les ERC-20 n'empêche
    // pas les transferts natifs et internes d'être indexés (et inversement).
    for (const kind of source.kinds) {
      try {
        const cursor = getCursor.get(chain.chainId, kind);
        const fromBlock = cursor
          ? Math.max(0, cursor.last_block - REORG_OVERLAP_BLOCKS)
          : await rpc.findFirstBlockAtOrAfter(chain, startTime);
        if (fromBlock > safeHead) { progressed += 1; continue; }
        const transfers = await source.fetch(kind, chain, address, fromBlock, safeHead);
        db.transaction(() => {
          for (const t of transfers) inserted += insertTransfer.run({ ...t, indexed_at: now() }).changes;
          setCursor.run(chain.chainId, kind, safeHead, now());
        })();
        progressed += 1;
      } catch (error) {
        errors.push(`${kind} : ${error.message}`);
      }
    }
    return { chainId: chain.chainId, inserted, safeHead, progressed, errors };
  }

  function classificationContext() {
    const quoteStmt = db.prepare('SELECT id, type FROM quote_events WHERE chain_id = ? AND tx_hash = ? ORDER BY created_at DESC LIMIT 1');
    const targets = (type) => new Set(db.prepare("SELECT DISTINCT tx_to FROM quote_events WHERE type = ? AND tx_to IS NOT NULL").all(type).map((r) => r.tx_to));
    return {
      quoteByTxHash: (chainId, txHash) => quoteStmt.get(chainId, txHash) || null,
      knownSwapTargets: targets('swap'),
      knownBridgeTargets: targets('bridge'),
    };
  }

  // Classe les transferts en attente, et réévalue ceux qui visaient un contrat
  // inconnu (un devis rattaché entre-temps peut les expliquer).
  async function classifyPending() {
    const rows = db.prepare(`SELECT id, chain_id, tx_hash, kind, amount_raw, parent_to FROM inbound_transfers
      WHERE classification = 'pending' OR (classification = 'unclassified' AND classification_reason IN ('unknown_contract', 'parent_unknown'))`).all();
    if (!rows.length) return 0;
    const context = classificationContext();
    const update = db.prepare(`UPDATE inbound_transfers SET parent_to = ?, classification = ?, classification_reason = ?,
      quote_id = COALESCE(?, quote_id), match_method = COALESCE(?, match_method) WHERE id = ?`);
    const parentCache = new Map();
    let changed = 0;
    for (const row of rows) {
      let parentTo = row.parent_to;
      if (!parentTo && row.kind !== 'native') {
        const chain = getChain(row.chain_id);
        const key = `${row.chain_id}:${row.tx_hash}`;
        if (!parentCache.has(key)) {
          try {
            parentCache.set(key, await parentTarget(chain, row.tx_hash));
          } catch (error) {
            logger.warn(`contrat cible introuvable pour ${row.tx_hash} : ${error.message}`);
            parentCache.set(key, null);
          }
        }
        parentTo = parentCache.get(key);
      }
      const result = classifyTransfer({ ...row, parent_to: parentTo }, context);
      const classification = result.classification === 'pending' ? 'unclassified' : result.classification;
      const reason = result.classification === 'pending' ? 'parent_unknown' : result.reason;
      changed += update.run(parentTo || null, classification, reason, result.quoteId || null, result.matchMethod || null, row.id).changes;
    }
    return changed;
  }

  // Valorise les commissions pas encore valorisées. Sans prix trouvé, la ligne
  // reste « non valorisée » (valeurs NULL) et sera retentée au passage suivant.
  async function priceRevenue() {
    const rows = db.prepare(`SELECT id, chain_id, token_address, token_decimals, amount_raw, block_time FROM inbound_transfers
      WHERE classification IN ('swap_fee', 'bridge_fee') AND priced_at IS NULL`).all();
    const update = db.prepare(`UPDATE inbound_transfers SET coingecko_id = ?, price_usd_at_receipt = ?, price_eur_at_receipt = ?,
      value_usd_at_receipt = ?, value_eur_at_receipt = ?, priced_at = ? WHERE id = ?`);
    const setId = db.prepare('UPDATE inbound_transfers SET coingecko_id = ? WHERE id = ?');
    let priced = 0;
    for (const row of rows) {
      const chain = getChain(row.chain_id);
      const coingeckoId = await pricing.resolveCoingeckoId(chain, row.token_address);
      if (!coingeckoId) { setId.run(null, row.id); continue; }
      const { usd, eur } = await pricing.historicalPrices(coingeckoId, row.block_time);
      if (usd === null || eur === null) { setId.run(coingeckoId, row.id); continue; }
      update.run(coingeckoId, usd, eur, fiatValue(row.amount_raw, row.token_decimals, usd), fiatValue(row.amount_raw, row.token_decimals, eur), now(), row.id);
      priced += 1;
    }
    return priced;
  }

  let running = false;
  async function runOnce() {
    if (running) return { status: 'skipped', detail: 'passage déjà en cours' };
    running = true;
    const runId = db.prepare("INSERT INTO indexer_runs (started_at, status) VALUES (?, 'running')").run(now()).lastInsertRowid;
    const chainsResult = [];
    const errors = [];
    try {
      let progressed = 0;
      for (const chain of chains) {
        try {
          const result = await indexChain(chain);
          chainsResult.push(result);
          progressed += result.progressed || 0;
          for (const e of result.errors || []) errors.push(`${chain.name} ${e}`);
        } catch (error) {
          errors.push(`${chain.name} : ${error.message}`);
        }
      }
      const classified = await classifyPending();
      let priced = 0;
      try { priced = await priceRevenue(); } catch (error) { errors.push(`prix : ${error.message}`); }
      const reconciled = reconcile(db);
      const status = errors.length === 0 ? 'ok' : (progressed > 0 ? 'partial' : 'error');
      const detail = JSON.stringify({ chains: chainsResult, classified, priced, reconciled, errors });
      db.prepare('UPDATE indexer_runs SET finished_at = ?, status = ?, detail = ? WHERE id = ?').run(now(), status, detail, runId);
      return { status, chains: chainsResult, classified, priced, reconciled, errors };
    } catch (error) {
      db.prepare("UPDATE indexer_runs SET finished_at = ?, status = 'error', detail = ? WHERE id = ?").run(now(), JSON.stringify({ errors: [...errors, error.message] }), runId);
      throw error;
    } finally {
      running = false;
    }
  }

  return { runOnce, indexChain, classifyPending, priceRevenue };
}

module.exports = { createIndexer, DEFAULT_START_TIME, REORG_OVERLAP_BLOCKS };
