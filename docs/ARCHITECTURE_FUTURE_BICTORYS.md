# Préparation documentaire de l’intégration Bictorys

Date : 13 novembre 2026. Statut : proposition pour après la démonstration, sans intégration ni activation de service.

## Existant conservé

L’application utilise Firebase Authentication, Firestore, ses règles et Hosting. Les recharges manuelles, demandes Wave validées par la caisse et mouvements de badges passent par les transactions Spark existantes. Une validation manuelle de caisse ne constitue pas une confirmation automatique Bictorys.

Les modules `src/lib/secureBalance.ts`, `src/lib/sparkBalance.ts`, `src/lib/sparkOrders.ts` et `functions/finance.cjs` ne sont pas modifiés par la sécurisation de démonstration. Aucun appel Bictorys, secret, webhook, reversement ou décompte mensuel validé n’est ajouté.

## Frontières à préserver

| Domaine | Source actuelle | Évolution envisagée, à autoriser séparément |
|---|---|---|
| Authentification et rôles | Authentication et profils Firestore | Conserver les sessions ; revoir séparément les identités historiques et privilèges |
| Crédit des badges | Transaction de caisse + reçu + `walletOperations` | Crédit unique après preuve de paiement contrôlée côté serveur |
| Consommation | Transaction `sparkOrders` + stock/quota + commande | Conserver le débit unique et la ventilation figée au moment du repas |
| Historique | Commandes, reçus, journal | Corriger par écritures traçables, sans effacement ni réécriture du passé |
| Contribution hospitalière | Rapports calculés existants | Décompte mensuel figé, double validation et rapprochement des fonds reçus |
| Paiement restaurant | Pas de reversement automatisé vérifié | Autorisation administrative, paiement unique, preuve et rapprochement |

## Contrat de la future confirmation de paiement

Le navigateur pourra demander une recharge, mais il ne devra jamais déclarer lui-même qu’un paiement opérateur est réussi. Un composant serveur futur devra vérifier la notification et le statut auprès du fournisseur selon son contrat officiel, rapprocher la référence, la devise et le montant attendu, puis enregistrer dans une même opération le crédit, le reçu et la preuve de rapprochement. Les identifiants fournisseur et internes devront empêcher les doublons, y compris après notifications répétées, délais ou réponse perdue.

Ce composant n’est pas implémenté. Son hébergement, ses coûts et les mécanismes exacts de vérification ne sont pas décidés. Il ne faut pas activer l’ancien dossier `functions` comme raccourci : ses règles métier et son périmètre doivent être revus avant toute utilisation. Le choix de conserver Spark ou de financer un serveur est une décision ultérieure.

## Séparer les montants

La rémunération du développeur n’est pas décidée. La conception détaillée des modes commission, abonnement et aucune rémunération, avec dates d’effet, habilitations et historique, figure dans [CONCEPTION_REMUNERATION_DEVELOPPEUR_NDAMATOU.md](CONCEPTION_REMUNERATION_DEVELOPPEUR_NDAMATOU.md). Aucun mode nouveau n’est activé. La commission développeur et la retenue restaurant sont deux règles distinctes ; supprimer la commission ne fixe pas automatiquement le restaurant à 995 F.

Une future écriture devra distinguer au minimum : montant payé, crédit consommable du badge, participation aux frais, frais réellement prélevés par Bictorys et l’opérateur, contribution hospitalière, dette envers le restaurant, commission et coût du reversement. Conserver les références des preuves et les dates de valeur ; ne pas confondre trésorerie reçue et revenu de la plateforme.

Le scénario demandé dans l’audit (agent 505 F, hôpital 505 F, restaurant 995 F, commission visée 5 F) doit être rapproché des frais réels. Le reliquat arithmétique de 10 F avant ces frais ne garantit pas la rentabilité. Les calculs actuels, dont certains exemples donnent 990 F au restaurant, sont conservés pour cette démonstration. Toute nouvelle formule doit faire l’objet d’une validation métier explicite et d’un versionnement, sans recalculer les anciennes commandes.

## Clôture et reversement futurs

Prévoir une période et une version de décompte, les repas admissibles, les montants par partie, la validation de l’hôpital, celle du restaurant, la preuve d’encaissement de l’hôpital et une autorisation administrative distincte de l’exécution du paiement. Les tentatives de reversement devront avoir une référence unique et un statut vérifiable pour empêcher un second versement après une réponse perdue.

Réserver les crédits non consommés des badges : ils constituent un engagement envers les agents et ne doivent pas financer un reversement. Une simulation et un rapprochement fictifs doivent précéder tout usage réel. Le choix virement/Mobile Money dépendra des coûts et disponibilités effectivement confirmés à ce moment-là.

## Ordre de travail ultérieur

1. Valider le modèle économique, les frais réels, les arrondis et la protection des fonds non consommés.
2. Choisir un environnement de test et un hébergement approuvé ; obtenir les spécifications officielles Bictorys et les accès de test par un canal sécurisé.
3. Tester confirmation, échec, expiration, répétition et concurrence sans argent réel.
4. Introduire le décompte figé et les validations mensuelles avant le reversement.
5. Tester les rapprochements et l’autorisation administrative avec données fictives.
6. Demander une autorisation distincte avant intégration réelle, changement de plan Firebase ou déploiement.
