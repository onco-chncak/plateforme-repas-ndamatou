# Prise en charge du Checkout HTTP 202 Bictorys

Date : 13 novembre 2026. Statut : **correctif publié après autorisation explicite de l’utilisateur**.

## Publication autorisée

Le Worker sandbox a été publié avec succès, version `04f204e8-fac7-4e7c-9046-3c70aa5228f5`, après un nouveau passage des 32 tests. URL : https://ndamatou-bictorys-sandbox.smsgueye.workers.dev.

Après publication : page HTTP 200, configuration sandbox complète, paiements de test activés, aucun badge réel connecté, contrôle d’affichage des dossiers en revue présent dans le JavaScript servi, refus HTTP 401 pour les badges et le webhook sans authentification. Les cinq anciennes tentatives, les soldes, les événements et le compteur de crédits ont été comparés avant/après et sont inchangés. Les deux badges fictifs restent à 0 F, aucun crédit n’est enregistré et aucune demande de paiement n’a été lancée par l’assistant.

Aucune migration D1, modification de secret, publication Firebase, modification tarifaire ou activation de Blaze n’a été effectuée. Les paragraphes de préparation ci-dessous décrivent la conception du correctif maintenant publié ; le parcours fournisseur complet attend toujours un essai manuel.

## Diagnostic observé

L’essai manuel de 505 F enregistré à 16 h 53 min 13 s a reçu une réponse HTTP 202 JSON. Les indicateurs enregistrés confirment la présence d’un `link`, sans `transactionId`, `id`, `redirectUrl` ni objet enveloppe `data` au niveau attendu. Le backend l’a classé `provider_missing_transaction_id`, puis a conservé la tentative en `review`.

Le réseau et l’appel API aboutissent désormais. La réponse 202 ne signifie ni que le paiement a été effectué, ni que la demande a été rejetée. Les badges fictifs restent à 0 F et aucun crédit n’est présent au diagnostic. Aucune nouvelle création de charge n’a été lancée par l’assistant.

## Cause dans l’intégration

Le backend exigeait trop tôt un identifiant de transaction pour toutes les réponses réussies. La [référence officielle de création](https://docs.bictorys.com/reference/createcharge) distingue :

- HTTP 201 : objet de confirmation d’une transaction initiée ;
- HTTP 202 : objet Checkout invitant l’utilisateur à choisir son moyen de paiement.

Le schéma OpenAPI incorporé à la [version Markdown officielle](https://docs.bictorys.com/reference/createcharge.md), récupéré en lecture seule, associe 202 à `CheckoutLinkObject`. Il décrit `link`, `chargeId` et `opToken`, sans exiger `transactionId`. Un identifiant de charge Checkout ne doit donc pas être utilisé comme s’il était déjà l’identifiant de la transaction de paiement.

Le mode Checkout est également décrit dans le [guide officiel](https://docs.bictorys.com/docs/how-checkout-works). Le code et les premiers tests supposaient à tort que le format illustré pour une confirmation HTTP 201 était commun aux deux réponses.

## Correctif préparé

### Création du Checkout

Pour HTTP 202, un lien HTTPS sur un domaine fournisseur déjà autorisé peut être enregistré sans identifiant de transaction. La tentative passe en attente avec `provider_id` nul ; le solde ne change pas.

Une trace interne `checkout_created` atteste que le serveur a réellement reçu et validé cette réponse. Elle ne contient que son type et le statut HTTP 202, sans copie du jeton d’opération, du corps fournisseur ni du lien. Le lien nécessaire à la navigation reste dans le champ protégé `checkout_url` de la tentative et n’est retourné qu’à une session autorisée. La trace n’est pas une preuve de paiement.

Le champ `chargeId` n’est pas converti en identifiant de transaction. Le champ `opToken` n’est pas recopié dans un journal. Les réponses HTTP 201 continuent à exiger un identifiant de transaction utilisable.

Le lien de paiement `link` est préféré à `redirectUrl`, qui peut désigner l’URL de retour du marchand. Les restrictions de domaine et l’absence de suivi automatique des redirections sont conservées.

### Confirmation fournisseur

Le webhook reste soumis au secret dédié, au montant exact de 505, à la devise XOF, aux références de la tentative et à un identifiant de transaction non vide. Une première transaction peut être liée au Checkout uniquement si :

1. la tentative est toujours en attente ;
2. le lien et la trace d’acceptation Checkout ont été conservés par le backend ;
3. aucun autre identifiant financier contradictoire n’a été enregistré ;
4. l’identifiant fournisseur respecte l’unicité dans les tentatives et le journal de crédits.

La liaison utilise une mise à jour conditionnelle atomique. Un identifiant déjà lié ne peut être remplacé par un autre. Un ancien dossier en `review` ou une ligne sans preuve d’acceptation Checkout ne devient pas automatiquement payable par ce nouveau mécanisme.

Le crédit exige ensuite `succeeded`. L’instruction atomique de crédit exclut les échecs, annulations et renversements préalables, ainsi que les événements financiers contradictoires portant un autre identifiant. Un conflit passe en revue, sans crédit automatique.

Les notifications antérieures à la réponse de création sont conservées puis rapprochées. Le rejeu ne traite que les types de notifications financières autorisés : les traces `checkout_created` et `creation_diagnostic` ne peuvent pas devenir des confirmations de paiement.

### Interface du sandbox

La réponse de création retourne l’état réellement enregistré. Le lien n’est proposé que si la tentative est encore en attente ; une tentative déjà créditée ou passée en revue ne présente pas un nouveau lien à payer. Le bouton « bientôt disponible » du site Firebase principal est inchangé.

## Validation

32 tests réussis, 0 échec : 28 tests unitaires et quatre tests dans le moteur local officiel Cloudflare. Tous les appels fournisseur y sont interceptés et le stockage est fictif et local.

Les tests nouveaux reproduisent le corps HTTP 202 avec lien sans identifiant, le crédit unique de 500 F après succès, le refus de données incohérentes, les confirmations précoces, l’impossibilité de remplacer une transaction liée et le refus d’utiliser une même transaction pour deux badges.

La relecture a identifié un cas de concurrence où une annulation d’une autre transaction pouvait être conservée entre la liaison et le crédit. Ce cas a été reproduit par un test à deux barrières : 500 F étaient crédités avant correction. Le prédicat atomique de crédit a été renforcé et le même test confirme désormais 0 F et une revue manuelle. Les anciens dossiers sans preuve Checkout restent également sans liaison ni crédit.

Ces validations ne sont pas des paiements sur le service Bictorys réel ou sandbox distant. Elles vérifient le code avec le format documenté et les garde-fous ; le parcours fournisseur complet reste à tester manuellement après une publication autorisée.

## Périmètre et point d’arrêt

Fichiers préparés : `worker.mjs`, `page.mjs` et les deux fichiers de tests du dossier `sandbox-bictorys`. Aucun changement de schéma D1, de secret, de tarification de production, de règle Firestore ou de service Firebase n’est nécessaire.

Les anciennes tentatives en `review` ne sont ni relancées, ni effacées, ni converties automatiquement. La réponse de l’essai déjà réalisé a été perdue avant enregistrement de son lien ; la trace booléenne ne permet pas de reconstruire un lien ou un jeton manquant. Ne pas inventer ce lien et ne pas réutiliser un `chargeId` comme transaction.

La publication a été autorisée et vérifiée. Aucune requête de paiement n’a été déclenchée pendant sa préparation ou sa publication. Le nouvel essai sera soumis uniquement par l’utilisateur, avec les moyens de simulation Bictorys, sans paiement réel ni accès aux badges réels. Ouvrir une session privée neuve après avoir fermé l’ancienne, se connecter, choisir DEMO-001 et saisir 505 F ; un seul clic manuel crée la nouvelle référence sans relancer les anciens dossiers en revue.
