// wallet-final/lib/bridge.js
// ─────────────────────────────────────────────────────────────────
//  Pont cross-chain via l'agrégateur LI.FI (https://li.quest/v1) — appelé
//  directement depuis le client, aucune clé API requise pour ce volume
//  (200 requêtes/2h sans clé, vérifié : https://li.quest/v1/quote répond
//  sans authentification). Retourne un `transactionRequest` déjà prêt
//  ({to, data, value, gasLimit}), signé et diffusé exactement comme le
//  flux de swap interne (voir handleSwap dans App.js / signRawTx dans
//  wallet.js) — même architecture non-custodiale, LI.FI ne voit jamais
//  la clé privée.
//
//  Scope volontairement réduit à l'ETH natif entre chaînes qui la
//  partagent (Ethereum/Arbitrum/Optimism/Base) : bridger un token ERC20
//  demanderait de revérifier son adresse sur CHAQUE chaîne de destination
//  avant de faire confiance à la route retournée — risque de perte de
//  fonds pas pris dans cette première version.
// ─────────────────────────────────────────────────────────────────

'use strict';

const axios = require('axios');

const LIFI_BASE_URL = 'https://li.quest/v1';
const NATIVE_PLACEHOLDER = '0x0000000000000000000000000000000000000000';

const CHAIN_IDS = { ethereum: 1, arbitrum: 42161, optimism: 10, base: 8453 };

async function getBridgeQuote({ fromNetwork, toNetwork, fromAddress, amountWei }) {
  const fromChain = CHAIN_IDS[fromNetwork];
  const toChain = CHAIN_IDS[toNetwork];
  if (!fromChain || !toChain) throw new Error('Réseau non supporté pour le pont.');
  if (fromChain === toChain) throw new Error('Choisis deux réseaux différents.');

  const res = await axios.get(`${LIFI_BASE_URL}/quote`, {
    params: {
      fromChain,
      toChain,
      fromToken: NATIVE_PLACEHOLDER,
      toToken: NATIVE_PLACEHOLDER,
      fromAddress,
      fromAmount: amountWei,
    },
    timeout: 20000,
  });
  return res.data;
}

module.exports = { getBridgeQuote, CHAIN_IDS };
