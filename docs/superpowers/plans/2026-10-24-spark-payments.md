# Paiements réels sur Spark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline execution with final review.

**Goal:** Enregistrer recharges de caisse réelles et commandes sans Cloud Functions ni facturation Blaze.
**Architecture:** Transactions du SDK Firestore, autorisées par règles contrôlant le rôle, le montant, le plafond et la création simultanée d'un journal immuable, d'un reçu et du nouveau solde. Identifiant de reprise conservé. La validation Wave est manuelle par la caisse.
**Tech Stack:** React, TypeScript, Firebase Auth/Firestore, émulateur Firestore et rules-unit-testing.
**Spec:** Proposition acceptée par l'utilisateur le 24 octobre 2026 : rester Spark, caisse valide les paiements, transactions/règles puis publication.

## Global Constraints
- Projet unique repas-ndamatou-7f044 ; dossier courant conservé pour préserver les modifications existantes.
- Aucun compte, encaissement ni débit réel créé pour les tests.
- Aucun abonnement ni déploiement Functions.
- Ne pas restaurer les chemins de démonstration.

## Review Focus
- Crédit isolé sans reçu : refusé, y compris pour la caisse.
- Agent ordinaire : impossible de se créditer ou de se donner un rôle de caisse.
- Deux écritures concurrentes et reprise réseau : pas de double crédit ni dépassement de plafond.
- Badges bloqués/en attente et montants invalides : refusés par les règles.
- Remboursements/cartes/corrections : preuves source et effet unique, pas de simple incrément sans justificatif.

### Task 1: Transaction de caisse et règles
- [x] Écrire des tests d'émulateur démontrant refus d'un crédit isolé, d'un faux caissier et d'un dépassement ; les observer échouer sur les règles actuelles.
- [x] Implémenter src/lib/sparkBalance.ts : recharges et opérations liées avec journal walletOperations immuable et reçu cashTransactions identique, marqueur lastWalletOperationId sur users.
- [x] Restreindre les mises à jour de solde et de reçus dans firestore.rules, tester transaction valide et refus malveillants.

### Task 2: Raccordement Spark et opérations existantes
- [x] Router secureBalance.ts vers Spark quand Functions désactivées ; conserver le circuit transactionnel des commandes.
- [x] Relier cartes, validation Wave manuelle, corrections et annulations à des transactions vérifiées.
- [x] Configurer .env.local sur Spark, documenter la publication hosting/rules seulement.

### Task 3: Vérification et publication
- [x] Tests émulateur, tests existants, TypeScript et build.
- [x] Revue indépendante finale, correction des défauts bloquants.
- [x] Déployer uniquement firestore:rules et hosting sur repas-ndamatou-7f044 ; vérifier le site public.

## Ledger
Ruling: conserver le dossier local en cours plutôt qu'un worktree vide — les corrections non commitées de la session sont requises.
Ruling: seul le reçu confirmé par Firestore permet l'affichage d'un succès financier.

Verification : 37 tests de règles financiers réussis, plus test du rapport serveur réussi ; 10 tests existants réussis. Revue indépendante sans défaut financier bloquant. Limite explicite de deux articles distincts pour respecter le budget de règles ; portions selon paramétrage. Horaires/compteurs et rapports utilisent les dates serveur.

Validation complémentaire : deux tests de livraison réussis (autorisation, frais et responsable de service). Total validé : 40 cas émulateur en lots ciblés et suite financière, 10 tests existants.

Publication confirmée : firestore:rules et hosting déployés sur repas-ndamatou-7f044, sans Functions. Vérification HTTPS : statut 200 ; index et SHA-256 du bundle public identiques au build local (index-CVQrPtLu.js). TypeScript et build finaux réussis.
