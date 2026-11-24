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
  // Phase 6 (audit M2) : transfer() décodé pour que la modale WalletConnect
  // / dApp affiche "Tu envoies X TOKEN à 0x…" au lieu de "0 ETH" + hex brut.
  '0xa9059cbb': { name: 'transfer', abi: 'function transfer(address to, uint256 amount)' },
  '0x095ea7b3': { name: 'approve', abi: 'function approve(address spender, uint256 amount)' },
  '0x39509351': { name: 'increaseAllowance', abi: 'function increaseAllowance(address spender, uint256 addedValue)' },
  '0xa22cb465': { name: 'setApprovalForAll', abi: 'function setApprovalForAll(address operator, bool approved)' },
  '0x23b872dd': { name: 'transferFrom', abi: 'function transferFrom(address from, address to, uint256 amount)' },
  '0x42842e0e': { name: 'safeTransferFrom', abi: 'function safeTransferFrom(address from, address to, uint256 tokenId)' },
};

// Beaucoup de dApps utilisent 2^256-1 exact OU une valeur "quasi infinie"
// arrondie (ex. 2^255) comme approbation "illimitée" — on détecte large.
const UNLIMITED_THRESHOLD = ethers.BigNumber.from(2).pow(200);

// Décode un appel connu (transfer/approve/increaseAllowance/
// setApprovalForAll/transferFrom/safeTransferFrom) à partir du calldata
// brut, ou null si le sélecteur n'est pas reconnu / le calldata est
// malformé. Exporté pour être réutilisé ailleurs (ex: enregistrement des
// approbations, voir lib/approvals.js et son point d'appel dans App.js,
// et affichage des transferts dans les modales WC/dApp) sans redupliquer
// la table de sélecteurs.
function decodeKnownCall(data) {
  // L'hexadecimal ne tient pas compte de la casse : "0x095EA7B3..." est
  // signe exactement comme "0x095ea7b3..." (approve). Sans cette mise en
  // minuscules, une dApp pouvait ecrire son calldata en MAJUSCULES pour
  // echapper a l'alerte "approbation illimitee" (et au suivi des
  // autorisations), alors que la transaction signee restait la meme.
  if (typeof data !== 'string') return null;
  data = data.toLowerCase();
  const selector = data.slice(0, 10);
  const known = data.length >= 10 ? KNOWN_SELECTORS[selector] : null;
  if (!known) return null;
  try {
    return { name: known.name, args: new ethers.utils.Interface([known.abi]).decodeFunctionData(known.name, data) };
  } catch {
    return null;
  }
}

// Adresse du contrat Permit2 d'Uniswap — identique sur la quasi-totalité des
// chaînes EVM (déploiement déterministe CREATE2), utile pour reconnaître une
// demande de signature Permit2 quel que soit le réseau.
// Attention : 42 caracteres exactement (0x + 40). Une version precedente
// avait perdu le "3" final, ce qui empechait de reconnaitre Permit2 (les
// signatures Permit2 n'etaient alors signalees qu'en risque "moyen").
const PERMIT2_ADDRESS = '0x000000000022d473030f116ddee9f6b43ac78ba3';

// Une signature "Permit" (EIP-2612) ou "Permit2" coûte 0 gas et ne déclenche
// AUCUNE transaction on-chain visible au moment de signer — c'est exactement
// ce qui la rend dangereuse : un site de phishing ("vérifier son wallet",
// "réclamer un airdrop") la fait passer pour un geste anodin alors qu'elle
// autorise en réalité un tiers à dépenser les tokens de la victime, sans le
// moindre avertissement de type "transaction" pour l'alerter. Contrairement à
// eth_sendTransaction (voir simulateTransaction ci-dessus), rien ne
// détectait ce risque avant : la modale de confirmation se contentait
// d'afficher le JSON brut de la donnée typée.
function analyzeTypedData(rawTypedData) {
  try {
    const typedData = typeof rawTypedData === 'string' ? JSON.parse(rawTypedData) : rawTypedData;
    const domain = typedData?.domain || {};
    const message = typedData?.message || {};
    const primaryType = typedData?.primaryType || '';
    const verifyingContract = (domain.verifyingContract || '').toLowerCase();
    const contractLabel = domain.name ? `"${domain.name}"` : (verifyingContract || 'ce contrat');

    // Deux formes de "Permit" : EIP-2612 (champ "value" = montant) et celle
    // du DAI et de ses copies (champ "allowed": true = autorisation
    // ILLIMITEE, sans montant). Les deux donnent les tokens au "spender".
    const permitDaiStyle = message.allowed === true || message.allowed === 'true';
    if (primaryType === 'Permit' && message.spender && (message.value !== undefined || permitDaiStyle)) {
      return {
        risk: 'high',
        warnings: [`Autorise ${message.spender} à dépenser tes tokens de ${contractLabel} — AUCUNE transaction on-chain ne confirmera ceci, c'est une simple signature. N'accepte que si tu as toi-même initié cette action sur un site de confiance.`],
      };
    }
    if (verifyingContract === PERMIT2_ADDRESS) {
      const spender = message.spender || message.details?.spender || 'un tiers';
      return {
        risk: 'high',
        warnings: [`Signature Permit2 : autorise ${spender} à dépenser tes tokens sans transaction visible sur la blockchain. N'accepte que si tu as toi-même initié cette action sur un site de confiance.`],
      };
    }
    // Ordres de place de marche (24/11/2026, audit de securite total). Une
    // fois signe, un ordre peut etre execute par N'IMPORTE QUI, sans autre
    // confirmation : c'est le vecteur des arnaques NFT les plus courantes
    // (faux "login" OpenSea qui fait signer la mise en vente de tes NFT pour
    // presque rien). Avant, ces signatures etaient affichees sans aucune alerte.
    const seaport = Array.isArray(message.offer) && Array.isArray(message.consideration);
    const placeNft = seaport || primaryType === 'OrderComponents' || primaryType === 'BulkOrder' || /seaport|blur|looksrare|x2y2|opensea|magic ?eden/i.test(domain.name || '');
    if (placeNft) {
      const offerer = String(message.offerer || message.trader || message.signer || '').toLowerCase();
      const offre = Array.isArray(message.offer) ? message.offer.length : null;
      const pourToi = Array.isArray(message.consideration)
        ? message.consideration.filter((c) => offerer && String(c?.recipient || '').toLowerCase() === offerer).length
        : null;
      const quoi = offre === null ? 'des objets' : `${offre} objet(s)`;
      const recu = pourToi === null ? '' : (pourToi === 0 ? ' SANS RIEN recevoir en échange' : ` contre ${pourToi} paiement(s) pour toi`);
      return {
        risk: 'high',
        warnings: [`Signature d'un ORDRE de place de marché NFT (${domain.name || primaryType || 'inconnu'}) : tu proposes ${quoi}${recu}. Une fois signé, n'importe qui peut exécuter cet ordre, sans autre confirmation de ta part. C'est la signature utilisée par les arnaques NFT les plus courantes : refuse si tu n'as pas toi-même mis un objet en vente ou fait une offre sur ce site.`],
      };
    }
    if (/^(Order|MakerOrder|Maker|LimitOrder|RFQOrder)$/.test(primaryType)) {
      return {
        risk: 'medium',
        warnings: [`Signature d'un ordre ("${primaryType}") : une fois signé, il peut être exécuté sans autre confirmation de ta part. Vérifie que tu es bien sur le site que tu voulais utiliser et que le montant te convient.`],
      };
    }
    if (/permit/i.test(primaryType)) {
      return {
        risk: 'medium',
        warnings: [`Cette signature ("${primaryType}") ressemble à une autorisation de dépense de tokens. Vérifie que tu es bien sur le site que tu voulais utiliser avant de continuer.`],
      };
    }
    return { risk: 'none', warnings: [] };
  } catch {
    return { risk: 'none', warnings: [] };
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
  if (known && known.name === 'transfer') {
    warnings.push('Transfert de token : le destinataire et le montant décodés sont affichés dans la modale — vérifie-les avant de signer.');
    if (risk === 'none') risk = 'medium';
  }
  if (known && (known.name === 'transferFrom' || known.name === 'safeTransferFrom')) {
    warnings.push('Déplace des fonds/NFT depuis une adresse déjà autorisée (normal pour un swap/marketplace connu, à vérifier sinon).');
    if (risk === 'none') risk = 'medium';
  }
  // Un appel de token (transfer, approve...) n'a JAMAIS besoin de recevoir
  // de la monnaie du réseau (ETH, BNB, POL...). Si la demande en joint
  // quand même, c'est le piège classique : l'écran parle d'un petit
  // transfert de token pendant que la transaction vide le solde ETH vers le
  // contrat du site. Toujours signalé en risque ÉLEVÉ, montant en clair.
  if (known) {
    let nativeValue = null;
    try { nativeValue = value ? ethers.BigNumber.from(value) : null; } catch { nativeValue = null; }
    if (nativeValue && !nativeValue.isZero()) {
      risk = 'high';
      warnings.push(`En plus de l'appel "${known.name}", cette transaction ENVOIE ${ethers.utils.formatEther(nativeValue)} en monnaie du réseau (ETH, BNB, POL…) au contrat ${to}. Un appel de token n'en a jamais besoin : refuse si tu ne l'as pas voulu.`);
    }
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

  // Phase 6 (audit M2) : pour un transfer(), exposer le destinataire et
  // le montant brut décodés, afin que la modale WC/dApp les affiche au
  // lieu de "0 ETH". Montant BRUT (unités du token, décimales inconnues
  // ici) — l'UI le dit explicitement, pour ne pas inventer une valeur.
  const decodedTransfer = known && known.name === 'transfer'
    ? { to: known.args[0], amount: known.args[1]?.toString?.() ?? String(known.args[1]) }
    : null;
  return { risk, warnings, willLikelyRevert, revertReason, decodedMethod: known?.name || null, decodedTransfer };
}

module.exports = { simulateTransaction, decodeKnownCall, analyzeTypedData };
