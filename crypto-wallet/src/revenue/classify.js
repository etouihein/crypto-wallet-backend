'use strict';

// Décide si un transfert entrant est une commission. L'adresse de collecte
// reçoit bien plus que des commissions : virements personnels, poussière et
// faux jetons d'empoisonnement d'adresse (constaté sur l'adresse réelle : 499
// envois de poussière et des dizaines de faux jetons sur Ethereum). Tout
// transfert qui ne passe pas ces règles est « unclassified » : visible dans
// l'admin, mais JAMAIS compté dans les revenus.

const { ZEROX_ALLOWANCE_HOLDER, LIFI_DIAMOND } = require('./chains');

// transfer : { chain_id, tx_hash, kind, amount_raw, parent_to }
// context  : {
//   quoteByTxHash(chainId, txHash) -> { id, type } | null   (devis rattaché à la diffusion)
//   knownSwapTargets : Set d'adresses (tx_to vues dans nos devis de swap)
//   knownBridgeTargets : Set d'adresses (tx_to vues dans nos devis de pont)
// }
function classifyTransfer(transfer, context = {}) {
  const txHash = String(transfer.tx_hash || '').toLowerCase();
  const parentTo = String(transfer.parent_to || '').toLowerCase();

  if (!/^[1-9]\d*$/.test(String(transfer.amount_raw || ''))) {
    return { classification: 'unclassified', reason: 'zero_value' };
  }

  // Une commission 0x ou LI.FI arrive toujours DANS la transaction de
  // l'utilisateur, envoyée par un contrat : jamais comme transaction normale.
  if (transfer.kind === 'native') {
    return { classification: 'unclassified', reason: 'direct_transfer' };
  }

  const quote = context.quoteByTxHash ? context.quoteByTxHash(transfer.chain_id, txHash) : null;
  if (quote) {
    return {
      classification: quote.type === 'bridge' ? 'bridge_fee' : 'swap_fee',
      reason: 'quote_tx_hash',
      quoteId: quote.id,
      matchMethod: 'tx_hash',
    };
  }

  if (!parentTo) return { classification: 'pending', reason: 'parent_unknown' };

  if (parentTo === ZEROX_ALLOWANCE_HOLDER || (context.knownSwapTargets && context.knownSwapTargets.has(parentTo))) {
    return { classification: 'swap_fee', reason: parentTo === ZEROX_ALLOWANCE_HOLDER ? 'zerox_allowance_holder' : 'known_swap_target' };
  }
  if (parentTo === LIFI_DIAMOND || (context.knownBridgeTargets && context.knownBridgeTargets.has(parentTo))) {
    return { classification: 'bridge_fee', reason: parentTo === LIFI_DIAMOND ? 'lifi_diamond' : 'known_bridge_target' };
  }
  return { classification: 'unclassified', reason: 'unknown_contract' };
}

module.exports = { classifyTransfer };
