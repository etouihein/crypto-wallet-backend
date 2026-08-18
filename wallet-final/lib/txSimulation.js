// wallet-final/lib/txSimulation.js
// ─────────────────────────────────────────────────────────────────
//  Analyse une transaction AVANT signature (approbations dangereuses,
//  transaction qui va probablement échouer) pour l'afficher dans les
//  écrans de confirmation WalletConnect / navigateur dApp. Ne dépend
//  d'aucun service tiers payant : décodage local du calldata (sélecteurs
//  ERC20/ERC721/ERC1155 connus) + une estimation de gas réelle via le RPC
//  déjà configuré (getProvider dans wallet.js) pour détecter les reverts
//  probables — pas une vraie simulation Tenderly/Blowfish, mais gratuite,
//  sans clé API, et couvre les deux risques les plus courants.
// ─────────────────────────────────────────────────────────────────

'use strict';

const { ethers } = require('ethers');
const { getProvider } = require('./wallet');

const KNOWN_SELECTORS = {
  '0x095ea7b3': { name: 'approve', abi: 'function approve(address spender, uint256 amount)' },
  '0x39509351': { name: 'increaseAllowance', abi: 'function increaseAllowance(address spender, uint256 addedValue)' },
  '0xa22cb465': { name: 'setApprovalForAll', abi: 'function setApprovalForAll(address operator, bool approved)' },
  '0x23b872dd': { name: 'transferFrom', abi: 'function transferFrom(address from, address to, uint256 amount)' },
  '0x42842e0e': { name: 'safeTransferFrom', abi: 'function safeTransferFrom(address from, address to, uint256 tokenId)' },
};

// Beaucoup de dApps utilisent 2^256-1 exact OU une valeur "quasi infinie"
// arrondie (ex. 2^255) comme approbation "illimitée" — on détecte large.
const UNLIMITED_THRESHOLD = ethers.BigNumber.from(2).pow(200);

// Décode un appel connu (approve/increaseAllowance/setApprovalForAll/
// transferFrom/safeTransferFrom) à partir du calldata brut, ou null si le
// sélecteur n'est pas reconnu / le calldata est malformé. Exporté pour être
// réutilisé ailleurs (ex: enregistrement des approbations, voir lib/approvals.js
// et son point d'appel dans App.js) sans redupliquer la table de sélecteurs.
function decodeKnownCall(data) {
  const selector = (data || '0x').slice(0, 10);
  const known = data && data.length >= 10 ? KNOWN_SELECTORS[selector] : null;
  if (!known) return null;
  try {
    return { name: known.name, args: new ethers.utils.Interface([known.abi]).decodeFunctionData(known.name, data) };
  } catch {
    return null;
  }
}

function extractRevertReason(err) {
  return err?.reason
    || err?.error?.reason
    || (typeof err?.message === 'string' ? err.message.split('\n')[0].slice(0, 200) : null);
}

// { risk: 'none'|'medium'|'high', warnings: string[], willLikelyRevert, revertReason, decodedMethod }
async function simulateTransaction({ to, data, value, network = 'ethereum' }) {
  const warnings = [];
  let risk = 'none';

  const known = decodeKnownCall(data);

  if (known && (known.name === 'approve' || known.name === 'increaseAllowance')) {
    const amount = known.args[1];
    if (amount && ethers.BigNumber.from(amount).gte(UNLIMITED_THRESHOLD)) {
      risk = 'high';
      warnings.push("Autorise un accès QUASI-ILLIMITÉ à ce token à ce contrat. N'accepte que si tu fais confiance à ce site.");
    }
  }
  if (known && known.name === 'setApprovalForAll' && known.args[1] === true) {
    risk = 'high';
    warnings.push('Donne le contrôle de TOUS tes NFT de cette collection à un tiers.');
  }
  if (known && (known.name === 'transferFrom' || known.name === 'safeTransferFrom')) {
    warnings.push('Déplace des fonds/NFT depuis une adresse déjà autorisée (normal pour un swap/marketplace connu, à vérifier sinon).');
    if (risk === 'none') risk = 'medium';
  }

  let willLikelyRevert = false;
  let revertReason = null;
  try {
    await getProvider(network).estimateGas({
      to,
      data: data || '0x',
      value: value ? ethers.BigNumber.from(value) : undefined,
    });
  } catch (err) {
    willLikelyRevert = true;
    revertReason = extractRevertReason(err);
    warnings.push(`Cette transaction va probablement échouer${revertReason ? ` : ${revertReason}` : ''}.`);
    if (risk === 'none') risk = 'medium';
  }

  return { risk, warnings, willLikelyRevert, revertReason, decodedMethod: known?.name || null };
}

module.exports = { simulateTransaction, decodeKnownCall };
