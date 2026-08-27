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
  nav_discover: 'Découvrir',
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
  settings_theme: 'Thème',
  settings_theme_dark: 'Sombre',
  settings_theme_light: 'Clair',
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
  nav_discover: 'Discover',
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
  settings_theme: 'Theme',
  settings_theme_dark: 'Dark',
  settings_theme_light: 'Light',
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

const es = {
  nav_home: 'Inicio',
  nav_market: 'Mercado',
  nav_stats: 'Stats',
  nav_discover: 'Descubrir',
  nav_swap: 'Swap',
  nav_settings: 'Ajustes',

  home_total_balance: 'SALDO TOTAL',
  home_my_tokens: 'MIS TOKENS',
  home_activity: 'Actividad',
  home_no_favorites_title: 'Fija tus criptos favoritas',
  home_no_favorites_sub: 'Ve a Mercado y toca la estrella para encontrarlas aquí.',

  action_send: 'Enviar',
  action_buy: 'Comprar',
  action_receive: 'Recibir',
  action_swap: 'Cambiar',

  common_cancel: 'Cancelar',
  common_confirm: 'Confirmar',
  common_next: 'Siguiente',
  common_back: 'Atrás',
  common_close: 'Cerrar',
  common_save: 'Guardar',
  common_ok: 'OK',
  common_delete: 'Eliminar',
  common_edit: 'Editar',
  common_loading: 'Cargando...',

  settings_title: 'Ajustes',
  settings_currency: 'Moneda',
  settings_network: 'Red',
  settings_tokens: 'Tokens',
  settings_accounts: 'Cuentas',
  settings_walletconnect: 'WalletConnect',
  settings_security: 'Seguridad',
  settings_quick_actions: 'Accesos rápidos de inicio',
  settings_notifications: 'Notificaciones',
  settings_info: 'Info',
  settings_language: 'Idioma',
  settings_theme: 'Tema',
  settings_theme_dark: 'Oscuro',
  settings_theme_light: 'Claro',
  settings_logout: 'Cerrar sesión',
  settings_logout_sub: 'Borra el wallet de este dispositivo',
  settings_show_mnemonic: 'Mostrar mi frase de recuperación',
  settings_add_account: 'Añadir una cuenta',
  settings_connect_dapp: 'Conectar una dApp',
  settings_sounds_vibrations: 'Sonidos y vibraciones',
  settings_share_app: 'Compartir NexiaWallet',
  settings_export_data: 'Exportar mis datos',
  settings_import_data: 'Importar mis datos',

  send_title: 'Enviar',
  send_recipient: 'Destinatario',
  send_amount: 'Importe',
  send_max: 'MÁX',
  send_confirm: 'Confirmar envío',
  receive_title: 'Recibir',
  buy_title: 'Comprar',
  swap_title: 'Cambiar',

  pin_choose_title: 'Elige un código PIN de 6 dígitos',
  pin_confirm_title: 'Vuelve a introducir el mismo código para confirmar',
  pin_wrong: 'Código incorrecto',

  onboarding_create: 'Crear mi wallet',
  onboarding_import: 'Ya tengo un wallet',
};

const de = {
  nav_home: 'Start',
  nav_market: 'Markt',
  nav_stats: 'Statistik',
  nav_discover: 'Entdecken',
  nav_swap: 'Swap',
  nav_settings: 'Einstellungen',

  home_total_balance: 'GESAMTGUTHABEN',
  home_my_tokens: 'MEINE TOKENS',
  home_activity: 'Aktivität',
  home_no_favorites_title: 'Pinne deine Lieblings-Kryptos an',
  home_no_favorites_sub: 'Geh zu Markt und tippe auf den Stern, um sie hier wiederzufinden.',

  action_send: 'Senden',
  action_buy: 'Kaufen',
  action_receive: 'Empfangen',
  action_swap: 'Tauschen',

  common_cancel: 'Abbrechen',
  common_confirm: 'Bestätigen',
  common_next: 'Weiter',
  common_back: 'Zurück',
  common_close: 'Schließen',
  common_save: 'Speichern',
  common_ok: 'OK',
  common_delete: 'Löschen',
  common_edit: 'Bearbeiten',
  common_loading: 'Lädt...',

  settings_title: 'Einstellungen',
  settings_currency: 'Währung',
  settings_network: 'Netzwerk',
  settings_tokens: 'Tokens',
  settings_accounts: 'Konten',
  settings_walletconnect: 'WalletConnect',
  settings_security: 'Sicherheit',
  settings_quick_actions: 'Schnellzugriffe auf der Startseite',
  settings_notifications: 'Benachrichtigungen',
  settings_info: 'Info',
  settings_language: 'Sprache',
  settings_theme: 'Design',
  settings_theme_dark: 'Dunkel',
  settings_theme_light: 'Hell',
  settings_logout: 'Abmelden',
  settings_logout_sub: 'Löscht das Wallet von diesem Gerät',
  settings_show_mnemonic: 'Meine Wiederherstellungsphrase anzeigen',
  settings_add_account: 'Konto hinzufügen',
  settings_connect_dapp: 'Eine dApp verbinden',
  settings_sounds_vibrations: 'Töne und Vibration',
  settings_share_app: 'NexiaWallet teilen',
  settings_export_data: 'Meine Daten exportieren',
  settings_import_data: 'Meine Daten importieren',

  send_title: 'Senden',
  send_recipient: 'Empfänger',
  send_amount: 'Betrag',
  send_max: 'MAX',
  send_confirm: 'Sendung bestätigen',
  receive_title: 'Empfangen',
  buy_title: 'Kaufen',
  swap_title: 'Tauschen',

  pin_choose_title: 'Wähle einen 6-stelligen PIN-Code',
  pin_confirm_title: 'Gib denselben Code zur Bestätigung erneut ein',
  pin_wrong: 'Falscher Code',

  onboarding_create: 'Wallet erstellen',
  onboarding_import: 'Ich habe bereits ein Wallet',
};

const pt = {
  nav_home: 'Início',
  nav_market: 'Mercado',
  nav_stats: 'Stats',
  nav_discover: 'Descobrir',
  nav_swap: 'Swap',
  nav_settings: 'Config.',

  home_total_balance: 'SALDO TOTAL',
  home_my_tokens: 'MEUS TOKENS',
  home_activity: 'Atividade',
  home_no_favorites_title: 'Fixa as tuas criptos favoritas',
  home_no_favorites_sub: 'Vai a Mercado e toca na estrela para as encontrares aqui.',

  action_send: 'Enviar',
  action_buy: 'Comprar',
  action_receive: 'Receber',
  action_swap: 'Trocar',

  common_cancel: 'Cancelar',
  common_confirm: 'Confirmar',
  common_next: 'Seguinte',
  common_back: 'Voltar',
  common_close: 'Fechar',
  common_save: 'Guardar',
  common_ok: 'OK',
  common_delete: 'Eliminar',
  common_edit: 'Editar',
  common_loading: 'A carregar...',

  settings_title: 'Definições',
  settings_currency: 'Moeda',
  settings_network: 'Rede',
  settings_tokens: 'Tokens',
  settings_accounts: 'Contas',
  settings_walletconnect: 'WalletConnect',
  settings_security: 'Segurança',
  settings_quick_actions: 'Atalhos do início',
  settings_notifications: 'Notificações',
  settings_info: 'Info',
  settings_language: 'Idioma',
  settings_theme: 'Tema',
  settings_theme_dark: 'Escuro',
  settings_theme_light: 'Claro',
  settings_logout: 'Terminar sessão',
  settings_logout_sub: 'Apaga a wallet deste dispositivo',
  settings_show_mnemonic: 'Mostrar a minha frase de recuperação',
  settings_add_account: 'Adicionar uma conta',
  settings_connect_dapp: 'Ligar uma dApp',
  settings_sounds_vibrations: 'Sons e vibrações',
  settings_share_app: 'Partilhar NexiaWallet',
  settings_export_data: 'Exportar os meus dados',
  settings_import_data: 'Importar os meus dados',

  send_title: 'Enviar',
  send_recipient: 'Destinatário',
  send_amount: 'Montante',
  send_max: 'MÁX',
  send_confirm: 'Confirmar envio',
  receive_title: 'Receber',
  buy_title: 'Comprar',
  swap_title: 'Trocar',

  pin_choose_title: 'Escolhe um código PIN de 6 dígitos',
  pin_confirm_title: 'Introduz novamente o mesmo código para confirmar',
  pin_wrong: 'Código incorreto',

  onboarding_create: 'Criar a minha wallet',
  onboarding_import: 'Já tenho uma wallet',
};

const DICTIONARIES = { fr, en, es, de, pt };

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

const SUPPORTED_LOCALES = ['fr', 'en', 'es', 'de', 'pt'];

module.exports = { translate, SUPPORTED_LOCALES };
