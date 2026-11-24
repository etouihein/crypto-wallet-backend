// wallet-final/lib/estimationAchat.js
// Estimation « ≈ X ETH » de l'ecran Acheter. Le montant est saisi en EUROS
// (« Montant (EUR) », Coinbase recoit fiatCurrency=EUR), mais les prix des
// tokens de l'app sont en DOLLARS. Avant le 24/11/2026 l'app divisait des
// euros par un prix en dollars : l'estimation etait fausse d'environ 9 %
// (vu en ligne : 10 € -> « ≈ 0,005978 ETH » au lieu d'environ 0,0065). On
// convertit le prix en euros avant de diviser.

'use strict';

// montantEur : texte ou nombre ; prixUsd : prix du token en dollars ;
// eurParUsd : combien d'euros vaut 1 dollar (ex. 0,9114).
function estimationAchat(montantEur, prixUsd, eurParUsd) {
  const eur = parseFloat(montantEur) || 0;
  const prix = Number(prixUsd) || 0;
  const taux = Number(eurParUsd) || 0;
  if (eur <= 0 || prix <= 0 || taux <= 0) return '0';
  const qty = eur / (prix * taux);
  return qty.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

module.exports = { estimationAchat };
