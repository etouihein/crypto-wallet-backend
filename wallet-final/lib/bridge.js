// wallet-final/lib/bridge.js
// ─────────────────────────────────────────────────────────────────
//  Pont cross-chain via l'agrégateur LI.FI, appelé À TRAVERS le backend
//  (`GET /bridge/quote`), plus en direct : le proxy garde la clé LI.FI
//  côté serveur et injecte `integrator` + `fee` (commission NexiaWallet)
//  pour qu'un client ne puisse pas les retirer. Le devis contient un
//  `transactionRequest` déjà prêt ({to, data, value, gasLimit}), signé et
//  diffusé exactement comme le flux de swap interne (voir handleSwap dans
//  App.js / signRawTx dans wallet.js) — architecture non-custodiale, ni le
//  backend ni LI.FI ne voient jamais la clé privée.
//
//  Scope volontairement réduit à l'ETH natif entre chaînes qui la
//  partagent (Ethereum/Arbitrum/Optimism/Base) : bridger un token ERC20
//  demanderait de revérifier son adresse sur CHAQUE chaîne de destination
//  avant de faire confiance à la route retournée — risque de perte de
//  fonds pas pris dans cette première version.
// ─────────────────────────────────────────────────────────────────

'use strict';

const axios = require('axios');

const CHAIN_IDS = { ethereum: 1, arbitrum: 42161, optimism: 10, base: 8453 };

async function getBridgeQuote({ fromNetwork, toNetwork, fromAddress, amountWei, apiBase, apiHeaders }) {
  const fromChain = CHAIN_IDS[fromNetwork];
  const toChain = CHAIN_IDS[toNetwork];
  if (!fromChain || !toChain) throw new Error('Réseau non supporté pour le pont.');
  if (fromChain === toChain) throw new Error('Choisis deux réseaux différents.');

  const res = await axios.get(`${apiBase}/bridge/quote`, {
    params: { fromChain, toChain, fromAddress, fromAmount: amountWei },
    headers: apiHeaders,
    timeout: 20000,
  });
  if (!res.data?.success || !res.data.quote) {
    throw new Error(res.data?.error || 'Impossible de récupérer une route de pont.');
  }
  return res.data.quote;
}

module.exports = { getBridgeQuote, CHAIN_IDS };
