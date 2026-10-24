// wallet-final/lib/designTokens.js
// ─────────────────────────────────────────────────────────────────
//  PHASE 1 — premiers tokens de design partagés (aperçu uniquement).
//
//  Objectif modeste et explicite : arrêter d'écrire les mêmes couleurs
//  de plusieurs façons différentes dans la page d'accueil. Le blanc,
//  par exemple, n'est écrit qu'UNE seule fois ici (white: '#FFFFFF') ;
//  la page d'accueil doit passer par DESIGN_TOKENS.white au lieu de
//  '#fff', '#FFF', '#FFFFFF' ou '#ffffff' en dur.
//
//  Périmètre Phase 1 : ces tokens ne couvrent QUE la page d'accueil
//  publique (palette claire). Ils ne remplacent pas les thèmes
//  DARK_THEME / LIGHT_THEME de App.js, qui restent inchangés, et ne
//  prétendent pas être un design system complet — c'est le travail
//  de la Phase 2. Aucune couleur n'est inventée ici : les valeurs
//  reprennent exactement la palette claire déjà utilisée par la
//  landing (objet `L` dans App.js).
// ─────────────────────────────────────────────────────────────────

'use strict';

const DESIGN_TOKENS = {
  // Couleurs — page d'accueil publique, palette claire.
  white: '#FFFFFF',
  ink: '#0B1215',
  soft: '#5B6672',
  accent: '#10B981',
  accentInk: '#062219',
  chip: '#F2F5F7',
  border: '#E4E9EC',
  warningBg: '#FFF7ED',
  warningText: '#9A6B2E',

  // Rayons et tailles utilisés par les zones touchées en Phase 1.
  radiusCard: 14,
  radiusButton: 16,
  fontTitle: 30,
  fontSubtitle: 15,
  fontBody: 13,
  fontSmall: 12,
};

module.exports = { DESIGN_TOKENS };
