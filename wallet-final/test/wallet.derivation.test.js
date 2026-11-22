'use strict';
// wallet-final/test/wallet.derivation.test.js
// ─────────────────────────────────────────────────────────────────
//  Adresses calculees a partir de la phrase de recuperation (lib/wallet.js).
//  Si ce calcul change, meme un peu, les utilisateurs ne voient plus leurs
//  fonds : on le fige sur les vecteurs de reference publics, et on verifie
//  qu'une phrase COLLEE avec des espaces en trop, des retours a la ligne ou
//  des majuscules donne exactement les memes adresses que la phrase propre
//  (comme dans MetaMask, Phantom ou tout autre wallet).
//  Phrases de test PUBLIQUES : ne jamais y envoyer de vrais fonds.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const localWallet = require('../lib/wallet');

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const ATTENDU = {
  // m/44'/60'/0'/0/0 (vecteur public bien connu)
  eth: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
  // m/84'/0'/0'/0/0 : vecteur officiel de la norme BIP84
  btc: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
  // m/44'/501'/0'/0' (chemin de Phantom / Solflare)
  sol: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
};

function adresses(phrase) {
  const w = localWallet.importLocalWallet(phrase, 'mnemonic');
  return { eth: w.address, btc: localWallet.getBitcoinAddress(w.mnemonic), sol: localWallet.getSolanaAddress(w.mnemonic), mnemonic: w.mnemonic };
}

test('phrase propre : les 3 adresses de reference (Ethereum, Bitcoin, Solana)', () => {
  const a = adresses(ABANDON);
  assert.equal(a.eth, ATTENDU.eth);
  assert.equal(a.btc, ATTENDU.btc);
  assert.equal(a.sol, ATTENDU.sol);
  assert.equal(localWallet.importLocalWallet('test test test test test test test test test test test junk', 'mnemonic').address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
});

test('phrase collee avec espaces en trop, retours a la ligne, tabulations ou majuscules : memes adresses', () => {
  const mots = ABANDON.split(' ');
  const variantes = [
    `  ${ABANDON}  `,
    mots.join('  '),
    mots.slice(0, 6).join(' ') + '\n' + mots.slice(6).join(' '),
    mots.slice(0, 4).join(' ') + '\r\n' + mots.slice(4, 8).join(' ') + '\n\n' + mots.slice(8).join(' '),
    mots.join('\t'),
    ABANDON.toUpperCase(),
    mots.map((m, i) => (i % 2 ? m.toUpperCase() : m)).join('  '),
  ];
  for (const v of variantes) {
    const a = adresses(v);
    assert.deepEqual({ eth: a.eth, btc: a.btc, sol: a.sol }, ATTENDU, JSON.stringify(v));
    assert.equal(a.mnemonic, ABANDON, 'phrase enregistree sous sa forme propre');
  }
});

test('phrase invalide : refusee avec une erreur, jamais un wallet inattendu', () => {
  for (const v of ['', '   ', 'abandon abandon', ABANDON.replace('about', 'abandon'), ABANDON + ' extra']) {
    assert.throws(() => localWallet.importLocalWallet(v, 'mnemonic'), String(JSON.stringify(v)));
  }
});

test('cle privee : avec ou sans 0x, meme adresse, pas de phrase', () => {
  const pk = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  for (const v of [pk, `0x${pk}`, `  ${pk}\n`]) {
    const w = localWallet.importLocalWallet(v, 'privateKey');
    assert.equal(w.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    assert.equal(w.mnemonic, null);
  }
});

test('phrase DEJA enregistree (meme avec des espaces en double) : adresses inchangees', () => {
  // Les wallets deja importes gardent EXACTEMENT les memes adresses
  // qu'avant : on ne recalcule pas d'anciennes phrases autrement (sinon
  // leurs fonds Solana/Bitcoin sembleraient disparaitre).
  const ancienne = ABANDON.replace(' about', '  about');
  assert.equal(localWallet.getSolanaAddress(ancienne), '9V16QRfFzeiG1jrcNf51KvHTXHKTkeNpQdtQaTyaCyCB');
  assert.equal(localWallet.getBitcoinAddress(ancienne), 'bc1qhdcxvnqs73kryvwmmkrj73qpmf79qfrtr2qn98');
});
