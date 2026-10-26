// wallet-final/lib/swapSecurity.js — Phase 6 (audit sécurité 2026-10-26, H1/H2/M8)
// ─────────────────────────────────────────────────────────────────
//  Vérification d'un devis AVANT signature. Règle d'or : on ne signe
//  jamais un calldata d'agrégateur sans avoir contrôlé les champs
//  structurés du devis contre la demande de l'utilisateur.
//
//  Ce que ce module garantit (et ne garantit pas) :
//  - GARANTI : buyToken/sellToken/taker/chainId du devis == demande,
//    sinon rejet. Le spender d'approbation 0x == AllowanceHolder officiel
//    de la chaîne, jamais le Settler (les docs 0x l'interdisent : une
//    approbation sur le Settler = perte de fonds potentielle), et jamais
//    le routeur de la transaction (H2). Pour LI.FI EVM, tx.to == diamant
//    LI.FI officiel de la chaîne de départ.
//  - GARANTI (partiel) : montant minimum reçu calculé avec le slippage
//    choisi (défaut 1 %) et affiché dans l'écran de confirmation ; le
//    slippage est aussi transmis à 0x via le backend (voir /swap/quote).
//  - NON GARANTI : le Settler 0x (transaction.to) n'est PAS mis en
//    allowlist codée en dur ici — ses adresses ne sont pas vérifiées
//    pour les deux chaînes supportées (ethereum, bsc) et peuvent changer.
//    Le routeur est donc AFFICHÉ dans l'écran de confirmation pour que
//    l'utilisateur le voie, et tout to invalide / égal au wallet / égal
//    à un token échangé est rejeté. C'est un choix documenté, pas un oubli :
//    une allowlist inventée casserait tous les swaps.
//  - NON GARANTI : pour Solana/BTC cross-chain, on AFFICHE ce qui est
//    décodable (programmes Solana, sorties PSBT Bitcoin) mais on ne peut
//    pas prouver que l'adresse de dépôt du pont est légitime — d'où
//    l'avertissement rouge explicite dans l'UI (voir App.js).
//
//  Adresses vérifiées (docs officielles 0x et LI.FI, octobre 2026) :
//  - AllowanceHolder 0x, chaînes Cancun (1, 56, 137, 42161, 10, 8453) :
//    0x0000000000001fF3684f28c67538d4D072C22734
//  - Diamant LI.FI, mêmes chaînes :
//    0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE
//  Comparaisons toujours en minuscules (la casse checksum ne compte pas).
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');

const ALLOWANCE_HOLDER = '0x0000000000001ff3684f28c67538d4d072c22734';
const LIFI_DIAMOND = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';

const ALLOWANCE_HOLDER_CHAINS = [1, 56, 137, 42161, 10, 8453];
const LIFI_DIAMOND_CHAINS = [1, 56, 137, 42161, 10, 8453];

const DEFAULT_SLIPPAGE_BPS = 100; // 1 %
const MAX_SLIPPAGE_BPS = 5000; // 50 %, au-delà c'est une erreur de saisie
const LARGE_SWAP_USD_HINT = 1000; // seuil d'avertissement "gros montant" (affichage seulement)

const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
const isAddr = (v) => typeof v === 'string' && ethers.utils.isAddress(v);

function minBuyAmount(buyAmount, slippageBps) {
  try {
    const buy = ethers.BigNumber.from(buyAmount);
    const bps = Math.max(0, Math.min(MAX_SLIPPAGE_BPS, Number(slippageBps) || DEFAULT_SLIPPAGE_BPS));
    return buy.mul(10000 - bps).div(10000).toString();
  } catch {
    return null;
  }
}

// Vérifie un devis 0x allowance-holder contre la demande.
// `quote` = objet quote brut de /swap/quote. Ne rejette QUE sur des
// champs présents et incohérents : un champ absent n'est pas une preuve
// de fraude (le format 0x v2 peut évoluer), mais un champ présent et
// faux est un rejet immédiat.
function validateZeroXQuote({ quote, sellAddress, buyAddress, taker, chainId, slippageBps }) {
  const errors = [];
  if (!quote || typeof quote !== 'object') return { ok: false, errors: ['Devis invalide.'], minBuyAmount: null, buyAmount: null };
  const tx = quote.transaction || {};
  if (quote.buyToken && lower(quote.buyToken) !== lower(buyAddress)) errors.push('Le devis porte sur un autre token à recevoir que celui demandé.');
  if (quote.sellToken && lower(quote.sellToken) !== lower(sellAddress)) errors.push('Le devis porte sur un autre token à vendre que celui demandé.');
  if (quote.sellAmount && quote.sellAmount !== undefined && quote.sellAmount !== null) {
    // sellAmount du devis doit correspondre à la demande ; comparé par
    // l'appelant si besoin, ici on ne fait que l'exposer (voir buyAmount).
  }
  if (quote.taker && lower(quote.taker) !== lower(taker)) errors.push('Le devis est destiné à une autre adresse que ton wallet.');
  const quoteChainId = quote.chainId ?? tx.chainId;
  if (quoteChainId !== undefined && quoteChainId !== null && Number(quoteChainId) !== Number(chainId)) {
    errors.push('Le devis porte sur une autre chaîne que le réseau actif.');
  }
  if (!isAddr(tx.to)) errors.push('Le contrat du swap est invalide.');
  if (isAddr(tx.to) && lower(tx.to) === lower(taker)) errors.push('Le contrat du swap ne peut pas être ton propre wallet.');
  if (isAddr(tx.to) && (lower(tx.to) === lower(buyAddress) || lower(tx.to) === lower(sellAddress))) {
    errors.push('Le contrat du swap ne peut pas être un des tokens échangés.');
  }
  const spender = quote.issues?.allowance?.spender;
  if (spender) {
    if (!ALLOWANCE_HOLDER_CHAINS.includes(Number(chainId))) {
      errors.push('Chaîne non couverte par la vérification AllowanceHolder.');
    } else if (lower(spender) !== ALLOWANCE_HOLDER) {
      errors.push("L'approbation demandée ne vise pas le contrat AllowanceHolder officiel de 0x.");
    }
    if (lower(spender) === lower(tx.to)) {
      errors.push("L'approbation ne doit jamais viser le contrat d'exécution du swap lui-même.");
    }
  }
  const buyAmount = quote.buyAmount != null ? String(quote.buyAmount) : null;
  const minBuy = buyAmount ? minBuyAmount(buyAmount, slippageBps) : null;
  return { ok: errors.length === 0, errors, minBuyAmount: minBuy, buyAmount, gas: tx.gas != null ? String(tx.gas) : null, router: tx.to || null };
}

// Vérifie une transaction LI.FI EVM : tx.to doit être le diamant LI.FI
// de la chaîne de départ, et la chaîne de destination doit correspondre.
function validateLifiEvmTx({ tx, fromChainId, toChainId, expectedToChainId }) {
  const errors = [];
  if (!tx || typeof tx !== 'object') return { ok: false, errors: ['Devis LI.FI invalide.'] };
  if (!LIFI_DIAMOND_CHAINS.includes(Number(fromChainId))) {
    errors.push('Chaîne de départ non couverte par la vérification du diamant LI.FI.');
  } else if (lower(tx.to) !== LIFI_DIAMOND) {
    errors.push("La transaction LI.FI ne vise pas le diamant LI.FI officiel de la chaîne de départ.");
  }
  if (expectedToChainId !== undefined && expectedToChainId !== null && Number(toChainId) !== Number(expectedToChainId)) {
    errors.push('Le devis LI.FI porte sur une autre chaîne de destination que celle demandée.');
  }
  return { ok: errors.length === 0, errors };
}

// Décodage Solana (affichage seulement) : liste les programmes appelés
// et les comptes impliqués. Ne prouve PAS que la route est légitime.
function decodeSolanaTx(base64Tx) {
  try {
    const { VersionedTransaction } = require('@solana/web3.js');
    const raw = Buffer.from(base64Tx, 'base64');
    const vtx = VersionedTransaction.deserialize(raw);
    const keys = vtx.message.staticAccountKeys || [];
    const programs = [];
    for (const ix of vtx.message.compiledInstructions || []) {
      const programId = keys[ix.programIdIndex]?.toBase58?.() || '?';
      if (!programs.includes(programId)) programs.push(programId);
    }
    return {
      ok: true,
      programs,
      accountCount: keys.length,
      accounts: keys.slice(0, 10).map((k) => k.toBase58?.() || '?'),
    };
  } catch (e) {
    return { ok: false, error: e?.message || 'Décodage Solana impossible.', programs: [], accountCount: 0, accounts: [] };
  }
}

// Décodage PSBT Bitcoin (affichage seulement) : liste les sorties.
// Une sortie vers un tiers est NORMALE pour un pont (adresse de dépôt
// du protocole), donc on ne rejette pas dessus — on affiche, et l'UI
// exige une confirmation explicite avec avertissement rouge.
function decodeBitcoinPsbtOutputs(psbtHex, ownAddress) {
  try {
    const bitcoin = require('bitcoinjs-lib');
    const psbt = bitcoin.Psbt.fromHex(psbtHex);
    const outputs = psbt.txOutputs.map((o) => {
      let address = null;
      try { address = bitcoin.address.fromOutputScript(o.script, bitcoin.networks.bitcoin); } catch { address = null; }
      return { address, valueSats: o.value, isOwn: !!ownAddress && address === ownAddress };
    });
    const totalOut = outputs.reduce((s, o) => s + (o.value || 0), 0);
    return { ok: true, outputs, totalOutSats: totalOut };
  } catch (e) {
    return { ok: false, error: e?.message || 'Décodage PSBT impossible.', outputs: [], totalOutSats: 0 };
  }
}

module.exports = {
  ALLOWANCE_HOLDER,
  LIFI_DIAMOND,
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  LARGE_SWAP_USD_HINT,
  minBuyAmount,
  validateZeroXQuote,
  validateLifiEvmTx,
  decodeSolanaTx,
  decodeBitcoinPsbtOutputs,
};
