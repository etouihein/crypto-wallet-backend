// src/crypto/chains.js
// ─────────────────────────────────────────────────────────────────
//  Configurations BIP44 pour chaque blockchain supportée
//  BIP44 path: m / purpose' / coin_type' / account' / change / index
// ─────────────────────────────────────────────────────────────────

'use strict';

const CHAINS = {
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    coinType: 60,        // BIP44 coin type
    path: "m/44'/60'/0'/0",
    addressType: 'evm',
    color: '#627EEA',
    decimals: 18,
    explorers: {
      mainnet: 'https://etherscan.io',
      testnet: 'https://sepolia.etherscan.io'
    }
  },

  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    coinType: 0,
    path: "m/44'/0'/0'/0",          // Legacy P2PKH
    pathSegwit: "m/84'/0'/0'/0",    // Native SegWit P2WPKH
    pathNested: "m/49'/0'/0'/0",    // Nested SegWit P2SH-P2WPKH
    addressType: 'btc',
    color: '#F7931A',
    decimals: 8,
    explorers: {
      mainnet: 'https://blockstream.info',
      testnet: 'https://blockstream.info/testnet'
    }
  },

  BNB: {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    coinType: 60,        // BSC utilise le même coin type qu'ETH
    path: "m/44'/60'/0'/0",
    addressType: 'evm',  // Même format d'adresse qu'Ethereum
    color: '#F3BA2F',
    decimals: 18,
    chainId: 56,
    explorers: {
      mainnet: 'https://bscscan.com',
      testnet: 'https://testnet.bscscan.com'
    }
  },

  MATIC: {
    name: 'Polygon',
    symbol: 'MATIC',
    coinType: 60,
    path: "m/44'/60'/0'/0",
    addressType: 'evm',
    color: '#8247E5',
    decimals: 18,
    chainId: 137,
    explorers: {
      mainnet: 'https://polygonscan.com',
      testnet: 'https://mumbai.polygonscan.com'
    }
  },

  AVAX: {
    name: 'Avalanche',
    symbol: 'AVAX',
    coinType: 9005,
    path: "m/44'/9005'/0'/0",
    addressType: 'evm',
    color: '#E84142',
    decimals: 18,
    chainId: 43114,
    explorers: {
      mainnet: 'https://snowtrace.io'
    }
  },

  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    coinType: 501,
    path: "m/44'/501'/0'/0'",
    addressType: 'ed25519',
    color: '#9945FF',
    decimals: 9,
    explorers: {
      mainnet: 'https://explorer.solana.com'
    }
  },

  TRX: {
    name: 'TRON',
    symbol: 'TRX',
    coinType: 195,
    path: "m/44'/195'/0'/0",
    addressType: 'tron',
    color: '#EB0029',
    decimals: 6,
    explorers: {
      mainnet: 'https://tronscan.org'
    }
  },

  LTC: {
    name: 'Litecoin',
    symbol: 'LTC',
    coinType: 2,
    path: "m/44'/2'/0'/0",
    addressType: 'btc_variant',
    color: '#BFBBBB',
    decimals: 8,
    explorers: {
      mainnet: 'https://blockchair.com/litecoin'
    }
  }
};

// Groupes par type d'adresse pour le dérivation
const EVM_CHAINS = ['ETH', 'BNB', 'MATIC', 'AVAX'];
const BTC_CHAINS = ['BTC', 'LTC'];

module.exports = { CHAINS, EVM_CHAINS, BTC_CHAINS };
