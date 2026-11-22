'use strict';
// wallet-final/test/recurringBuy.test.js
// ─────────────────────────────────────────────────────────────────
//  Rappel "Achat recurrent" (lib/recurringBuy.js) : planification de la
//  notification locale, annulation, refus de permission, stockage.
//  AsyncStorage et expo-notifications sont remplaces par des faux en Node.
//
//  Le faux scheduleNotificationAsync applique la MEME regle que
//  expo-notifications 0.32 (SDK 54) : un declencheur sans "type" est
//  refuse (TypeError "It needs to contain a `type` or `channelId`"), et
//  seul { type: 'timeInterval', seconds: <nombre> } donne un rappel
//  periodique.
//
//  USAGE : npm run test:lib
// ─────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');

const memoire = new Map();
const fauxStockage = {
  getItem: async (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: async (k, v) => { memoire.set(k, String(v)); },
  removeItem: async (k) => { memoire.delete(k); },
};

const planifiees = new Map();
const etat = { permission: 'granted', compteur: 0, annulees: [] };
const fauxNotifications = {
  requestPermissionsAsync: async () => ({ status: etat.permission }),
  scheduleNotificationAsync: async ({ content, trigger }) => {
    // Regle reprise de expo-notifications/build/scheduleNotificationAsync.js
    if (trigger === undefined) throw new TypeError('Encountered an `undefined` notification trigger.');
    if (trigger !== null && !(typeof trigger === 'object' && ('type' in trigger || 'channelId' in trigger))) {
      throw new TypeError('The `trigger` object you provided is invalid. It needs to contain a `type` or `channelId` entry.');
    }
    etat.compteur += 1;
    const id = `notif-${etat.compteur}`;
    planifiees.set(id, { content, trigger });
    return id;
  },
  cancelScheduledNotificationAsync: async (id) => { etat.annulees.push(id); planifiees.delete(id); },
};

function remplacerModule(nom, exportsFaux) {
  const chemin = require.resolve(nom);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports: exportsFaux };
}
remplacerModule('@react-native-async-storage/async-storage', { __esModule: true, default: fauxStockage });
remplacerModule('expo-notifications', fauxNotifications);

const recurringBuy = require('../lib/recurringBuy');

const CLE_ID = 'wallet-pro-recurring-buy-notif-id-v1';

function remiseAZero() {
  memoire.clear();
  planifiees.clear();
  etat.permission = 'granted';
  etat.compteur = 0;
  etat.annulees = [];
}

test('scheduleReminder planifie un rappel periodique accepte par expo-notifications', async () => {
  remiseAZero();
  const id = await recurringBuy.scheduleReminder({ amountUsd: 50, token: 'ETH', frequency: 'weekly' });
  assert.equal(id, 'notif-1');
  const { trigger, content } = planifiees.get(id);
  assert.equal(trigger.type, 'timeInterval');
  assert.equal(trigger.seconds, 7 * 24 * 60 * 60);
  assert.equal(trigger.repeats, true);
  assert.match(content.body, /50€ en ETH/);
  assert.deepEqual(content.data, { type: 'recurring-buy', amountUsd: 50, token: 'ETH' });
  assert.equal(memoire.get(CLE_ID), 'notif-1');
});

test('frequence mensuelle = 30 jours ; frequence inconnue = hebdomadaire', async () => {
  remiseAZero();
  const mensuel = await recurringBuy.scheduleReminder({ amountUsd: 20, token: 'BTC', frequency: 'monthly' });
  assert.equal(planifiees.get(mensuel).trigger.seconds, 30 * 24 * 60 * 60);
  const inconnu = await recurringBuy.scheduleReminder({ amountUsd: 20, token: 'BTC', frequency: 'daily' });
  assert.equal(planifiees.get(inconnu).trigger.seconds, 7 * 24 * 60 * 60);
});

test('replanifier annule l ancien rappel (pas de doublon)', async () => {
  remiseAZero();
  const premier = await recurringBuy.scheduleReminder({ amountUsd: 10, token: 'ETH', frequency: 'weekly' });
  const second = await recurringBuy.scheduleReminder({ amountUsd: 15, token: 'ETH', frequency: 'weekly' });
  assert.deepEqual(etat.annulees, [premier]);
  assert.deepEqual([...planifiees.keys()], [second]);
  assert.equal(memoire.get(CLE_ID), second);
});

test('permission refusee : aucun rappel, retourne null', async () => {
  remiseAZero();
  etat.permission = 'denied';
  const id = await recurringBuy.scheduleReminder({ amountUsd: 10, token: 'ETH', frequency: 'weekly' });
  assert.equal(id, null);
  assert.equal(planifiees.size, 0);
  assert.equal(memoire.has(CLE_ID), false);
});

test('cancelReminder supprime le rappel et son id ; sans rappel, ne plante pas', async () => {
  remiseAZero();
  const id = await recurringBuy.scheduleReminder({ amountUsd: 10, token: 'ETH', frequency: 'weekly' });
  await recurringBuy.cancelReminder();
  assert.deepEqual(etat.annulees, [id]);
  assert.equal(memoire.has(CLE_ID), false);
  await recurringBuy.cancelReminder();
  assert.deepEqual(etat.annulees, [id]);
});

test('getConfig / saveConfig : aller-retour, et stockage abime = null', async () => {
  remiseAZero();
  assert.equal(await recurringBuy.getConfig(), null);
  const config = { enabled: true, amountUsd: 25, token: 'SOL', frequency: 'monthly' };
  await recurringBuy.saveConfig(config);
  assert.deepEqual(await recurringBuy.getConfig(), config);
  memoire.set('wallet-pro-recurring-buy-v1', '{pas du json');
  assert.equal(await recurringBuy.getConfig(), null);
});
