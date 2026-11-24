'use strict';

// Journal du serveur sans secret ni donnee personnelle (audit de securite
// total, 24/11/2026).
//
// Avant : les routes ecrivaient l'objet d'erreur ENTIER dans le journal
// Railway (console.error('...', error)). Une erreur d'ethers v5 contient
// l'adresse complete du noeud, par exemple
//   url="https://base-mainnet.g.alchemy.com/v2/<CLE ALCHEMY>"
// -> la cle API se retrouvait en clair dans les journaux, lisibles par toute
// personne ayant acces au tableau de bord Railway ou a un export de logs.
// Le webhook MoonPay y ecrivait aussi l'adresse du wallet et le montant
// de chaque achat.
//
// erreurPourJournal(error) ne garde que le message (et le code), avec les
// secrets masques : chemin /v2/<cle> et /v3/<cle>, parametres api-key /
// apikey / key / token / access_token, identifiants dans l'URL.

function masquerSecrets(texte) {
  return String(texte == null ? '' : texte)
    .replace(/(\/v[0-9]\/)[A-Za-z0-9_-]{12,}/g, '$1***')
    .replace(/([?&](?:api[_-]?key|apikey|key|token|access[_-]?token|auth)=)[^&\s"'<>]+/gi, '$1***')
    .replace(/(https?:\/\/)[^\s"'@/]+@/gi, '$1***@')
    .slice(0, 500);
}

function erreurPourJournal(error) {
  if (error == null) return '';
  if (typeof error !== 'object') return masquerSecrets(error);
  const code = error.code ? ` [${masquerSecrets(error.code)}]` : '';
  return `${masquerSecrets(error.message || String(error))}${code}`;
}

module.exports = { masquerSecrets, erreurPourJournal };
