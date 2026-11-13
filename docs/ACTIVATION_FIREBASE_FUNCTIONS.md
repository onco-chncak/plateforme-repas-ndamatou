# Activation des opérations de solde sécurisées

Les opérations suivantes sont préparées pour être exécutées par Firebase Functions :

- recharge d'un badge par le comptable ;
- correction ou annulation d'une recharge pendant 60 secondes ;
- validation comptable d'une demande Wave historique ;
- utilisation d'une carte prépayée ;
- débit du badge lors d'une commande ;
- remboursement du badge lors d'une annulation.

Le mode sécurisé reste désactivé tant que les Functions ne sont pas déployées. Cela évite de bloquer l'application existante.

## Prérequis

Firebase Functions nécessite l'activation du forfait Blaze du projet Firebase. Les règles de sécurité et les contrôles de rôle restent appliqués côté serveur.

## Déploiement

Dans l'invite de commandes Windows :

```cmd
cd /d "C:\Users\Test\Documents\plateforme-repas-chncak"
cd functions
"C:\Program Files\nodejs\npm.cmd" install
cd ..
firebase deploy --only functions
```

Ajouter ensuite cette ligne dans `.env.local` :

```env
VITE_SECURE_BALANCE_FUNCTIONS=true
```

Reconstruire et publier l'application :

```cmd
cd /d "C:\Users\Test\Documents\plateforme-repas-chncak"
"C:\Program Files\nodejs\node.exe" ".\node_modules\vite\bin\vite.js" build
firebase deploy --only "hosting,firestore:rules"
```

## Vérifications avant verrouillage définitif

Tester avec un compte personnel, un comptable et un restaurant :

1. recharge puis annulation dans les 60 secondes ;
2. refus d'annulation après 60 secondes ;
3. utilisation unique d'une carte prépayée ;
4. débit exact lors d'une commande ;
5. restauration du stock et remboursement lors d'une annulation.

Après validation de tous ces scénarios, les écritures directes de `walletBalance` pourront être interdites dans les règles Firestore.
