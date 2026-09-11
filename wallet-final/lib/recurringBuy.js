// wallet-final/lib/recurringBuy.js
// ─────────────────────────────────────────────────────────────────
//  "Achat récurrent" (DCA) — MoonPay ne permet pas de déclencher un achat
//  automatiquement en arrière-plan sans que l'utilisateur repasse par le
//  widget (carte bancaire, conformité) : ce n'est PAS une vraie automatisation
//  côté serveur. On implémente donc un rappel local (notification planifiée
//  sur l'appareil) qui rouvre l'écran Acheter pré-rempli au bon moment —
//  l'utilisateur valide toujours lui-même le paiement, comme pour un achat
//  normal. Honnête : "achat récurrent" = rappel récurrent, pas prélèvement
//  automatique.
// ─────────────────────────────────────────────────────────────────

'use strict';

const AsyncStorage = require('@react-native-async-storage/async-storage').default;
const Notifications = require('expo-notifications');

const CONFIG_KEY = 'wallet-pro-recurring-buy-v1';
const NOTIFICATION_ID_KEY = 'wallet-pro-recurring-buy-notif-id-v1';

const FREQUENCY_SECONDS = {
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
};

async function getConfig() {
  try {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null; // { enabled, amountUsd, token, frequency }
  } catch { return null; }
}

async function saveConfig(config) {
  try { await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch { /* rien à faire */ }
}

async function cancelReminder() {
  try {
    const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
  } catch { /* pas grave si déjà annulée/inexistante */ }
  await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
}

// Planifie (ou replanifie) le rappel local. Retourne l'id de notification,
// ou null si la permission a été refusée / non disponible sur cette plateforme.
async function scheduleReminder({ amountUsd, token, frequency }) {
  await cancelReminder();
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  const seconds = FREQUENCY_SECONDS[frequency] || FREQUENCY_SECONDS.weekly;
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '💰 Achat récurrent NexiaWallet',
      body: `C'est le moment de ton achat de ${amountUsd}€ en ${token} — appuie pour valider.`,
      data: { type: 'recurring-buy', amountUsd, token },
    },
    trigger: { seconds, repeats: true },
  });
  await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
  return id;
}

module.exports = { getConfig, saveConfig, scheduleReminder, cancelReminder, FREQUENCY_SECONDS };
