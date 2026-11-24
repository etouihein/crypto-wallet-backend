'use strict';
// Frein contre les essais de code PIN au hasard, partage par TOUS les
// endroits ou l'on tape le PIN : deverrouillage, "Afficher la phrase" et
// export du keystore. Avant le 24/11/2026, seul l'ecran de deverrouillage
// comptait les erreurs : sur un telephone laisse deverrouille, on pouvait
// essayer des PIN sans fin dans "Afficher la phrase" et repartir avec la
// phrase de recuperation (acces au wallet pour toujours).
//
// Les 2 premieres erreurs restent instantanees (faute de frappe), puis
// 5 s, 10 s, 20 s, 40 s, et 60 s au maximum.

function delaiApresEchecs(nombre) {
  const n = Number(nombre) || 0;
  if (n < 3) return 0;
  return Math.min(5000 * (2 ** (n - 3)), 60000);
}

// Message a afficher si l'on doit encore attendre, sinon null.
function messageAttentePin(bloqueJusqua, maintenant = Date.now()) {
  const reste = (Number(bloqueJusqua) || 0) - maintenant;
  if (reste <= 0) return null;
  return `Trop d'essais — réessaie dans ${Math.ceil(reste / 1000)}s.`;
}

module.exports = { delaiApresEchecs, messageAttentePin };
