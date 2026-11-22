'use strict';
// wallet-final/test/i18n.test.js
// ─────────────────────────────────────────────────────────────────
//  Traductions de l'app (lib/i18n.js), testees en Node.
//   - aucune cle utilisee par App.js ne manque (sinon l'ecran afficherait
//     le nom technique de la cle, ex. "send_title") ;
//   - l'anglais couvre toutes les cles du francais (langue de repli) ;
//   - les {{variables}} sont les memes dans toutes les langues ;
//   - repli es/de/pt -> anglais -> francais -> cle ;
//   - une valeur inseree ({{symbol}}...) est affichee telle quelle, meme
//     si elle contient "$" (nom de token choisi par n'importe qui) ;
//   - langue de depart selon l'appareil.
//  Sert aussi de filet pour le chantier V1 (traduction des textes en dur).
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { translate, SUPPORTED_LOCALES, INTL_LOCALE_TAG, detectDeviceLocale, DICTIONARIES } = require('../lib/i18n');

const placeholders = (s) => (String(s).match(/{{\w+}}/g) || []).sort();

// Cles utilisees dans App.js : t('cle') et titleKey/descKey: 'cle' (onboarding).
function clesUtiliseesDansApp() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const cles = new Set();
  for (const m of src.matchAll(/[^\w.]t\(\s*['"]([a-z0-9_]+)['"]/g)) cles.add(m[1]);
  for (const m of src.matchAll(/(?:titleKey|descKey)\s*:\s*['"]([a-z0-9_]+)['"]/g)) cles.add(m[1]);
  return [...cles];
}

test('les 5 langues annoncees ont chacune un dictionnaire et un format de date', () => {
  assert.deepEqual(Object.keys(DICTIONARIES).sort(), [...SUPPORTED_LOCALES].sort());
  for (const l of SUPPORTED_LOCALES) assert.ok(INTL_LOCALE_TAG[l], `format de date manquant pour ${l}`);
});

test('chaque cle utilisee par App.js existe en francais ET en anglais', () => {
  const cles = clesUtiliseesDansApp();
  assert.ok(cles.length > 50, `trop peu de cles trouvees dans App.js (${cles.length}) : le test ne lit plus le bon fichier ?`);
  const manquantesFr = cles.filter((k) => !Object.prototype.hasOwnProperty.call(DICTIONARIES.fr, k));
  const manquantesEn = cles.filter((k) => !Object.prototype.hasOwnProperty.call(DICTIONARIES.en, k));
  assert.deepEqual(manquantesFr, [], 'cles absentes du francais');
  assert.deepEqual(manquantesEn, [], 'cles absentes de l\'anglais');
});

test('l\'anglais (langue de repli) couvre toutes les cles du francais', () => {
  const manquantes = Object.keys(DICTIONARIES.fr).filter((k) => !(k in DICTIONARIES.en));
  assert.deepEqual(manquantes, []);
});

test('aucune langue n\'a de cle inconnue du francais (faute de frappe)', () => {
  for (const l of SUPPORTED_LOCALES) {
    const enTrop = Object.keys(DICTIONARIES[l]).filter((k) => !(k in DICTIONARIES.fr));
    assert.deepEqual(enTrop, [], `cles inconnues en ${l}`);
  }
});

test('toutes les traductions sont des textes non vides', () => {
  for (const l of SUPPORTED_LOCALES) {
    for (const [k, v] of Object.entries(DICTIONARIES[l])) {
      assert.equal(typeof v, 'string', `${l}.${k}`);
      assert.ok(v.trim().length > 0, `${l}.${k} est vide`);
    }
  }
});

test('les {{variables}} sont les memes dans toutes les langues', () => {
  for (const l of SUPPORTED_LOCALES) {
    for (const [k, v] of Object.entries(DICTIONARIES[l])) {
      assert.deepEqual(placeholders(v), placeholders(DICTIONARIES.fr[k]), `${l}.${k}`);
    }
  }
});

test('repli : es/de/pt -> anglais, langue inconnue -> francais, cle inconnue -> la cle', () => {
  // Depuis le 22/11/2026 l'espagnol est complet : on retire une cle le temps du test.
  const cle = 'home_sort_name';
  const gardee = DICTIONARIES.es[cle];
  delete DICTIONARIES.es[cle];
  try {
    assert.equal(translate('es', cle), DICTIONARIES.en[cle]);
  } finally {
    DICTIONARIES.es[cle] = gardee;
  }
  assert.equal(translate('xx', 'nav_home'), DICTIONARIES.fr.nav_home);
  assert.equal(translate(undefined, 'nav_home'), DICTIONARIES.fr.nav_home);
  assert.equal(translate('en', 'cle_qui_n_existe_pas'), 'cle_qui_n_existe_pas');
  assert.equal(translate('fr', 'nav_home'), 'Accueil');
});

test('les variables sont remplacees partout, meme repetees', () => {
  assert.equal(
    translate('fr', 'home_since_date', { date: '19/11' }),
    DICTIONARIES.fr.home_since_date.replace('{{date}}', '19/11'),
  );
  const txt = translate('fr', 'home_daily_mover', { emoji: '🚀', sym: 'ETH', sign: '+', change: '4.2' });
  assert.ok(!/{{/.test(txt), txt);
  assert.match(txt, /ETH/);
  assert.match(txt, /\+4\.2/);
});

test('une valeur contenant "$" est affichee telle quelle (pas de motif de remplacement)', () => {
  // Un nom de token est choisi par son createur : "$&", "$$" ou "$'" ne
  // doivent pas etre interpretes comme des motifs de String.replace.
  for (const symbole of ['$&', '$$MOON', "$'", '$`', '$1']) {
    const txt = translate('fr', 'home_diversification', { pct: '60', symbol: symbole });
    assert.ok(txt.includes(`en ${symbole}.`), `attendu « ${symbole} » dans : ${txt}`);
  }
});

test('langue de depart : francais si l\'appareil est en francais, anglais sinon', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const essayer = (nav) => {
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
    return detectDeviceLocale();
  };
  try {
    assert.equal(essayer({ languages: ['fr-CA', 'en-US'], language: 'en-US' }), 'fr');
    assert.equal(essayer({ languages: ['en-GB'], language: 'en-GB' }), 'en');
    assert.equal(essayer({ language: 'FR-fr' }), 'fr');
    assert.equal(essayer({ language: 'de-DE' }), 'en');
    assert.equal(essayer({ languages: [], language: 'es-ES' }), 'en');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
});

test('une cle ou une langue au nom "piege" (toString, constructor...) renvoie toujours un texte', () => {
  // Avant : la cle etait lue sur le prototype de l'objet, translate()
  // renvoyait une fonction (affichee comme du code) et plantait des qu'on
  // lui passait des variables (text.replace n'existe pas sur une fonction).
  for (const cle of ['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf']) {
    for (const langue of ['fr', 'en', 'de']) {
      assert.equal(translate(langue, cle), cle, `${langue}/${cle}`);
      assert.equal(translate(langue, cle, { n: 1 }), cle, `${langue}/${cle} avec variables`);
    }
  }
  // Langue au nom piege : repli sur le francais comme une langue inconnue.
  const cleFr = Object.keys(DICTIONARIES.fr)[0];
  assert.equal(translate('constructor', cleFr), DICTIONARIES.fr[cleFr]);
  assert.equal(translate('__proto__', cleFr), DICTIONARIES.fr[cleFr]);
});

test('espagnol, allemand et portugais couvrent toutes les cles du francais (rien ne s affiche en anglais)', () => {
  const fr = Object.keys(DICTIONARIES.fr);
  for (const langue of ['es', 'de', 'pt']) {
    const manquantes = fr.filter((k) => !Object.prototype.hasOwnProperty.call(DICTIONARIES[langue], k));
    assert.deepEqual(manquantes, [], `${langue} : ${manquantes.length} texte(s) non traduit(s)`);
  }
});
