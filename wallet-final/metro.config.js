// Requis par les libs crypto ajoutées pour le support Solana (bip39,
// @noble/hashes, @solana/web3.js…) : elles n'exposent leurs sous-modules
// (ex. "@noble/hashes/sha256") que via le champ package.json "exports".
// Sans ce flag, le résolveur Metro par défaut (Expo 50 / Metro 0.80) ne
// sait pas les trouver et échoue au bundling avec "Unable to resolve".
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
