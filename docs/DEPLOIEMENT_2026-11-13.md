# Déploiement autorisé — 13 novembre 2026

Le déploiement a été expressément autorisé par l’utilisateur, après la phase de sécurisation locale.

- Projet : `repas-ndamatou-7f044`.
- Site : https://repas-ndamatou-7f044.web.app.
- Périmètre publié : règles Firestore et Firebase Hosting uniquement.
- Résultat CLI : `Deploy complete!`, règles publiées et version Hosting mise en ligne.
- Aucun déploiement de Functions, changement de plan ou activation de Bictorys.
- Les nouveaux modes de rémunération restent documentaires et non implémentés.
- Aucune migration tarifaire, recharge, commande, suppression d’historique ou transaction financière réelle exécutée par les vérifications de déploiement.

## Vérifications

Avant publication : 26 tests unitaires réussis, TypeScript sans erreur et compilation Vite réussie. Les 58 tests de règles avaient été validés lors de la sécurisation ; aucune modification ultérieure des règles n’a été apportée pour ce déploiement. Le compilateur Firestore distant a accepté les règles avec des avertissements de fonctions inutilisées notamment.

Après publication : la page publique répond HTTP 200 et son contenu correspond exactement à `dist/index.html`. Les ressources JavaScript `index-DRb-MyYY.js` et CSS `index-jS1XCamw.css` répondent HTTP 200. Ces vérifications téléchargent uniquement des fichiers statiques, sans authentification applicative ni accès aux données des agents. Elles ne remplacent pas un essai visuel de chaque rôle.

## Incident de connexion résolu

La première tentative a échoué lors de l’authentification. Le diagnostic HTTPS a identifié `UNABLE_TO_VERIFY_LEAF_SIGNATURE` dans Node. L’usage des certificats de confiance Windows a résolu cet échec sans désactiver la vérification TLS. Le réglage a été limité au processus de commande :

```powershell
$env:NODE_USE_SYSTEM_CA = "1"
firebase.cmd deploy --only "firestore:rules,hosting" --project repas-ndamatou-7f044 --non-interactive
```

Aucun certificat, secret ou réglage de facturation n’a été ajouté au projet. Les déclarations « aucun déploiement » de l’audit et de la phase locale décrivent leur état au moment de leur rédaction ; ce document consigne la publication ultérieure autorisée.

## Complément visuel demandé le même jour

Le lien « Payer via Wave par ce lien » a été remplacé par un bouton désactivé « Bictorys — bientôt disponible », sans lien ni action de paiement. Le texte précise que les recharges manuelles restent disponibles. Compilation réussie, puis publication Hosting uniquement confirmée par Firebase. Nouveau bundle : `index-CQVjGQq0.js`. Aucun calcul, règle Firestore, solde ou tarif modifié pour ce complément ; aucun paiement Bictorys ajouté.
