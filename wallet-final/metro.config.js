// Requis par les libs crypto ajoutées pour le support Solana (bip39,
// @noble/hashes, @solana/web3.js…) : elles n'exposent leurs sous-modules
// (ex. "@noble/hashes/sha256") que via le champ package.json "exports".
// Sans ce flag, le résolveur Metro par défaut (Expo 50 / Metro 0.80) ne
// sait pas les trouver et échoue au bundling avec "Unable to resolve".
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
// Exclut la condition "import" : tslib@1.x (imbriqué par plusieurs paquets
// WalletConnect) déclare ses clés "exports" dans l'ordre module/import/default
// — avec "import" activé, Metro résout vers "./modules/index.js" (qui fait un
// require() relatif interne cassé sous l'interop CJS de Metro : crash au
// démarrage "Cannot read properties of undefined (reading '__extends')").
// Sans "import" dans la liste, Metro retombe sur la clé "default"/"require"
// (le vrai fichier CJS), ce que Metro utilise de toute façon puisqu'il compile
// tout en CommonJS quel que soit la syntaxe source (import vs require).
config.resolver.unstable_conditionNames = ['require'];

module.exports = config;
