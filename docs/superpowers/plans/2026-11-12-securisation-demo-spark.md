# Sécurisation conservatrice de la démonstration Spark

> Exécution : superpowers:executing-plans. Demande utilisateur : corriger les vulnérabilités sans modifier les paiements, données réelles, tarifs ou services Firebase. Travail dans le dossier existant pour conserver les modifications locales non commitées.

## Périmètre retenu avant modification

La sécurisation complète des lectures, identités historiques et QR peut bloquer des usages ; elle est reportée. Cette étape conserve les rôles et parcours et traite uniquement la réactivation des commandes terminales/remboursées, la modification du paiement sans opération liée et les suppressions d'historiques. Les remboursements et corrections restent des écritures atomiques Spark. La migration tarifaire automatique à la connexion est retirée : aucune valeur de tarif ou solde n'est changée.

Risque identifié et solution : une règle trop stricte pourrait bloquer un scan ou une annulation normale. Conserver les transitions des commandes actives, les scans agent/restaurant/livreur et les remboursements avec reçu lié ; vérifier chaque rôle dans l'émulateur. Conserver la confirmation administrative des anciens paiements en attente, mais pas la réactivation d'un paiement remboursé. Les outils d'effacement deviennent des messages de protection, conformément à la demande de conservation.

## Étapes

- [x] Écrire et exécuter les tests démontrant la réactivation interdite et la protection des suppressions ; observer leur échec sur les règles actuelles.
- [x] Ajouter les garde-fous ciblés dans Firestore, sans changer les règles de création, les autorisations de lecture ou les formules financières. Tester les parcours positifs et négatifs pour agent, restaurant, opérateur, comptabilité, DRH, livraison et administration.
- [x] Ajouter un contrôle de transition dans l'interface et supprimer les effets automatiques de migration et les opérations d'effacement ; conserver les fonctions de correction tracée.
- [x] Exécuter tests unitaires, règles et TypeScript ; compiler localement, faire relire et rédiger le rapport de livraison et la préparation future purement documentaire.

## Résultat

26 tests unitaires et 58 tests Firestore réussis, TypeScript et compilation validés. Relecture indépendante effectuée. Configurations et modules de paiement/transaction protégés comparés par SHA-256 et inchangés. Rapport : `RAPPORT_SECURISATION_SPARK_DEMONSTRATION_NDAMATOU.md`. Aucune publication ni opération de production.

## Invariants

Pas de déploiement. Pas de console Firebase ni d'application connectée aux données réelles. Tests uniquement localhost avec profils fictifs. Pas de nouveaux services, dépendances ou coûts d'exécution. Configurations et calculs de paiement inchangés ; seules les corrections autorisées du code et des règles sont livrées. Ne pas annoncer une faille corrigée en production avant publication autorisée.
