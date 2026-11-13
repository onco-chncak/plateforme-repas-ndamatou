# Cause du diagnostic provider_network_error et correctif local

Date : 13 novembre 2026. Statut : **corrigé, testé puis publié sur le sandbox après autorisation explicite**.

## Publication et contrôles après autorisation

Le correctif a été publié sur `ndamatou-bictorys-sandbox`, version `d1b86e19-8c08-4c91-ac65-70f80489258c`, après un nouveau passage réussi des 23 tests. URL : https://ndamatou-bictorys-sandbox.smsgueye.workers.dev.

Les contrôles après publication confirment : page HTTP 200, configuration sandbox complète, paiements de test activés, aucun badge réel connecté et refus HTTP 401 pour les accès sans authentification aux badges et au webhook. Les quatre tentatives existantes, les deux soldes fictifs à 0 F, le nombre de crédits (zéro) et les événements ont été comparés avant/après et sont inchangés. Aucun paiement ni nouvelle tentative n’a été créé par l’assistant.

La correction publiée concerne le Worker sandbox uniquement. Aucun déploiement Firebase, changement de tarif de production ou passage à Blaze n’a eu lieu. Les dépendances ajoutées sont des outils de test locaux, sans import dans le Worker publié.

## Constat

Le dernier essai manuel de 505 F, enregistré à 16 h 38 min 15 s heure de Dakar, est en `review`. Son diagnostic contient `provider_network_error` sans statut HTTP, ni identifiant fournisseur, ni lien de paiement. Les quatre tentatives existantes, de 510 F et 505 F, sont conservées. Les deux badges fictifs restent à 0 F et aucun crédit n’est présent.

Aucune tentative n’a été relancée pendant ce diagnostic. Aucun appel de création de paiement n’a été envoyé par l’assistant.

## Cause reproduite

Le backend préparé par l’assistant utilisait `redirect: 'error'` dans l’appel `fetch`. La [documentation Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/request/) précise que ce mode n’est pas pris en charge : il provoque un `TypeError` lors de la construction de la requête, avant tout envoi.

La construction de la même requête a été exécutée dans le simulateur officiel Miniflare/workerd : le mode `error` est rejeté, le mode `manual` est accepté. Deux tests supplémentaires ont ensuite exécuté le véritable code du Worker, compilé avec ses imports existants, dans ce moteur. Avant correction, ils reproduisaient la réponse HTTP 502 et le diagnostic `provider_network_error`, avant l’appel au fournisseur simulé.

Cette erreur locale explique le blocage systématique de l’appel de création sur ce chemin et concorde avec l’absence de transactions observée dans le tableau de bord. Elle ne constitue pas une preuve générale sur tout l’historique du compte marchand ; le rapprochement API des anciennes tentatives reste non confirmé.

## Correctif

Remplacement de `redirect: 'error'` par `redirect: 'manual'` dans `sandbox-bictorys/worker.mjs`. Les réponses de redirection restent soumises au contrôle existant des statuts HTTP non réussis. Le backend ne suit pas l’URL `Location` et n’y transmet pas la clé API.

Le calcul des crédits, les habilitations, le secret de webhook, les contrôles de montant/devise/référence et les contraintes contre les doubles crédits ne changent pas. Aucune migration D1 n’est nécessaire et aucune ancienne tentative n’est débloquée ou effacée automatiquement.

## Tests renforcés

Les tests Node précédents simulaient la fonction fournisseur et ne construisaient pas la requête avec le moteur Cloudflare. Ils ne pouvaient donc pas détecter cette incompatibilité d’API. Une assertion du mode `manual` est ajoutée à ces tests.

Le fichier `sandbox-bictorys/worker.runtime.test.mjs` ajoute deux vérifications dans le moteur officiel, avec une base D1 locale éphémère, des identifiants fictifs et un intercepteur de toutes les requêtes sortantes :

1. Création simulée de 505 F, attente sans crédit, notification authentifiée puis crédit unique de 500 F, même après répétitions.
2. Réponse fournisseur HTTP 302 vers un domaine non autorisé : aucun suivi, un seul appel intercepté, diagnostic HTTP 302, aucun crédit.

Ces tests échouaient avant le correctif puis réussissent après. **Résultat : 23 tests réussis, 0 échec.** Le résultat est un essai du code dans le moteur local Cloudflare, pas un paiement auprès du véritable service Bictorys.

Miniflare, déjà utilisé par Wrangler, est ajouté comme dépendance de développement du sandbox pour rendre ce contrôle reproductible. Le script de test et son verrouillage de dépendances restent locaux ; ces outils ne sont pas importés dans le Worker publié. Les fichiers de la plateforme Firebase ne sont pas modifiés.

La relecture indépendante n’a relevé aucun défaut dans ce correctif. Elle a vérifié notamment que la protection contre le transfert des identifiants lors d’une redirection est conservée.

## Suite attendue

La publication a été autorisée et vérifiée sans créer de paiement. Les anciennes tentatives restent en `review`. La suite attend un nouvel essai manuel distinct avec les moyens de simulation Bictorys. Pour éviter de réutiliser la référence conservée dans une session privée antérieure, fermer cette session puis en ouvrir une nouvelle, se connecter, choisir DEMO-001 et saisir 505 F. Les historiques D1 restent conservés ; aucune ancienne ligne n’est supprimée ou relancée.

La correction supprime le blocage local démontré. L’acceptation de la clé et du compte marchand par le vrai prestataire reste à vérifier lors de cet essai humain ; aucun succès fournisseur n’est annoncé à l’avance.
