// wallet-final/lib/theme.js
// ─────────────────────────────────────────────────────────────────
//  Couleurs, polices et contexte de theme (sortis d'App.js, chantier V3 de
//  decoupage, sans changement). Chaque ecran deplace hors d'App.js importe
//  useTheme d'ici.
// ─────────────────────────────────────────────────────────────────

import { createContext, useContext } from 'react';
import { Platform } from 'react-native';

// ═══════════════════════════════════════════════════════════
//  COULEURS & THÈME
// ═══════════════════════════════════════════════════════════
// Refonte graphique "banque privée" (voir nexiawallet-redesign fourni par
// Pablo) : encre profonde, un seul accent champagne, variations de prix
// désaturées distinctes de l'accent de marque (avant : le même vert servait
// aux deux, ce qui empêchait d'avoir un accent de marque différent du vert
// "hausse" conventionnel). `gold` remplace l'ancien rôle de `green` pour
// tout ce qui est bouton/onglet actif/coche — `up`/`down` sont réservés aux
// variations de prix et au sens des transactions (reçu/envoyé).
export const DARK_THEME = {
  bg:      '#0a0d13',
  card:    '#0f131b',
  card2:   '#151b26',
  border:  '#232b3a',
  borderSoft: '#1a2130',
  // Accent principal (boutons, onglet actif, coches, favoris…) = vert
  // NexiaWallet, aligné sur la landing publique. Nom "gold" conservé pour ne
  // pas toucher aux ~200 références dans les styles.
  gold:    '#10B981',
  goldBg:  'rgba(16, 185, 129, 0.14)',
  goldLine:'rgba(16, 185, 129, 0.38)',
  up:      '#7fb69a',
  upBg:    'rgba(127, 182, 154, 0.12)',
  down:    '#c98a8a',
  
  downBg:  'rgba(201, 138, 138, 0.12)',
  red:     '#c9605f',
  redBg:   'rgba(201, 96, 95, 0.12)',
  blue:    '#5E8CFF',
  blueBg:  '#071430',
  orange:  '#FFAD5A',
  orangeBg:'#312511',
  text:    '#e9ecf2',
  text2:   '#9aa3b5',
  text3:   '#626c80',

  yellow:  '#FFD166',
  purple:  '#8B5CF6',
  // Palette "Nexia" — utilisée uniquement pour la landing page publique
  // (écran d'accueil avant création/import de wallet). Volontairement fixe
  // dans les deux thèmes : effet vitrine dramatique assumé, indépendant du
  // thème clair/sombre choisi pour le reste de l'app.
  deepBg:  '#05030e',
  violet:  '#7c3aed',
  cyan:    '#22d3ee',
  magenta: '#e879f9',
  stroke:  'rgba(139,135,168,0.18)',

  fontDisplay: Platform.select({ web: '"Instrument Serif", Georgia, serif' }),
  fontBody:    Platform.select({ web: '"Manrope", -apple-system, "Segoe UI", sans-serif' }),
  fontMono:    Platform.select({ web: '"IBM Plex Mono", "SF Mono", Consolas, monospace', default: 'monospace' }),
};

// Thème clair "banque privée" : même accent champagne (assombri pour rester
// lisible sur fond clair) et mêmes rôles sémantiques (up/down/red/blue/
// orange assombris pour le contraste), fond papier chaud plutôt que blanc pur.
export const LIGHT_THEME = {
  bg:      '#f6f6f8',
  card:    '#ffffff',
  card2:   '#f0f1f4',
  border:  '#e7e8ec',
  borderSoft: '#eff0f3',
  // Accent principal = vert NexiaWallet, aligné sur la landing (voir DARK_THEME).
  gold:    '#10B981',
  goldBg:  'rgba(16, 185, 129, 0.12)',
  goldLine:'rgba(16, 185, 129, 0.38)',
  up:      '#4d8f6e',
  upBg:    'rgba(77, 143, 110, 0.12)',
  down:    '#b5605f',
  downBg:  'rgba(181, 96, 95, 0.12)',
  red:     '#b23b3a',
  redBg:   'rgba(178, 59, 58, 0.10)',
  blue:    '#3b6fe0',
  blueBg:  '#eaf1ff',
  orange:  '#c9791f',
  orangeBg:'#fdf1e2',
  text:    '#1c2129',
  text2:   '#5b6472',
  text3:   '#8b93a1',

  yellow:  '#b8860b',
  purple:  '#6d3fd1',
  // Palette "Nexia" (landing) — identique au thème sombre, voir commentaire
  // au-dessus de DARK_THEME.
  deepBg:  '#05030e',
  violet:  '#7c3aed',
  cyan:    '#22d3ee',
  magenta: '#e879f9',
  stroke:  'rgba(139,135,168,0.18)',

  fontDisplay: Platform.select({ web: '"Instrument Serif", Georgia, serif' }),
  fontBody:    Platform.select({ web: '"Manrope", -apple-system, "Segoe UI", sans-serif' }),
  fontMono:    Platform.select({ web: '"IBM Plex Mono", "SF Mono", Consolas, monospace', default: 'monospace' }),
};

// Contexte thème : fournit { T, st, cs } déjà résolus pour le thème actif à
// tout composant de ce fichier, y compris ceux déclarés hors du composant
// App (CandlestickChart, ToastBanner, etc.) qui n'ont pas accès à l'état
// React local de App. `st`/`cs` (StyleSheet.create) sont recalculés une
// seule fois par changement de thème (useMemo côté App), pas à chaque rendu.
export const ThemeContext = createContext({ T: DARK_THEME, st: null, cs: null });
export const useTheme = () => useContext(ThemeContext);
