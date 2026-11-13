# Sécurisation Spark et préparation de la démonstration — Ndamatou

Date : 13 novembre 2026. Périmètre : modifications locales conservatrices, après l’audit financier et technique.

**Mise à jour après autorisation : les règles et le site ont ensuite été publiés le 13 novembre 2026. Voir le [compte rendu de déploiement](docs/DEPLOIEMENT_2026-11-13.md). Les mentions d’absence de déploiement ci-dessous décrivent la phase locale initiale, avant cette autorisation. La rémunération configurable et l’intégration Bictorys restent non activées.**

**Aucun déploiement n’a été effectué. Aucun accès aux données de production, paiement Bictorys, changement de tarif ou mouvement de badge réel n’a été effectué. Les protections décrites ci-dessous ne seront actives sur le site publié qu’après une publication expressément autorisée.**

## 1. Choix de périmètre

Les corrections retenues avant intervention concernent la réactivation d’une commande clôturée/remboursée, la qualification d’un remboursement sans écriture liée et les suppressions d’historiques. Elles utilisent exclusivement les règles Firestore et les transactions du SDK existant. Les droits de lecture et l’identification historique des profils restent inchangés pour limiter le risque de blocage.

Les changements potentiellement plus perturbants — restrictions de lecture, refonte des QR, migration des identités et nouveaux paiements — sont reportés. La protection des historiques désactive volontairement les anciens outils de suppression et de remise à zéro globale ; les corrections comptables tracées restent disponibles.

## 2. Corrections réalisées

| Fichier / fonction | Changement | Comportement préservé |
|---|---|---|
| `firestore.rules` / `preservesOrderLifecycle` | Une commande annulée, expirée, remise ou retournée ne peut plus changer de statut. Un paiement remboursé ne redevient pas payé. | Traitement des commandes actives ; mises à jour autorisées de métadonnées sur un statut inchangé |
| `firestore.rules` / mises à jour `orders` | Passage payé → remboursé conditionné à une nouvelle opération `refund-<commande>` liée dans la même écriture atomique ; cette opération reste soumise aux contrôles du journal, du solde et du reçu. | Remboursement caisse existant, restitution du quota et correction tracée ; confirmation administrative des anciens paiements en attente |
| `firestore.rules` / parcours agent | Vérification rapide du bénéficiaire par UID avant les autres branches, pour éviter d’épuiser le budget d’expressions sur les actions ordinaires | Scan et annulation de l’agent ; branches historiques de rapprochement de profils conservées |
| `firestore.rules` / suppressions | Refus de suppression des commandes, reçus de caisse, y compris anciens reçus, et demandes Wave | Lecture, export et conservation des décomptes ; journal financier déjà non supprimable |
| `src/lib/orderLifecycle.ts` et `App.handleUpdateOrderStatus` | Contrôle préalable dans l’interface ; répétition du même statut sans nouvel effet | Transitions des commandes actives ; les règles restent l’autorité indépendante du navigateur |
| `App.handleCancelWaveTopup`, `src/types.ts`, règles Wave | Annulation logique `cancelled`, avec auteur et date serveur ; lecture puis mise à jour transactionnelle du statut réel, au lieu d’effacer le document | L’agent peut annuler une demande encore en attente, sans crédit ni débit du badge |
| Règles Wave | Seules les demandes en attente sont traitables ; caisse limitée aux champs de validation ; une demande approuvée ne peut être rouverte | Approbation manuelle Spark existante, une seule fois, avec crédit et reçu |
| `App` / effet de migration tarifaire | Retrait de la migration automatique déclenchée à la connexion du propriétaire | Tarifs déjà enregistrés conservés ; aucune formule, valeur par défaut ou ancienne commande recalculée |
| `App.handleResetAllBadgeBalances`, `handleClearCashHistory`, `handleClearOperationalHistory` | Remplacement des écritures destructrices par un message de protection | Ajustements individuels et corrections comptables tracés conservés |

Les changements de statut terminal et les effacements sont volontairement refusés même à l’administration. Une rectification exceptionnelle d’une commande clôturée devra ultérieurement passer par une procédure traçable, distincte d’une remise en préparation.

L’annulation Wave et l’approbation de caisse lisent la même demande dans une transaction : si l’autre action est déjà confirmée, son statut empêche le traitement concurrent. Aucun mécanisme de paiement automatique n’a été ajouté.

## 3. Vérifications locales

Tests réalisés avec des utilisateurs et montants fictifs, uniquement contre l’émulateur Firestore sur `127.0.0.1:8087`, projet `demo-ndamatou-spark`. Aucun compte réel ni téléphone réel n’est utilisé pour les scénarios ajoutés. Les profils des différents rôles ont des coordonnées distinctes pour ne pas confondre droits métier et rapprochement historique de profils.

| Rôle / domaine | Parcours vérifiés dans les tests |
|---|---|
| Agent | Profil, inscription normale, commande payée avec débit/stock/quota atomiques, scan de remise, annulation simple, annulation logique Wave, refus de crédit ou remboursement fabriqué |
| Restaurant / administration | Préparation → livraison → remise, confirmation d’un ancien paiement en attente, remboursement réel avec journal, refus de réactivation et d’effacement d’historique |
| Opérateur | Préparation, livraison et remise selon les droits existants ; opérations de caisse exercées par les tests Spark |
| Comptabilité | Lecture des profils/commandes et recharge manuelle autorisée, écritures liées, frais, correction tracée et rapport comptable |
| DRH | Validation du profil/badge, crédit de subvention consommé une seule fois, refus de réécriture directe du portefeuille |
| Livraison | Préparation, acheminement et remise ; commandes avec frais institutionnels et autorisation de service |
| Résilience | Rejeu d’une recharge sans double crédit, concurrence sur plafond et stock, correction déjà traitée, double remboursement, conservation des anciens reçus et tarifs |

Les tests de régression ont été exécutés avant les corrections pour constater les failles, puis après modification. Les scénarios positifs vérifient aussi que les actions nécessaires restent autorisées. Les refus malveillants peuvent produire des messages `PERMISSION_DENIED` attendus dans les journaux ; certains chemins déjà complexes atteignent encore la limite d’expressions lors de tentatives refusées. Cela ne remplace pas une preuve complète de toutes les autorisations possibles.

Résultats finaux :

- `npm.cmd test` : **26 tests réussis, 0 échec**.
- `npm.cmd run test:rules` : **58 tests réussis, 0 échec**, avec profils fictifs distincts.
- `npm.cmd run lint` : **TypeScript sans erreur**.
- `npm.cmd run build` : **compilation réussie**. L’avertissement Vite sur la taille du bundle subsiste ; il ne bloque pas la compilation et aucune optimisation structurelle n’a été tentée avant la démonstration.
- Relecture indépendante du périmètre : aucun défaut introduit identifié ; la limite préexistante de conversion avec supplément agent est documentée ci-dessous.
- Comparaison SHA-256 avant/après des configurations et modules protégés : inchangés, notamment `firebase.json`, `.firebaserc`, fichiers d’environnement, `functions/index.js`, calculs financiers et modules de transactions Spark.

**Limite des vérifications :** il s’agit de tests unitaires, de transactions réelles contre l’émulateur, d’une vérification TypeScript et d’une compilation. La connexion au fournisseur Authentication, la caméra QR sur téléphone, la livraison physique, l’impression et chaque interaction visuelle n’ont pas été exécutées de bout en bout. Aucun essai sur le site connecté aux agents réels n’a été fait. La compatibilité de tous les profils historiques de production ne peut donc pas être garantie par ces tests seuls.

## 4. Fonctionnalités conservées

Les composants de connexion, badges, restauration, comptabilité, rapports, DRH, livraison et administration sont conservés. Les fichiers de transactions `sparkBalance.ts` et `sparkOrders.ts`, le routage `secureBalance.ts` et les calculs `finance.cjs` ne sont pas modifiés dans cette intervention. Aucune nouvelle dépendance n’est installée ; seul le script de tests dans `package.json` inclut les nouveaux tests de transition.

Les recharges manuelles restent manuelles. Les montants versés, crédits de badge, commissions et formules préexistantes restent ceux du projet. Le modèle financier souhaité dans l’audit n’est pas activé. Les anciennes commandes, reçus et soldes réels ne sont ni migrés ni supprimés.

## 5. Corrections reportées et risques résiduels

| Sujet | Raison du report / prochaine étape |
|---|---|
| Lectures étendues des utilisateurs, commandes et paramètres | Les abonnements actuels utilisent ces lectures. Concevoir des requêtes et vues par rôle, puis les tester avant de restreindre les règles |
| Propriété rapprochée par e-mail, badge ou téléphone | Compatibilité des comptes historiques. Migrer vers une propriété UID fiable après inventaire et validation des cas de récupération |
| QR et codes de livraison | Génération côté client et service QR externe encore présents. Prévoir une génération locale et une validation plus robuste sans casser les scanners |
| Anciens reçus sans `kind` | Leur suppression est bloquée, mais certaines modifications administratives restent permises par les règles existantes. Définir un processus de correction compatible avec cet historique |
| Fonctions backend historiques | Non activées. Revoir autorisations, idempotence et calculs avant toute éventuelle utilisation ; aucun passage à Blaze pour la démonstration |
| Conversion d’une commande déjà créée vers livraison avec supplément agent | Limitation Spark préexistante : écriture directe du portefeuille et changement de total incompatibles avec les protections existantes. Les nouvelles commandes de livraison sont testées ; cette conversion particulière n’est pas présentée comme validée. Concevoir ultérieurement une opération de supplément atomique, sans changer les tarifs aujourd’hui |
| Autorisations administratives étendues | La caisse peut toujours effectuer les ajustements tracés autorisés. La protection contre un utilisateur métier autorisé malveillant exige une séparation des responsabilités ultérieure |
| Décompte mensuel, double validation, fonds hospitaliers reçus et reversement restaurant | Fonctionnalités futures, sans implementation dans cette étape ; distinguer impérativement dettes de badges et trésorerie disponible |
| Test visuel et profils historiques | Prévoir une répétition sur environnement fictif isolé ; ne pas provoquer de commandes ou recharges artificielles en production |

La sécurisation est progressive : ces corrections ne constituent pas une clôture de tous les risques de l’audit.

## 6. Compatibilité Spark et absence de déploiement

- Les modifications utilisent Firestore Rules et les transactions client existantes, sans nouveau service serveur.
- Aucun ajout ou activation de Cloud Functions, Cloud Run, Secret Manager ou service nécessitant Blaze.
- Aucun changement de `firebase.json`, `.firebaserc` ou configuration d’environnement dans cette intervention ; aucun changement de plan demandé ou effectué.
- Aucune transaction Bictorys, aucun appel de reversement, aucune clé ou donnée personnelle ajoutée à ce rapport.
- Aucun déploiement Firebase, aucune écriture ni suppression dans le projet réel.
- Les essais de l’émulateur local ne consomment pas le quota Firestore de production.

La compatibilité avec Spark est conservée au niveau du code et des services configurés. Le plan déclaré par l’utilisateur n’a pas été vérifié dans la console. Aucun coût Firebase supplémentaire n’est introduit par ces changements ; les quotas ordinaires du plan Spark continuent de s’appliquer. La compilation génère uniquement le dossier local `dist` et ne publie pas le site.

## 7. Préparation de la démonstration et suite

Complément du 13 novembre 2026 : [conception de la rémunération configurable](docs/CONCEPTION_REMUNERATION_DEVELOPPEUR_NDAMATOU.md). Trois modes sont proposés : commission par repas, abonnement institutionnel mensuel/annuel et aucune rémunération. Le document prévoit versions datées, historique, habilitations, exclusivité des modes sauf avenant explicite, séparation des frais et de la retenue restaurant. Aucun code de calcul, paramètre Firebase ou tarif n’est modifié dans ce complément ; les nouvelles fonctions restent à développer après validation.

Le document `docs/ARCHITECTURE_FUTURE_BICTORYS.md` décrit les frontières à respecter pour une future intégration, sans code actif, nouvelle collection déployée ni secret. L’intégration réelle, le modèle financier et un éventuel hébergement serveur nécessitent une autorisation séparée.

Avant une démonstration d’écriture, faire une répétition avec profils fictifs dans un environnement isolé : connexion, affichage du badge, recharge manuelle, commande, préparation, remise, rapport comptable et validation DRH. Pour la livraison, privilégier le parcours de création de commande déjà autorisée en livraison, couvert par les tests. Vérifier visuellement caméra, impression et affichage sur l’appareil de présentation. Une démonstration sur les données réelles doit éviter les commandes et recharges fictives.

Les changements locaux ne doivent pas être annoncés comme actifs sur le site public avant publication. Une fois les fichiers relus, une autorisation explicite sera nécessaire pour publier conjointement les règles et l’interface. Aucune commande de déploiement n’a été exécutée dans cette mission.
