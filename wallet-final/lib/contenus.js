// wallet-final/lib/contenus.js
// ─────────────────────────────────────────────────────────────────
//  Textes longs affiches tels quels : documents legaux et FAQ de la page
//  d'accueil (sortis d'App.js, chantier V3 de decoupage, sans changement).
//  Sans dependance : testable en Node.
// ─────────────────────────────────────────────────────────────────

'use strict';

// ═══════════════════════════════════════════════════════════
//  DOCUMENTS LÉGAUX — texte affiché tel quel dans Paramètres et le footer de
//  la landing. Gabarit générique pour un wallet non-custodial ; à faire
//  relire par un juriste avant un vrai lancement à grande échelle, mais
//  couvre déjà les points essentiels (pas de garde de fonds, responsabilité
//  utilisateur sur la phrase de récupération, absence de collecte de
//  données personnelles).
// ═══════════════════════════════════════════════════════════
const LEGAL_DOCS = {
  about: {
    title: 'À propos de NexiaWallet',
    updated: '11 septembre 2026',
    body: `Qui est derrière NexiaWallet ?
NexiaWallet est développé par une personne indépendante, Pablo, entrepreneur individuel enregistré en France (SIREN 108 689 357). Ce n'est pas une société avec une équipe et des investisseurs : c'est un projet solo, construit petit à petit, avec un objectif simple — un portefeuille crypto vraiment accessible, en français.

Pourquoi ce wallet ?
La plupart des wallets sérieux sont en anglais et pensés pour des gens déjà à l'aise avec la crypto. NexiaWallet essaie l'inverse : une interface épurée, en français, pour quelqu'un qui débute et qui a surtout peur de se faire avoir.

« Non-custodial », ça veut dire quoi ?
Custodial : une plateforme (un exchange par exemple) détient tes cryptos pour toi. Si elle est piratée, fait faillite ou gèle ton compte, tes fonds sont en danger.
Non-custodial : toi seul détiens tes cryptos. Concrètement, quand tu crées un wallet ici :
• Une phrase de récupération (12 mots) est générée sur ton appareil. C'est LA clé de ton wallet.
• Cette phrase et ta clé privée ne quittent jamais ton téléphone : elles ne passent par aucun serveur NexiaWallet et ne sont enregistrées nulle part ailleurs.
• Chaque transaction est signée sur ton appareil ; seule la transaction déjà signée (une donnée publique) est envoyée au réseau.
La contrepartie : si tu perds ta phrase de récupération, personne — ni moi, ni personne — ne peut te redonner l'accès. Note-la sur papier, hors ligne, et ne la partage JAMAIS. Si on te la demande, même au nom du « support », c'est une arnaque.

Ce que NexiaWallet ne fait pas
• Ne détient jamais tes fonds ni tes clés.
• Ne demande jamais d'email, de nom ou de compte pour créer un wallet.
• Ne vend aucune donnée, n'utilise aucun tracker publicitaire.
• Ne donne aucun conseil en investissement. Ce que tu achètes, gardes ou vends reste ta décision et ta responsabilité.

Comment le projet se finance
Une petite commission est prélevée sur les opérations optionnelles : 0,75 % sur un échange (swap) et 0,25 % sur un pont cross-chain. Une commission sur les achats/ventes par carte via un partenaire est à l'étude mais n'est pas encore active. Aucun abonnement ; envoyer, recevoir et garder ses cryptos est gratuit.

État du projet
NexiaWallet est jeune et évolue vite. Version web disponible aujourd'hui, application mobile en préparation. Les retours sont les bienvenus — c'est ce qui fait avancer l'app.

Contact : contact@nexiawallet.com`,
  },
  cgu: {
    title: "Conditions Générales d'Utilisation",
    updated: '11 septembre 2026',
    body: `1. Objet
NexiaWallet est une application de portefeuille crypto non-custodial : elle permet de générer, importer et utiliser un portefeuille multi-réseaux (Ethereum, BNB Smart Chain, Polygon, Arbitrum, Optimism, Base, Solana, Bitcoin) sans que NexiaWallet ne détienne ou ne contrôle jamais les fonds de l'utilisateur (voir §2 pour le détail du traitement de la clé privée). L'utilisation de l'application vaut acceptation pleine et entière des présentes conditions.

2. Nature non-custodiale
NexiaWallet ne détient et ne contrôle jamais les fonds de l'utilisateur. La clé privée et la phrase de récupération sont générées, chiffrées et utilisées EXCLUSIVEMENT sur l'appareil de l'utilisateur : elles ne quittent jamais cet appareil, ne transitent jamais par un serveur NexiaWallet et ne sont jamais écrites sur un disque ou une base de données qui nous appartient. Toute transaction est signée localement ; seule la transaction déjà signée (donnée publique dès sa diffusion) est relayée au réseau. En conséquence, NexiaWallet ne peut techniquement ni récupérer ni réinitialiser un accès perdu.

3. Éligibilité et usage autorisé
L'utilisation de NexiaWallet est réservée aux personnes majeures, juridiquement capables de contracter. L'utilisateur s'engage à ne pas utiliser l'application à des fins illégales (blanchiment, financement d'activités illicites, contournement de sanctions internationales, fraude). En tant qu'outil non-custodial, NexiaWallet n'effectue elle-même aucune vérification d'identité ; les contrôles d'identité (KYC) éventuels sont assurés par les prestataires tiers d'achat/vente mentionnés au §6.

4. Responsabilité de l'utilisateur
L'utilisateur est seul responsable de la conservation de sa phrase de récupération et de son code PIN. Leur perte entraîne la perte définitive et irréversible de l'accès aux fonds. NexiaWallet ne peut en aucun cas restaurer un accès perdu.

5. Transactions
Les transactions sur une blockchain publique sont irréversibles. L'utilisateur doit vérifier l'adresse et le montant avant toute confirmation d'envoi. NexiaWallet n'est pas responsable des transactions envoyées à une adresse erronée, y compris via une interaction avec un contrat intelligent tiers (dApp connectée en WalletConnect ou via le navigateur intégré).

6. Services et prestataires tiers
Achat de crypto par carte : Coinbase Onramp. Vente de crypto (mise en euros) : Coinbase Offramp — nécessite un compte Coinbase et sa propre vérification d'identité. Dans les deux cas, les fonds sont livrés ou prélevés directement sur l'adresse du wallet de l'utilisateur, jamais sur un compte détenu par NexiaWallet. Échange entre cryptos (swap) : agrégateur 0x. Transfert entre réseaux (pont) : agrégateur LI.FI. Dans ces deux cas, la signature de la transaction reste 100 % locale sur l'appareil de l'utilisateur. Connexion à une application décentralisée tierce (WalletConnect, navigateur intégré) : l'utilisateur interagit alors directement avec un contrat intelligent tiers dont NexiaWallet ne contrôle ni le code ni le comportement — vérifier la légitimité d'une dApp avant de s'y connecter reste de la responsabilité de l'utilisateur. Données de marché, historique de transactions et visuels NFT : CoinGecko, explorateurs de blocs (Etherscan et équivalents), Alchemy — fournis "en l'état", sans garantie d'exactitude en temps réel.

7. Commissions
NexiaWallet prélève une commission sur certaines opérations optionnelles, intégrée et affichée dans le taux proposé avant confirmation : 0,75 % sur un échange (swap) et 0,25 % sur un transfert entre réseaux (pont). Générer, importer, envoyer, recevoir et conserver des cryptos reste gratuit, sans abonnement. Le détail à jour de ce financement figure dans la page "À propos de NexiaWallet".

8. Limitation de responsabilité
NexiaWallet est fourni "en l'état", sans garantie d'absence d'erreur ou d'interruption. L'utilisation de cryptomonnaies comporte des risques de marché et de sécurité que l'utilisateur accepte en connaissance de cause. NexiaWallet ne saurait être tenu responsable des conséquences d'une décision d'investissement, d'une action d'un prestataire tiers, ou d'une interaction avec un contrat intelligent tiers.

9. Résiliation
L'utilisateur peut cesser d'utiliser NexiaWallet à tout moment en désinstallant l'application ou en supprimant son wallet local — sa phrase de récupération reste alors le seul moyen d'en retrouver l'accès ailleurs, y compris dans un autre wallet non-custodial compatible. NexiaWallet peut faire évoluer, suspendre ou arrêter tout ou partie du service sans que cela n'affecte les fonds de l'utilisateur.

10. Droit applicable
Les présentes conditions sont soumises au droit français. À défaut de résolution amiable, tout litige relève des tribunaux français compétents.

11. Évolution
Ces conditions peuvent être mises à jour ; la date de dernière mise à jour figure en haut de ce document. Contact : contact@nexiawallet.com`,
  },
  privacy: {
    title: 'Politique de Confidentialité',
    updated: '11 septembre 2026',
    body: `1. Aucune donnée personnelle collectée pour créer un wallet
NexiaWallet ne demande ni email, ni nom, ni numéro de téléphone pour créer un wallet. Aucun compte utilisateur n'existe côté serveur.

2. Ce qui reste uniquement sur l'appareil
Le code PIN (chiffré), les favoris, le carnet d'adresses récentes, les alertes de prix et les préférences d'affichage (devise, langue, thème) sont stockés localement (stockage sécurisé du système ou stockage du navigateur). Rien de tout cela n'est envoyé à un serveur NexiaWallet.

3. Ce qui ne transite JAMAIS par le serveur
La clé privée et la phrase de récupération sont générées et utilisées exclusivement sur l'appareil (génération, chiffrement et signature des transactions 100% locaux) — elles ne sont ni envoyées ni conservées, même temporairement, par un serveur NexiaWallet. Le serveur reçoit uniquement des données publiques de blockchain nécessaires au fonctionnement : adresse publique (pour consulter un solde ou un historique), transaction déjà signée (pour la relayer au réseau). Ces dernières sont publiques par nature sur une blockchain.

4. Fournisseurs tiers utilisés
Les prix de marché (CoinGecko), l'historique de transactions (Etherscan et équivalents), les visuels NFT (Alchemy), l'achat/la vente par carte (Coinbase Onramp/Offramp), l'échange entre cryptos (0x) et le pont entre réseaux (LI.FI) sont fournis par des services tiers ; consulter leurs propres politiques de confidentialité pour le traitement effectué de leur côté. NexiaWallet ne leur transmet jamais votre clé privée ni votre phrase de récupération.

5. Suivi d'erreurs (Sentry)
En cas de bug, un rapport technique (message d'erreur, type d'appareil, version de l'application) peut être envoyé à Sentry, l'outil utilisé pour détecter et corriger les problèmes. Aucune donnée sensible du wallet — clé privée, phrase de récupération, code PIN — n'est jamais incluse dans ces rapports.

6. Mesure d'audience
Le site nexiawallet.com utilise Umami pour mesurer sa fréquentation (nombre de visites, pages consultées sans leurs paramètres d'URL, site de provenance, pays, type d'appareil et de navigateur) et les grandes étapes franchies dans l'app, transmises sous forme d'un simple nom (par exemple « wallet créé » ou « swap envoyé »), sans aucune autre information. Umami ne dépose aucun cookie et ne sert pas à identifier individuellement les visiteurs. Il ne reçoit aucune donnée du wallet : ni clé, ni phrase de récupération, ni adresse, ni solde.

7. Cookies
Aucun cookie publicitaire ni cookie de mesure d'audience n'est déposé sur ce site, et aucun outil publicitaire n'y est utilisé.

8. Vos droits
Pour les données techniques limitées décrites ci-dessus, vous disposez d'un droit d'accès, de rectification et d'effacement. Pour l'exercer, contactez contact@nexiawallet.com. Vous pouvez aussi introduire une réclamation auprès de la CNIL (cnil.fr).

9. Contact
Pour toute question sur cette politique, contactez contact@nexiawallet.com ou consultez les informations listées dans les Mentions Légales.`,
  },
  mentions: {
    title: 'Mentions Légales',
    updated: '11 septembre 2026',
    body: `Éditeur du site
NexiaWallet est édité par Pablo, entrepreneur individuel (micro-entreprise), SIREN 108 689 357, SIRET 108 689 357 00011, activité déclarée : programmation informatique (code APE 62.01Z). Entreprise à statut non-diffusible : l'adresse professionnelle n'est pas publiée ici, mais communiquée sur demande légitime (autorité, procédure judiciaire) via contact@nexiawallet.com.
Directeur de la publication : Pablo.

Hébergement
Backend applicatif hébergé par Railway (railway.app). Application web hébergée par Cloudflare Pages (pages.dev).

Nature du service
NexiaWallet met à disposition un outil technique de génération et de gestion de portefeuille crypto non-custodial. NexiaWallet n'est ni un établissement de paiement, ni un prestataire de services sur actifs numériques (PSAN) au sens où elle ne détient jamais les fonds des utilisateurs.

Propriété intellectuelle
L'interface, le code et les visuels de NexiaWallet sont la propriété de leur auteur, sauf logos et données de marché appartenant à leurs fournisseurs respectifs (CoinGecko, Coinbase).

Contact
contact@nexiawallet.com`,
  },
};

// FAQ affichée sur la landing — questions réellement posées par les
// premiers testeurs (phrase de récupération, non-custodial, réseaux).
const LANDING_FAQ = [
  {
    q: "C'est quoi une phrase de récupération ?",
    a: "12 mots générés à la création de ton wallet. Ils permettent de reconstruire ta clé privée n'importe où. Si tu les perds ET perds ton appareil, personne — pas même nous — ne peut récupérer tes fonds.",
  },
  {
    q: 'Que veut dire "non-custodial" ?',
    a: "NexiaWallet ne détient et ne contrôle jamais tes fonds, contrairement à un exchange (Binance, Coinbase...) qui les garde pour toi. Ta clé privée n'est jamais stockée durablement par NexiaWallet — pas sur disque, pas en base de données.",
  },
  {
    q: 'Quels réseaux sont supportés ?',
    a: 'Ethereum, BNB Smart Chain, Polygon, Arbitrum, Optimism et Base côté EVM, plus Solana et Bitcoin en natif — solde, envoi et réception sur les huit. D\'autres tokens ERC20 peuvent être ajoutés en lecture seule par adresse de contrat.',
  },
  {
    q: "J'ai perdu mon téléphone, comment je récupère mon wallet ?",
    a: 'Installe NexiaWallet sur un nouvel appareil et choisis "J\'ai déjà un wallet", puis entre ta phrase de récupération de 12 mots. Sans elle, la récupération est impossible.',
  },
  {
    q: 'Le swap et l\'achat par carte sont-ils sûrs ?',
    a: "L'achat par carte passe par Coinbase Onramp — la crypto est livrée directement sur l'adresse de ton wallet, jamais sur un compte tiers. Le swap passe par l'agrégateur DEX 0x pour trouver le meilleur prix, mais la signature de la transaction reste 100% locale sur ton appareil, comme un envoi classique.",
  },
  {
    q: 'Comment vendre mes cryptos et récupérer des euros ?',
    a: "Via Coinbase Offramp (bouton \"Vendre\") : tu envoies tes cryptos à l'adresse de dépôt affichée, puis tu retires en euros par virement SEPA. Il faut un compte Coinbase (gratuit) et sa vérification d'identité — NexiaWallet ne demande jamais d'identité de son côté.",
  },
  {
    q: 'Est-ce que NexiaWallet prend une commission ?',
    a: "Oui, une petite commission sur deux opérations optionnelles : 0,75 % sur un échange (swap) et 0,25 % sur un transfert entre réseaux (pont) — toujours affichée avant de confirmer. Créer un wallet, envoyer, recevoir et garder ses cryptos reste entièrement gratuit.",
  },
];

module.exports = { LEGAL_DOCS, LANDING_FAQ };
