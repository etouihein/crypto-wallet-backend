'use strict';

// Chaînes suivies pour les commissions, et contrats qui les paient.
//
// Adresses vérifiées dans les sources officielles le 2026-09-15 :
//   - 0x AllowanceHolder (chaînes « Cancun », identique sur les 6) :
//     https://docs.0x.org/docs/core-concepts/contracts
//     0x déconseille de coder en dur les adresses de contrat (le Settler
//     change) : les contrats vus dans nos propres devis (quote_events.tx_to)
//     sont donc aussi reconnus, voir classify.js.
//   - LI.FI Diamond (identique sur les 6) : GET https://li.quest/v1/chains, champ diamondAddress
//
// Sources d'indexation (voir sources/) : Blockscout pour tout sauf BNB Chain
// (absente de Blockscout), NodeReal MegaNode pour BNB Chain. L'offre gratuite
// d'Etherscan V2 exclut BNB Chain, Optimism et Base.

const ZEROX_ALLOWANCE_HOLDER = '0x0000000000001ff3684f28c67538d4d072c22734';
const LIFI_DIAMOND = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
const NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
// 0x désigne le token natif par cette adresse conventionnelle dans ses devis.
const ZEROX_NATIVE_PLACEHOLDER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const CHAINS = [
  {
    chainId: 1, key: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH',
    nativeCoingeckoId: 'ethereum', coingeckoPlatform: 'ethereum',
    explorerTx: 'https://etherscan.io/tx/', source: 'blockscout', blockscoutHost: 'https://eth.blockscout.com',
    rpcUrl: process.env.ETHEREUM_RPC_URL || process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com',
    confirmations: 12,
  },
  {
    chainId: 56, key: 'bsc', name: 'BNB Chain', nativeSymbol: 'BNB',
    nativeCoingeckoId: 'binancecoin', coingeckoPlatform: 'binance-smart-chain',
    explorerTx: 'https://bscscan.com/tx/', source: 'nodereal',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-rpc.publicnode.com',
    confirmations: 15,
  },
  {
    chainId: 137, key: 'polygon', name: 'Polygon', nativeSymbol: 'POL',
    nativeCoingeckoId: 'polygon-ecosystem-token', coingeckoPlatform: 'polygon-pos',
    explorerTx: 'https://polygonscan.com/tx/', source: 'blockscout', blockscoutHost: 'https://polygon.blockscout.com',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
    confirmations: 64,
  },
  {
    chainId: 42161, key: 'arbitrum', name: 'Arbitrum', nativeSymbol: 'ETH',
    nativeCoingeckoId: 'ethereum', coingeckoPlatform: 'arbitrum-one',
    explorerTx: 'https://arbiscan.io/tx/', source: 'blockscout', blockscoutHost: 'https://arbitrum.blockscout.com',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com',
    confirmations: 40,
  },
  {
    chainId: 10, key: 'optimism', name: 'Optimism', nativeSymbol: 'ETH',
    nativeCoingeckoId: 'ethereum', coingeckoPlatform: 'optimistic-ethereum',
    explorerTx: 'https://optimistic.etherscan.io/tx/', source: 'blockscout', blockscoutHost: 'https://optimism.blockscout.com',
    rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://optimism-rpc.publicnode.com',
    confirmations: 20,
  },
  {
    chainId: 8453, key: 'base', name: 'Base', nativeSymbol: 'ETH',
    nativeCoingeckoId: 'ethereum', coingeckoPlatform: 'base',
    explorerTx: 'https://basescan.org/tx/', source: 'blockscout', blockscoutHost: 'https://base.blockscout.com',
    rpcUrl: process.env.BASE_RPC_URL || 'https://base-rpc.publicnode.com',
    confirmations: 20,
  },
];

const CHAIN_BY_ID = new Map(CHAINS.map((c) => [c.chainId, c]));

function getChain(chainId) {
  return CHAIN_BY_ID.get(Number(chainId)) || null;
}

// Adresse de token normalisée : natif = 0x000…0, quel que soit le codage
// (0x utilise 0xeeee…ee dans ses devis, LI.FI et les explorateurs 0x000…0).
function normalizeToken(address) {
  const a = String(address || '').toLowerCase();
  return !a || a === ZEROX_NATIVE_PLACEHOLDER ? NATIVE_TOKEN : a;
}

module.exports = {
  CHAINS, getChain, normalizeToken,
  ZEROX_ALLOWANCE_HOLDER, LIFI_DIAMOND, NATIVE_TOKEN, ZEROX_NATIVE_PLACEHOLDER,
};
