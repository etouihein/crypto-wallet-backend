// wallet-final/lib/defiPositions.js
// ─────────────────────────────────────────────────────────────────
//  Suivi de positions DeFi (staking/LP/rewards), façon Zerion/DeBank —
//  MAIS sans indexeur tiers : les APIs multi-protocoles gratuites sans clé
//  n'existent pas vraiment (DeBank/Zerion/CoinStats/Moralis demandent toutes
//  une clé ou un paiement — vérifié). Plutôt que deviner/mocker, cette v1
//  ne suit QU'UNE position réelle, vérifiée : le stETH de Lido (staking
//  liquide ETH) — un simple solde ERC20 sur un contrat officiel vérifié en
//  dur (adresse ET symbol() confirmés par un vrai appel on-chain avant
//  ajout). Architecture volontairement extensible : ajouter un protocole =
//  ajouter une entrée à KNOWN_POSITIONS, pas réécrire l'écran.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { getCustomTokenInfo } = require('./wallet');

// Adresse proxy officielle Lido stETH (Ethereum mainnet) — vérifiée sur
// Etherscan + docs.lido.fi + le repo GitHub officiel lidofinance/core, ET en
// appelant symbol() en direct sur le vrai RPC (retourne bien "stETH").
const KNOWN_POSITIONS = [
  {
    id: 'lido-steth',
    protocol: 'Lido',
    kind: 'staking',
    network: 'ethereum',
    tokenAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    label: 'ETH staké (stETH)',
    icon: '🌊',
  },
];

// Retourne uniquement les positions avec un solde > 0 pour ce wallet.
async function getDefiPositions(walletAddress) {
  if (!walletAddress) return [];
  const results = await Promise.all(
    KNOWN_POSITIONS.map(async (pos) => {
      try {
        const info = await getCustomTokenInfo(pos.tokenAddress, walletAddress, pos.network);
        const balance = parseFloat(info.balance);
        if (!balance) return null;
        return { ...pos, balance: info.balance, symbol: info.symbol };
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

module.exports = { getDefiPositions, KNOWN_POSITIONS };
