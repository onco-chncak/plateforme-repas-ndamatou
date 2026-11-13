# Premier test Bictorys Sandbox — diagnostic et parcours préparé

Date : 13 novembre 2026, heure de référence Dakar.

**Mise à jour ultérieure :** après vérification manuelle de son historique TEST sans transaction de 510 F trouvée, l’utilisateur a autorisé la publication en conservant le rapprochement non confirmé. Le correctif du Worker sandbox est désormais publié et vérifié. Voir le [compte rendu de publication et les instructions de l’essai 505 F](docs/PUBLICATION_CORRECTIF_SANDBOX_2026-11-13.md). Les mentions « non déployé » ci-dessous décrivent la phase de diagnostic initiale. Aucun premier paiement complet n’est encore annoncé comme réalisé.

**État : diagnostic effectué ; correctif sandbox préparé localement, non déployé ; paiement de bout en bout non lancé. Une autorisation de publication du correctif sandbox est nécessaire avant l’essai.**

## Scénario demandé

| Élément | Valeur |
|---|---:|
| Badge fictif retenu | DEMO-001 |
| Solde initial vérifié dans D1 | 0 F |
| Montant à payer en TEST | 505 F XOF |
| Crédit après succès authentifié et rapproché | 500 F fictifs |
| Solde après échec, annulation ou absence de confirmation | 0 F |

Le calcul actuel donne `arrondi(505 × 101 / 102) = 500`. Il n’est pas nécessaire de modifier la formule partagée ni les règles financières de production. L’ancien exemple 510 F → 505 F reste également valable ; il faut remplacer la valeur 510 préremplie par **505** pour ce scénario précis.

## 1. Vérifications de configuration

| Contrôle | Résultat et limite |
|---|---|
| Environnement de l’API | URL fixe `https://api.test.bictorys.com`. Le backend refuse l’environnement production, les clés sans préfixe `test_public-` et toute configuration Firebase |
| Clé locale | Préfixe sandbox vérifié sans affichage de sa valeur |
| Secrets distants | Quatre noms de secrets présents : clé de test, secret webhook, mot de passe de démonstration, secret de session. Aucune clé privée de reversement configurée |
| Backend publié | `/health` répond : environnement sandbox, configuration complète, paiements de test activés, aucun badge réel connecté |
| Accès public | Page et script HTTP 200 ; les données des badges sont soumises à une session |
| Webhook | URL prévue `/webhooks/bictorys`. Un POST sans authentification est refusé HTTP 401, sans écriture de crédit |
| Enregistrement chez Bictorys | Confirmé par l’utilisateur ; correspondance du secret et livraison effective depuis Bictorys restent à constater sur une notification fournisseur |
| Historique distant | Deux badges fictifs à 0 F, aucun crédit et aucun événement fournisseur enregistrés au diagnostic |

L’existence d’un environnement test et de secrets de forme correcte ne prouve pas encore que Bictorys accepte le compte marchand ou la clé pour créer une charge. Aucun appel de création de paiement n’a été effectué pendant cette mission pour obtenir cette preuve.

## 2. Confidentialité

- La clé de test et les secrets sont stockés côté Worker ; aucune clé privée n’a été demandée ou utilisée.
- Les pages HTML et JavaScript effectivement servies ont été comparées aux valeurs des secrets locaux : aucune correspondance détectée.
- Le backend n’écrit pas les clés ou les corps de requête dans des appels `console` ; son observabilité configurée est désactivée.
- Treize journaux locaux Wrangler ont été recherchés pour les valeurs des quatre secrets locaux : aucune correspondance détectée. Cela ne constitue pas une inspection de tous les journaux éventuels du fournisseur ou de toute la machine.
- Les réponses publiques portent `Cache-Control: no-store` et `Referrer-Policy: no-referrer`.
- Le mot de passe de démonstration doit être saisi par son utilisateur dans le formulaire de connexion ; il n’est pas inclus dans les fichiers JavaScript servis. Le cookie de session est signé, `HttpOnly`, `Secure` et `SameSite=Strict`.

Ce rapport ne contient aucune valeur de clé, mot de passe, secret webhook, téléphone ou donnée d’agent réel.

## 3. Authenticité et rapprochement du paiement

Le backend utilise le mécanisme `X-Secret-Key` décrit par la [documentation officielle de validation des webhooks Bictorys](https://docs.bictorys.com/docs/how-to-validate-webhooks), puis vérifie montant, devise, référence et transaction. La comparaison du secret est indépendante du contenu déclaré dans le navigateur.

Le webhook doit correspondre à une tentative existante, au montant entier attendu de 505, à la devise exacte `XOF`, aux références de tentative envoyées et à l’identifiant de transaction retourné par Bictorys. Seul le statut `succeeded` ouvre le crédit. Les statuts `pending`, `processing` et `authorized` ne créditent pas le badge ; cette préparation ne traite pas une autorisation carte comme un encaissement définitif.

Le backend n’effectue pas de contrôle supplémentaire par signature HMAC du webhook ni de consultation systématique de l’API de statut. La signature de session du navigateur n’est pas une signature fournisseur. Pour le mécanisme applicable vérifié ici, la preuve attendue est le secret dédié de notification, transmis par HTTPS, et le rapprochement strict des champs. La livraison et le format exact de la notification du compte marchand restent à vérifier pendant l’essai réel du sandbox.

Une redirection vers `/return`, même accompagnée d’un paramètre « succès », ne donne aucun crédit. La [référence de création de charge](https://docs.bictorys.com/reference/createcharge) décrit une réponse de création accompagnée d’un lien : elle ne constitue pas à elle seule une confirmation d’encaissement.

## 4. Protection contre le double crédit

Le schéma réellement présent dans D1 a été relu sans modification :

- `credits.attempt_id` est une clé primaire ; `credits.provider_id` est unique.
- `attempts.provider_id` est unique.
- Les événements répétés sont dédupliqués par transaction et statut.
- L’insertion d’un crédit et l’augmentation du solde sont liées par un déclencheur SQLite dans la même instruction atomique.

Les tests reproduisent plusieurs notifications de succès simultanées ou répétées : le crédit reste unique. Une référence déjà utilisée pour une tentative différente est refusée. Un nouvel identifiant de tentative n’autorise pas à créditer deux fois une même transaction fournisseur.

## 5. Erreurs trouvées et correction locale

### Succès reçu après échec ou annulation

La version publiée autorisait un crédit lorsqu’un succès arrivait après une notification d’échec ou d’annulation déjà enregistrée. Le test ajouté a effectivement observé 500 F au lieu de 0 F.

Le correctif local restreint l’insertion du crédit aux tentatives en attente. Il exclut également, dans la même instruction SQL, les événements d’échec, annulation ou renversement déjà conservés pour la tentative et la transaction. Une contradiction passe en état `review`, sans crédit automatique.

La relecture a aussi reproduit un ordre concurrent particulier : annulation conservée avant la réponse de création, puis succès reçu avant le rejeu de cette annulation. Un test avec barrières contrôlées a échoué avant le complément du correctif, puis réussi après. Le contrôle ne dépend donc pas uniquement d’une lecture antérieure du statut.

Fichiers modifiés localement : `sandbox-bictorys/worker.mjs` et `sandbox-bictorys/worker.test.mjs`. Aucun changement de schéma ou migration D1 n’est nécessaire pour ce correctif. **La version distante reste inchangée tant que la publication n’est pas autorisée.**

Un renversement reçu après un crédit déjà confirmé reste un sujet de rapprochement : le journal est conservé et l’opération passe en revue. Le backend n’efface pas le crédit passé ni ne déclenche un débit arbitraire du badge.

### Tentative préexistante à examiner

Une tentative antérieure concernant DEMO-001 porte sur 510 F payés et 505 F fictifs attendus. Elle est en `review`, sans identifiant fournisseur ni lien de paiement conservé. Aucun événement ni crédit n’y est associé dans D1.

Elle n’a pas été créée par ce diagnostic et elle n’a pas été supprimée, remise à zéro ou relancée. La cause exacte est inconnue : le gestionnaire d’erreur existant ne conserve pas le statut HTTP ou la catégorie détaillée de l’échec fournisseur. L’absence de référence locale ne prouve pas qu’aucune tentative n’a atteint Bictorys.

À rapprocher avec l’historique sandbox du compte marchand avant une relance de cette ancienne opération. Pour un prochain échec, une amélioration distincte pourra enregistrer seulement une catégorie technique et un statut HTTP, sans corps de réponse, secret ou donnée personnelle. Aucune cause réseau, refus de clé ou panne fournisseur n’est inventée dans ce rapport.

## 6. Résultats des tests

`node --test sandbox-bictorys/worker.test.mjs` : **18 tests réussis, 0 échec** sur le correctif local. Ils utilisent un fournisseur simulé et une base SQLite en mémoire, sans appel Bictorys.

| Cas | Résultat local |
|---|---|
| 0 F initial, paiement 505 XOF, succès authentifié | Crédit 500 F |
| Paiement en attente, non confirmé ou seulement autorisé | Aucun crédit |
| Échec ou annulation | Aucun crédit |
| Notification sans secret, mauvais montant, devise ou référence | Refus, aucun crédit |
| Succès répété et concurrent | Un seul crédit |
| Succès tardif sur une tentative toujours en attente | Un seul crédit de 500 F |
| Succès tardif contradictoire après échec/annulation | Aucun crédit, revue manuelle |
| Annulation concurrente avant insertion du crédit | Aucun crédit, revue manuelle |
| Annulation précoce conservée avant rejeu, puis succès concurrent | Aucun crédit, revue manuelle |
| Notification avant la fin de création | Conservation puis rapprochement, sans perte ni double crédit |
| Renversement | Historique conservé, revue ; aucun double crédit |
| Réponse de création perdue | Aucun nouvel appel fournisseur automatique avec la même référence |
| Page publique et script | Aucune valeur des secrets de test retournée |

La compilation Wrangler a également réussi en mode **`--dry-run`**. Ce mode n’a effectué aucune publication. La relecture indépendante confirme le correctif et ses 18 tests.

Ces résultats ne sont pas des paiements exécutés sur les simulateurs Wave/Orange Money. Le test fournisseur complet, l’acceptation de la clé et la livraison effective du webhook restent **non exécutés / non prouvés**.

## 7. Parcours manuel préparé — à suivre après autorisation et publication

**Ne pas lancer le paiement avant publication autorisée du correctif et rapprochement de l’ancienne tentative en revue.**

1. Dans l’historique Bictorys en mode TEST, vérifier l’ancienne tentative de 510 F. Si un paiement correspondant est en attente ou réussi, ne pas le répéter ; signaler uniquement son état, sans partager de clé ou de données de compte.
2. Une fois le correctif publié, ouvrir uniquement https://ndamatou-bictorys-sandbox.smsgueye.workers.dev, et se connecter avec le champ `DEMO_PASSWORD` du fichier local confidentiel déjà fourni. Ne pas coller ce fichier dans la conversation.
3. Choisir **DEMO-001** et vérifier que son solde est toujours **0 F**. S’il a changé, s’arrêter pour recalculer le point de départ ; ne pas remettre le badge à zéro automatiquement.
4. Dans **« Montant de test, en F CFA »**, remplacer la valeur préremplie par **505**, puis cliquer **une seule fois** sur **« Préparer un paiement Bictorys de TEST »**. Ce bouton demande la création de la tentative ; il ne prouve pas le paiement.
5. Si un lien apparaît, cliquer sur **« Ouvrir le paiement Bictorys de TEST »**. C’est l’étape d’interaction humaine avec Bictorys. Vérifier l’environnement de simulation et le montant **505 XOF** avant toute validation.
6. Utiliser uniquement les moyens et scénarios de simulation fournis pour le compte sandbox Bictorys. Si le parcours demande un moyen réel ou si son caractère de test n’est pas clair, ne pas valider. Aucun numéro ou OTP de simulation n’est inventé dans ce rapport.
7. Après la simulation, revenir au sandbox et cliquer **« Actualiser les soldes et les tentatives »**. Attendre le webhook : un retour dans le navigateur ne suffit pas. En succès vérifié, résultat attendu : statut `credited`, un crédit et solde 500 F.
8. En cas d’erreur ou d’état `review`, ne pas recommencer ni effacer l’historique. Noter le message visible et l’état ; ne transmettre aucun secret, numéro ou lien contenant des paramètres sensibles.

Pour le premier essai, faire uniquement le scénario de succès. Les cas négatifs ont été simulés automatiquement. D’autres paiements sandbox destinés à tester l’échec ou l’annulation devront être préparés comme des tentatives distinctes, après le bilan de ce premier essai.

## 8. Point d’arrêt et bilan

Le travail s’arrête avant toute création de charge auprès de Bictorys. Aucune intervention humaine dans un paiement n’a été automatisée. Une autorisation explicite est attendue pour publier **uniquement** le correctif du Worker sandbox, puis la confirmation de l’utilisateur sera attendue à l’étape du paiement de test.

Aucun badge réel, tarif de production, règle Firestore ou configuration Firebase n’a été modifié. Aucun passage à Blaze, paiement réel, suppression d’historique ou déploiement n’a été effectué pendant cette mission. Les lectures D1 ont été confirmées sans écriture ; les tests financiers ont eu lieu uniquement en mémoire.

Une empreinte SHA-256 agrégée avant/après sur 47 fichiers de sources, fonctions, configurations Firebase, environnement et dépendances est identique. Les seuls changements applicatifs préparés concernent le Worker sandbox et ses tests locaux.

Le bilan fournisseur final sera complété après l’essai humain : référence rapprochée sans divulgation, montant/devise/statut, réception authentifiée, crédit unique, solde après confirmation et éventuelle erreur. En l’état, il serait incorrect d’annoncer le premier paiement complet comme réussi.
