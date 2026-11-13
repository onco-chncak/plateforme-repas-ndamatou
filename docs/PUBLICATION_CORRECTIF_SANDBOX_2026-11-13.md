# Publication autorisée du correctif sandbox

Date : 13 novembre 2026, référence Dakar.

## Autorisation et rapprochement préalable

L’utilisateur a vérifié son tableau de bord Bictorys TEST et n’y a trouvé aucune transaction de 510 F. Il a ensuite expressément autorisé la publication du correctif préparé, en demandant de conserver l’ancienne tentative et de maintenir le rapprochement fournisseur comme non confirmé.

La tentative locale de 510 F a été relue avant publication : état `review`, aucun identifiant fournisseur ou lien de paiement enregistré. Elle est conservée intégralement, sans relance, suppression ou changement de statut. **Rapprochement fournisseur : non confirmé.** L’accès API historique avait répondu HTTP 403 ; le constat manuel de l’utilisateur n’est pas remplacé par une preuve API inexistante.

## Publication

- Worker : `ndamatou-bictorys-sandbox`.
- URL : https://ndamatou-bictorys-sandbox.smsgueye.workers.dev
- Version publiée : `277fd991-f96d-48cd-a7c4-27016020669c`.
- Résultat Wrangler : chargement réussi puis publication des routes réussie.
- Périmètre : correctif `sandbox-bictorys/worker.mjs` uniquement, avec ses imports existants inchangés. Le fichier `worker.test.mjs` reste un test local et n’est pas un endpoint publié.
- Aucun changement de schéma, migration D1, secret, tarif ou mode de rémunération ajouté lors de cette publication.
- Aucun déploiement Firebase, changement de plan ou accès aux badges réels.

Le correctif empêche le crédit lorsqu’un échec, une annulation ou un renversement contradictoire a déjà été conservé, y compris dans l’ordre concurrent identifié avant le rejeu d’un événement précoce. Le journal unique et le déclencheur de crédit restent en place.

## Vérifications

- 18 tests locaux réussis, 0 échec, avec fournisseur simulé ; aucun paiement externe dans ces tests.
- Après publication, `/health` confirme environnement sandbox, configuration complète, création de paiements de test activée et aucun badge réel connecté.
- Connexion de démonstration HTTP 200 ; accès aux badges avec session fonctionnel.
- Requête anonyme de création de paiement : HTTP 401, sans création de charge.
- Notification webhook sans authentification : HTTP 401.
- DEMO-001 et DEMO-002 sont toujours à 0 F.
- Comparaison des données D1 avant/après : ancienne tentative inchangée, soldes inchangés, zéro crédit et zéro tentative de 505 F.
- Empreinte agrégée des fichiers de la plateforme principale comparée avant/après ; aucune modification par cette intervention.

Ces contrôles prouvent le fonctionnement des accès et protections du Worker. Ils ne constituent pas encore un paiement Bictorys de bout en bout et ne prouvent pas que le compte marchand acceptera la création de la prochaine charge.

## Préparation distincte du scénario 505 F

Le scénario est préparé : badge `DEMO-001`, départ 0 F, montant à payer 505 XOF, crédit attendu 500 F fictifs après notification authentifiée et rapprochement réussi.

Aucune tentative de 505 F n’est insérée à l’avance dans D1 et aucun appel de création de paiement n’est exécuté par l’assistant. Le seul endpoint de création actuel appelle le fournisseur : le lancer automatiquement contredirait l’instruction de l’utilisateur. La nouvelle référence sera générée par le navigateur lors du clic manuel, distincte de l’ancienne tentative de 510 F. Le montant fait partie des contrôles de rejeu ; une référence ancienne ne peut pas être réutilisée pour un montant différent.

## Instructions manuelles

1. Ouvrir https://ndamatou-bictorys-sandbox.smsgueye.workers.dev et actualiser la page.
2. Se connecter avec la valeur du champ `DEMO_PASSWORD` du fichier local confidentiel `sandbox-bictorys/.secrets.local.json`. Ne pas partager ce fichier ou son contenu dans un message.
3. Choisir **DEMO-001** et confirmer le solde de départ **0 F**. S’il a changé, s’arrêter et le signaler sans remise à zéro.
4. Dans **« Montant de test, en F CFA »**, saisir **505**, en remplaçant la valeur préremplie de 510.
5. Cliquer **une seule fois** sur **« Préparer un paiement Bictorys de TEST »**. C’est ce clic qui créera la nouvelle tentative et appellera Bictorys.
6. Si le lien apparaît, cliquer **« Ouvrir le paiement Bictorys de TEST »**. Vérifier le mode de simulation et le montant **505 XOF**, puis utiliser uniquement les moyens de simulation fournis par Bictorys. Ne pas utiliser un moyen de paiement réel.
7. Revenir au sandbox et cliquer **« Actualiser les soldes et les tentatives »**. En succès authentifié, résultat attendu : `credited`, un seul crédit, solde **500 F fictifs**. Une simple redirection ne suffit pas.
8. Si une erreur apparaît, si le caractère test est incertain ou si le statut est `review`, s’arrêter et transmettre uniquement le message visible et l’état. Ne pas relancer à répétition et ne pas communiquer de secret, numéro ou OTP.

**Point d’arrêt : l’assistant attend l’intervention manuelle de l’utilisateur avant tout paiement. Aucun paiement réel ou sandbox n’a été déclenché par cette publication.**
