# Paramétrage du partage des frais

> Exécution : superpowers:executing-plans, dans le dossier de travail existant pour conserver les nombreuses modifications locales de l'utilisateur.

**Objectif :** 510 F versés par mobile money donnent 505 F au badge ; 2 % du brut sont suivis séparément ; aucun nouveau frais au repas ; l'hôpital finance 101 % de sa subvention de base et le restaurant reçoit 99 % de la valeur des repas servis.

**Architecture :** calcul monétaire commun en centimes comptables dans `functions/finance.cjs`, utilisé par l'interface et les deux chemins sécurisés. Les anciens reçus et demandes conservent leur formule. Les nouveaux reçus mobiles portent une version de formule et le brut réellement confirmé. Les rapports de reversement sont des sommes dues, pas des paiements bancaires exécutés.

**Contraintes :** crédit badge entier XOF ; aucune réécriture de solde ou d'historique ; espèces sans frais ; fonds du badge exclus d'une rémunération ; pas de déploiement implicite ni de nouvelle intégration Bictorys.

**Décision tarifaire :** l'utilisateur a confirmé le passage à 1000/500/500. Migration atomique à la première connexion du propriétaire après publication, avec conservation des anciens tarifs pour les historiques.

## Tâches

- [x] Ajouter des tests financiers : 510/505, 500 débités/5 conservés, arrondis, espèces, saisie invalide, double prélèvement exclu, calcul 505 hôpital/990 restaurant.
- [x] Implémenter le calcul commun et les reçus versionnés dans Spark et Functions ; vérifier crédit/brut, plafond et idempotence côté serveur et règles Firestore. Tester fraude et rejeu.
- [x] Ajouter le moyen mobile à la caisse restaurant, la saisie du brut et le détail avant confirmation ; informer le personnel ; afficher/exporter le suivi des frais et le reversement théorique des repas servis.
- [x] Vérifier les tests unitaires et Functions, puis les règles avec l'émulateur, TypeScript et la compilation ; examiner le diff et documenter activation/déploiement.

## Vérification et décisions finales

- 23 tests unitaires/Functions/historiques passent avec `npm test` ; 46 cas Spark/règles passent avec `npm run test:rules` et émulateur local.
- TypeScript passe. Build de production réussi (bundle index-CCSKBDXx.js), avec avertissement de taille du bundle.
- Revue indépendante : snapshot désormais obligatoire à la création et immuable ; aucun autre problème important relevé.
- Les contrôles de quantité et de stock Firestore ont été factorisés pour rester sous la limite d'évaluation, sans retirer les limites de portions ni le contrôle des écritures sur les stocks.
- L'alias Vite @ndamatou/finance précompile le calcul partagé CommonJS ; le scan dev est limité à index.html pour éviter les anciens bundles Android. Après modification du calcul CommonJS, relancer le dev avec --force pour régénérer le cache de dépendances.
- La vérification de whitespace Git remonte le CRLF et des lignes vides déjà présents dans le travail local ; aucune normalisation globale des fichiers de l'utilisateur n'a été faite.
- Aucun déploiement ni encaissement réel effectué. Procédure dans docs/PARTAGE_FRAIS_NDAMATOU.md.

## Points de contrôle

Anciennes écritures inchangées ; demandes Wave antérieures compatibles ; arrondis visibles ; subventions uniquement sur repas servis ; remboursement ne déclenchant aucun frais ; un même reçu ne peut pas servir à deux recharges ; brut/frais/crédit non falsifiables via accès direct Firestore.
