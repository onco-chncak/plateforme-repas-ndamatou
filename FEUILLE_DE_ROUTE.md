# Feuille de route — Plateforme Repas Ndamatou

Dernière mise à jour : 24 octobre 2026.
Statut : version Spark publiée ; projet en pause à la demande de l’utilisateur.

## 1. Objectif de l’application

Gérer les repas du personnel du Centre Hospitalier Ndamatou : comptes et badges, menus, commandes, paiement par solde de badge, préparation, livraison et suivi comptable.

## 2. Repères pour reprendre le projet

- Site publié : https://repas-ndamatou-7f044.web.app
- Projet Firebase unique : repas-ndamatou-7f044.
- Offre retenue : Spark, sans activation de Blaze.
- Base Firestore : (default), région europe-west9.
- Dossier local de référence : C:/Users/Test/Documents/plateforme-repas-ndamatou.
- Technologies : React, TypeScript, Vite, Firebase Auth et Firestore.
- Guide de publication : [MISE_EN_SERVICE_NDAMATOU.md](docs/MISE_EN_SERVICE_NDAMATOU.md).
- Plan technique réalisé : [Paiements Spark](docs/superpowers/plans/2026-10-24-spark-payments.md).

Attention : une autre copie existe sous C:/Users/Test/Documents/PROJET REPAS HOPITAL NDAMATOU/plateforme-repas-ndamatou. Elle ne doit pas être confondue avec le dossier de référence contenant les corrections de cette session.

## 3. État actuel

### Fonctionnalités présentes dans le code

- Espace personnel : profil, badge, consultation du menu, vote et commande.
- Gestion des profils, validation des badges et droits du personnel.
- Espace restaurant : menus, stocks, préparation et suivi des commandes.
- Suivi des livraisons et autorisations par service.
- Caisse : recharges, demandes Wave, cartes prépayées et corrections.
- Suivi comptable, rapports et notifications internes.

Cette liste décrit les modules présents. Leur validation complète en conditions réelles reste une étape distincte des tests techniques réalisés.

### Travaux terminés pendant cette session

- [x] Corriger la configuration et la cible Firebase vers repas-ndamatou-7f044.
- [x] Rendre le site accessible et publier la nouvelle version.
- [x] Retirer les données et parcours de démonstration de l’application.
- [x] Faire fonctionner les opérations financières avec Firestore sur Spark, sans Cloud Functions.
- [x] Enregistrer simultanément le solde, le reçu et le journal d’une recharge.
- [x] Empêcher les doubles crédits lors des reprises et les dépassements du plafond configuré.
- [x] Contrôler les droits de caisse et le statut du badge.
- [x] Relier cartes prépayées, validations Wave, corrections et remboursements de caisse au circuit sécurisé.
- [x] Vérifier prix, stock, débit et compteurs de portions ensemble pour une commande payée.
- [x] Utiliser les dates serveur pour les rapports comptables des nouvelles écritures.
- [x] Protéger les nouveaux journaux financiers contre la modification et la suppression.
- [x] Retirer les messages qui demandaient Blaze et masquer le module de facture Blaze sur Spark.
- [x] Publier les règles Firestore et le site ; vérifier la page publique et le bundle publié.

Le 24 octobre 2026, l’utilisateur a confirmé que cela fonctionne.

### Vérifications réalisées

- 40 cas de tests Firestore validés sur émulateur, en suite et lots ciblés.
- 10 tests existants réussis.
- Vérification TypeScript et compilation de production réussies.
- Revue indépendante des contrôles financiers effectuée et défauts bloquants relevés corrigés.
- Site public : HTTP 200, fichier principal identique au build local.
- Aucun compte ni paiement réel créé automatiquement pour les tests.

## 4. Règles de fonctionnement à conserver

- Une recharge correspond à un encaissement réel validé par un compte autorisé.
- Wave reste manuel : la caisse vérifie le paiement reçu avant de créditer le badge. Aucune confirmation bancaire automatique n’est intégrée.
- Le succès affiché dépend de la confirmation Firestore.
- Le panier accepte au maximum deux articles distincts ; le nombre de portions et le quota restent soumis aux paramètres de l’établissement.
- Le remboursement par l’agent reste désactivé dans cette configuration. Les remboursements autorisés passent par la caisse.
- Les erreurs de caisse se corrigent par une écriture tracée, sans effacer le journal financier.
- Ne pas activer Blaze ni déployer de fonctions sans nouvelle décision de l’utilisateur.
- Ne pas réintroduire de comptes, soldes ou commandes fictifs dans la base réelle.

## 5. Prochaine étape — Vérifier l’utilisation quotidienne

Ces actions restent à réaliser ou à confirmer lors de la reprise, avec les responsables concernés et uniquement sur des opérations réellement justifiées.

- [ ] Confirmer les comptes autorisés : administration, restaurant, caisse, DRH et livraison.
- [ ] Vérifier les paramètres de l’établissement : tarifs, plafond de badge, quotas, horaires, frais et autorisations de livraison.
- [ ] Lors du prochain encaissement réel, vérifier le reçu, le journal et le solde après actualisation.
- [ ] Lors du prochain paiement Wave réel, vérifier le parcours de déclaration et de validation manuelle.
- [ ] Suivre une commande réelle de bout en bout : paiement, stock, préparation, remise ou livraison.
- [ ] Comparer un rapport de caisse aux encaissements et commandes réellement enregistrés.
- [ ] Recueillir les difficultés rencontrées par les utilisateurs sur téléphone et ordinateur.

Critère de fin : les responsables peuvent effectuer leur travail courant et rapprocher les opérations des justificatifs réels.

## 6. Ensuite — Fiabilisation et entretien

Priorités proposées pour la reprise, à ajuster selon les retours ; aucune de ces tâches n’est lancée pendant la pause.

- [ ] Corriger les anomalies constatées pendant l’utilisation quotidienne.
- [ ] Vérifier les parcours de profil, menu, vote, notification et livraison qui n’ont pas encore été validés complètement en situation réelle.
- [ ] Vérifier les messages d’erreur et les reprises après coupure réseau sur les appareils utilisés.
- [ ] Examiner les avertissements de dépendances et mettre à jour ce qui est nécessaire, avec vérification des régressions.
- [ ] Étudier la réduction du poids du fichier JavaScript principal pour améliorer le chargement sur mobile.
- [ ] Définir avec l’établissement une procédure de sauvegarde et de restauration adaptée aux moyens disponibles.
- [ ] Préparer un guide court pour le personnel et les responsables.
- [ ] Organiser la sauvegarde du code et des changements locaux avant une prochaine évolution importante.

## 7. Évolutions possibles — À décider plus tard

- Confirmation automatique des paiements Wave, uniquement après étude du fournisseur, des droits d’accès, de la sécurité et des coûts.
- Élargissement des paniers au-delà de deux articles distincts si le besoin est confirmé et si l’architecture le permet.
- Évolution éventuelle vers une architecture serveur et Blaze si l’utilisateur le décide.
- Installations Android ou Windows : des scripts existent, mais la construction et la distribution de ces versions restent à vérifier séparément.

Ces possibilités ne sont ni promises, ni activées, ni nécessaires pour conserver la version Spark actuelle.

## 8. Commandes utiles pour la reprise

Depuis le dossier local de référence, dans PowerShell :

~~~powershell
npm run dev
npm run lint
npm run build
node --test tests/topupRequests.test.ts functions/topup.test.cjs
~~~

Tests des règles, avec Java et Firebase CLI disponibles :

~~~powershell
$env:NODE_USE_SYSTEM_CA = '1'
firebase emulators:exec --only firestore --project demo-ndamatou-spark --config firebase.emulators.json "node --test --test-concurrency=1 tests/spark.rules.test.cts"
~~~

Publication, uniquement après validation des modifications :

~~~powershell
$env:NODE_USE_SYSTEM_CA = '1'
firebase deploy --only "firestore:rules,hosting" --project repas-ndamatou-7f044
~~~

Le projet demo-ndamatou-spark sert uniquement aux tests locaux sur émulateur. La production reste repas-ndamatou-7f044.

## 9. Point de reprise après la pause

1. Ouvrir le dossier de référence et relire cette feuille de route.
2. Examiner les changements locaux existants avant toute modification ; ne pas les écraser.
3. Consulter les retours de l’utilisateur depuis la publication.
4. Commencer par la section 5, puis choisir la prochaine correction utile.

Aucun travail automatique, rappel ou déploiement supplémentaire n’est prévu pendant la pause.
