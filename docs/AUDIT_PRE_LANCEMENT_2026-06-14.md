# Audit pré-lancement - Plateforme Restauration CHNCAK

Date de l'audit : 14 juin 2026

## Résultat général

La compilation de production réussit et le compte personnel s'affiche sans page blanche ni erreur JavaScript visible. Les formules financières de référence ont été testées avec succès :

- première portion quotidienne : personnel 410 FCFA, hôpital 390 FCFA ;
- portions suivantes : personnel 800 FCFA, hôpital 0 FCFA ;
- montant réel : part personnel + part hôpital.

## Corrections appliquées

- Ajout d'une confirmation Oui/Non avant de libérer une place lors de la sortie du restaurant.
- Remplacement des écritures de commande et d'annulation par des transactions Firestore afin d'éviter les collisions de stock et de solde.
- Vérification du montant attendu et de la limite quotidienne avant chaque commande.
- Suppression de l'injection automatique de données de démonstration dans Firebase.
- Renforcement des règles de création de commande et de profil.
- Restriction de la lecture des demandes Wave au propriétaire, au comptable et aux administrateurs.
- Correction du calcul des portions restantes physiquement.
- Uniformisation des dates selon l'heure locale de Touba.
- Correction du fichier de paramétrage Wave qui contenait des caractères cassés.
- Ajout d'un écran de récupération en cas d'erreur d'affichage.
- Mise à jour du cache PWA pour diffuser correctement la nouvelle version.

## Vérifications réussies

- Build Vite de production : réussi.
- Test navigateur du formulaire de connexion : réussi.
- Test navigateur d'un compte personnel Firebase : réussi, aucune erreur console.
- Recherche de caractères cassés dans le code et les règles : aucun caractère cassé restant.
- Test automatisé des calculs financiers : réussi.
- Synchronisation temps réel présente pour repas, commandes, profils, notifications, recharges et présence restaurant.

## Risques résiduels importants

### Sécurité des soldes sans Firebase Functions

Les opérations de solde sont encore exécutées depuis l'application cliente car Firebase Functions n'est pas activé. Un utilisateur techniquement malveillant utilisant un navigateur modifié pourrait tenter de manipuler son propre solde ou certains compteurs. L'interface normale ne permet pas cette fraude, mais les règles Firestore seules ne peuvent pas garantir totalement les opérations financières complexes.

Recommandation avant utilisation financière importante : activer le forfait Blaze puis déplacer les débits, crédits, remboursements, cartes prépayées et validations sensibles dans Firebase Functions.

### Validation métier sans serveur

La limite de commandes, la preuve d'un scan QR et certains compteurs sont renforcés dans l'application, mais leur garantie absolue nécessite également une validation serveur.

### Test de charge

Le système utilise les écouteurs temps réel Firestore et les transactions critiques. Il reste recommandé de faire un essai réel avec 20 à 50 agents simultanés avant l'ouverture à plus de 500 personnes.

### Matériel

L'impression automatique et la lecture QR doivent être validées avec le lecteur HID et l'imprimante thermique réels, avec le navigateur Edge configuré et le bon format d'étiquette.

### Environnement local

Le contrôle TypeScript signale des déclarations de types Firestore manquantes dans l'installation locale de `node_modules`. La compilation Vite et l'exécution fonctionnent. Une réinstallation propre des dépendances devra être faite ultérieurement pour rétablir ce contrôle supplémentaire.

## Checklist avant ouverture

1. Déployer ensemble `hosting` et `firestore:rules`.
2. Tester une commande, une annulation, un scan restaurant, une sortie et une livraison sur le site public.
3. Tester deux commandes simultanées sur la dernière portion d'un même plat.
4. Tester une recharge puis une annulation avec le comptable.
5. Vérifier les prix administrateur : réel 800, hôpital 390, personnel 410.
6. Exporter les données comptables et conserver une sauvegarde avant l'ouverture.
7. Vérifier les horaires, la fermeture du week-end et les quotas de livraison.
8. Former le restaurant à ne servir qu'après validation verte ou ticket valide.

## Décision recommandée

L'application est utilisable pour un lancement pilote contrôlé. Pour un lancement financier pleinement sécurisé, l'activation des Firebase Functions reste la principale amélioration nécessaire.
