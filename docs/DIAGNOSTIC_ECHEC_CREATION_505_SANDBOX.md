# Échec de création de la tentative sandbox de 505 F

Date : 13 novembre 2026, heure de référence Dakar.

**Mise à jour après autorisation :** l’utilisateur a confirmé ne trouver aucune trace dans Bictorys et a autorisé la publication du diagnostic. Le Worker sandbox a été publié avec succès, version `3bb4490f-7040-4002-8db1-5a13e01c2209`, après 21 tests réussis et relecture indépendante. La page répond HTTP 200, la configuration sandbox est complète et les accès aux badges/webhooks sans authentification sont refusés HTTP 401. Aucune nouvelle demande de paiement n’a été créée par l’assistant. Les paragraphes « local / non publié » plus bas décrivent la phase de préparation initiale.

L’absence de transaction est un constat manuel de l’utilisateur ; le rapprochement fournisseur des anciennes tentatives reste non confirmé par API. La nouvelle instrumentation ne peut pas reconstituer les erreurs passées. Les tentatives de 510 F et 505 F sont conservées en `review`.

Pour un **nouvel essai manuel distinct**, ouvrir une fenêtre de navigation privée, se connecter au sandbox, choisir DEMO-001 et saisir 505 F. La nouvelle fenêtre n’a pas la référence de tentative conservée dans le stockage du navigateur habituel ; le clic manuel produira une référence distincte sans effacer les anciens historiques. Cette démarche est proposée après le contrôle manuel de l’historique par l’utilisateur, et non comme relance automatique d’une tentative ambiguë. En cas de nouvelle erreur, relever le code de diagnostic et le statut HTTP affichés et s’arrêter, sans multiplier les essais. Aucun moyen de paiement réel ne doit être utilisé.

## Constat vérifié en lecture seule

Après le clic manuel de l’utilisateur, une tentative pour `DEMO-001` a été enregistrée à 14 h 49 min 45 s : montant à payer 505 F, crédit fictif attendu 500 F, état `review`. Aucun identifiant fournisseur ni lien de paiement n’est conservé. Les badges fictifs restent à 0 F. Aucun crédit et aucun événement de confirmation ne sont présents dans D1 au diagnostic.

L’ancienne tentative de 510 F reste également en `review`, intacte. Elle n’a pas été relancée, supprimée ou réinterprétée. Son rapprochement fournisseur reste non confirmé, selon les instructions de l’utilisateur.

La tentative de 505 F a été créée par l’action manuelle de l’utilisateur, pas par l’assistant. Aucune requête de création ou répétition de paiement n’a été effectuée pendant ce diagnostic.

## Ce que signifie le message

La connexion et l’enregistrement initial de la tentative ont abouti. Le message générique est produit ensuite par le bloc qui appelle Bictorys, analyse sa réponse et conserve les éléments de rapprochement.

Ce bloc pouvait échouer pour plusieurs raisons : réseau ou délai, réponse HTTP non réussie, JSON inattendu, identifiant de transaction absent, URL de paiement non admise, erreur locale de stockage ou de rapprochement. La version publiée ne conserve ni catégorie d’erreur ni statut HTTP. La cause précise de cet échec ne peut donc pas être récupérée a posteriori dans D1.

L’absence d’identifiant fournisseur local ne prouve pas que Bictorys n’a reçu aucune demande. Il faut vérifier cette nouvelle tentative dans le tableau de bord TEST avant un nouvel essai. Le refus HTTP 403 précédemment obtenu concernait la lecture de l’historique ; il ne constitue pas une preuve du statut de la requête de création.

## Correctif de diagnostic préparé localement

Fichiers : `sandbox-bictorys/worker.mjs` et `sandbox-bictorys/worker.test.mjs`.

Le correctif distingue notamment :

- `provider_http_error`, avec le statut HTTP numérique ;
- `provider_timeout` et `provider_network_error` ;
- `provider_invalid_json` et `provider_response_too_large` ;
- `provider_missing_transaction_id` ;
- `provider_invalid_checkout_url` ;
- `local_storage_error` et `local_reconciliation_error`.

Une trace technique contient uniquement le code choisi dans cette liste, le statut HTTP éventuel, une catégorie de contenu et quelques indicateurs booléens de forme de réponse. Aucun corps de réponse fournisseur, URL retournée, message d’exception arbitraire, en-tête, clé ou donnée personnelle n’y est copié.

La trace utilise le journal existant avec un type interne `creation_diagnostic` et un identifiant de diagnostic distinct des identifiants fournisseur. Elle n’est pas traitée comme une confirmation de paiement et elle est exclue du rejeu des notifications fournisseur. Aucun changement de schéma D1 n’est nécessaire. Les traces de diagnostic futures ne doivent pas être comptées comme des webhooks reçus de Bictorys.

L’erreur visible inclura ce code et, s’il existe, le statut HTTP. Une erreur d’enregistrement du diagnostic ne provoque jamais une nouvelle requête de paiement. L’état de revue et les contrôles contre les doubles crédits sont conservés.

Ce correctif améliore la preuve technique disponible lors d’un prochain essai autorisé. Il ne répare pas à lui seul une éventuelle erreur du compte marchand ou de l’API, et ne permet pas d’inventer le détail perdu des tentatives passées.

## Vérifications

21 tests locaux réussis, dont les 18 contrôles financiers et de concurrence antérieurs. Les nouveaux tests reproduisent les réponses HTTP 400/401/403/500, des réponses inexploitables et un délai dépassé. Ils vérifient l’absence des secrets et du corps fournisseur dans la trace et dans le message visible, ainsi que l’absence de répétition automatique du paiement.

Le fournisseur est entièrement simulé et la base de test est SQLite en mémoire. Aucun paiement Bictorys n’est appelé par ces tests. La compilation est vérifiée séparément en mode `--dry-run`, sans publication.

## Point d’arrêt

Le correctif reste local en attente d’autorisation de publication sur le Worker sandbox uniquement. Aucun déploiement Firebase ou Cloudflare n’a été effectué pendant ce diagnostic ; la plateforme principale, ses tarifs et ses badges réels restent inchangés.

Avant tout nouvel essai, vérifier dans l’historique Bictorys TEST l’éventuelle opération de **505 F du 13 novembre vers 14 h 49, heure de Dakar**. Ne pas relancer la tentative actuelle, effacer le stockage du navigateur pour contourner la protection ou modifier les anciennes lignes D1. Ne transmettre que le statut et l’existence éventuelle d’une opération correspondante, sans secret ni donnée personnelle.

La suite nécessite une autorisation de publication du diagnostic, puis un rapprochement et une intervention manuelle distincte avant toute nouvelle demande de paiement.
