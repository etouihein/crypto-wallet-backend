# Rapport de travail — 11 septembre 2026

Session longue, travail autonome sur demande de Pablo ("améliore NexiaWallet
autant que possible, priorité sécurité/fiabilité/qualité/perf/UX jusqu'à
23h"). Ce document récapitule tout ce qui a été fait, vérifié, et ce qui
reste ouvert. Tous les commits cités sont poussés sur `main` et déployés
(Railway pour `crypto-wallet/`, Cloudflare Pages pour `wallet-final/`) sauf
mention contraire.

## 1. Sécurité — priorité absolue, traitée en premier

### 1.1 Faille corrigée : usurpation d'origine dans le navigateur dApp intégré (commit `1c934b1`)

**La plus importante de la session.** Trouvée par un audit de sécurité dédié
(2 passes indépendantes, confiance 9/10, méthodologie détaillée plus bas).

- **Problème** : le pont natif du navigateur dApp intégré (`handleDappMessage`
  dans `wallet-final/App.js`) faisait confiance à un champ `origin` présent
  dans le corps du message qu'une page web envoie elle-même via
  `window.ReactNativeWebView.postMessage` — un pont global appelable par
  N'IMPORTE QUELLE page chargée dans le navigateur, pas seulement par le
  script fournisseur légitime.
- **Impact réel** : une page malveillante ouverte dans le navigateur dApp
  pouvait forger `origin: "https://vraie-dapp-deja-connectee.com"` et (1)
  récupérer silencieusement l'adresse du wallet sans confirmation si
  l'utilisateur avait déjà connecté ce site plus tôt dans la session, ou (2)
  afficher un nom de marque usurpé dans la modale de confirmation d'une
  signature/transaction — risque de phishing ou de signature d'une
  transaction malveillante en pensant approuver un site de confiance.
- **Correction** : l'origine de confiance est maintenant calculée côté natif
  à partir de l'URL réellement suivie par la WebView (`onNavigationStateChange`,
  un événement natif qu'une page ne peut pas falsifier), au lieu du champ
  auto-déclaré du message.
- **Limite de la vérification** : le flux WebView natif complet n'a pas pu
  être rejoué (react-native-webview n'existe pas sur le build web, aucun
  appareil physique disponible dans cet environnement). Vérifié par lecture
  de code exhaustive (2 agents indépendants ont tracé tout le chemin
  d'attaque ligne par ligne) + non-régression du reste de l'app (bundle
  recompilé, Settings → Navigateur Web3 s'ouvre sans crash). **Recommandation :
  teste ce flux sur un vrai téléphone dès que possible** (connecter une vraie
  dApp, vérifier que ça fonctionne toujours normalement).

### 1.2 Dépendances vulnérables — correctifs sûrs appliqués (commit `5e8ae7d`)

- Backend : 24 → 23 vulnérabilités résolues via `npm audit fix` (aucun bump
  majeur, seul le lockfile a changé). Serveur redémarré et testé en local
  après coup.
- Frontend : 42 → 39 vulnérabilités résolues de la même manière (ethers, ws,
  xmldom, js-yaml, body-parser). **Vérifié de façon critique** puisque ça
  touche aux mêmes librairies que la signature de transaction : réimport de
  la mnémonique de test publique et bien connue `test test test test test
  test test test test test test junk` (compte #0 standard Hardhat/Anvil) →
  dérive exactement `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, confirmant
  que la dérivation cryptographique ethers fonctionne toujours correctement
  après la mise à jour des dépendances.
- **Volontairement non traité** (risque > bénéfice, détaillé dans le commit) :
  - La plupart des vulnérabilités restantes côté frontend nécessitent un bump
    majeur d'Expo (SDK 54 → 57, un saut de 3 versions). Beaucoup concernent
    des outils de *build* (metro, `@expo/cli`, postcss) exploitables
    seulement en compromettant la chaîne de build elle-même, pas l'app
    déployée — risque faible en pratique. Un tel bump nécessite le protocole
    déjà utilisé pour la migration SDK 54 (`expo install --fix`,
    `expo-doctor`, test réel sur téléphone) — impossible à faire sans
    appareil dans cet environnement. **À planifier comme chantier dédié.**
  - `@coinbase/cdp-sdk` (axios imbriqué, sévérité haute signalée) : le
    correctif automatique propose de **downgrader** le SDK, risque réel de
    casser l'intégration Coinbase Onramp/Offramp en prod pour un bénéfice
    pratique faible (aucune entrée utilisateur n'atteint la config axios
    concernée).

### 1.3 Autres zones auditées, aucune faille trouvée (confiance haute)

Vérifié en détail — signature de transaction (`lib/wallet.js` : signNativeTx,
signErc20Tx, signRawTx, signApproveTx, signNftTransferTx, signSolanaTransferTx,
signBitcoinTransferTx), déchiffrement du keystore, code PIN de détresse
(ne touche jamais la vraie clé), export du keystore chiffré, révocation
d'autorisations de tokens (`lib/approvals.js`), CORS backend
(`corsOriginCheck` + `allowedOrigins.js` — regex bien ancrées, pas de bypass
par sous-chaîne), routes de diffusion de transaction (`/tx/broadcast*` — de
purs relais, pas d'injection possible côté `network`), aucun secret commité
dans le dépôt (`.env` correctement ignoré, seul `.env.example` avec des
valeurs vides est suivi), signature HMAC du webhook MoonPay (utilise bien
`crypto.timingSafeEqual`, pas de comparaison vulnérable au timing), et
logging des erreurs backend (le code utilise `fetch` partout, pas `axios` —
les objets d'erreur ne peuvent donc pas embarquer les en-têtes de requête
avec les clés API secrètes, contrairement à un risque classique avec axios).

### 1.4 Bugs de fonds/transaction trouvés et corrigés pendant l'audit fonctionnel (avant le focus sécurité pur)

- **Commit `900f0ba`** : le bouton "Tout"/"MAX"/"100%" (Swap/Envoyer/Vendre)
  mettait l'intégralité du solde natif (ETH/BNB...) comme montant, laissant
  0 pour payer le gas de la transaction elle-même → échec garanti
  ("insufficient funds"), confirmé par une vraie capture d'écran de Pablo.
  Corrigé avec une réserve de gas automatique (`getNativeGasReserve`).
- Même commit : les erreurs de transaction affichaient le JSON-RPC brut
  d'ethers.js (des centaines de caractères illisibles) au lieu d'un message
  clair — ajouté `humanizeTxError()`, appliqué à 23 endroits.
- **Commit `b1e0709`** : `keyboardType="numeric"` empêchait de saisir un
  montant décimal (virgule ou point) sur mobile — impossible de swapper/
  envoyer/acheter un montant non-entier. Corrigé partout (`decimal-pad` +
  normalisation virgule→point, car un clavier français affiche une virgule
  qu'`Number()`/`parseFloat` ne comprend pas).

## 2. Fiabilité (commit `122d524`)

- **Filet de sécurité process-level ajouté au backend** : avant ce commit,
  une seule exception non rattrapée (une promesse rejetée sans `.catch`
  quelque part) faisait planter **tout le serveur pour tous les
  utilisateurs simultanément**, sans qu'aucun log clair n'explique pourquoi,
  jusqu'au redémarrage automatique de Railway. Ajouté
  `process.on('uncaughtException'/'unhandledRejection', ...)` — log
  seulement le message (jamais l'objet erreur entier, par précaution contre
  une fuite de données de requête), et arrêt propre + relance automatique
  par Railway sur `uncaughtException`.
- **Gestionnaire d'erreurs final + 404 JSON propre** : avant, une route
  inconnue renvoyait la page HTML par défaut d'Express ; maintenant, une
  réponse JSON cohérente avec le reste de l'API. Toute erreur non prévue
  reçoit désormais une réponse générique au lieu de potentiellement fuiter
  un détail d'implémentation.
- **`.env.example` remis à jour** : il datait d'avant l'intégration Coinbase,
  LI.FI, Alchemy, les 3 L2 (Arbitrum/Optimism/Base) et Solana — un
  contributeur (ou Pablo lui-même sur une nouvelle machine) partant de ce
  fichier aurait configuré le mauvais fournisseur de paiement
  (`PAYMENT_PROVIDER=moonpay` au lieu de `coinbase`) et manqué la moitié des
  variables. Documenté intégralement, vérifié par `grep` contre le code réel.

## 3. UX / correction de bugs produit (avant le pivot sécurité, sur demande explicite de Pablo)

- **Commit `8a16250`** : emojis incohérents (presse-papier, appareil photo,
  cloche, icônes de la fiche token) remplacés par des Ionicons, cohérents
  avec le reste de l'app.
- **Commit `638e45d`** : devise/réseau/langue/thème en Réglages compactés en
  puces (au lieu d'une pleine ligne par option) ; **vrai bug de rangement
  corrigé** — "Pont cross-chain", "Positions DeFi", "Achat récurrent",
  "Navigateur Web3" et "Autorisations de tokens" étaient rangés sous la
  section "WalletConnect" alors qu'ils n'ont rien à voir ; documents légaux
  (CGU/Politique de confidentialité/Mentions légales) complétés — ajout des
  clauses manquantes, divulgation de Sentry et Cloudflare Analytics
  (actifs en prod mais jamais mentionnés), section droits RGPD/CNIL.
- **Commit `bef216a`** : tags de catégorie ("Layer 1", "Ethereum Ecosystem")
  sur la fiche token, restés bleus depuis le passage de l'app en vert →
  corrigés ; montants rapides 10/25/50/100€ ajoutés sur Acheter.
- **Commit `2225e36`** : 4 résidus "USD"/"MoonPay" trouvés en auditant tous
  les écrans de paiement — le champ d'Achat récurrent disait littéralement
  "Montant USD" (jamais mis à jour depuis le passage en EUR), la
  notification de rappel affichait "20$" pour un montant réellement en
  euros, et le message affiché à **chaque achat qui échoue réellement**
  disait encore "la transaction MoonPay n'a pas abouti" alors que Coinbase
  est le seul fournisseur actif depuis fin août.

## 4. Méthode de vérification utilisée tout au long de la session

Pour chaque changement touchant l'UI : export web réel (`npx expo export
--platform web`) + serveur statique local + script Playwright rejouant le
parcours complet (création de wallet → PIN → écran concerné), avec capture
du nombre d'erreurs console et captures d'écran. Pour chaque changement backend :
démarrage local du serveur + `curl` sur les routes concernées. Pour chaque
changement poussé sur `main` : vérification que le bundle/service **réellement
déployé** (nexiawallet.com / Railway) contient bien le nouveau code, pas
seulement que le commit existe (poll du hash de bundle Cloudflare Pages / du
comportement de la route Railway jusqu'à ce que le nouveau code réponde).

## 5. État de sécurité connu, non couvert par cette session (hérité, pas nouveau)

- L'app signe sans liste blanche de contrats connus pour les swaps/ponts (le
  `to`/`data` viennent du devis 0x/LI.FI proxié par le backend) — cohérent
  avec la plupart des wallets intégrant un agrégateur de swap, dépend de la
  confiance dans ces fournisseurs tiers déjà établie. Pas une régression de
  cette session, signalé pour information.
- Pas de tests automatisés (unitaires/intégration/e2e) dans le dépôt — toute
  la vérification de cette session s'est faite par scripts Playwright
  ad-hoc (jetables, dans le scratchpad de session, pas committés). Un vrai
  chantier de tests automatisés committés serait la prochaine étape
  naturelle pour la maintenabilité à long terme (voir section 6).

## 6. Prochaines améliorations prioritaires (proposées, non commencées)

Par ordre d'impact/risque estimé :

1. **Tester la faille d'usurpation d'origine sur un vrai téléphone** (le
   correctif est déployé mais son scénario d'attaque exact n'a pu être rejoué
   qu'en lecture de code, faute d'appareil).
2. **Traductions incomplètes** — l'app propose 5 langues en Réglages mais
   seules ~43 chaînes passent par le système de traduction ; tout le reste
   (boutons, erreurs, documents légaux, FAQ...) reste écrit en dur en
   français. Un utilisateur non-francophone ne voit qu'une barre de
   navigation traduite. Chantier de grande ampleur, pas commencé — need
   décision de Pablo sur la priorité (voir échange précédent dans la
   conversation).
3. **Migration Expo SDK 54 → 57** pour éliminer les vulnérabilités de
   dépendances restantes côté outils de build — nécessite un appareil pour
   tester, à faire sur une branche dédiée comme la migration SDK 54
   précédente.
4. **Tests automatisés committés** (au moins un smoke test Playwright committé
   dans le dépôt, exécutable en CI) plutôt que des scripts jetables recréés à
   chaque session.
5. Perf du bundle web (allègement des ~1,8 Mo de JS, code-splitting) — déjà
   identifié dans une session précédente, toujours pas fait, pas urgent tant
   que le trafic reste faible.
6. Contenu App Store / Play Store (texte uniquement, prêt à l'avance).

## 6bis. Round supplémentaire — complétude/qualité (commit `d4de3ee`)

- **Vrai oubli trouvé** : "Adresses en observation" (watch-only) ne proposait
  que 3 réseaux (Ethereum/BSC/Polygon) sur les 6 réseaux EVM supportés par le
  reste de l'app — Arbitrum/Optimism/Base oubliés lors de leur ajout. Vérifié
  que les fonctions de lecture (`getNativeBalance`/`getErc20Balance`) sont
  déjà génériques sur tous les réseaux, donc aucune limitation technique :
  juste une liste codée en dur jamais mise à jour. Corrigé (les 6 réseaux
  sont maintenant proposés, via la même source unique `NETWORK_INFO` que le
  sélecteur de réseau des Réglages, pour ne plus jamais désynchroniser les
  deux listes).
- Dernier emoji presse-papier restant (adresse du wallet en haut de
  l'accueil) remplacé par une icône, sur le même modèle que le nettoyage
  fait plus tôt dans la session.
- **Vérifié propre en passant** : couverture des labels d'accessibilité
  (`accessibilityLabel`) sur les boutons icône-seule — déjà bonne partout où
  vérifié (boutons retour, réglages, adresse). Logique de l'onglet Stats
  relue en détail, rien à signaler.

## 7. Blocages documentés (rien à débloquer sans intervention de Pablo)

- Test réel sur téléphone (faille dApp browser, migration Expo) : aucun
  appareil disponible dans cet environnement.
- Traductions : décision de priorité/scope à prendre avec Pablo avant de
  lancer un chantier aussi large.
- Tout ce qui touche à de vrais fonds (test réel du swap/pont avec des frais
  de gas) : Pablo a signalé ne pas avoir d'ETH disponible pour tester pour
  l'instant.
