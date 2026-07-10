// wallet-final/lib/i18n.js
// ─────────────────────────────────────────────────────────────────
//  i18n minimal, sans dépendance externe : un dictionnaire par langue et une
//  fonction t(key, vars). Portée volontairement limitée à l'UI qu'on voit au
//  quotidien (navigation, accueil, paramètres, envoi/réception/achat/swap,
//  écrans PIN) — les pages légales (CGU/Confidentialité/Mentions) et la FAQ
//  restent en français uniquement : ce sont de gros blocs de texte qui
//  mériteraient une vraie relecture humaine avant d'exister en anglais,
//  pas juste une traduction mot à mot.
//
//  Le français reste la langue de référence : une clé absente de `en`
//  retombe sur `fr`, et une clé absente des deux renvoie la clé elle-même
//  (jamais un écran vide ou un crash pour une chaîne oubliée).
// ─────────────────────────────────────────────────────────────────

'use strict';

const fr = {
  nav_home: 'Accueil',
  nav_market: 'Marché',
  nav_stats: 'Stats',
  nav_swap: 'Swap',
  nav_settings: 'Paramètres',

  home_total_balance: 'SOLDE TOTAL',
  home_my_tokens: 'MES TOKENS',
  home_activity: 'Activité',
  home_no_favorites_title: 'Épingle tes cryptos préférées',
  home_no_favorites_sub: "Va dans Marché et appuie sur l'étoile pour les retrouver ici.",

  action_send: 'Envoyer',
  action_buy: 'Acheter',
  action_receive: 'Recevoir',
  action_swap: 'Échanger',

  common_cancel: 'Annuler',
  common_confirm: 'Confirmer',
  common_next: 'Suivant',
  common_back: 'Retour',
  common_close: 'Fermer',
  common_save: 'Enregistrer',
  common_ok: 'OK',
  common_delete: 'Supprimer',
  common_edit: 'Modifier',
  common_loading: 'Chargement...',

  settings_title: 'Paramètres',
  settings_currency: 'Devise',
  settings_network: 'Réseau',
  settings_tokens: 'Tokens',
  settings_accounts: 'Comptes',
  settings_walletconnect: 'WalletConnect',
  settings_security: 'Sécurité',
  settings_quick_actions: "Actions rapides de l'accueil",
  settings_notifications: 'Notifications',
  settings_info: 'Info',
  settings_language: 'Langue',
  settings_logout: 'Déconnexion',
  settings_logout_sub: 'Efface le wallet de cet appareil',
  settings_show_mnemonic: 'Afficher ma phrase de récupération',
  settings_add_account: 'Ajouter un compte',
  settings_connect_dapp: 'Connecter une dApp',
  settings_sounds_vibrations: 'Sons et vibrations',
  settings_share_app: 'Partager NexiaWallet',
  settings_export_data: 'Exporter mes données',
  settings_import_data: 'Importer mes données',

  send_title: 'Envoyer',
  send_recipient: 'Destinataire',
  send_amount: 'Montant',
  send_max: 'MAX',
  send_confirm: "Confirmer l'envoi",
  receive_title: 'Recevoir',
  buy_title: 'Acheter',
  swap_title: 'Échanger',

  pin_choose_title: 'Choisis un code PIN à 6 chiffres',
  pin_confirm_title: 'Ressaisis le même code pour confirmer',
  pin_wrong: 'Code incorrect',

  onboarding_create: 'Créer mon wallet',
  onboarding_import: "J'ai déjà un wallet",
};

const en = {
  nav_home: 'Home',
  nav_market: 'Market',
  nav_stats: 'Stats',
  nav_swap: 'Swap',
  nav_settings: 'Settings',

  home_total_balance: 'TOTAL BALANCE',
  home_my_tokens: 'MY TOKENS',
  home_activity: 'Activity',
  home_no_favorites_title: 'Pin your favorite cryptos',
  home_no_favorites_sub: 'Go to Market and tap the star to find them here.',

  action_send: 'Send',
  action_buy: 'Buy',
  action_receive: 'Receive',
  action_swap: 'Swap',

  common_cancel: 'Cancel',
  common_confirm: 'Confirm',
  common_next: 'Next',
  common_back: 'Back',
  common_close: 'Close',
  common_save: 'Save',
  common_ok: 'OK',
  common_delete: 'Delete',
  common_edit: 'Edit',
  common_loading: 'Loading...',

  settings_title: 'Settings',
  settings_currency: 'Currency',
  settings_network: 'Network',
  settings_tokens: 'Tokens',
  settings_accounts: 'Accounts',
  settings_walletconnect: 'WalletConnect',
  settings_security: 'Security',
  settings_quick_actions: 'Home quick actions',
  settings_notifications: 'Notifications',
  settings_info: 'Info',
  settings_language: 'Language',
  settings_logout: 'Log out',
  settings_logout_sub: 'Erases the wallet from this device',
  settings_show_mnemonic: 'Show my recovery phrase',
  settings_add_account: 'Add an account',
  settings_connect_dapp: 'Connect a dApp',
  settings_sounds_vibrations: 'Sounds and vibrations',
  settings_share_app: 'Share NexiaWallet',
  settings_export_data: 'Export my data',
  settings_import_data: 'Import my data',

  send_title: 'Send',
  send_recipient: 'Recipient',
  send_amount: 'Amount',
  send_max: 'MAX',
  send_confirm: 'Confirm send',
  receive_title: 'Receive',
  buy_title: 'Buy',
  swap_title: 'Swap',

  pin_choose_title: 'Choose a 6-digit PIN code',
  pin_confirm_title: 'Enter the same code again to confirm',
  pin_wrong: 'Wrong code',

  onboarding_create: 'Create a wallet',
  onboarding_import: 'I already have a wallet',
};

const DICTIONARIES = { fr, en };

function translate(locale, key, vars) {
  const dict = DICTIONARIES[locale] || DICTIONARIES.fr;
  let text = dict[key] ?? DICTIONARIES.fr[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, 'g'), v);
    }
  }
  return text;
}

const SUPPORTED_LOCALES = ['fr', 'en'];

module.exports = { translate, SUPPORTED_LOCALES };
