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
//  - GARANTI (depuis le 23/11/2026, si l'appelant passe sellAmount) :
//    quote.sellAmount == montant demandé ; transaction.value <= montant
//    demandé pour une vente d'ETH/BNB, et == 0 pour une vente de token.
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
//  - GARANTI (Bitcoin, depuis le 23/11/2026) : le PSBT ne fait pas sortir
//    du wallet plus que le montant demande (+3 % de commissions au plus) et
//    ses frais de reseau ne depassent pas le montant echange
//    (validateBitcoinPsbt) ; montant sortant et frais sont affiches.
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
// Jeton natif (ETH, BNB) dans les devis 0x.
const NATIVE_TOKEN = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const bn = (v) => { try { return ethers.BigNumber.from(v); } catch { return null; } };

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
function validateZeroXQuote({ quote, sellAddress, buyAddress, taker, chainId, slippageBps, sellAmount }) {
  const errors = [];
  if (!quote || typeof quote !== 'object') return { ok: false, errors: ['Devis invalide.'], minBuyAmount: null, buyAmount: null };
  const tx = quote.transaction || {};
  if (quote.buyToken && lower(quote.buyToken) !== lower(buyAddress)) errors.push('Le devis porte sur un autre token à recevoir que celui demandé.');
  if (quote.sellToken && lower(quote.sellToken) !== lower(sellAddress)) errors.push('Le devis porte sur un autre token à vendre que celui demandé.');
  // Montant vendu et valeur native envoyée (depuis le 23/11/2026) : avant,
  // ni quote.sellAmount ni transaction.value n'étaient contrôlés, alors que
  // l'écran affiche « Tu paies » d'après la saisie de l'utilisateur et que
  // transaction.value est signé tel quel. Un devis qui envoie plus d'ETH/BNB
  // que demandé, ou de l'ETH/BNB lors de la vente d'un token, est rejeté.
  if (sellAmount !== undefined && sellAmount !== null) {
    const demande = bn(sellAmount);
    if (!demande) {
      errors.push('Montant vendu de la demande invalide.');
    } else {
      if (quote.sellAmount !== undefined && quote.sellAmount !== null) {
        const duDevis = bn(quote.sellAmount);
        if (!duDevis || !duDevis.eq(demande)) errors.push('Le devis porte sur un autre montant à vendre que celui demandé.');
      }
      const valeur = bn(tx.value ?? '0');
      const venteNative = lower(sellAddress) === NATIVE_TOKEN;
      if (!valeur) errors.push('La valeur de la transaction du devis est invalide.');
      else if (venteNative && valeur.gt(demande)) errors.push('Le devis enverrait plus que le montant demandé depuis ton wallet.');
      else if (!venteNative && !valeur.isZero()) errors.push('Le devis enverrait aussi de la crypto native alors que tu vends un token.');
    }
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
// Lit un PSBT Bitcoin (devis LI.FI) : sorties, total entre/sorti, frais du
// reseau et montant qui quitte le wallet. Les montants sont des nombres
// (bitcoinjs-lib 7 rend des BigInt). Avant le 23/11/2026, totalOutSats
// valait toujours 0 (il additionnait un champ inexistant) et ni les frais
// ni le montant total qui part n'etaient calcules.
function decodeBitcoinPsbtOutputs(psbtHex, ownAddress) {
  try {
    const bitcoin = require('bitcoinjs-lib');
    const reseau = bitcoin.networks.bitcoin;
    const psbt = bitcoin.Psbt.fromHex(String(psbtHex || '').replace(/^0x/i, ''), { network: reseau });
    const adresseDe = (script) => { try { return bitcoin.address.fromOutputScript(script, reseau); } catch { return null; } };
    const outputs = psbt.txOutputs.map((o) => {
      const address = adresseDe(o.script);
      return { address, valueSats: Number(o.value), isOwn: !!ownAddress && address === ownAddress };
    });
    const totalOut = outputs.reduce((s, o) => s + o.valueSats, 0);
    // Entrees : montant connu par witnessUtxo, ou par la transaction
    // precedente complete (nonWitnessUtxo).
    let totalIn = 0;
    let entreesConnues = true;
    let entreesEtrangeres = 0;
    psbt.data.inputs.forEach((entree, i) => {
      let valeur = null;
      let script = null;
      if (entree.witnessUtxo) {
        valeur = Number(entree.witnessUtxo.value);
        script = entree.witnessUtxo.script;
      } else if (entree.nonWitnessUtxo) {
        const precedente = bitcoin.Transaction.fromBuffer(entree.nonWitnessUtxo);
        const sortie = precedente.outs[psbt.txInputs[i].index];
        if (sortie) { valeur = Number(sortie.value); script = sortie.script; }
      }
      if (valeur === null) { entreesConnues = false; return; }
      totalIn += valeur;
      if (!ownAddress || adresseDe(script) !== ownAddress) entreesEtrangeres += 1;
    });
    const sentToOthersSats = outputs.filter((o) => !o.isOwn).reduce((s, o) => s + o.valueSats, 0);
    return {
      ok: true,
      outputs,
      totalOutSats: totalOut,
      totalInSats: entreesConnues ? totalIn : null,
      feeSats: entreesConnues ? totalIn - totalOut : null,
      sentToOthersSats,
      foreignInputs: entreesEtrangeres,
    };
  } catch (e) {
    return { ok: false, error: e?.message || 'Décodage PSBT impossible.', outputs: [], totalOutSats: 0 };
  }
}

// Marge sur le montant demande : LI.FI ajoute ses commissions et celles de
// l'integrateur comme sorties en plus du montant envoye au pont (doc LI.FI,
// « Bitcoin transaction requirements »). 3 % couvre largement 0,25 % + 0,25 %.
const BTC_PSBT_MARGE_BPS = 300;

// Controle d'un PSBT AVANT de l'afficher et de le signer. Bloque :
//  - un PSBT illisible ;
//  - un PSBT qui fait sortir du wallet nettement PLUS que le montant demande ;
//  - des frais de reseau superieurs au montant echange lui-meme.
// (Un PSBT sans entree de ce wallet echoue de toute facon a la signature.)
function validateBitcoinPsbt({ decoded, requestedSats }) {
  const errors = [];
  if (!decoded || !decoded.ok) {
    errors.push('Le PSBT Bitcoin du devis est illisible.');
    return { ok: false, errors };
  }
  const demande = Number(requestedSats);
  if (!Number.isFinite(demande) || demande <= 0) {
    errors.push('Montant demandé invalide.');
    return { ok: false, errors };
  }
  const plafond = Math.floor(demande * (10000 + BTC_PSBT_MARGE_BPS) / 10000);
  if (decoded.sentToOthersSats > plafond) {
    errors.push(`Le devis ferait sortir ${decoded.sentToOthersSats} sats de ton wallet alors que tu as demandé ${demande} sats.`);
  }
  if (decoded.feeSats !== null && decoded.feeSats !== undefined) {
    if (decoded.feeSats < 0) errors.push('Le PSBT Bitcoin du devis est incohérent (sorties supérieures aux entrées).');
    else if (decoded.feeSats > demande) errors.push(`Frais du réseau anormaux : ${decoded.feeSats} sats, plus que le montant échangé.`);
  }
  return { ok: errors.length === 0, errors };
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
  validateBitcoinPsbt,
  BTC_PSBT_MARGE_BPS,
};
