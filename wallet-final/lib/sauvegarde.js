// wallet-final/lib/sauvegarde.js
// ─────────────────────────────────────────────────────────────────
//  Export du keystore chiffre (Parametres > "Exporter le keystore").
//  Le fichier exporte contient la cle ET la phrase de recuperation : il
//  donne le controle total des fonds. Comme pour "Afficher la phrase",
//  le PIN est donc redemande (vrai dechiffrement du keystore enregistre,
//  aucune comparaison de code en clair). Avant le 24/11/2026, quiconque
//  tenait le telephone deverrouille pouvait exporter le wallet avec une
//  phrase de passe de SON choix, sans jamais taper le PIN.
// ─────────────────────────────────────────────────────────────────

'use strict';

const localWallet = require('./wallet');

async function exporterKeystoreAvecPin({ encryptedKeystore, address, pin, passphrase }) {
  if (!encryptedKeystore) throw new Error('Wallet verrouillé.');
  if (!/^\d{6}$/.test(String(pin || ''))) throw new Error('PIN incorrect.');
  if (String(passphrase || '').length < 8) {
    throw new Error("Au moins 8 caractères — c'est ce qui protège le fichier exporté, pas ton PIN.");
  }
  let wallet;
  try {
    wallet = await localWallet.decryptWalletKeystore(encryptedKeystore, pin);
  } catch {
    throw new Error('PIN incorrect.');
  }
  if (address && wallet.address.toLowerCase() !== String(address).toLowerCase()) {
    throw new Error('PIN incorrect.');
  }
  return localWallet.encryptWalletKeystore(wallet, passphrase);
}

module.exports = { exporterKeystoreAvecPin };
