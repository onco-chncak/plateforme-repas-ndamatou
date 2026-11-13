# Intégration WhatsApp - Plateforme restauration CHNCAK

## Objectif

Envoyer aux agents ayant donné leur accord des notifications WhatsApp pour :

- confirmation de commande ;
- départ de la livraison ;
- repas remis ou commande annulée ;
- rappel de commande ;
- alerte importante du restaurant.

## Solution recommandée

Utiliser **WhatsApp Business Platform Cloud API** de Meta. Ne jamais placer le jeton Meta dans le code React, `.env.local` publié ou Firebase Hosting.

L'envoi doit passer par une passerelle serveur sécurisée :

- Firebase Functions lorsque le forfait Blaze sera accepté ;
- ou un petit serveur Node.js hébergé séparément ;
- ou un prestataire WhatsApp Business officiel.

## Éléments à obtenir auprès de Meta ou du prestataire

- identifiant du compte WhatsApp Business ;
- identifiant du numéro de téléphone ;
- jeton d'accès permanent ;
- numéro WhatsApp professionnel vérifié ;
- modèles de messages approuvés ;
- URL et secret du webhook.

## Éléments fournis par le CHNCAK

- nom officiel de l'établissement ;
- numéro professionnel à utiliser ;
- preuve d'autorisation d'utilisation du numéro ;
- textes des notifications ;
- politique de consentement des agents ;
- liste des événements qui déclenchent un message.

## Consentement

Le profil personnel comporte maintenant l'option **Recevoir les notifications sur WhatsApp**. Seuls les agents ayant activé cette option doivent recevoir les messages.

## Sécurité

- conserver le jeton uniquement côté serveur ;
- vérifier chaque webhook reçu ;
- journaliser chaque envoi ;
- limiter les messages aux événements utiles ;
- permettre à l'agent de retirer son consentement ;
- ne jamais envoyer le solde complet du badge ou une information médicale.

## Étapes de branchement

1. Créer ou utiliser un compte Meta Business du CHNCAK.
2. Ajouter WhatsApp Business Platform et vérifier le numéro.
3. Faire approuver les modèles de messages.
4. Déployer la passerelle serveur.
5. Ajouter le jeton et les identifiants comme secrets serveur.
6. Déclencher les messages uniquement pour les profils avec `whatsappOptIn = true`.
7. Tester avec quelques agents avant le déploiement général.

Documentation officielle :

- https://developers.facebook.com/docs/whatsapp/cloud-api/
- https://developers.facebook.com/docs/whatsapp/pricing/
