# Migration SaaS - Plateforme Restauration CHNCAK

## Objectif

Transformer l'application actuelle, utilisée par le CHNCAK Touba, en plateforme SaaS vendable a plusieurs hopitaux ou etablissements, sans mettre en danger la version CHNCAK actuellement en production.

La regle principale est simple : chaque etablissement doit voir uniquement ses agents, ses repas, ses commandes, ses recharges, ses rapports et ses parametres.

## Etat actuel

L'application est deja cloud :

- Firebase Authentication pour la connexion.
- Firestore pour les donnees.
- Firebase Hosting pour le lien public.
- Firebase Functions pour les operations sensibles.
- Roles deja presents : personnel, restaurant, admin, comptable, DRH, livreur, operateur.

Mais les donnees sont encore organisees comme une application mono-etablissement. Les collections principales sont globales.

## Collections Firestore detectees

Collections metier principales :

- `users`
- `orders`
- `meals`
- `cashTransactions`
- `waveTopupRequests`
- `prepaidCards`
- `notifications`
- `restaurantPresence`
- `deliveryCodeIssuers`
- `registrationIdentifiers`
- `ideaBox`
- `satisfactionSurveys`

Parametres :

- `settings/institution`
- `settings/officialResetApproval`

Ces collections devront etre rattachees a un etablissement.

## Nouvelle notion centrale

Ajouter un identifiant d'etablissement :

```ts
hospitalId: string
```

Exemple pour CHNCAK :

```ts
hospitalId: "chncak-touba"
```

Chaque document sensible devra contenir ce champ.

## Donnees a isoler par etablissement

Chaque document devra porter `hospitalId` :

- agents/personnels
- commandes
- repas et menus
- recharges badges
- demandes Wave
- cartes prepayees
- notifications
- presence restaurant
- habilitations de livraison
- boites d'idees
- questionnaires de satisfaction

Les parametres devront etre separes par etablissement.

## Structure Firestore recommandee

Deux architectures possibles.

### Option A - Collections globales avec champ `hospitalId`

Exemple :

```txt
users/{uid}
orders/{orderId}
meals/{mealId}
cashTransactions/{transactionId}
```

Chaque document contient :

```ts
hospitalId: "chncak-touba"
```

Avantages :

- Migration plus progressive.
- Moins de changement brutal dans le code.
- Plus facile pour conserver les donnees actuelles.

Inconvenients :

- Les regles Firestore doivent etre tres strictes.
- Les requetes devront filtrer partout par `hospitalId`.

### Option B - Sous-collections par etablissement

Exemple :

```txt
hospitals/{hospitalId}/users/{uid}
hospitals/{hospitalId}/orders/{orderId}
hospitals/{hospitalId}/meals/{mealId}
hospitals/{hospitalId}/cashTransactions/{transactionId}
```

Avantages :

- Isolation plus lisible.
- Structure SaaS plus propre a long terme.

Inconvenients :

- Beaucoup plus de modifications dans le code.
- Migration plus longue.
- Risque plus eleve si on le fait directement sur la version en production.

## Recommandation

Pour ne pas casser la version CHNCAK, commencer par l'option A :

1. Ajouter `hospitalId` aux types.
2. Ajouter `hospitalId` aux nouveaux documents.
3. Ajouter automatiquement `hospitalId: "chncak-touba"` aux documents existants.
4. Modifier progressivement les requetes pour filtrer par `hospitalId`.
5. Renforcer les regles Firestore.
6. Quand tout est stable, envisager une structure plus avancee si necessaire.

## Nouveaux roles SaaS

Ajouter un niveau superieur :

```ts
role: "saas_admin"
```

Ce role gere :

- creation d'un etablissement client
- activation/desactivation d'un etablissement
- abonnement SaaS
- modules actifs
- quotas
- supervision globale

Les admins locaux restent limites a leur etablissement.

## Nouvelle collection SaaS

Ajouter :

```txt
hospitals/{hospitalId}
```

Exemple :

```ts
{
  id: "chncak-touba",
  name: "Centre Hospitalier National Cheikh Ahmadoul Khadim de Touba",
  shortName: "CHNCAK Touba",
  status: "active",
  subscriptionPlan: "production",
  subscriptionStatus: "active",
  createdAt: "...",
  logoUrl: "...",
  contactEmail: "...",
  contactPhone: "..."
}
```

## Parametres par etablissement

Aujourd'hui :

```txt
settings/institution
```

Version SaaS recommandee :

```txt
hospitalSettings/{hospitalId}
```

Ou plus tard :

```txt
hospitals/{hospitalId}/settings/institution
```

Parametres concernes :

- logo
- signataires
- prix repas
- part hopital
- horaires de commande
- capacite restaurant
- regles de livraison
- quota remboursement
- services
- fonctions
- batiments
- etages
- texte publicitaire
- parametres d'impression
- modules actifs

## Regles de securite SaaS

Principe :

- un utilisateur lit uniquement les documents de son `hospitalId`
- un admin local modifie uniquement son `hospitalId`
- le super admin SaaS voit tous les etablissements
- aucune commande, recharge ou solde ne doit pouvoir passer d'un etablissement a un autre

Pseudo-regle :

```txt
request.auth.token.hospitalId == resource.data.hospitalId
```

Mais comme Firebase Authentication ne contient pas encore les claims, on peut d'abord utiliser le document `users/{uid}.hospitalId`.

## Firebase Auth et multi-etablissement

Deux options :

### Simple au depart

Chaque utilisateur a dans Firestore :

```ts
hospitalId: "chncak-touba"
```

Les regles Firestore verifient ce champ.

### Plus robuste plus tard

Utiliser les custom claims Firebase :

```ts
{
  hospitalId: "chncak-touba",
  role: "admin"
}
```

Cette option est plus propre, mais necessite Firebase Functions/Admin SDK.

## Migration des donnees CHNCAK

Script a prevoir :

1. Lire toutes les collections actuelles.
2. Ajouter `hospitalId: "chncak-touba"` quand absent.
3. Ne jamais modifier les soldes sans sauvegarde.
4. Exporter avant migration :
   - agents
   - soldes badges
   - recharges
   - commandes
   - repas
   - parametres
5. Verifier les totaux financiers avant/apres.

## Points sensibles a ne pas casser

Priorite haute :

- solde badge
- recharge badge
- annulation/remboursement
- scan restaurant
- impression ticket
- rapports financiers
- validation DRH
- commandes actives
- stock des portions

Toute migration devra etre testee sur une copie avant production.

## Plan par phases

### Phase 1 - Preparation sans risque

- Creer le modele `Hospital`.
- Ajouter `hospitalId` aux types.
- Creer une constante temporaire :

```ts
const CURRENT_HOSPITAL_ID = "chncak-touba";
```

- Ajouter un document `hospitals/chncak-touba`.
- Preparer le script d'ajout `hospitalId` sur les donnees existantes.

### Phase 2 - Lecture filtree

- Modifier les requetes principales pour filtrer par `hospitalId`.
- Commencer par les collections non financieres :
  - `meals`
  - `notifications`
  - `ideaBox`
  - `satisfactionSurveys`
- Ensuite seulement :
  - `orders`
  - `cashTransactions`
  - `users`

### Phase 3 - Ecriture filtree

- Toutes les nouvelles commandes recoivent `hospitalId`.
- Toutes les recharges recoivent `hospitalId`.
- Toutes les notifications recoivent `hospitalId`.
- Toutes les operations de scan restent dans le meme `hospitalId`.

### Phase 4 - Regles Firestore

- Ajouter les controles `hospitalId`.
- Tester :
  - personnel CHNCAK ne voit pas un autre hopital
  - admin CHNCAK ne modifie pas un autre hopital
  - super admin SaaS voit tout

### Phase 5 - Interface SaaS

Creer un espace super admin :

- liste des etablissements
- creer etablissement
- activer/desactiver
- abonnement
- modules actifs
- statistiques globales

### Phase 6 - Commercialisation

Prevoir :

- page commerciale
- contrat de service
- conditions d'utilisation
- politique de confidentialite
- sauvegarde et restauration
- support technique
- procedure de deploiement client

## Tests obligatoires avant production

Creer deux etablissements de test :

```txt
chncak-touba
hopital-demo
```

Verifier :

- un agent CHNCAK ne voit pas les menus de `hopital-demo`
- un restaurant CHNCAK ne scanne pas un badge `hopital-demo`
- les rapports financiers restent separes
- les soldes badges ne se melangent pas
- les parametres de prix restent separes

## Decision actuelle

La migration SaaS doit commencer par une branche ou une copie de travail.

Ne pas transformer brutalement la version production CHNCAK.

Decision recommandee :

```txt
Créer une branche/copie : saas-migration
Conserver la production CHNCAK stable.
Faire les changements SaaS et tests dans cette branche.
```

