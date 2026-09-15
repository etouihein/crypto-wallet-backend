'use strict';

// Réconciliation : relie chaque commission encaissée (inbound_transfers classé
// swap_fee / bridge_fee) au devis qui l'explique.
//   1. même chaîne + même hash de transaction (rattaché à la diffusion) : sûr ;
//   2. à défaut, heuristique : même type, chaîne et token, réception dans les
//      30 minutes suivant le devis, montant proche de la commission attendue.
//      Chaque devis ne peut expliquer qu'une seule réception.

const { NATIVE_TOKEN } = require('./chains');

const HEURISTIC_WINDOW_MS = 30 * 60 * 1000;
// Tolérance sur le montant : la commission 0x suit le montant réellement acheté
// (slippage) ; celle de LI.FI est fixe sur le montant envoyé.
const TOLERANCE_BPS = { swap: 500, bridge: 200 };
const DEDUP_GAP_MS = 2 * 60 * 1000;

function withinTolerance(receivedRaw, expectedRaw, toleranceBps) {
  if (expectedRaw == null) return false;
  const received = BigInt(receivedRaw);
  const expected = BigInt(expectedRaw);
  if (expected <= 0n) return false;
  const diff = received > expected ? received - expected : expected - received;
  return diff * 10000n <= expected * BigInt(toleranceBps);
}

function reconcile(db) {
  const exact = db.prepare(`UPDATE inbound_transfers
    SET quote_id = (SELECT q.id FROM quote_events q
                    WHERE q.chain_id = inbound_transfers.chain_id AND q.tx_hash = inbound_transfers.tx_hash
                    ORDER BY q.created_at DESC LIMIT 1),
        match_method = 'tx_hash'
    WHERE quote_id IS NULL
      AND classification IN ('swap_fee', 'bridge_fee')
      AND EXISTS (SELECT 1 FROM quote_events q
                  WHERE q.chain_id = inbound_transfers.chain_id AND q.tx_hash = inbound_transfers.tx_hash)`).run().changes;

  const unmatched = db.prepare(`SELECT id, chain_id, token_address, amount_raw, block_time, classification
    FROM inbound_transfers
    WHERE quote_id IS NULL AND classification IN ('swap_fee', 'bridge_fee')
    ORDER BY block_time`).all();
  const candidatesStmt = db.prepare(`SELECT id, created_at, expected_fee_amount FROM quote_events q
    WHERE q.type = ? AND q.chain_id = ? AND q.expected_fee_token = ?
      AND q.created_at <= ? AND q.created_at >= ?
      AND NOT EXISTS (SELECT 1 FROM inbound_transfers t WHERE t.quote_id = q.id)`);
  const link = db.prepare("UPDATE inbound_transfers SET quote_id = ?, match_method = 'heuristic' WHERE id = ?");

  let heuristic = 0;
  db.transaction(() => {
    for (const t of unmatched) {
      const type = t.classification === 'bridge_fee' ? 'bridge' : 'swap';
      const receivedAtMs = t.block_time * 1000;
      const token = String(t.token_address || NATIVE_TOKEN).toLowerCase();
      const candidates = candidatesStmt.all(type, t.chain_id, token, receivedAtMs, receivedAtMs - HEURISTIC_WINDOW_MS)
        .filter((q) => withinTolerance(t.amount_raw, q.expected_fee_amount, TOLERANCE_BPS[type]))
        .sort((a, b) => (receivedAtMs - a.created_at) - (receivedAtMs - b.created_at));
      if (candidates.length) {
        link.run(candidates[0].id, t.id);
        heuristic += 1;
      }
    }
  })();

  return { exact, heuristic };
}

// Entonnoir de conversion sur une période [fromMs, toMs[ :
//   devis demandés (bruts, puis dédoublonnés : un même utilisateur qui
//   rafraîchit le même devis en moins de 2 minutes compte une fois) ->
//   transactions diffusées -> commissions encaissées.
function conversionStats(db, { fromMs = 0, toMs = Number.MAX_SAFE_INTEGER } = {}) {
  const quotes = db.prepare(`SELECT user_hash, type, chain_id, token_in, token_out, created_at, tx_hash, id
    FROM quote_events WHERE created_at >= ? AND created_at < ?
    ORDER BY user_hash, type, chain_id, token_in, token_out, created_at`).all(fromMs, toMs);

  let deduped = 0;
  let previous = null;
  for (const q of quotes) {
    const sameIntent = previous && previous.user_hash === q.user_hash && previous.type === q.type
      && previous.chain_id === q.chain_id && previous.token_in === q.token_in && previous.token_out === q.token_out
      && q.created_at - previous.created_at <= DEDUP_GAP_MS;
    if (!sameIntent) deduped += 1;
    previous = q;
  }

  const broadcast = quotes.filter((q) => q.tx_hash).length;
  const settled = db.prepare(`SELECT COUNT(DISTINCT t.quote_id) AS n FROM inbound_transfers t
    JOIN quote_events q ON q.id = t.quote_id
    WHERE q.created_at >= ? AND q.created_at < ?`).get(fromMs, toMs).n;

  const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
  return {
    quotes: quotes.length,
    quotesDeduped: deduped,
    broadcast,
    settled,
    broadcastRatePct: rate(broadcast, deduped),
    settledRatePct: rate(settled, deduped),
  };
}

module.exports = { reconcile, conversionStats, withinTolerance, HEURISTIC_WINDOW_MS, TOLERANCE_BPS };
