# Sandbox en ligne Bictorys, isolé de Firebase

Objectif autorisé : héberger un sandbox sur Cloudflare Workers Free avec stockage D1 gratuit, sans modifier le site Firebase, ses tarifs, ses règles ou ses données.

## Structure

`sandbox-bictorys/worker.mjs` : contrôles de configuration, session de démonstration, création de tentatives et webhook.
`sandbox-bictorys/schema.sql` : badges fictifs, tentatives et crédits uniques avec mise à jour atomique.
`sandbox-bictorys/page.mjs` : interface clairement marquée TEST, sans connexion Firebase.
`sandbox-bictorys/worker.test.mjs` : tests HTTP avec fournisseur simulé et base SQLite locale ; aucun paiement externe.
`sandbox-bictorys/wrangler.jsonc` : Worker gratuit et liaison D1 ; pas de secrets dans la configuration versionnée.
`sandbox-bictorys/README.md` : exploitation, emplacement des secrets locaux et configuration du webhook.

## Étapes

1. Écrire les tests refus d’accès/configuration, confirmation non authentifiée et protections des crédits ; observer leur échec avant implémentation.
2. Implémenter le Worker et le schéma. Réutiliser le calcul financier actuel pour les crédits fictifs, sans créer de règle financière nouvelle.
3. Vérifier connexion, sessions, cas d’échec et de notification répétée ; contrôler aucune dépendance Firebase/production.
4. Créer D1 et le Worker dans les offres gratuites, charger uniquement des badges fictifs et vérifier l’URL publique.
5. Configurer les secrets backend hors dépôt et garder la création de paiements désactivée jusqu’à la configuration correspondante du webhook Bictorys et la validation des parcours opérateur.

## Garde-fous

## Résultat au 13 novembre 2026

Les étapes de préparation, tests, relecture, création D1, publication Worker et configuration des secrets sont effectuées. Onze tests locaux réussissent, dont la régression d’une notification concurrente à la réponse de création. L’utilisateur confirme le webhook enregistré ; création de paiements de test activée ensuite. Connexion, refus d’accès anonyme et état public actif vérifiés en ligne sans paiement fournisseur. Le premier paiement de simulation de bout en bout reste à effectuer avec les moyens de test Bictorys. Le site Firebase n’est ni modifié ni redéployé par cette étape.

L’accès public ne permet ni de consulter les badges fictifs ni de lancer des tentatives sans session. Une redirection de retour n’accorde aucun crédit. Les notifications doivent avoir le secret attendu et correspondre à une tentative, une transaction, un montant et une devise attendus. L’unicité du journal rend le crédit idempotent. Les notifications tardives de renversement sont conservées pour revue, sans débit automatique arbitraire. Aucun paiement fournisseur réel ou sandbox n’est créé par les tests automatisés.
