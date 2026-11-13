# Fiche de paramétrage Wave - Plateforme Repas CHNCAK Touba

## Objectif

Brancher le paiement Wave à la plateforme repas du CHNCAK Touba pour permettre au personnel de payer ou recharger son badge via Wave, avec confirmation automatique dans l'application.

## Ce que l'hôpital doit fournir à Wave

- Nom officiel de la structure : Centre Hospitalier National Cheikh Ahmadoul Khadim de Touba.
- Nom commercial affiché au paiement : Repas CHNCAK Touba.
- Adresse de l'hôpital.
- Téléphone officiel du service administratif ou financier.
- Email officiel de contact.
- NINEA / RCCM ou document administratif demandé par Wave.
- Pièce d'identité du responsable habilité, si demandée.
- Coordonnées du compte bancaire ou compte de règlement, si Wave reverse les fonds sur un compte.
- Numéro Wave marchand souhaité ou numéro Wave existant de l'hôpital, si déjà disponible.
- Nom et contact du référent technique : SMSG, smsgueye@gmail.com, 774190805.
- URL de production de l'application : https://repas-chncak-44b98.web.app
- Domaine personnalisé futur, si disponible.

## Ce que Wave doit fournir

Demander explicitement à Wave :

- Compte marchand Wave activé pour le CHNCAK.
- Numéro marchand ou identifiant marchand.
- Accès API de paiement, si Wave le propose directement.
- Clé API publique, si nécessaire.
- Clé API secrète, à garder confidentielle.
- Identifiant marchand, merchant ID ou business ID.
- URL de création de paiement.
- URL de vérification du paiement.
- Documentation API officielle.
- Méthode de webhook ou notification serveur.
- Clé de signature webhook, si disponible.
- Liste des statuts possibles : succès, échec, expiré, annulé, en attente.
- Environnement test/sandbox, si disponible.
- Environnement production.
- Frais de transaction.
- Délai de reversement des fonds.
- Personne support technique Wave.

## Ce que nous devons leur demander clairement

1. Est-ce que Wave Sénégal fournit une API directe aux marchands ?
2. Est-ce que le paiement peut être déclenché depuis une application web ?
3. Est-ce que le client reçoit une demande de paiement dans son application Wave ?
4. Est-ce que Wave envoie un webhook automatique quand le paiement est réussi ?
5. Est-ce que nous pouvons vérifier une référence de paiement par API ?
6. Quels sont les frais exacts par paiement ?
7. Quel est le délai de reversement ?
8. Existe-t-il un mode test avant production ?
9. Quelles sont les limites de montant ?
10. Quelles informations personnelles du payeur sont retournées à l'application ?

## Comment le paiement va fonctionner dans l'application

### Mode provisoire actuel

1. Le personnel choisit paiement Wave.
2. L'application affiche le numéro marchand Wave du CHNCAK.
3. Le personnel envoie le montant via Wave.
4. Le personnel saisit la référence de transaction.
5. Le restaurant ou le SAF vérifie manuellement.
6. La commande est validée dans l'application.

### Recharge par carte prépayée interne

La plateforme peut aussi fonctionner avec des cartes prépayées CHNCAK sans frais de transaction.

Principe :

1. L'administration crée ou imprime des cartes de recharge.
2. Chaque carte contient un code unique et un montant.
3. Le personnel saisit le code dans son compte.
4. Le badge est crédité du montant correspondant.
5. Le code doit être marqué comme utilisé pour éviter une deuxième utilisation.

Avantages :

- aucun frais Wave ;
- fonctionnement possible même si le personnel n'a pas de compte Wave ;
- utile pour les dotations internes ou avances repas ;
- contrôle possible par le SAF.

Pour la version de production, il faudra ajouter une collection Firestore dédiée :

```text
prepaidCards
```

Champs recommandés :

- code
- amount
- status: active / used / cancelled
- createdAt
- usedAt
- usedBy
- createdBy

Important : les codes de production devront être uniques et non devinables.
### Mode automatique après intégration API

1. Le personnel clique sur payer par Wave.
2. L'application crée une demande de paiement Wave.
3. Wave affiche ou envoie la demande au téléphone du personnel.
4. Le personnel confirme dans Wave.
5. Wave notifie l'application par webhook.
6. L'application marque automatiquement la commande payée.
7. La commande apparaît comme validée au restaurant.
8. Les recettes et performances se mettent à jour automatiquement.

## Informations techniques à prévoir

- Collection Firestore `orders` : stocker le statut de paiement.
- Collection Firestore `payments` : créer un enregistrement pour chaque paiement Wave.
- Champs importants :
  - orderId
  - userId
  - amount
  - provider: wave
  - paymentReference
  - waveTransactionId
  - status
  - createdAt
  - paidAt
- Fonction serveur nécessaire pour sécuriser les clés API.
- Ne jamais mettre la clé secrète Wave dans le code frontend.

## Point important de sécurité

Les clés secrètes Wave ne doivent jamais être placées dans React, Vite ou Firebase Hosting. Elles doivent être utilisées côté serveur, par exemple avec :

- Firebase Cloud Functions ;
- un serveur Node.js sécurisé ;
- ou un agrégateur de paiement qui gère la sécurité.

## Décision recommandée

Pour démarrer rapidement :

1. Utiliser le mode provisoire Wave avec numéro marchand et référence.
2. Ouvrir un compte marchand Wave officiel au nom du CHNCAK.
3. Demander à Wave l'accès API ou l'option webhook.
4. Quand les accès sont fournis, intégrer le paiement automatique.

## Contacts projet

Responsable projet :

```text
SMSG
smsgueye@gmail.com
774190805
```

Application :

```text
Plateforme Repas CHNCAK Touba
https://repas-chncak-44b98.web.app
```

