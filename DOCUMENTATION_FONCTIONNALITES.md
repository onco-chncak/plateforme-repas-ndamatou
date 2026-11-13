# Documentation fonctionnelle - Plateforme Repas CHNCAK Touba

Portail culinaire officiel du Centre Hospitalier National Cheikh Ahmadoul Khadim de Touba.

Copyright SMSG 2026 - smsgueye@gmail.com - 774190805

## Objectif

L'application permet au personnel du CHNCAK Touba de commander les repas du jour, de voter pour le menu du lendemain, de suivre son historique de consommation, et de gérer son profil et son badge.

Elle permet aussi au restaurant, au livreur et à l'administration de suivre les commandes, les stocks, les recettes, les autorisations de livraison et les paramètres institutionnels.

## Compte personnel CHNCAK

Le personnel peut :

- créer un compte et se connecter avec Firebase Authentification ;
- consulter les menus disponibles ;
- commander un repas sur place ou demander une livraison ;
- voir le nombre de portions restantes ;
- payer par badge, paiement mobile provisoire ou espèces ;
- recharger le badge par Wave ou par carte prépayée interne sans frais ;
- consulter son historique personnel de consommation ;
- noter les repas consommés ;
- voter pour les menus proposés pour le lendemain ;
- imprimer son badge avec QR code ;
- afficher le contact à appeler si le badge est perdu ;
- échanger avec des collègues via la messagerie interne.

## Règles de tarification

La première portion d'un plat est subventionnée par l'hôpital et revient au personnel à 500 FCFA.

La deuxième portion du même plat est autorisée, mais elle est facturée au prix réel du repas. L'hôpital ne supporte pas cette deuxième portion.

Au-delà de deux portions du même plat, la commande est bloquée.

## Livraison

Par défaut, le personnel consomme au restaurant.

La livraison est réservée aux personnes autorisées par le SAF ou à celles qui disposent du code d'accès SAF.

L'administrateur peut gérer la liste des personnes autorisées à la livraison dans l'espace restaurant.

## Horaires de commande

Les commandes sont ouvertes de 10h à 13h.

Hors créneau, l'application affiche un message avec le numéro à appeler.

## Compte restaurant / administrateur

Le compte restaurant permet :

- de voir les commandes en direct ;
- d'envoyer une commande en cuisine ;
- de dispatcher une commande au livreur ;
- de confirmer une livraison ;
- de scanner le QR code du badge du personnel au restaurant pour remettre et comptabiliser le plat ;
- d'annuler une commande ;
- de gérer les stocks par catégories : entrées, plats chauds, desserts, boissons ;
- d'ajouter, modifier ou supprimer un repas ;
- de réapprovisionner les portions ;
- de proposer des menus pour le vote du lendemain ;
- d'ajouter rapidement des menus sénégalais comme Thiéboudienne, Mafé, Domoda, Souloukhou et Yassa ;
- de consulter les performances et recettes ;
- d'imprimer un rapport des recettes journalier, mensuel, semestriel ou annuel ;
- d'imprimer les badges QR de tout le personnel inscrit, classés par service, à raison de six badges par feuille A4 ;
- de modifier les informations institutionnelles : logo, directrice, chef SAF, numéro marchand Wave, code SAF.

## Suivi performance

Le suivi performance affiche :

- les recettes ;
- le nombre de commandes ;
- la moyenne par commande ;
- la répartition des commandes par service ;
- la répartition des ventes par catégorie ;
- un tableau historique des recettes.

La moyenne par commande correspond aux recettes divisées par le nombre total de commandes.

## Compte livreur

Le livreur peut voir les commandes prêtes à être livrées, prendre une commande en charge, puis la marquer comme livrée.

Les commandes sur place ne sont pas envoyées au livreur.

## Firebase

Firebase est utilisé pour :

- l'authentification des comptes ;
- la synchronisation Firestore des utilisateurs, repas, commandes, notifications et paramètres institutionnels ;
- l'hébergement public avec Firebase Hosting.

Les paramètres institutionnels sont stockés dans Firestore dans le document :

```text
settings / institution
```

## Paiement mobile provisoire

Avant l'intégration d'un agrégateur de paiement, l'application propose un paiement mobile provisoire :

1. le personnel choisit Wave ;
2. l'application affiche le numéro marchand de l'hôpital ;
3. le personnel effectue le transfert ;
4. le personnel saisit la référence de transaction ;
5. le restaurant ou le SAF vérifie la référence.

Pour un paiement automatique, l'hôpital devra ouvrir un compte marchand Wave ou passer par un agrégateur disposant d'une API et de webhooks compatible Wave.

## Déploiement

Pour publier une nouvelle version :

```cmd
cd "C:\Users\Test\Documents\plateforme-repas-chncak"
set "PATH=C:\Users\Test\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%CD%\node_modules\.bin;%PATH%"
vite build
firebase deploy --only firestore:rules,hosting
```

Lien public :

```text
https://repas-chncak-44b98.web.app
```
