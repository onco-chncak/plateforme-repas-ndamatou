# Proposition commerciale - Plateforme Repas CHNCAK Touba

## Présentation

La Plateforme Repas CHNCAK Touba est une application web et mobile installable destinée à organiser la commande, la distribution, le paiement et le suivi des repas du personnel du Centre Hospitalier National Cheikh Ahmadoul Khadim de Touba.

Elle permet au personnel de commander son repas, de voter pour le menu du lendemain, de consulter son historique de consommation, de gérer son badge QR et de communiquer avec ses collègues. Elle permet au restaurant et à l'administration de gérer les menus, les stocks, les commandes, les remises de plats par scan QR, les autorisations de livraison, les recettes et les rapports de performance.

## Problème résolu

La gestion manuelle des repas peut entraîner des files d'attente, des pertes de tickets, un manque de visibilité sur les stocks, une difficulté à comptabiliser les consommations, et une absence de statistiques fiables.

La plateforme apporte une solution centralisée, traçable et évolutive :

- commande numérique par le personnel ;
- limitation et tarification automatique des portions ;
- subvention hospitalière intégrée ;
- lecture QR des badges au restaurant ;
- suivi des stocks en temps réel ;
- statistiques de consommation et de recettes ;
- rapports imprimables avec zones de signature et cachet ;
- badge imprimable avec QR code et contact en cas de perte.

## Fonctionnalités principales

### Personnel CHNCAK

- inscription et connexion sécurisée ;
- consultation des menus disponibles ;
- commande du repas du jour ;
- choix consommation sur place ou livraison autorisée ;
- paiement par badge ou paiement mobile provisoire ;
- historique individuel de consommation ;
- vote pour le menu du lendemain ;
- notation des plats consommés ;
- messagerie interne ;
- impression du badge QR individuel.

### Restaurant et administration

- tableau des commandes en direct ;
- envoi en cuisine ;
- remise du plat par scan du badge QR ;
- dispatch au livreur pour les personnes autorisées ;
- gestion des menus du jour ;
- gestion des stocks par catégories : entrées, plats chauds, desserts, boissons ;
- création, modification et suppression des repas ;
- proposition des menus pour le lendemain ;
- impression massive des badges du personnel, six badges par feuille A4 ;
- suivi des performances et recettes ;
- impression des rapports avec signature et cachet du chef SAF et du responsable restaurant ;
- gestion du logo, des photos institutionnelles et des paramètres.

## Cloud et fiabilité

La plateforme utilise Firebase pour :

- l'authentification des comptes ;
- la base de données Firestore ;
- la synchronisation en temps réel ;
- l'hébergement public sécurisé ;
- l'accès multi-appareils.

Pour un démarrage officiel avec plus de 500 comptes, Firebase peut supporter ce volume sans difficulté technique. Les points à prévoir pour une exploitation fiable sont :

- règles Firestore strictes ;
- sauvegarde régulière des données ;
- compte Firebase institutionnel appartenant à l'hôpital ;
- activation d'un plan adapté si le volume augmente fortement ;
- procédure de restauration des données ;
- formation des utilisateurs clés.

Quand le restaurateur ajoute ou modifie un menu dans Firestore, tous les comptes connectés reçoivent la mise à jour automatiquement grâce à la synchronisation temps réel.

## Matériel recommandé

Pour le contrôle au restaurant, le matériel conseillé est un lecteur QR 2D USB filaire en mode clavier HID avec support de table.

Avantages :

- coût faible ;
- pas d'installation complexe ;
- compatible avec PC Windows ;
- fonctionne comme un clavier ;
- adapté au comptoir restaurant.

Prix indicatif : 15 000 à 35 000 FCFA par lecteur.

## Valeur du projet

La valeur estimative du projet complet est proposée à :

```text
5 000 000 FCFA
```

Cette valeur couvre :

- conception et développement de la plateforme ;
- interface personnel ;
- interface restaurant / administration ;
- interface livreur ;
- intégration Firebase ;
- badge QR ;
- impression massive des badges ;
- rapports de performance ;
- accompagnement au déploiement ;
- documentation fonctionnelle ;
- corrections et améliorations initiales.

Une maintenance annuelle peut être proposée séparément selon le niveau d'accompagnement souhaité par l'hôpital.

## Proposition de maintenance

Option de maintenance recommandée :

```text
600 000 FCFA par an
```

Elle peut couvrir :

- corrections mineures ;
- assistance technique ;
- petites évolutions fonctionnelles ;
- vérification périodique Firebase ;
- accompagnement des administrateurs.

## Conclusion

La Plateforme Repas CHNCAK Touba apporte une solution moderne, traçable et adaptée au fonctionnement hospitalier. Elle améliore l'organisation du restaurant, réduit les erreurs de distribution, facilite le suivi des recettes et donne à l'administration des données fiables pour piloter le service.

Copyright SMSG 2026  
smsgueye@gmail.com  
774190805
