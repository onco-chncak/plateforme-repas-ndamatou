# Plateforme Repas Ndamatou

Application web de commande de repas pour le personnel du Centre Hospitalier Ndamatou de Touba.

## Fonctionnalités actuelles

- Portail personnel pour consulter le menu, voter pour le menu du lendemain et passer une commande.
- Espace restaurant pour gérer les plats, les stocks, les commandes et les statistiques.
- Espace livraison pour suivre les commandes à préparer, en cours et livrées.
- Notifications internes et synchronisation Firebase des opérations.
- Recharges et débits de badges par transactions Firestore sécurisées, compatibles avec Firebase Spark.

## Installation locale

Prérequis: Node.js et npm.

```bash
npm install
npm run dev
```

L'application démarre par défaut sur:

```text
http://localhost:3000
```

## Connexion Firebase

1. Créez un projet dans la console Firebase.
2. Ajoutez une application Web Firebase.
3. Activez Firestore Database.
4. Copiez `.env.example` vers `.env.local`.
5. Renseignez les variables `VITE_FIREBASE_*` avec la configuration de votre application Web Firebase.
6. Redémarrez `npm run dev`.

Exemple:

```env
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="votre-projet.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="votre-projet"
VITE_FIREBASE_STORAGE_BUCKET="votre-projet.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
VITE_FIREBASE_MEASUREMENT_ID="..."
VITE_FIRESTORE_DATABASE_ID=""
VITE_SECURE_BALANCE_FUNCTIONS="false"
```

## Règles Firestore

Le fichier `firestore.rules` impose les droits, le montant, le plafond et la création simultanée du solde et des reçus. Les commandes sont vérifiées contre le catalogue, le stock et les quotas. L'identification utilise Firebase Auth et les rôles enregistrés dans Firestore.

## Notes de développement

Firebase est obligatoire : sans configuration valide, l'application bloque l'accès aux opérations. Aucun compte, repas ou solde fictif n'est injecté. Les recharges fonctionnent sur Spark, avec validation manuelle de la caisse pour les espèces et Wave.

Projet actuel : `repas-ndamatou-7f044`. Site : https://repas-ndamatou-7f044.web.app

Voir `docs/MISE_EN_SERVICE_NDAMATOU.md` pour la publication.


## Copie GitHub privée

Ce dépôt contient un instantané du code Ndamatou. Les secrets, données Firestore et historiques Git antérieurs ne sont pas inclus. Aucun déploiement automatique n’est configuré par cette sauvegarde.

Copier `.env.example` vers `.env.local` et renseigner la configuration Firebase localement. Conserver `VITE_SECURE_BALANCE_FUNCTIONS=false` pour Spark. Les secrets du sandbox Cloudflare doivent être configurés séparément ; le test de paiement Bictorys reste non validé de bout en bout. Ne pas publier de clés, mots de passe, exports d’agents ou journaux.
