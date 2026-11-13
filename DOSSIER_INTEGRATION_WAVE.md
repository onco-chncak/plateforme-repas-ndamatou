# Dossier de préparation - Intégration paiement Wave

Plateforme Repas CHNCAK Touba  
Centre Hospitalier National Cheikh Ahmadoul Khadim de Touba  
Préparé par SMSG - smsgueye@gmail.com - 774190805

## Objectif de la demande

Nous souhaitons intégrer le paiement Wave dans une application web interne permettant au personnel du CHNCAK Touba de payer ses repas.

L'objectif est de remplacer le paiement mobile provisoire actuel par un paiement automatisé :

1. le personnel choisit Wave comme moyen de paiement ;
2. l'application crée une demande de paiement ;
3. le personnel valide le paiement via Wave ;
4. Wave confirme le paiement à l'application ;
5. la commande est automatiquement marquée comme payée.

## Informations administratives à préparer

Wave ou l'agrégateur pourra probablement demander :

- nom légal de l'établissement ;
- adresse complète de l'hôpital ;
- numéro d'identification fiscale ou équivalent ;
- registre de commerce ou document administratif de l'établissement si applicable ;
- nom du responsable administratif/financier ;
- téléphone professionnel du responsable ;
- email professionnel de contact ;
- compte bancaire ou compte marchand de réception ;
- justificatif d'identité du responsable légal ou mandaté ;
- type d'activité : restauration interne hospitalière ;
- estimation du nombre de transactions par jour ;
- montant moyen par transaction ;
- devise : FCFA / XOF ;
- pays : Sénégal.

## Informations métier à expliquer

L'application concerne les repas du personnel hospitalier.

Règle tarifaire :

- première portion : 500 FCFA, subventionnée par l'hôpital ;
- deuxième portion : prix réel du plat ;
- maximum deux portions du même plat ;
- paiement par badge, espèces ou Wave selon le choix du personnel.

Les commandes sont ouvertes de 10h à 13h.

Les commandes peuvent être :

- consommées sur place ;
- livrées uniquement si le personnel est autorisé.

## Informations techniques à demander à Wave

Demander clairement :

- existe-t-il une API de paiement marchand pour application web ?
- faut-il passer par un agrégateur partenaire ?
- comment créer une demande de paiement ?
- quels paramètres sont obligatoires : montant, téléphone, référence, description, callback URL ?
- l'utilisateur reçoit-il une demande de validation sur son téléphone ?
- Wave fournit-il un lien de paiement ou une demande push ?
- existe-t-il un mode test/sandbox ?
- comment recevoir la confirmation de paiement ?
- les confirmations passent-elles par webhook ?
- comment vérifier qu'un webhook vient bien de Wave ?
- y a-t-il une signature HMAC, un token secret ou une clé publique ?
- comment gérer les paiements échoués, expirés ou annulés ?
- comment gérer les remboursements ?
- quels sont les frais par transaction ?
- quel est le délai de règlement vers le compte de l'hôpital ?
- y a-t-il des limites de montant ou volume ?
- quelles données personnelles sont retournées par l'API ?

## Données que notre application devra envoyer

Pour chaque paiement, l'application devra envoyer :

- identifiant de commande : exemple `CMD-1234` ;
- montant à payer ;
- devise : `XOF` ;
- nom du personnel ;
- téléphone du personnel ;
- email du personnel ;
- badge du personnel ;
- description : repas CHNCAK Touba ;
- URL de confirmation serveur ;
- URL de retour utilisateur si Wave utilise une redirection.

## Webhook attendu

Le système doit recevoir une notification serveur après paiement.

Exemple de données attendues :

```json
{
  "transactionId": "WAVE-123456",
  "orderId": "CMD-1234",
  "amount": 500,
  "currency": "XOF",
  "status": "paid",
  "paidAt": "2026-06-03T12:00:00Z",
  "customerPhone": "+221770000000"
}
```

Statuts nécessaires :

- `pending` : paiement créé mais non confirmé ;
- `paid` : paiement confirmé ;
- `failed` : paiement échoué ;
- `cancelled` : paiement annulé ;
- `expired` : délai dépassé ;
- `refunded` : paiement remboursé.

## Architecture recommandée

Ne pas appeler l'API Wave directement depuis le navigateur.

Il faut un backend sécurisé, par exemple :

- Firebase Cloud Functions ;
- ou serveur Node.js ;
- ou backend fourni par l'agrégateur.

Flux recommandé :

```text
Application web
  -> Cloud Function createPayment
  -> API Wave / agrégateur
  -> demande de paiement au personnel
  -> Wave confirme par webhook
  -> Cloud Function update order
  -> Firestore orders/{orderId}.paymentStatus = paid
```

## Collections Firestore concernées

Commande :

```text
orders/{orderId}
```

Champs importants :

- `paymentMethod`: `online_card` ou futur `wave`;
- `paymentStatus`: `pending`, `paid`, `refunded`;
- `total`;
- `employeeId`;
- `employeeName`;
- `employeePhone`;
- `createdAt`;
- `notes`.

Il faudra ajouter si nécessaire :

- `paymentProvider`;
- `paymentReference`;
- `paymentTransactionId`;
- `paymentConfirmedAt`;
- `paymentRawResponse`.

## Questions à poser pendant la réunion

1. Est-ce que Wave propose une API directe pour notre établissement ?
2. Si non, quels agrégateurs recommandez-vous ?
3. Peut-on créer un paiement de 500 FCFA minimum ?
4. Peut-on identifier chaque paiement avec notre numéro de commande ?
5. Fournissez-vous une URL de webhook ?
6. Comment sécuriser les webhooks ?
7. Existe-t-il un environnement sandbox ?
8. Quel est le délai de validation d'un paiement ?
9. Que se passe-t-il si l'utilisateur paie mais ferme l'application ?
10. Comment gérer un paiement en double ?
11. Comment faire un remboursement ?
12. Quels sont les frais ?
13. Quel contrat ou dossier administratif faut-il fournir ?
14. Quel compte reçoit l'argent ?
15. Peut-on recevoir un rapport journalier ou mensuel des paiements ?

## Documents à apporter

- présentation courte de l'application ;
- capture ou lien de l'application ;
- nom du projet Firebase ;
- lien public : `https://repas-chncak-44b98.web.app` ;
- pièce administrative de l'établissement ;
- coordonnées du responsable ;
- estimation du volume :
  - plus de 500 personnels potentiels ;
  - commandes entre 10h et 13h ;
  - montant personnel courant : 500 FCFA pour la première portion ;
  - deuxième portion au prix réel.

## Version provisoire actuelle

Actuellement, le paiement Wave est manuel :

1. l'application affiche le numéro marchand ;
2. le personnel effectue le transfert ;
3. il saisit la référence ;
4. le restaurant/SAF vérifie.

Cette méthode doit être remplacée par une API officielle ou un agrégateur pour automatiser la validation.
