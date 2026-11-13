# Audit financier et technique — Bictorys / Hôpital de Ndamatou

**Date : 12 novembre 2026 — Audit du projet local, avant nouvelle intégration.**

## 1. Conclusion et périmètre

La plateforme dispose d'une gestion des repas, de badges prépayés, de recharges manuelles, de transactions Firestore et de rapports. **Elle ne contient pas d'intégration opérationnelle à l'API Bictorys, de webhook Bictorys, de vérification serveur d'un paiement Bictorys, ni de reversement bancaire/Mobile Money.** L'affichage « frais Bictorys » correspond actuellement à un calcul interne, pas à une lecture du relevé du prestataire.

Le code existant applique le modèle `shared_510_505_v1` : 510 F versés donnent 505 F de crédit ; pour un repas à 1 000 F, la part agent est 500 F, la base hospitalière 500 F, la contribution hospitalière 5 F et le restaurant théoriquement destinataire de **990 F**. Votre nouvelle mission demande **505 F versés pour 500 F de crédit**, **995 F nets au restaurant** et **5 F de commission développeur** : cette cible n'est pas entièrement implémentée. La formule actuelle donne déjà 505 → 500 pour cet exemple grâce à l'arrondi, mais elle ne définit pas la même tarification proportionnelle pour tous les montants.

**Avis : conserver la plateforme comme socle opérationnel, mais ne pas l'utiliser en l'état comme système automatisé de collecte pour compte de tiers et de règlement mensuel.** Les principaux préalables sont la preuve serveur des paiements, la sécurisation de la preuve de consommation, la clôture mensuelle, le financement des frais et la protection effective des fonds des badges.

L'audit a été réalisé sans modification des fichiers de l'application, sans déploiement, sans appel Bictorys et sans accès à des comptes ou données de production. Seul le présent rapport est créé. Les configurations sensibles ont été examinées par noms de variables et indicateurs de mode ; aucune clé, aucun secret, aucune identité ou coordonnée personnelle d'agent n'est reproduit.

### Limites de preuve

- Les constats concernent les sources locales, y compris leurs modifications non commitées ; un commit Git seul ne représente pas cet état de travail.
- Le site réellement publié, les règles actuellement déployées, les comptes, les soldes et le paramétrage effectif de Firebase ne sont pas interrogés.
- La facturation Firebase, les fournisseurs Authentication activés et l'existence éventuelle de fonctions anciennes déjà déployées ne peuvent pas être établis à partir des seuls fichiers.
- « Présent/testé localement » ne signifie pas « exploité et réceptionné en production ».
- Aucun audit juridique, agrément de paiement ou autorisation de conserver des fonds de tiers n'est déduit de cet audit technique.

## 2. Architecture réelle

| Élément | Constat dans le projet | Sources |
|---|---|---|
| Application web | React 19, TypeScript, Vite 6, Tailwind CSS ; synchronisation Firebase côté navigateur | `package.json`, `src/main.tsx`, `src/App.tsx`, `vite.config.ts` |
| Interfaces | Personnel, restaurant, comptabilité, DRH, livraison, notifications et profil ; orchestration principale concentrée dans un grand composant App | `src/components/`, `src/App.tsx` |
| Graphiques et scan | Recharts ; bibliothèques QR locales dans `src/vendor/`, impression navigateur et adaptateur QZ | `RestaurantView.tsx`, `EmployeeView.tsx`, `src/lib/qzPrinter.ts` |
| Logique métier | Tarifs/subvention, transactions de badges, commandes, rapports et identifiants de reprise séparés en bibliothèques | `src/lib/business.ts`, `sparkBalance.ts`, `sparkOrders.ts`, `sparkReports.ts`, `topupRequests.ts` |
| Calcul financier partagé | Module CommonJS consommé par le frontend via un alias Vite et par le code Functions | `functions/finance.cjs`, `src/lib/finance.ts`, `vite.config.ts` |
| Android | Conteneur Capacitor 8 pointant sur le build `dist` | `capacitor.config.ts`, `android/`, scripts `android:*` |
| Windows | Conteneur Electron et packaging electron-builder ; attention à l'ancienne destination distante par défaut | `electron/main.cjs:4`, `package.json` |
| Backend alternatif | Fonctions Firebase appelables, JavaScript CommonJS, moteur Node 20 déclaré | `functions/package.json`, `functions/index.js` |
| Hébergement | Firebase Hosting, publication de `dist`, redirection vers `index.html`, en-têtes limitant le cache | `firebase.json`, `.firebaserc` |
| Documentation et tests | Dossiers `docs/`, `tests/` et tests Functions ; présence de documents historiques CHNCAK qui ne prouvent pas une intégration Ndamatou | `docs/`, `functions/topup.test.cjs` |

Express et le SDK Google GenAI sont déclarés parmi les dépendances, mais aucun serveur de paiement Express ni appel GenAI participant au circuit financier n'a été identifié dans les fichiers exécutables examinés. Une dépendance installée ne prouve pas une fonctionnalité utilisée.

### 2.1 Configuration Firebase

Le projet et le site déclarés sont `repas-ndamatou-7f044`. `src/lib/firebase.ts` initialise Authentication et Firestore à partir des variables `VITE_FIREBASE_*`. La sélection d'une base nommée est possible via `VITE_FIRESTORE_DATABASE_ID`, avec `(default)` comme repli. Le client force le long-polling pour sa connexion Firestore.

L'application utilise notamment la connexion et l'inscription par email/mot de passe, la réinitialisation du mot de passe et la gestion du profil. La configuration des fournisseurs dans la console n'a pas été vérifiée. Les rôles sont principalement stockés dans `users`, et non définis par un système général de custom claims dans les sources examinées.

`src/lib/secureBalance.ts:8` choisit deux circuits :

1. **Circuit dit Spark** : transactions Firestore exécutées dans le navigateur, autorisées par `firestore.rules`.
2. **Circuit Functions** : appels `httpsCallable`, région cliente `us-central1`, lorsque `VITE_SECURE_BALANCE_FUNCTIONS` vaut `true`.

Dans les fichiers d'environnement locaux examinés, le circuit Functions n'est pas activé. Cela établit le comportement attendu du build local, pas le plan de facturation réellement souscrit. `firebase.json` ne déclare que Firestore et Hosting : il ne configure pas le déploiement du dossier Functions. Aucun déploiement n'a été tenté pendant l'audit.

Les variables préfixées `VITE_` sont destinées au frontend. **Les futures clés privées Bictorys et secrets de webhook doivent être exclusivement côté serveur**, dans un gestionnaire de secrets ou une configuration serveur adaptée. Ils ne doivent pas être ajoutés aux paramètres publics Firestore.

Le service worker présent dans `public/sw.js` supprime les anciens caches et se désinscrit ; il ne constitue pas un dispositif financier hors ligne. Les sources ne démontrent pas un mécanisme de sauvegarde/restauration automatisé des données financières.

### 2.2 Rôles et responsabilités

Les types déclarent `employee`, `restaurant_admin`, `admin`, `accountant`, `delivery`, `hr` et `operator` (`src/types.ts:102`). Des accès complémentaires existent, notamment comptabilité, DRH et caisse. Les règles comprennent aussi des habilitations fondées sur des adresses administratives codées en dur ; leurs valeurs ne sont pas reproduites.

| Acteur métier | Représentation actuelle | Limite pour la cible |
|---|---|---|
| Agent | `employee`, profil, badge et commandes | Ne doit pas pouvoir certifier seul un événement qui déclenche une créance hospitalière |
| Restaurant | `restaurant_admin`, `operator` | Peut gérer des opérations et des recharges ; pas de compte fournisseur ni de validation mensuelle distincte |
| Hôpital | Répartition entre `admin`, `accountant` et `hr` | Aucun rôle métier `hospital`, compte de facturation hospitalier ou circuit d'approbation mensuelle autonome |
| Développeur/administrateur technique | Accès administratifs et compte propriétaire | Pas de compte de commission séparé ni de séparation complète entre administration technique et autorisation de paiement |
| Livreur | `delivery` et autorisations de livraison | Les traces de livraison restent des données applicatives modifiables selon les droits accordés |

Il n'existe pas de modèle général multi-établissements avec cloisonnement financier par `hospitalId` dans les collections analysées.

## 3. Badges, commandes et consommation

### 3.1 Recharge

`RestaurantView.tsx:1317`, `handleRestaurantTopup`, permet de choisir espèces, Wave ou Orange Money. La caisse saisit le montant réellement versé et confirme manuellement le paiement. Le calcul affiche le crédit, la contribution agent, les 2 % de frais calculés et le net théorique.

Le parcours est : interface caisse → `App.handleAccountantTopup` (`src/App.tsx:2789`) → `secureAccountantTopup` → `createSparkBalance().topup` ou `accountantTopup` Functions.

Dans le circuit Spark, une transaction met à jour `users.walletBalance` et écrit un reçu dans `cashTransactions` ainsi qu'une entrée identique dans `walletOperations`. Les règles vérifient leur correspondance, le solde avant/après, les limites et l'acteur. Le journal `walletOperations` n'est pas modifiable ou supprimable par le client.

Un identifiant conservé en `sessionStorage` par `createTopupRequestStore` permet de reprendre la même opération sans double crédit. **Il protège une tentative applicative ; il ne garantit pas qu'une même transaction réelle de paiement n'est pas déclarée sous plusieurs identifiants.**

Les cartes prépayées et demandes Wave historiques suivent des chemins distincts. La déclaration Wave du personnel est encore présente dans le code, mais un bloc de son interface est masqué par `false && waveTopupEnabled` (`EmployeeView.tsx:3483`). Un lien Wave externe demeure ; il ne déclenche pas un crédit automatique.

### 3.2 Commande et débit

`EmployeeView.tsx:1300` environ construit une commande payée par badge. `App.handleCreateOrder` (`3257`) appelle le chemin sécurisé. Dans `createSparkPaidOrder` (`src/lib/sparkOrders.ts:10`), le serveur Firestore vérifie via les règles : identité, tarifs, stock, créneau, quotas, état du badge et débit correspondant.

Le débit du badge, les compteurs et la diminution du stock sont atomiques. Le chemin Spark vérifie aussi l'existence du même identifiant de commande avant de redébiter. Une ventilation `settlement` est enregistrée à la création et protégée contre les mises à jour ultérieures. Le badge reste un solde entier XOF ; des centimes comptables sont utilisés pour les frais calculés.

Les règles de subvention comprennent notamment la première portion éligible, la facturation des portions suivantes au prix réel, des exclusions, le tarif personnel permanent et des crédits de subvention exceptionnels. Le nombre maximal de portions est configurable ; le panier Spark reste limité à deux articles distincts. Les suppléments et dîners spéciaux suivent des règles spécifiques.

### 3.3 Remise du repas et remboursement

Les commandes passent par des états comme `pending`, `preparing`, `delivering`, `delivered`, `returned`, `cancelled` et `expired`. `App.handleUpdateOrderStatus` (`3614`) conserve étapes, mode de remise et acteur ; `deliveryTime` est renseigné à la remise.

Les badges QR servent à retrouver un profil. Le payload utilise le téléphone, à défaut le numéro de badge (`EmployeeView.tsx:1519`, `RestaurantView.tsx:2891`). Ce n'est pas une preuve cryptographique de paiement ou de présence physique. Les QR de restaurant et codes courts sont calculés côté client ; les règles ne vérifient pas un challenge de remise signé par un serveur.

L'annulation avec remboursement caisse passe par une opération distincte qui recrédite le badge et restaure le stock ; le chemin Spark évite de rejouer le même remboursement. **Un crédit interne ou une correction de badge n'est pas un remboursement Bictorys/bancaire.** Aucun remboursement externe n'est implémenté.

## 4. Bictorys : inventaire de ce qui existe et manque

| Fonction attendue | État réel |
|---|---|
| Création d'un paiement Bictorys | Absente : aucun appel d'encaissement Bictorys identifié |
| Session de paiement/lien Bictorys lié à une recharge | Absente ; le lien Wave existant est externe et distinct |
| Stockage d'une intention de paiement et d'un identifiant prestataire unique | Absent comme modèle de paiement dédié |
| Webhook HTTP Bictorys | Absent ; le backend contient des `onCall`, pas de récepteur Bictorys |
| Authentification/signature d'un webhook | Absente ; aucun algorithme ne peut être considéré comme déjà intégré |
| Vérification serveur du statut, montant, devise et bénéficiaire | Absente pour Bictorys |
| Notification de confirmation d'encaissement | Notifications internes présentes ; aucun événement Bictorys reçu |
| Frais de paiement | Calculs internes présents ; pas de rapprochement avec les frais réellement retenus |
| Erreurs | Gestion d'erreurs Firebase, reprises et messages de caisse ; pas d'états ou stratégie d'erreurs Bictorys |
| Reversement bancaire ou Mobile Money | Absent : aucun appel de payout, enregistrement d'exécution ou rapprochement bancaire identifié |
| Sélection du canal le moins coûteux | Absente ; aucune grille de coût ni comparaison de canaux |

`approveWaveTopup` (`functions/index.js:161`) et `handleApproveWaveTopup` (`src/App.tsx:2721`) signifient **validation manuelle d'une demande**, pas interrogation de l'opérateur. La référence Wave peut être générée par l'application (`EmployeeView.tsx:917` environ). La détection de doublon dans `handleWaveTopupRequest` est limitée aux demandes chargées en mémoire et n'est pas un index global sur les paiements réels.

`addNotification` (`src/App.tsx:1771`) écrit des messages dans `notifications` ou affiche un toast. Ces messages ne sont ni un webhook, ni une preuve d'encaissement, ni une autorisation administrative de reversement.

## 5. Comptabilité et collections Firestore

| Collection/document | Usage identifié | Ce qu'il ne faut pas lui attribuer |
|---|---|---|
| `users` | Profils, droits, statut, solde badge, compteurs et références de dernière opération | Ce n'est pas un compte bancaire ni un grand livre comptable complet |
| `walletOperations` | Journal immuable des opérations de badge du chemin Spark | Pas de journal des versements hospitaliers ou payouts ; les commandes sont tracées séparément |
| `cashTransactions` | Reçus de recharges, cartes utilisées, corrections, ajustements et remboursements de badge | Son nom ne garantit pas un mouvement réel de trésorerie ; toutes les lignes ne sont pas des recettes |
| `waveTopupRequests` | Déclarations manuelles en attente/approuvées/rejetées | Pas des transactions Bictorys certifiées |
| `prepaidCards` | Codes nominatifs de recharge et état actif/utilisé | Pas une preuve autonome d'encaissement des espèces |
| `orders` | Commandes, contenu, paiement badge, étapes, remise et ventilation financière | Pas une facture mensuelle figée ni une instruction de paiement |
| `meals` | Menus, prix complémentaires, stocks et disponibilité | Pas un compte fournisseur |
| `settings/institution` | Paramètres, tarifs, versions, accès et présentation | Document publiquement lisible selon les règles actuelles : ne doit pas accueillir des secrets |
| `settings/officialResetApproval` | Trace d'une remise à zéro opérationnelle | Pas une approbation d'état mensuel ou de reversement |
| `notifications` | Messages applicatifs | Pas des preuves bancaires |
| `restaurantPresence` | Présence opérationnelle | Pas une validation financière de consommation |
| `deliveryCodeIssuers` | Responsables autorisés et codes de livraison | Pas des approbateurs de règlements mensuels |
| `registrationIdentifiers` | Réservation d'identifiants d'inscription | Sans lien avec l'unicité des paiements prestataire |
| `ideaBox`, `satisfactionSurveys` | Retours et enquêtes | Sans rôle financier |

Les règles consultent aussi `admins` pour certaines habilitations. Aucune collection dédiée aux intentions de paiement Bictorys, événements prestataire, factures hospitalières, règlements hospitaliers, clôtures mensuelles, approbations de paiement, commissions ou reversements n'a été identifiée.

### 5.1 Tarifs et conservation des historiques

`functions/finance.cjs:45` prévoit une migration des paramètres vers 1 000/500/500, avec conservation des anciens tarifs dans `legacyAccountingPrices`. `src/App.tsx:919` environ déclenche cette migration à la connexion du propriétaire si la version n'a pas encore été marquée. L'audit n'a pas ouvert l'application ni déclenché cette migration ; son exécution en production est inconnue.

`getOrderAccounting` (`src/lib/business.ts:130`) utilise les anciens tarifs pour les commandes sans ventilation et les montants figés pour les nouvelles commandes. Les historiques ne sont pas réécrits par cette migration. Le nouveau tableau financier exclut les anciens repas sans le snapshot attendu ; leur reprise financière reste donc un chantier explicite.

### 5.2 Rapports existants

- `RestaurantView.handlePrintRevenueReport` (`1387`) : états sur différentes périodes, recettes, parts agent/hôpital, quantités, regroupements et zones imprimées de signature/cachet.
- `RestaurantView.handlePrintTopupReport` (`1830`) : recharges et corrections, détails de brut/crédit/frais/net pour les nouveaux reçus.
- `AccountantView.printReport` (`416` environ) : rapports journaliers, hebdomadaires ou personnalisés avec chargement complémentaire ; le code refuse l'impression si ses tentatives de chargement échouent.
- Exports de comptabilité, audits des badges et graphiques ; certains exports dits Excel sont produits comme tableaux HTML, pas comme classeurs comptables structurés avec contrôles de clôture.
- `SharedFinanceReport.tsx` : collecte mobile du nouveau modèle, contribution hospitalière, retenue restaurant, sommes dues et réserve des badges visibles ; export CSV.
- `handlePrintBlazeInvoice` concerne un état de frais Firebase saisis dans les paramètres, **pas une facture hospitalière calculée et acquittée**.

Les zones imprimées de signature ne constituent pas une validation numérique enregistrée avec identité, date et version du décompte. Il n'existe pas de facture mensuelle numérotée, d'échéancier de règlement, de suivi de réception des fonds hospitaliers ni de verrou de paiement après cette réception.

### 5.3 Limites importantes pour les fins de mois

Les abonnements à l'écran sont limités : 650 commandes récentes, 900 transactions et 1 500 profils au maximum dans les constantes correspondantes (`src/App.tsx:791`). Les totaux dits « depuis le début » ne garantissent donc pas une exhaustivité historique. Le tableau `SharedFinanceReport` utilise les données reçues de ces écrans et ne charge pas lui-même un mois complet.

Le rapport Restaurant peut se rabattre sur les données déjà visibles après une erreur de chargement (`RestaurantView.tsx:1439` environ). Ce mécanisme est acceptable comme secours d'affichage, mais impropre à un ordre de paiement définitif.

Les rapports généraux sélectionnent principalement les commandes `paid`, sans exiger systématiquement `delivered` (`RestaurantView.tsx:1444`, `AccountantView.tsx:515`). Le nouveau tableau financier exige bien `delivered` et `paid`, mais ses périodes sont encore basées sur la date de création de la commande transmise par l'écran, pas sur un événement serveur de consommation. Une commande créée en fin de mois et remise le mois suivant peut donc être affectée à une mauvaise période de consommation.

`loadSparkReport` (`src/lib/sparkReports.ts:4`) privilégie les timestamps serveur et rapproche les anciens documents sans ce champ, ce qui est utile. Cela ne remplace ni une clôture, ni le choix de la date métier de consommation, ni un journal comptable exhaustif.

## 6. Nouveau modèle demandé : vérification économique

Pour un repas, les objectifs exprimés sont : agent 505 F dont 500 F consommables ; hôpital 505 F dont 500 F de base ; restaurant 995 F nets ; développeur 5 F. Les frais prestataire et les frais de reversement sont à distinguer de ces montants.

### 6.1 Écarts avec les formules actuelles

| Élément | Code existant | Nouvelle demande |
|---|---:|---:|
| Recharge d'exemple | 510 F → 505 F crédités | 505 F → 500 F crédités |
| Formule mobile | `arrondi(brut × 101 / 102)` | À définir selon le crédit hors frais et les arrondis autorisés |
| Versement hospitalier sur base 500 | 505 F nets théoriques | 505 F ; réception mensuelle à prouver |
| Net restaurant sur valeur 1 000 | 990 F | 995 F |
| Commission développeur | Pas de créance distincte de 5 F par repas | Objectif de 5 F à définir contractuellement et comptablement |
| Frais de prestataire | 2 % calculés en dur | Frais réels constatés, séparés et rapprochés |
| Frais de sortie | Non modélisés | À constater séparément pour chaque reversement |

La nouvelle retenue restaurant de 5 F correspond à 0,5 % du repas ; les 5 F agent et hôpital correspondent chacun à 1 % de leur part de base de 500 F. Les pourcentages ne doivent pas être additionnés sans préciser leurs bases.

La formule existante donne bien 505 F → 500 F, mais donne aussi **10 100 F → 10 001 F**, alors qu'une règle « crédit 10 000 F + 1 % de frais agent » demanderait 10 100 F pour 10 000 F de crédit. Il faut donc définir la règle générale et sa version, pas seulement valider un petit exemple qui coïncide par arrondi.

### 6.2 Le financement n'est pas exactement équilibré avec 2 %

Les calculs ci-dessous utilisent le taux interne de 2 % présent dans le code, sans garantir son application contractuelle ou ses arrondis réels.

| Hypothèse pour un repas | Hôpital par virement sans frais | Hôpital lui aussi prélevé à 2 % |
|---|---:|---:|
| Brut payé par l'agent | 505,00 F | 505,00 F |
| Frais sur l'agent : 2 % du brut | 10,10 F | 10,10 F |
| Net de la recharge | 494,90 F | 494,90 F |
| Versement brut de l'hôpital | 505,00 F | 505,00 F |
| Net hospitalier reçu | 505,00 F | 494,90 F |
| Trésorerie totale après ces frais | 999,90 F | 989,80 F |
| Objectif restaurant + développeur | 1 000,00 F | 1 000,00 F |
| Manque avant frais de reversement | **0,10 F** | **10,20 F** |

Après 995 F au restaurant, il reste respectivement **4,90 F**, ou un déficit de **5,20 F avant même la commission développeur**. Les frais de sortie aggravent ces écarts. Ils ne peuvent pas être effacés par une simple ligne d'affichage comptable.

Il faut donc décider qui supporte les frais réels et les arrondis : financeur distinct, supplément explicitement autorisé, tarif négocié, ou rémunération résiduelle différente. Le rapport ne choisit pas à votre place et ne transforme pas l'objectif de 5 F en bénéfice garanti.

### 6.3 Protection des crédits non consommés

Pour 505 F versés et 500 F de crédit, le net calculé à 2 % est seulement 494,90 F. Il manque **5,10 F pour couvrir immédiatement les 500 F de droits de l'agent**. Cette différence existe avant toute consommation ; une subvention hospitalière payable uniquement sur les repas consommés n'est pas une réserve disponible pour les badges inutilisés.

La protection exige donc un financement et un rapprochement réels : compte/circuit approprié, réserve liquide, séparation des obligations et limitation des sommes payables au restaurant. Une somme de `walletBalance` affichée dans un tableau ne prouve ni la présence des fonds ni leur protection.

La cible doit aussi distinguer le crédit non consommé, le crédit déjà débité sur une commande encore non remise, les avances, les remboursements dus et les autres dettes. Une commande non remise peut avoir consommé le solde technique tout en laissant une obligation envers l'agent.

## 7. Risques et constats de sécurité

Priorités : **P1** = préalable à la centralisation ; **P2** = correction importante avant généralisation. Les observations n'impliquent pas qu'un incident se soit produit en production.

| Réf. | Priorité et preuve | Constat | Conséquence / modification nécessaire |
|---|---|---|---|
| R1 | P1 — confirmé dans l'émulateur | Un propriétaire de commande peut modifier son statut en `delivered` et `paymentStatus` en `paid`, y compris depuis une commande remboursée. La règle ne vérifie pas un état antérieur admissible ou une preuve serveur de remise (`firestore.rules:995`). | Des repas peuvent entrer à tort dans le décompte hospitalier/restaurant. Imposer transitions et preuve de consommation contrôlées côté serveur ; interdire la réactivation financière d'une commande remboursée. |
| R2 | P1 — confirmé dans l'émulateur | Paramètres lisibles sans authentification (`firestore.rules:365`) ; le même document contient des paramètres d'accès/code. | Séparer paramètres publics et paramètres restreints. Ne jamais stocker de secret Bictorys dans ce document. Aucune valeur de code n'est reproduite ici. |
| R3 | P1 — profils confirmés dans l'émulateur, commandes par lecture du code | Tous les comptes connectés peuvent lire les profils et les commandes (`firestore.rules:642`, `910`). | Exposition excessive de coordonnées et de consommations ; appliquer les droits par agent et par fonction, avec exports habilités. L'annuaire de secours embarqué actuel est vide : ne pas le présenter comme une fuite de données effective. |
| R4 | P1 — code | Une confirmation de caisse, un identifiant de demande ou un retour de navigateur ne prouvent pas un encaissement externe ; aucune unicité globale de transaction Bictorys. | Risque de crédit non encaissé ou de même paiement saisi deux fois sous deux identifiants. Créer une preuve prestataire vérifiée et une liaison unique paiement → crédit, atomique. |
| R5 | P1 — code | Pas de réception hospitalière enregistrée, double validation mensuelle, autorisation de paiement ou rapprochement d'un reversement réel. | Le tableau des sommes dues ne doit pas devenir un bouton de paiement sans ces étapes et des contrôles d'idempotence. |
| R6 | P1 — code et calcul | Réserve des badges affichée mais aucune réserve de trésorerie contrôlée ; certains totaux sont limités aux données chargées. | Risque de payer le restaurant avec des fonds encore dus aux agents. Instaurer rapprochement et contrôle de réserve, avec financement initial des frais. |
| R7 | P1 — code | `handleResetAllBadgeBalances` supprime notamment `orders`, tout en conservant les soldes et recharges (`src/App.tsx:2625`). `orders` est supprimable par `isAdmin`, qui inclut le gestionnaire restaurant (`firestore.rules:1000`). | Perte possible des pièces de consommation et rupture des rapprochements. Remplacer les suppressions financières par archivage et écritures correctrices ; séparer outils de test et production. Le nom de la fonction ne décrit pas sa suppression d'historiques. |
| R8 | P1 — code | Rapports parfois fondés sur `paid` au lieu de consommé, dates de commande, données tronquées ou secours incomplet. | Facturation et montant mensuel potentiellement inexacts. Produire un état exhaustif sur la date serveur de consommation ; refuser la clôture si incomplet. |
| R9 | P1 si réactivation du mode Functions — code | Le chemin Functions n'est pas équivalent à Spark : `requestId` de recharge est facultatif (`functions/index.js:48`), pas de contrôle préalable d'existence de la commande dans `createPaidOrder` (`241`), ventilation et autorisations différentes. Le tarif permanent peut aussi tenir compte d'une valeur soumise par le client (`286`). | Selon le panier/quota, un rejeu peut redébiter et écraser la même commande. Ne pas simplement activer le drapeau Functions : harmoniser et tester ces endpoints ou les remplacer pour les nouveaux flux. |
| R10 | P2 — risque statique, tentative croisée non aboutie | `isOwnOrderProfile` accepte des correspondances de contacts/badge, en plus du UID (`firestore.rules:337`) ; un contact personnel est modifiable (`595`). Le test croisé a été refusé en atteignant la limite d'évaluation des règles. | Aucune usurpation d'une autre commande n'est déclarée comme démontrée. Ces heuristiques restent fragiles pour un droit financier ; utiliser des liens UID immuables et des délégations explicites. La limite d'évaluation ne constitue pas une politique d'autorisation. |
| R11 | P2 — code | `waveTopupRequests` est largement modifiable par la caisse ; anciennes écritures `cashTransactions` sans `kind` restent modifiables/supprimables par l'administration ; cartes prépayées créées sans encaissement comptable lié obligatoire (`firestore.rules:719`, `758`, `780`). | Les garanties du nouveau journal ne couvrent pas uniformément les anciens circuits. Limiter les transitions, identifier la preuve d'encaissement et prévoir une migration/conciliation des anciens reçus. |
| R12 | P2 — code | L'URL de génération des QR transmet le téléphone, à défaut le badge, à un prestataire externe (`EmployeeView.tsx:1519`, `RestaurantView.tsx:2891`). | Générer les QR localement et utiliser un identifiant opaque. L'audit n'a envoyé aucun payload de QR. |
| R13 | P1 pour Windows — code | Le conteneur Electron empaqueté charge par défaut l'ancien site CHNCAK, sauf variable d'environnement de remplacement (`electron/main.cjs:4`). | Risque d'utiliser un autre environnement que Ndamatou. Corriger et vérifier la destination avant distribution de l'exécutable ; ne pas confondre le build web et le packaging Windows. |
| R14 | P2 — code | Un agent connecté peut diminuer le stock par une écriture ne touchant que `stock`, sans exiger une commande liée dans cette règle de collection (`firestore.rules:834`). | Réserver les mouvements de stock à une commande atomique ou à une opération de gestion habilitée ; limiter les blocages volontaires du service. |
| R15 | P2 — code | Prix, migration financière et habilitations reposent sur un compte technique propriétaire et des exceptions d'adresses ; des inscriptions actives sont permises par les règles de création, même si l'interface prévoit une validation DRH. | Formaliser les habilitations institutionnelles et les conditions d'activation côté serveur. Ne pas dépendre uniquement des contrôles de formulaire ou de la visibilité d'un bouton. |

Autres points à traiter : absence de workflow de sauvegarde/restauration prouvé, logs Firebase contenant des identifiants/contacts, génération HTML de certains rapports avec interpolation de données et conventions de dates différentes entre chemins. Les futurs exports et journaux doivent minimiser les données personnelles et résister à l'injection HTML/formule.

### Protections déjà utiles, à préserver

Le circuit Spark contrôle les liens solde/reçu/journal ; il refuse les augmentations isolées, les plafonds dépassés et les montants mobiles incohérents. Les identifiants stables protègent des reprises du même appel. Les commandes lient débit et stock ; les corrections et remboursements ont des justificatifs et des protections de rejeu. Le snapshot financier est obligatoire pour les nouvelles commandes et immuable lors des mises à jour. Les champs de rôle ne peuvent pas simplement être auto-promus par la mise à jour ordinaire du profil.

Ces protections sont importantes, mais elles ne remplacent pas la preuve de paiement externe, la certification de consommation et les approbations mensuelles.

## 8. Modifications nécessaires — proposition, non réalisées

### 8.1 Recharges Bictorys

Prévoir des intentions de paiement liées à un agent, à un montant de crédit et à une version tarifaire. Le serveur calcule les frais affichés, crée le paiement chez le prestataire et mémorise sa référence. Le crédit ne doit intervenir qu'après confirmation vérifiée côté serveur et contrôle du montant, de la devise, du statut final et du compte bénéficiaire.

L'authentification du webhook et la procédure de vérification devront être conformes au contrat et à la documentation Bictorys effectivement fournis ; aucun mécanisme ou nom d'en-tête n'est présumé dans ce rapport. La redirection vers une page de succès ne vaut jamais confirmation comptable.

La confirmation et les reprises doivent lier une seule fois l'identifiant prestataire au reçu, au journal et au solde. Prévoir doublons, événements désordonnés, paiement tardif, timeout, remboursement, refus et écart de montant. Une demande en état incertain doit être recherchée/rapprochée avant une nouvelle tentative financière.

### 8.2 Comptes et comptabilité

Introduire un journal financier équilibré distinguant : trésorerie encaissée, dette de crédits badge, droits attachés aux commandes non remises, créance hôpital, dette restaurant, commission développeur, frais d'encaissement, frais de reversement et remboursements dus. Les recharges ne sont pas immédiatement une recette de repas ; les créances hospitalières ne sont pas de la trésorerie reçue.

Les centimes comptables servent aux calculs et au rapprochement. Les paiements XOF exécutés doivent suivre une règle écrite d'arrondi au montant accepté par le canal, avec compte d'écarts. Les frais « attendus » et « constatés » doivent être deux informations distinctes.

Collections possibles, **nouvelles et non présentes aujourd'hui** : `paymentIntents`, `paymentEvents`, `financialEntries`, `monthlyStatements`, `hospitalReceipts`, `payoutRequests`, `payoutAttempts`, `payoutApprovals` et `reconciliations`. Les noms définitifs restent à décider ; il ne faut pas créer un second solde concurrent sans migration et rapprochement.

### 8.3 Décompte mensuel et validation

La période doit être calculée selon Africa/Dakar et la date de consommation certifiée par serveur. Le décompte doit inclure les repas éligibles effectivement remis, les annulations/retours et leurs régularisations, les montants par partie et les écarts. Les commandes traversant deux mois doivent être traitées explicitement.

Prévoir un état versionné : brouillon → soumis → validé par l'hôpital et par le restaurant → fonds hospitaliers reçus et rapprochés → autorisation administrative de paiement → reversement en cours → réglé/rapproché. Une contestation ou correction doit créer une nouvelle version ou un ajustement lié ; elle ne doit pas modifier silencieusement un état déjà approuvé.

Les signatures imprimées peuvent rester comme pièces complémentaires, mais les validations doivent être enregistrées avec l'acteur habilité, la date serveur, la version et les totaux approuvés. Le restaurant ne doit pas pouvoir à lui seul autoriser le paiement dont il est bénéficiaire.

### 8.4 Versement de l'hôpital et paiement du restaurant

Un virement hospitalier peut être enregistré manuellement avec justificatif et rapprochement, ce qui évite de forcer un passage payant par Bictorys. Si Bictorys est retenu, appliquer au versement le même principe de confirmation serveur et enregistrer ses frais réels. Gérer les versements partiels, retards, écarts et rejets.

Le reversement restaurant ne doit être préparé qu'après validation du décompte, réception suffisante de la contribution hospitalière, contrôle de réserve et approbation administrative. Comparer les canaux disponibles selon leurs frais totaux, plafonds, délais et disponibilité, sans supposer qu'un canal est toujours le moins cher.

Un virement manuel autorisé avec justificatif et contrôle indépendant peut constituer une première étape économique. Un payout API ultérieur doit posséder une référence métier unique, un identifiant de tentative, un état incertain explicite, une recherche de statut et une procédure de rapprochement. Ne jamais retenter avec une nouvelle référence simplement parce qu'une réponse tarde. La validation de l'ordre de paiement et la preuve de son exécution sont deux événements distincts.

## 9. Plan d'intégration progressif et économique

| Phase | Travail proposé | Condition de passage |
|---|---|---|
| 0 — Décisions | Valider l'équilibre 505/505/995/5, le financeur des frais, les tarifs prestataire, la réserve, le titulaire des fonds et les approbateurs | Modèle financier documenté et autorisé ; budget de fonctionnement estimé |
| 1 — Sécurisation de l'existant | Corriger les transitions des commandes, les droits de lecture, les suppressions et le rattachement des identités ; rapprocher les historiques | Tests de sécurité et reprise des soldes/obligations ; restauration testée |
| 2 — Backend minimal | Ajouter un composant serveur pour les secrets, intentions, confirmations et rapprochement des paiements ; conserver les interfaces React et le catalogue | Environnement d'essai, aucune clé privée dans le frontend, idempotence démontrée |
| 3 — Recharge automatique pilote | Un canal, faible périmètre, plafond d'exposition ; crédit uniquement après preuve serveur ; secours manuel distinct et habilité | Tests des succès, échecs, doublons, retards et remboursements ; rapprochement quotidien complet |
| 4 — Clôture et règlement manuel contrôlé | Décompte mensuel verrouillé, deux validations, réception hospitalière, réserve et autorisation ; virement restaurant avec justificatif | Un cycle mensuel rapproché sans écart inexpliqué ni paiement doublé |
| 5 — Automatisation ciblée | Comparaison de coût et payout API seulement si le gain opérationnel justifie son coût et ses risques | Statuts de payout, contrôle du bénéficiaire, reprise sur timeout et séparation des fonctions validés |

Le frontend peut conserver son mode de lecture et son hébergement existants. Un site Hosting statique ne peut pas conserver une clé privée ni recevoir seul un webhook avec logique de crédit serveur. Si Firebase Functions/Cloud Run ou un autre petit backend est retenu, ses conditions de facturation doivent être chiffrées avant décision ; l'audit ne promet ni gratuité ni maintien intégral du plan actuel pour ces fonctions serveur.

Pour maîtriser le coût : éviter un payout par repas, consolider les règlements mensuels autorisés, conserver l'impression et les exports utiles, limiter la rétention des événements techniques, mettre en place des alertes de coût, et ne développer l'automatisation des sorties qu'après stabilisation des encaissements et de la clôture.

Le basculement doit prévoir une date d'effet, une nouvelle version de formule, la coexistence maîtrisée des anciens reçus, un état d'ouverture rapproché et une actualisation des clients. Il ne faut pas remplacer les formules actuelles à la volée dans des rapports historiques ni activer sans vérification les anciennes Functions.

## 10. Questions à résoudre avant développement

1. Les 995 F au restaurant et les 5 F développeur sont-ils des montants nets garantis ou des objectifs avant frais ? Qui finance les écarts calculés et les frais de sortie ?
2. Quel est le contrat Bictorys applicable : encaissement, frais opérateur inclus ou additionnels, taxes, minimums, arrondis, remboursement et reversement ? Quelles pièces confirmeront les frais réellement retenus ?
3. Pour une recharge de plusieurs repas, les frais agent sont-ils proportionnels au crédit, par recharge, par repas, ou fixes ? Quel montant exact doit être crédité pour 505, 1 010 ou 5 050 F payés ?
4. Qui est titulaire du compte de collecte et habilité à conserver/mouvoir ces fonds ? Quels accords institutionnels et contrats de paiement autorisent ce circuit ?
5. Quel financement couvre la différence entre net encaissé et crédits protégés, dès la recharge et avant consommation ? Quel seuil de réserve bloque un reversement ?
6. Quel compte et quel acteur représentent l'hôpital ? Qui valide le décompte, qui constate le virement et qui autorise le paiement restaurant ? Quelles incompatibilités de rôles ?
7. Quel événement prouve le repas consommé : remise au comptoir, livraison confirmée, scan contrôlé par un opérateur ? Comment traiter repas non retirés, retours et consommations à cheval sur deux mois ?
8. Quelles portions, suppléments et dîners sont concernés par la subvention, les 995 F et la commission de 5 F ? Que faire des agents exclus ou bénéficiant de tarifs permanents ?
9. À quelle date l'hôpital paie-t-il et selon quelle procédure en cas de retard, de paiement partiel ou de contestation ? Faut-il suspendre certaines nouvelles consommations sans toucher aux crédits protégés ?
10. Le restaurant reçoit-il exactement 995 F par repas, frais de réception inclus ? Quels comptes bénéficiaires, plafonds et délais sont admissibles ? Qui approuve leur changement ?
11. Quelles API, confirmations et capacités de reversement sont réellement disponibles dans le contrat Bictorys ? Existe-t-il un environnement d'essai et une procédure de statut après timeout ?
12. Quels historiques sont exhaustifs ? Des remises à zéro ont-elles déjà eu lieu ? Quelle source externe permet de rapprocher soldes badge, recharges, repas, subventions et règlements antérieurs ?
13. Quels sont les volumes, budgets serveur, besoins de support, règles de conservation des pièces et modalités de sauvegarde/restauration ?
14. Quelle est la version réellement publiée et quels clients Android/Windows circulent ? Faut-il retirer ou corriger des exécutables pointant sur l'ancien site ?

## 11. Vérifications réalisées et garanties de non-modification

- Lecture des sources exécutables frontend, transactions, règles Firestore, backend alternatif, types, configuration de publication et scripts ; recherche des appels Bictorys/webhooks/payouts dans les fichiers exécutables, hors dépendances et bundles générés.
- `npm test` : **23 tests réussis**, sans transaction externe.
- `npm run lint` : **réussi**, contrôle TypeScript sans émission de fichiers.
- `npm run test:rules` avec émulateur local sur `127.0.0.1:8087`, projet de démonstration : **46 tests réussis**. Aucun projet de production n'est utilisé par cette suite.
- Contrôles supplémentaires isolés, sur un autre projet de démonstration local et des profils fictifs : lecture publique des paramètres autorisée ; lecture d'un autre profil autorisée ; passage d'une commande remboursée à livrée/payée par son propriétaire autorisé ; modification d'un contact personnel autorisée. La tentative de modifier une autre commande après correspondance de contact a été **refusée**, avec dépassement de la limite d'évaluation : aucune exploitation croisée n'est annoncée.
- Les 69 tests existants couvrent des protections utiles, mais pas tous les objectifs de centralisation. Leur succès ne constitue pas une certification de sécurité financière.
- Pas de lancement de l'application connectée : cela aurait pu déclencher sa migration automatique de paramètres. Pas de build de production, pour ne pas réécrire `dist`. Pas de déploiement, d'installation de dépendances, d'appel Bictorys ou de modification de données réelles.
- Empreintes de 55 fichiers applicatifs/configurations comparées avant et après l'audit : aucun changement ; valeurs d'environnement non reproduites. Seul ce rapport est ajouté à l'espace de travail par l'audit.

**Aucune intégration ni correction n'a été réalisée. Toute modification et toute mise en service restent soumises à votre autorisation après examen de cet audit.**
