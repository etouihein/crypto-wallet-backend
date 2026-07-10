// wallet-final/lib/wallet.js
// ─────────────────────────────────────────────────────────────────
//  Portefeuille NON-CUSTODIAL : tout ce qui touche à une clé privée
//  ou une mnémonique vit ici, en local, et n'est JAMAIS envoyé au
//  backend. Seule une transaction déjà signée (donnée publique dès
//  sa diffusion) part vers /wallet/tx/broadcast pour être relayée.
//
//  Module volontairement libre de tout import React Native/Expo pour
//  rester testable avec de simples scripts `node -e` (voir le plan
//  de migration).
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const {
  Keypair, PublicKey, Connection, SystemProgram, Transaction,
  StakeProgram, Authorized, Lockup,
} = require('@solana/web3.js');
const { BIP32Factory } = require('bip32');
const bitcoinEcc = require('@bitcoinerlab/secp256k1');
const bitcoin = require('bitcoinjs-lib');

const bip32 = BIP32Factory(bitcoinEcc);

// Mêmes RPC publics que ceux utilisés par défaut côté backend
// (crypto-wallet/src/routes/wallet.js) — gardés synchronisés à la main.
const NETWORKS = {
  ethereum: {
    chainId: 1,
    nativeSymbol: 'ETH',
    rpcUrl: (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL) || 'https://ethereum-rpc.publicnode.com',
  },
  bsc: {
    chainId: 56,
    nativeSymbol: 'BNB',
    rpcUrl: (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BSC_RPC_URL) || 'https://bsc-rpc.publicnode.com',
  },
  polygon: {
    chainId: 137,
    nativeSymbol: 'MATIC',
    rpcUrl: (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_POLYGON_RPC_URL) || 'https://polygon-bor-rpc.publicnode.com',
  },
};

// Adresses vérifiées sur Etherscan/BscScan (voir le plan de migration non-
// custodial). Ne JAMAIS modifier sans revérifier sur l'explorateur officiel
// — une erreur ici fait perdre des fonds aux utilisateurs qui envoient.
const ERC20_TOKENS = {
  ethereum: {
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  },
  bsc: {
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
  },
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const ERC20_METADATA_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
];

function getNetworkConfig(network = 'ethereum') {
  return NETWORKS[network] || NETWORKS.ethereum;
}

function getProvider(network = 'ethereum') {
  return new ethers.providers.JsonRpcProvider(getNetworkConfig(network).rpcUrl);
}

function getErc20Config(symbol, network = 'ethereum') {
  return ERC20_TOKENS[network]?.[symbol?.toUpperCase()] || null;
}

// ── Génération / import — 100% local ────────────────────────────

function createLocalWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase,
    privateKey: wallet.privateKey,
  };
}

function importLocalWallet(value, type) {
  const trimmed = (value || '').trim();
  if (!trimmed) throw new Error('Mnémonique ou clé privée requise.');

  let wallet;
  if (type === 'privateKey') {
    const pk = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
    wallet = new ethers.Wallet(pk);
  } else {
    wallet = ethers.Wallet.fromMnemonic(trimmed.toLowerCase());
  }

  return {
    address: wallet.address,
    mnemonic: type === 'mnemonic' ? trimmed.toLowerCase() : null,
    privateKey: wallet.privateKey,
  };
}

function walletFromPrivateKey(privateKey, network) {
  const wallet = new ethers.Wallet(privateKey);
  return network ? wallet.connect(getProvider(network)) : wallet;
}

// ── Chiffrement au repos (PIN choisi par l'utilisateur) ──────────
// Format "Ethereum keystore" standard (scrypt + AES-128-CTR + MAC),
// implémenté par ethers — aucune dépendance supplémentaire. Quand le
// wallet a une mnémonique associée (créé via createRandom/fromMnemonic),
// ethers l'embarque automatiquement dans le keystore (extension "x-ethers")
// et la restitue telle quelle au déchiffrement.
// N réduit (16384 au lieu des 131072 par défaut) : reste largement assez
// coûteux contre le brute-force pour un PIN à 6 chiffres, mais évite un
// déchiffrement de plusieurs secondes sur un mobile bas de gamme.
const KEYSTORE_SCRYPT_OPTS = { scrypt: { N: 1 << 14 } };

async function encryptWalletKeystore({ privateKey, mnemonic }, pin) {
  const wallet = mnemonic ? ethers.Wallet.fromMnemonic(mnemonic) : new ethers.Wallet(privateKey);
  return wallet.encrypt(pin, KEYSTORE_SCRYPT_OPTS);
}

async function decryptWalletKeystore(encryptedJson, pin) {
  const wallet = await ethers.Wallet.fromEncryptedJson(encryptedJson, pin);
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic ? wallet.mnemonic.phrase : null,
  };
}

// ── Lecture — RPC public direct, aucune clé nécessaire ──────────

async function getNativeBalance(address, network = 'ethereum') {
  const balanceWei = await getProvider(network).getBalance(address);
  return ethers.utils.formatEther(balanceWei);
}

async function getErc20Balance(address, symbol, network = 'ethereum') {
  const token = getErc20Config(symbol, network);
  if (!token) return '0';
  const contract = new ethers.Contract(token.address, ERC20_ABI, getProvider(network));
  const balance = await contract.balanceOf(address);
  return ethers.utils.formatUnits(balance, token.decimals);
}

// Token personnalisé (adresse de contrat saisie à la main) — lecture seule :
// nom/symbole/décimales + solde. Pas d'envoi géré ici (pas d'ajout à
// ERC20_TOKENS), pour éviter de fiabiliser un transfert sur un contrat non
// vérifié à la main comme USDT/USDC le sont ci-dessus.
async function getCustomTokenInfo(contractAddress, walletAddress, network = 'ethereum') {
  if (!ethers.utils.isAddress(contractAddress)) {
    throw new Error("Adresse de contrat invalide.");
  }
  const provider = getProvider(network);
  const contract = new ethers.Contract(contractAddress, ERC20_METADATA_ABI, provider);
  const [name, symbol, decimals, balance] = await Promise.all([
    contract.name().catch(() => 'Token'),
    contract.symbol().catch(() => '???'),
    contract.decimals().catch(() => 18),
    contract.balanceOf(walletAddress).catch(() => ethers.BigNumber.from(0)),
  ]);
  return {
    address: contractAddress,
    name,
    symbol,
    decimals,
    balance: ethers.utils.formatUnits(balance, decimals),
    network,
  };
}

// Estimation des frais AVANT signature — sert uniquement à les afficher sur
// l'écran de confirmation (le vrai gasLimit utilisé à l'envoi est recalculé
// au moment de signer, dans signNativeTx/signErc20Tx). Repli sur une
// estimation approximative si le nœud RPC refuse `estimateGas` sans clé
// (certains RPC publics l'exigent) — mieux vaut un ordre de grandeur affiché
// que rien plutôt que de bloquer l'écran de confirmation.
//
// Pas d'oracle de gas dédié ici (type Etherscan Gas Tracker) : les 3 niveaux
// lent/normal/rapide sont de simples multiplicateurs du gasPrice actuel du
// réseau (90% / 100% / 130%). C'est une approximation grossière assumée —
// pas de promesse de délai de confirmation en secondes, seulement moins cher
// / plus rapide en tendance relative.
const GAS_TIER_MULTIPLIERS = { slow: 0.9, normal: 1, fast: 1.3 };

async function estimateSendFee({ from, to, amount, symbol, network = 'ethereum' }) {
  const provider = getProvider(network);
  const nativeSymbol = getNetworkConfig(network).nativeSymbol;
  const feeData = await provider.getFeeData();
  const baseGasPrice = feeData.gasPrice || feeData.maxFeePerGas || ethers.BigNumber.from('5000000000');

  let gasLimit;
  let approximate = false;
  try {
    if (!symbol || symbol === nativeSymbol) {
      gasLimit = await provider.estimateGas({ from, to, value: ethers.utils.parseEther((amount || '0').toString()) });
    } else {
      const token = getErc20Config(symbol, network);
      if (!token) throw new Error(`Token ${symbol} non configuré sur ${network}.`);
      const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
      const value = ethers.utils.parseUnits((amount || '0').toString(), token.decimals);
      gasLimit = await contract.estimateGas.transfer(to, value, { from });
    }
  } catch {
    gasLimit = ethers.BigNumber.from(symbol && symbol !== nativeSymbol ? 65000 : 21000);
    approximate = true;
  }

  // Multiplication en entiers (basis points) pour éviter toute perte de
  // précision en virgule flottante sur un BigNumber.
  const tiers = {};
  for (const [tier, mult] of Object.entries(GAS_TIER_MULTIPLIERS)) {
    const tierGasPrice = baseGasPrice.mul(Math.round(mult * 1000)).div(1000);
    const tierFeeWei = tierGasPrice.mul(gasLimit);
    tiers[tier] = {
      gasPriceWei: tierGasPrice.toString(),
      gasPriceGwei: ethers.utils.formatUnits(tierGasPrice, 'gwei'),
      feeNative: ethers.utils.formatEther(tierFeeWei),
    };
  }

  const feeWei = baseGasPrice.mul(gasLimit);
  return {
    feeNative: ethers.utils.formatEther(feeWei),
    nativeSymbol,
    gasLimit: gasLimit.toString(),
    gasPriceGwei: ethers.utils.formatUnits(baseGasPrice, 'gwei'),
    approximate,
    tiers,
  };
}

// ── Signature locale — retourne une tx déjà signée (rawTx), jamais
//    diffusée directement d'ici : App.js l'envoie à
//    POST /wallet/tx/broadcast qui se contente de la relayer. ────

// `gasPrice` (optionnel, en wei, string ou BigNumber-able) vient du niveau
// lent/normal/rapide choisi par l'utilisateur sur l'écran de confirmation
// (voir `tiers` dans estimateSendFee ci-dessus). Absent -> comportement
// inchangé, ethers choisit lui-même le gasPrice courant du réseau.
//
// IMPORTANT : `type: 0` (legacy) est obligatoire ici. Sans ça,
// `wallet.populateTransaction` ignore silencieusement un `gasPrice` fourni
// et repopule ses propres maxFeePerGas/maxPriorityFeePerGas EIP-1559 à la
// place (vérifié empiriquement : la transaction signée n'utilisait PAS le
// gasPrice demandé) -- le sélecteur de vitesse aurait été purement cosmétique.
async function signNativeTx({ privateKey, to, amount, network = 'ethereum', gasPrice }) {
  if (!ethers.utils.isAddress(to)) throw new Error("L'adresse de destination n'est pas valide.");
  const wallet = walletFromPrivateKey(privateKey, network);
  const value = ethers.utils.parseEther(amount.toString());

  const currentBalanceWei = await wallet.provider.getBalance(wallet.address);
  if (currentBalanceWei.lt(value)) throw new Error('Fonds insuffisants sur le wallet.');

  const base = { to, value };
  if (gasPrice) { base.gasPrice = ethers.BigNumber.from(gasPrice); base.type = 0; }
  const populated = await wallet.populateTransaction(base);
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

async function signErc20Tx({ privateKey, to, amount, symbol, network = 'ethereum', gasPrice }) {
  if (!ethers.utils.isAddress(to)) throw new Error("L'adresse de destination n'est pas valide.");
  const token = getErc20Config(symbol, network);
  if (!token) throw new Error(`Token ${symbol} non configuré sur ${network}.`);

  const wallet = walletFromPrivateKey(privateKey, network);
  const contract = new ethers.Contract(token.address, ERC20_ABI, wallet);
  const value = ethers.utils.parseUnits(amount.toString(), token.decimals);

  const currentBalance = await contract.balanceOf(wallet.address);
  if (currentBalance.lt(value)) throw new Error(`Fonds ${symbol} insuffisants sur le wallet.`);

  const unsignedTx = await contract.populateTransaction.transfer(to, value);
  if (gasPrice) { unsignedTx.gasPrice = ethers.BigNumber.from(gasPrice); unsignedTx.type = 0; }
  const populated = await wallet.populateTransaction(unsignedTx);
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

// ── NFT (ERC721) — la galerie (lecture) passe par le backend (GET
//    /wallet/nft/owned/:address, clé Alchemy côté serveur) ; l'envoi, lui,
//    reste 100% local ici, exactement comme un envoi ERC20 classique.
const ERC721_ABI = ['function safeTransferFrom(address from, address to, uint256 tokenId)'];

async function signNftTransferTx({ privateKey, contractAddress, tokenId, to, network = 'ethereum' }) {
  if (!ethers.utils.isAddress(to)) throw new Error("L'adresse de destination n'est pas valide.");
  const wallet = walletFromPrivateKey(privateKey, network);
  const contract = new ethers.Contract(contractAddress, ERC721_ABI, wallet);
  const unsignedTx = await contract.populateTransaction.safeTransferFrom(wallet.address, to, tokenId);
  const populated = await wallet.populateTransaction(unsignedTx);
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

// ── Swap (agrégateur DEX 0x) — la signature reste ici, en local. Le backend
//    ne fait QUE fournir un devis chiffré (voir GET /wallet/swap/quote) ; la
//    transaction qu'il retourne est signée et diffusée exactement comme un
//    envoi classique. Adresse convention 0x pour "token natif" (ETH/BNB).
const NATIVE_PLACEHOLDER = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)'];

// Signe une transaction déjà construite (par ex. celle renvoyée par un devis
// de swap 0x) : { to, data, value, gasLimit } → transaction signée (rawTx).
async function signRawTx({ privateKey, to, data, value = '0', gasLimit, network = 'ethereum' }) {
  const wallet = walletFromPrivateKey(privateKey, network);
  const base = { to, data: data || '0x', value: ethers.BigNumber.from(value || '0') };
  if (gasLimit) base.gasLimit = ethers.BigNumber.from(gasLimit);
  const populated = await wallet.populateTransaction(base);
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

// Autorise un contrat (le "spender" renvoyé par le devis de swap) à dépenser
// jusqu'à `amount` d'un token ERC20 — étape obligatoire avant un swap si
// l'allocation actuelle est insuffisante (jamais nécessaire pour un token natif).
async function signApproveTx({ privateKey, tokenAddress, spender, amount, network = 'ethereum' }) {
  const wallet = walletFromPrivateKey(privateKey, network);
  const iface = new ethers.utils.Interface(ERC20_APPROVE_ABI);
  const data = iface.encodeFunctionData('approve', [spender, amount]);
  const populated = await wallet.populateTransaction({ to: tokenAddress, data });
  const rawTx = await wallet.signTransaction(populated);
  return { rawTx };
}

// Attend la confirmation d'une transaction déjà diffusée — utilisé entre
// l'approbation et le swap lui-même (le swap échouerait si l'allocation
// n'est pas encore confirmée on-chain).
async function waitForTx(txHash, network = 'ethereum', timeoutMs = 120_000) {
  return getProvider(network).waitForTransaction(txHash, 1, timeoutMs);
}

// ── Solana — chaîne non-EVM : adresse et clé dérivées de LA MÊME
//    mnémonique BIP39 que l'adresse Ethereum, via SLIP-0010 (ed25519),
//    chemin standard m/44'/501'/0'/0' (utilisé par la plupart des
//    wallets Solana JS : Phantom, Solflare, Solana Cookbook). La
//    mnémonique reste donc la SEULE chose à sauvegarder pour tout
//    récupérer, EVM et Solana.
const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

// Le RPC public officiel (api.mainnet-beta.solana.com) rejette TOUTE requête
// portant un header Origin avec 403 "Access forbidden" — vérifié : ça passe
// sans Origin (Node, curl) mais échoue pour n'importe quel Origin de
// navigateur (localhost, nexiawallet.pages.dev, autre...). Ça cassait
// silencieusement le solde SOL ET l'envoi depuis la version web déployée,
// jamais repéré car les vérifications précédentes utilisaient curl/Node, pas
// un vrai navigateur. publicnode.com (déjà utilisé pour ETH/BSC/Polygon plus
// haut) accepte les requêtes cross-origin.
const SOLANA_RPC_URL = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_SOLANA_RPC_URL)
  || 'https://solana-rpc.publicnode.com';

function getSolanaConnection() {
  return new Connection(SOLANA_RPC_URL, 'confirmed');
}

function solanaKeypairFromMnemonic(mnemonic) {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  const derived = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex'));
  return Keypair.fromSeed(derived.key);
}

function getSolanaAddress(mnemonic) {
  return solanaKeypairFromMnemonic(mnemonic).publicKey.toBase58();
}

function isValidSolanaAddress(address) {
  try { new PublicKey(address); return true; } catch { return false; }
}

async function getSolanaBalance(address) {
  const lamports = await getSolanaConnection().getBalance(new PublicKey(address));
  return (lamports / 1_000_000_000).toString();
}

// Construit + signe un transfert SOL natif en local ; retourne une
// transaction sérialisée en base64, diffusée ensuite par le backend
// (POST /wallet/tx/broadcast-solana) exactement comme un rawTx EVM.
async function signSolanaTransferTx({ mnemonic, to, amountSol }) {
  if (!isValidSolanaAddress(to)) throw new Error("L'adresse Solana de destination n'est pas valide.");
  const keypair = solanaKeypairFromMnemonic(mnemonic);
  const connection = getSolanaConnection();

  const lamports = Math.round(parseFloat(amountSol) * 1_000_000_000);
  const currentBalance = await connection.getBalance(keypair.publicKey);
  if (currentBalance < lamports) throw new Error('Fonds SOL insuffisants sur le wallet.');

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey }).add(
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: new PublicKey(to), lamports })
  );
  tx.sign(keypair);
  return { rawTx: tx.serialize().toString('base64') };
}

// ── Staking natif Solana — délégation à un validateur via le programme Stake
//    intégré au protocole (pas de protocole tiers type Lido/Marinade : moins
//    de rendement, mais aucun risque de smart contract supplémentaire, et
//    reste 100% non-custodial comme le reste du wallet). Cycle de vie d'un
//    compte de stake : création+délégation -> activation (~1 epoch, 2-3 jours)
//    -> actif (touche les récompenses) -> désactivation demandée -> désactivé
//    (~1 epoch) -> retrait possible.
const STAKE_ACCOUNT_SEED_PREFIX = 'nexia-stake-';

// Les validateurs changent de commission/stake au fil du temps : on interroge
// le réseau à chaque fois plutôt que de figer une liste en dur (qui finirait
// par pointer vers un validateur devenu peu fiable sans qu'on s'en rende compte).
async function getSolanaValidators() {
  const connection = getSolanaConnection();
  const { current } = await connection.getVoteAccounts();
  return current
    .filter((v) => v.commission <= 10 && v.epochVoteAccount)
    .sort((a, b) => b.activatedStake - a.activatedStake)
    .slice(0, 10)
    .map((v) => ({
      votePubkey: v.votePubkey,
      commission: v.commission,
      activatedStakeSol: v.activatedStake / 1_000_000_000,
    }));
}

// Récupère l'état actuel d'une liste de comptes de stake déjà connus (voir
// `stakePubkey` retourné par createAndDelegateStake ci-dessous, à conserver
// côté client — App.js les persiste par adresse de wallet). Volontairement
// PAS un scan "trouve tous les comptes de stake de cette adresse" via
// getProgramAccounts : cette méthode est désactivée ou très instable sur la
// plupart des RPC publics/gratuits (vérifié : timeout systématique sur
// publicnode.com avec un filtre memcmp), alors qu'un getMultipleAccounts sur
// une liste de pubkeys connus est un appel bien plus léger, supporté partout.
async function getSolanaStakeAccountsInfo(stakePubkeys) {
  if (!stakePubkeys?.length) return [];
  const connection = getSolanaConnection();
  const pubkeys = stakePubkeys.map((s) => new PublicKey(s));
  const [accounts, epochInfo] = await Promise.all([
    connection.getMultipleParsedAccounts(pubkeys),
    connection.getEpochInfo(),
  ]);

  return accounts.value
    .map((account, i) => {
      if (!account) return null; // compte fermé (déjà entièrement retiré)
      const info = account.data.parsed?.info;
      const delegation = info?.stake?.delegation;
      const lamports = account.lamports;
      let status = 'inactive';
      if (delegation) {
        const activationEpoch = Number(delegation.activationEpoch);
        const deactivationEpoch = Number(delegation.deactivationEpoch);
        const maxEpoch = 18446744073709552000; // u64::MAX renvoyé par le RPC quand jamais désactivé
        if (deactivationEpoch < maxEpoch && epochInfo.epoch > deactivationEpoch) status = 'inactive';
        else if (deactivationEpoch < maxEpoch) status = 'deactivating';
        else if (epochInfo.epoch > activationEpoch) status = 'active';
        else status = 'activating';
      }
      return {
        stakePubkey: stakePubkeys[i],
        lamports,
        amountSol: lamports / 1_000_000_000,
        status,
        votePubkey: delegation?.voter || null,
      };
    })
    .filter(Boolean);
}

// Crée le compte de stake ET délègue en une seule transaction (un seul frais
// réseau, une seule signature) — l'adresse du compte de stake est dérivée
// déterministiquement de la clé publique + d'un seed unique, donc jamais
// besoin de la stocker : `getSolanaStakeAccounts` la retrouve toujours via
// le réseau.
async function createAndDelegateStake({ mnemonic, votePubkey, amountSol }) {
  const keypair = solanaKeypairFromMnemonic(mnemonic);
  const connection = getSolanaConnection();
  const seed = `${STAKE_ACCOUNT_SEED_PREFIX}${Date.now()}`;
  const stakePubkey = await PublicKey.createWithSeed(keypair.publicKey, seed, StakeProgram.programId);

  const lamportsToStake = Math.round(parseFloat(amountSol) * 1_000_000_000);
  const rentExempt = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
  const totalLamports = lamportsToStake + rentExempt;

  const currentBalance = await connection.getBalance(keypair.publicKey);
  if (currentBalance < totalLamports) throw new Error('Fonds SOL insuffisants (montant + réserve de loyer du compte de stake).');

  const createIx = StakeProgram.createAccountWithSeed({
    fromPubkey: keypair.publicKey,
    stakePubkey,
    basePubkey: keypair.publicKey,
    seed,
    authorized: new Authorized(keypair.publicKey, keypair.publicKey),
    lockup: new Lockup(0, 0, PublicKey.default),
    lamports: totalLamports,
  });
  const delegateIx = StakeProgram.delegate({
    stakePubkey,
    authorizedPubkey: keypair.publicKey,
    votePubkey: new PublicKey(votePubkey),
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey });
  tx.add(...createIx.instructions, ...delegateIx.instructions);
  tx.sign(keypair);
  return { rawTx: tx.serialize().toString('base64'), stakePubkey: stakePubkey.toBase58() };
}

// Démarre la désactivation (le SOL délégué reste bloqué ~1 epoch de plus
// avant de pouvoir être retiré — c'est une règle du protocole Solana, pas une
// contrainte de ce wallet).
async function deactivateStake({ mnemonic, stakePubkey }) {
  const keypair = solanaKeypairFromMnemonic(mnemonic);
  const connection = getSolanaConnection();
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey }).add(
    StakeProgram.deactivate({ stakePubkey: new PublicKey(stakePubkey), authorizedPubkey: keypair.publicKey })
  );
  tx.sign(keypair);
  return { rawTx: tx.serialize().toString('base64') };
}

// Retire la totalité du compte de stake (doit être "inactive", voir
// getSolanaStakeAccounts) vers le wallet — le compte de stake lui-même est
// alors fermé automatiquement par le programme.
async function withdrawStake({ mnemonic, stakePubkey, lamports }) {
  const keypair = solanaKeypairFromMnemonic(mnemonic);
  const connection = getSolanaConnection();
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: keypair.publicKey }).add(
    StakeProgram.withdraw({
      stakePubkey: new PublicKey(stakePubkey),
      authorizedPubkey: keypair.publicKey,
      toPubkey: keypair.publicKey,
      lamports,
    })
  );
  tx.sign(keypair);
  return { rawTx: tx.serialize().toString('base64') };
}

// ── Bitcoin — chaîne non-EVM : adresse dérivée de LA MÊME mnémonique via
//    BIP84 (native segwit, adresses "bc1..."), le standard actuel pour les
//    wallets grand public (Trust Wallet, Ledger...) — frais les plus bas.
//    Aucune clé privée ni la mnémonique ne quittent l'appareil ; seule une
//    transaction déjà signée (hex) part vers le backend pour être relayée.
const BITCOIN_DERIVATION_PATH = "m/84'/0'/0'/0/0";
const BITCOIN_NETWORK = bitcoin.networks.bitcoin;

// API publique Blockstream (pas de clé nécessaire, données publiques de la
// blockchain) — même principe que les RPC EVM/Solana publics utilisés plus haut.
const BLOCKSTREAM_API_URL = (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_BLOCKSTREAM_API_URL)
  || 'https://blockstream.info/api';

function bitcoinKeyPairFromMnemonic(mnemonic) {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  const root = bip32.fromSeed(seed, BITCOIN_NETWORK);
  return root.derivePath(BITCOIN_DERIVATION_PATH);
}

function getBitcoinAddress(mnemonic) {
  const keyPair = bitcoinKeyPairFromMnemonic(mnemonic);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network: BITCOIN_NETWORK });
  return address;
}

function isValidBitcoinAddress(address) {
  try { bitcoin.address.toOutputScript(address, BITCOIN_NETWORK); return true; } catch { return false; }
}

async function getBitcoinUtxos(address) {
  const res = await fetch(`${BLOCKSTREAM_API_URL}/address/${address}/utxo`);
  if (!res.ok) throw new Error('Impossible de récupérer les UTXOs Bitcoin.');
  return res.json();
}

async function getBitcoinBalance(address) {
  const utxos = await getBitcoinUtxos(address);
  const totalSats = utxos.reduce((sum, u) => sum + u.value, 0);
  return (totalSats / 1e8).toString();
}

// Estimation de frais réelle (sat/vByte) via l'endpoint public Blockstream,
// repli sur 15 sat/vByte (ordre de grandeur raisonnable) si l'API échoue —
// juste pour ne pas bloquer l'envoi, pas une promesse de précision absolue.
async function getBitcoinFeeRate() {
  try {
    const res = await fetch(`${BLOCKSTREAM_API_URL}/fee-estimates`);
    const data = await res.json();
    return Math.ceil(data['6'] || data['3'] || 15);
  } catch {
    return 15;
  }
}

// Construit + signe un transfert BTC natif (P2WPKH) en local ; retourne une
// transaction sérialisée en hex, diffusée ensuite par le backend (POST
// /wallet/tx/broadcast-bitcoin) exactement comme un rawTx EVM/Solana.
// Sélection d'UTXOs simple (accumulation jusqu'à couvrir montant + frais) et
// estimation de taille approximative (P2WPKH : ~68 vB/entrée, ~31 vB/sortie)
// — suffisant pour un wallet grand public, pas un optimiseur de frais.
async function signBitcoinTransferTx({ mnemonic, to, amountBtc }) {
  if (!isValidBitcoinAddress(to)) throw new Error("L'adresse Bitcoin de destination n'est pas valide.");
  const keyPair = bitcoinKeyPairFromMnemonic(mnemonic);
  const { address: fromAddress, output: fromScript } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network: BITCOIN_NETWORK });

  const amountSats = Math.round(parseFloat(amountBtc) * 1e8);
  const utxos = await getBitcoinUtxos(fromAddress);
  const feeRate = await getBitcoinFeeRate();

  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let inputSum = 0;
  let estFeeSats = 0;
  for (const utxo of sorted) {
    selected.push(utxo);
    inputSum += utxo.value;
    estFeeSats = Math.ceil((10 + selected.length * 68 + 2 * 31) * feeRate);
    if (inputSum >= amountSats + estFeeSats) break;
  }
  if (inputSum < amountSats + estFeeSats) throw new Error('Fonds BTC insuffisants (montant + frais réseau).');

  const psbt = new bitcoin.Psbt({ network: BITCOIN_NETWORK });
  for (const utxo of selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: fromScript, value: utxo.value },
    });
  }
  psbt.addOutput({ address: to, value: amountSats });
  const changeSats = inputSum - amountSats - estFeeSats;
  if (changeSats > 546) { // seuil de poussière standard, en dessous le réseau rejette la sortie
    psbt.addOutput({ address: fromAddress, value: changeSats });
  }

  const signer = {
    publicKey: Buffer.from(keyPair.publicKey),
    sign: (hash) => Buffer.from(keyPair.sign(hash)),
  };
  selected.forEach((_, i) => psbt.signInput(i, signer));
  psbt.finalizeAllInputs();

  return { rawTx: psbt.extractTransaction().toHex() };
}

module.exports = {
  NETWORKS,
  ERC20_TOKENS,
  NATIVE_PLACEHOLDER,
  getNetworkConfig,
  getProvider,
  createLocalWallet,
  importLocalWallet,
  walletFromPrivateKey,
  encryptWalletKeystore,
  decryptWalletKeystore,
  getNativeBalance,
  getErc20Balance,
  getSolanaAddress,
  isValidSolanaAddress,
  getSolanaBalance,
  signSolanaTransferTx,
  getSolanaValidators,
  getSolanaStakeAccountsInfo,
  createAndDelegateStake,
  deactivateStake,
  withdrawStake,
  getBitcoinAddress,
  isValidBitcoinAddress,
  getBitcoinBalance,
  signBitcoinTransferTx,
  getCustomTokenInfo,
  estimateSendFee,
  signNativeTx,
  signErc20Tx,
  signNftTransferTx,
  signRawTx,
  signApproveTx,
  waitForTx,
};
