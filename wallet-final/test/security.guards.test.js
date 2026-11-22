'use strict';
// wallet-final/test/security.guards.test.js
// ─────────────────────────────────────────────────────────────────
//  Garde-fous de securite cote app, testes en Node (sans React Native) :
//   - lib/addressSafety.js : detection des adresses "empoisonnees"
//   - lib/swapSecurity.js  : verification des devis 0x / LI.FI AVANT
//     signature, et calcul du montant minimum recu.
//
//  Ces fonctions protegent de l'argent : chaque regle documentee dans
//  l'en-tete de swapSecurity.js a ici au moins un test qui echouerait si
//  elle etait supprimee par erreur.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');

const { looksLikePoisonedAddress } = require('../lib/addressSafety');
const {
  ALLOWANCE_HOLDER,
  LIFI_DIAMOND,
  DEFAULT_SLIPPAGE_BPS,
  MAX_SLIPPAGE_BPS,
  minBuyAmount,
  validateZeroXQuote,
  validateLifiEvmTx,
} = require('../lib/swapSecurity');

// Adresses publiques bien connues (aucun fonds reel en jeu).
const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // compte #0 Hardhat
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ROUTER = '0xDef1C0ded9bec7F1a1670819833240f027b25EfF'; // routeur 0x quelconque
const AUTRE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // compte #1 Hardhat

// ─── addressSafety ───────────────────────────────────────────────

test('adresse empoisonnee : meme debut et meme fin qu\'un contact, milieu different -> detectee', () => {
  const contact = '0x1234567890abcdef1234567890abcdef12abcdef';
  const piege = '0x123456ffffffffffffffffffffffffffffabcdef';
  assert.equal(looksLikePoisonedAddress(piege, [contact]), contact);
});

test('adresse empoisonnee : la comparaison ignore la casse (checksum)', () => {
  const contact = '0x1234567890abcdef1234567890abcdef12abcdef';
  const piege = '0x123456FFFFFFFFFFFFFFFFFFFFFFFFFFFFABCDEF';
  assert.equal(looksLikePoisonedAddress(piege, [contact]), contact);
});

test('adresse identique a un contact connu -> pas une alerte', () => {
  const contact = '0x1234567890abcdef1234567890abcdef12abcdef';
  assert.equal(looksLikePoisonedAddress(contact.toUpperCase().replace('0X', '0x'), [contact]), null);
});

test('adresse sans ressemblance -> pas d\'alerte', () => {
  assert.equal(looksLikePoisonedAddress(AUTRE, [WALLET]), null);
});

test('seul le debut OU seule la fin correspond -> pas d\'alerte', () => {
  const contact = '0x1234567890abcdef1234567890abcdef12abcdef';
  const memeDebut = '0x123456ffffffffffffffffffffffffffff000000';
  const memeFin = '0x000000ffffffffffffffffffffffffffffabcdef';
  assert.equal(looksLikePoisonedAddress(memeDebut, [contact]), null);
  assert.equal(looksLikePoisonedAddress(memeFin, [contact]), null);
});

test('longueurs differentes (ex. adresse Solana vs EVM) -> jamais comparees', () => {
  assert.equal(looksLikePoisonedAddress('0x123456abcdef', ['0x123456ffffffabcdef']), null);
});

test('entrees vides ou carnet absent -> null, sans planter', () => {
  assert.equal(looksLikePoisonedAddress('', [WALLET]), null);
  assert.equal(looksLikePoisonedAddress(null, [WALLET]), null);
  assert.equal(looksLikePoisonedAddress(WALLET, null), null);
  assert.equal(looksLikePoisonedAddress(WALLET, [null, '', undefined]), null);
});

test('adresse piegee SOLANA : 4 memes premiers et derniers caracteres -> detectee', () => {
  const contact = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const piege = 'HAgkZ9xWq3RtYuP2mN8bVcLkJhGfDsAa1QwErTyDKpqk';
  assert.equal(looksLikePoisonedAddress(piege, [contact]), contact);
  // longueur differente (43 au lieu de 44) : toujours detectee
  assert.equal(looksLikePoisonedAddress('HAgkZ9xWq3RtYuP2mN8bVcLkJhGfDsAa1QwErTyKpqk', [contact]), contact);
});

test('adresse piegee BITCOIN bc1q : 4 memes caracteres apres bc1q et a la fin -> detectee', () => {
  const contact = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
  const piege = 'bc1qcr8tq9w2h7x5yu3ne4ld6kfp0sgm2ac8zv06fyu';
  assert.equal(looksLikePoisonedAddress(piege, [contact]), contact);
  assert.equal(looksLikePoisonedAddress(piege.toUpperCase(), [contact]), contact, 'bech32 : casse ignoree');
});

test('Solana / Bitcoin : adresse identique ou sans ressemblance -> pas d alerte', () => {
  const sol = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const btc = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
  assert.equal(looksLikePoisonedAddress(sol, [sol, btc, WALLET]), null);
  assert.equal(looksLikePoisonedAddress(btc, [sol, btc, WALLET]), null);
  assert.equal(looksLikePoisonedAddress('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', [sol, btc, WALLET]), null);
  assert.equal(looksLikePoisonedAddress('bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', [sol, btc, WALLET]), null);
  // "bc1q" commun a toutes les adresses : ne suffit jamais a declencher
  assert.equal(looksLikePoisonedAddress('bc1qzzzzkr609gcawutmrza0j4xv80jy8z30zzzz', [btc]), null);
});

test("App.js : le controle d'adresse piegee passe AVANT les envois SOL et BTC", () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'App.js'), 'utf8');
  const debut = src.indexOf('const prepareSend = async');
  assert.ok(debut > 0);
  const corps = src.slice(debut, src.indexOf('const confirmAndSend = async', debut));
  const controle = corps.indexOf('looksLikePoisonedAddress(sendAddress');
  assert.ok(controle > 0, 'controle present dans prepareSend');
  assert.ok(controle < corps.indexOf("if (sendToken === 'SOL')"), 'avant la branche SOL');
  assert.ok(controle < corps.indexOf("if (sendToken === 'BTC')"), 'avant la branche BTC');
  // l'alerte rouge sous le champ ne se limite plus aux adresses de 42 caracteres
  assert.doesNotMatch(src, /sendAddress\.length === 42 && \(\(\) => \{\s*const poisonedMatch/);
});

// ─── minBuyAmount ────────────────────────────────────────────────

test('montant minimum recu : 1 % de slippage retire exactement 1 %', () => {
  assert.equal(minBuyAmount('1000000', 100), '990000');
});

test('montant minimum recu : 0,5 % et 2 % (les choix proposes dans l\'app)', () => {
  assert.equal(minBuyAmount('1000000', 50), '995000');
  assert.equal(minBuyAmount('1000000', 200), '980000');
});

test('montant minimum recu : slippage plafonne a 50 % meme si on demande plus', () => {
  assert.equal(MAX_SLIPPAGE_BPS, 5000);
  assert.equal(minBuyAmount('1000000', 9000), '500000');
});

test('montant minimum recu : slippage absent ou invalide -> defaut 1 %', () => {
  assert.equal(DEFAULT_SLIPPAGE_BPS, 100);
  assert.equal(minBuyAmount('1000000', undefined), '990000');
  assert.equal(minBuyAmount('1000000', 'abc'), '990000');
  // A noter (comportement actuel, pas un risque aujourd'hui) : 0 est
  // aussi traite comme "absent" -> 1 %. L'app ne propose que 0,5/1/2 %.
  assert.equal(minBuyAmount('1000000', 0), '990000');
});

test('montant minimum recu : grands nombres (18 decimales) sans perte de precision', () => {
  assert.equal(minBuyAmount('123456789012345678901234', 100), '122222221122222222112221');
});

test('montant minimum recu : montant illisible -> null', () => {
  assert.equal(minBuyAmount('pas-un-nombre', 100), null);
});

// ─── validateZeroXQuote ──────────────────────────────────────────

function devisValide(surcharge = {}) {
  return {
    buyToken: NATIVE,
    sellToken: USDC,
    taker: WALLET,
    chainId: 1,
    buyAmount: '420000000000000',
    issues: { allowance: { spender: ALLOWANCE_HOLDER } },
    transaction: { to: ROUTER, gas: '210000', chainId: 1 },
    ...surcharge,
  };
}
const demande = { sellAddress: USDC, buyAddress: NATIVE, taker: WALLET, chainId: 1, slippageBps: 100 };

test('devis 0x correct -> accepte, avec routeur, gas et minimum recu', () => {
  const r = validateZeroXQuote({ quote: devisValide(), ...demande });
  assert.equal(r.ok, true, r.errors.join(' / '));
  assert.equal(r.router, ROUTER);
  assert.equal(r.gas, '210000');
  assert.equal(r.minBuyAmount, '415800000000000');
});

test('devis 0x : token recu different de la demande -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisValide({ buyToken: AUTRE }), ...demande });
  assert.equal(r.ok, false);
});

test('devis 0x : token vendu different de la demande -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisValide({ sellToken: AUTRE }), ...demande });
  assert.equal(r.ok, false);
});

test('devis 0x : destine a un autre wallet -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisValide({ taker: AUTRE }), ...demande });
  assert.equal(r.ok, false);
});

test('devis 0x : autre chaine que le reseau actif -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisValide({ chainId: 56 }), ...demande });
  assert.equal(r.ok, false);
});

test('devis 0x : approbation vers un contrat autre que l\'AllowanceHolder officiel -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisValide({ issues: { allowance: { spender: AUTRE } } }), ...demande });
  assert.equal(r.ok, false);
});

test('devis 0x : approbation vers le contrat d\'execution lui-meme -> rejete', () => {
  const q = devisValide({ issues: { allowance: { spender: ALLOWANCE_HOLDER } }, transaction: { to: ALLOWANCE_HOLDER, chainId: 1 } });
  const r = validateZeroXQuote({ quote: q, ...demande });
  assert.equal(r.ok, false);
});

test('devis 0x : contrat d\'execution = mon propre wallet ou un token echange -> rejete', () => {
  for (const to of [WALLET, USDC, NATIVE]) {
    const r = validateZeroXQuote({ quote: devisValide({ transaction: { to, chainId: 1 } }), ...demande });
    assert.equal(r.ok, false, `to=${to} aurait du etre rejete`);
  }
});

test('devis 0x : contrat d\'execution absent ou invalide -> rejete', () => {
  for (const to of [undefined, '', '0x1234']) {
    const r = validateZeroXQuote({ quote: devisValide({ transaction: { to, chainId: 1 } }), ...demande });
    assert.equal(r.ok, false);
  }
});

test('devis 0x : approbation sur une chaine non couverte -> rejete', () => {
  const r = validateZeroXQuote({ quote: devisValide({ chainId: 999 }), ...demande, chainId: 999 });
  assert.equal(r.ok, false);
});

test('devis 0x : champs optionnels absents -> pas de rejet pour ca (format 0x evolutif)', () => {
  const r = validateZeroXQuote({ quote: { transaction: { to: ROUTER } }, ...demande });
  assert.equal(r.ok, true, r.errors.join(' / '));
  assert.equal(r.minBuyAmount, null);
});

test('devis 0x : la casse des adresses ne compte pas', () => {
  const q = devisValide({ buyToken: NATIVE.toLowerCase(), sellToken: USDC.toUpperCase().replace('0X', '0x'), taker: WALLET.toLowerCase() });
  assert.equal(validateZeroXQuote({ quote: q, ...demande }).ok, true);
});

test('devis 0x : devis vide ou illisible -> rejete', () => {
  assert.equal(validateZeroXQuote({ quote: null, ...demande }).ok, false);
  assert.equal(validateZeroXQuote({ quote: 'texte', ...demande }).ok, false);
});

// ─── validateLifiEvmTx ───────────────────────────────────────────

test('pont LI.FI : transaction vers le diamant officiel -> acceptee', () => {
  const r = validateLifiEvmTx({ tx: { to: LIFI_DIAMOND }, fromChainId: 1, toChainId: 8453, expectedToChainId: 8453 });
  assert.equal(r.ok, true, r.errors.join(' / '));
});

test('pont LI.FI : transaction vers un autre contrat -> rejetee', () => {
  const r = validateLifiEvmTx({ tx: { to: ROUTER }, fromChainId: 1, toChainId: 8453, expectedToChainId: 8453 });
  assert.equal(r.ok, false);
});

test('pont LI.FI : mauvaise chaine de destination -> rejetee', () => {
  const r = validateLifiEvmTx({ tx: { to: LIFI_DIAMOND }, fromChainId: 1, toChainId: 10, expectedToChainId: 8453 });
  assert.equal(r.ok, false);
});

test('pont LI.FI : chaine de depart non couverte -> rejetee', () => {
  const r = validateLifiEvmTx({ tx: { to: LIFI_DIAMOND }, fromChainId: 999, toChainId: 1, expectedToChainId: 1 });
  assert.equal(r.ok, false);
});

test('pont LI.FI : transaction absente -> rejetee', () => {
  assert.equal(validateLifiEvmTx({ tx: null, fromChainId: 1 }).ok, false);
});
