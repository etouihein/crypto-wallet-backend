'use strict';

// Assemble les services du suivi des revenus (base, RPC, prix, indexeur, soldes,
// frais LI.FI) une seule fois, à la demande. Partagé par le planificateur de
// l'indexeur et la page d'administration.

const { ethers } = require('ethers');

const DEFAULT_FEE_RECIPIENT = '0xFD749d841FFF1f87e81D58e4a186261e62FbcbCC';

function feeRecipientAddress() {
  try {
    return ethers.utils.getAddress((process.env.FEE_RECIPIENT_ADDRESS || DEFAULT_FEE_RECIPIENT).trim());
  } catch {
    return null;
  }
}

let services = null;

function getRevenueServices() {
  if (services) return services;
  const { getRevenueDb } = require('./db');
  const { createRpc } = require('./rpc');
  const { createPricing } = require('./pricing');
  const { createIndexer } = require('./indexer');
  const { createBalances } = require('./balances');
  const { createLifiFees } = require('./lifi');
  const { createBlockscoutSource } = require('./sources/blockscout');
  const { createNodeRealSource } = require('./sources/nodereal');
  const { createAlchemySource } = require('./sources/alchemy');
  const { fetchAvecDelai } = require('./http');

  const feeAddress = feeRecipientAddress();
  if (!feeAddress) throw new Error('FEE_RECIPIENT_ADDRESS invalide');
  const db = getRevenueDb();
  // Chaque appel extérieur a un délai maximum (voir ./http.js).
  const fetchImpl = fetchAvecDelai();
  const rpc = createRpc({ fetchImpl });
  const blockscoutSource = createBlockscoutSource({ fetchImpl });
  const nodeRealSource = createNodeRealSource({ fetchImpl, rpc });
  const pricing = createPricing({ db, fetchImpl });
  services = {
    db,
    rpc,
    pricing,
    feeAddress,
    indexer: createIndexer({
      db, rpc, pricing, feeAddress,
      sources: { blockscout: blockscoutSource, nodereal: nodeRealSource, alchemy: createAlchemySource({ fetchImpl }) },
    }),
    balances: createBalances({ db, rpc, pricing, feeAddress }),
    lifiFees: createLifiFees({ fetchImpl }),
  };
  return services;
}

module.exports = { getRevenueServices, feeRecipientAddress };
