'use strict';

// Intentions : les devis de swap/pont demandés par l'app, et leur rattachement
// à la transaction réellement diffusée. Un devis ne prouve aucun encaissement ;
// il sert au taux de conversion et à expliquer chaque commission reçue.
//
// Aucune donnée personnelle stockée : adresse -> empreinte HMAC (hash.js),
// calldata -> empreinte SHA-256, pas d'IP.

const crypto = require('crypto');
const { ethers } = require('ethers');
const { userHash, calldataHash } = require('./hash');
const { normalizeToken, NATIVE_TOKEN } = require('./chains');

const ATTACH_WINDOW_MS = 60 * 60 * 1000;

function insertQuote(db, row) {
  db.prepare(`INSERT INTO quote_events
    (id, created_at, type, chain_id, dest_chain_id, token_in, token_out, amount_in, amount_out,
     expected_fee_amount, expected_fee_token, fee_bps, user_hash, calldata_hash, tx_to)
    VALUES (@id, @created_at, @type, @chain_id, @dest_chain_id, @token_in, @token_out, @amount_in, @amount_out,
     @expected_fee_amount, @expected_fee_token, @fee_bps, @user_hash, @calldata_hash, @tx_to)`).run(row);
  return row.id;
}

// Devis 0x : la commission attendue est celle que 0x annonce dans le devis
// (fees.integratorFee), prélevée sur le token acheté.
function recordSwapQuote(db, { chainId, sellToken, buyToken, sellAmount, taker, quote, feeBps, now = Date.now(), secret }) {
  const user = userHash(taker, secret);
  if (!user) return null;
  const integratorFee = quote && quote.fees && quote.fees.integratorFee;
  return insertQuote(db, {
    id: crypto.randomUUID(),
    created_at: now,
    type: 'swap',
    chain_id: Number(chainId),
    dest_chain_id: null,
    token_in: normalizeToken(sellToken),
    token_out: normalizeToken(buyToken),
    amount_in: String(sellAmount),
    amount_out: quote && quote.buyAmount != null ? String(quote.buyAmount) : null,
    expected_fee_amount: integratorFee && integratorFee.amount != null ? String(integratorFee.amount) : null,
    expected_fee_token: normalizeToken(integratorFee && integratorFee.token ? integratorFee.token : buyToken),
    fee_bps: Number(feeBps) || 0,
    user_hash: user,
    calldata_hash: calldataHash(quote && quote.transaction && quote.transaction.data),
    tx_to: quote && quote.transaction && quote.transaction.to ? String(quote.transaction.to).toLowerCase() : null,
  });
}

// Devis LI.FI : notre part intégrateur est `fee` (0,0025) du montant envoyé,
// en ETH natif de la chaîne de départ (seul l'ETH natif est ponté).
function recordBridgeQuote(db, { fromChain, toChain, fromAddress, fromAmount, quote, fee, now = Date.now(), secret }) {
  const user = userHash(fromAddress, secret);
  if (!user) return null;
  const feeMicros = BigInt(Math.round((Number(fee) || 0) * 1e6));
  const expected = feeMicros > 0n ? ((BigInt(fromAmount) * feeMicros) / 1000000n).toString() : null;
  const request = quote && quote.transactionRequest;
  return insertQuote(db, {
    id: crypto.randomUUID(),
    created_at: now,
    type: 'bridge',
    chain_id: Number(fromChain),
    dest_chain_id: Number(toChain),
    token_in: NATIVE_TOKEN,
    token_out: NATIVE_TOKEN,
    amount_in: String(fromAmount),
    amount_out: quote && quote.estimate && quote.estimate.toAmount != null ? String(quote.estimate.toAmount) : null,
    expected_fee_amount: expected,
    expected_fee_token: NATIVE_TOKEN,
    fee_bps: Math.round((Number(fee) || 0) * 10000),
    user_hash: user,
    calldata_hash: calldataHash(request && request.data),
    tx_to: request && request.to ? String(request.to).toLowerCase() : null,
  });
}

// Appelé après une diffusion réussie (POST /tx/broadcast) : si les données de
// la transaction signée sont celles d'un devis récent de la même chaîne, on y
// rattache le hash. La chaîne est lue dans la transaction signée elle-même
// (EIP-155), pas dans un paramètre fourni par le client.
function attachBroadcast(db, { rawTx, txHash, now = Date.now() }) {
  let tx;
  try { tx = ethers.utils.parseTransaction(rawTx); } catch { return null; }
  const hash = calldataHash(tx && tx.data);
  if (!hash || !tx.chainId) return null;
  const quote = db.prepare(`SELECT id FROM quote_events
    WHERE calldata_hash = ? AND chain_id = ? AND tx_hash IS NULL AND created_at >= ?
    ORDER BY created_at DESC LIMIT 1`).get(hash, Number(tx.chainId), now - ATTACH_WINDOW_MS);
  if (!quote) return null;
  db.prepare('UPDATE quote_events SET tx_hash = ?, tx_attached_at = ? WHERE id = ?')
    .run(String(txHash || tx.hash).toLowerCase(), now, quote.id);
  return quote.id;
}

module.exports = { recordSwapQuote, recordBridgeQuote, attachBroadcast, ATTACH_WINDOW_MS };
