// Doivent rester les tout premiers imports du bundle : ethers a besoin de
// crypto.getRandomValues (absent de Hermes/RN) avant d'être lui-même importé
// où que ce soit dans l'app — voir wallet-final/lib/wallet.js.
import * as Crypto from 'expo-crypto';
if (typeof global.crypto !== 'object') global.crypto = {};
if (typeof global.crypto.getRandomValues !== 'function') {
  global.crypto.getRandomValues = Crypto.getRandomValues;
}
// Requis par bip39/@solana/web3.js (dérivation de l'adresse Solana) : ces
// libs appellent Buffer.from(...) directement, absent de Hermes/RN/web sans
// ce polyfill (sinon "ReferenceError: Buffer is not defined").
import { Buffer } from 'buffer';
if (typeof global.Buffer === 'undefined') global.Buffer = Buffer;
import '@ethersproject/shims';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
