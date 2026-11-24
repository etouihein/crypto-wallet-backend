'use strict';
// Deverrouillage Face ID / empreinte : le PIN memorise (dans le coffre du
// telephone) est range PAR COMPTE (adresse). Avant le 24/11/2026 il n'y
// avait qu'un seul PIN memorise pour tout l'appareil : avec plusieurs
// comptes (chacun son PIN), Face ID essayait le PIN d'un AUTRE compte,
// affichait « Code incorrect » et chaque essai comptait comme une erreur
// (delai d'attente apres 3 essais). Ajouter un compte effacait aussi Face ID
// du compte precedent.
//
// Valeur stockee : {"v":2,"pins":{"0xadresse en minuscules":"123456"}}.
// Ancienne valeur (avant ce changement) : le PIN seul, « 123456 ». On ne
// sait pas a quel compte il appartient ; il reste utilise comme avant
// (aucune regression pour un appareil a un seul compte).

const ANCIEN_FORMAT = /^\d{6}$/;
const MAX_COMPTES = 30; // coffre du telephone : valeur courte

const cle = (adresse) => String(adresse || '').trim().toLowerCase();

function lire(valeur) {
  if (typeof valeur !== 'string' || !valeur) return { pins: {}, ancien: null };
  if (ANCIEN_FORMAT.test(valeur)) return { pins: {}, ancien: valeur };
  try {
    const p = JSON.parse(valeur);
    const pins = {};
    if (p && p.v === 2 && p.pins && typeof p.pins === 'object') {
      for (const [a, pin] of Object.entries(p.pins)) {
        if (a && typeof pin === 'string' && ANCIEN_FORMAT.test(pin)) pins[cle(a)] = pin;
      }
    }
    return { pins, ancien: null };
  } catch {
    return { pins: {}, ancien: null };
  }
}

const ecrire = (pins) => (Object.keys(pins).length ? JSON.stringify({ v: 2, pins }) : null);

// PIN memorise pour CE compte, ou null (Face ID non active pour lui).
function pinBiometriquePour(valeur, adresse) {
  const { pins, ancien } = lire(valeur);
  if (!cle(adresse)) return null;
  if (pins[cle(adresse)]) return pins[cle(adresse)];
  return ancien;
}

// Nouvelle valeur a stocker apres activation pour un compte.
function ajouterPinBiometrique(valeur, adresse, pin) {
  if (!cle(adresse) || !ANCIEN_FORMAT.test(String(pin || ''))) return valeur || null;
  const { pins } = lire(valeur);
  delete pins[cle(adresse)];
  const garde = Object.entries(pins).slice(-(MAX_COMPTES - 1));
  return ecrire({ ...Object.fromEntries(garde), [cle(adresse)]: pin });
}

// Nouvelle valeur apres suppression d'un compte (null = plus rien a garder).
function retirerPinBiometrique(valeur, adresse) {
  const { pins, ancien } = lire(valeur);
  if (ancien) return ancien;
  delete pins[cle(adresse)];
  return ecrire(pins);
}

module.exports = { pinBiometriquePour, ajouterPinBiometrique, retirerPinBiometrique };
