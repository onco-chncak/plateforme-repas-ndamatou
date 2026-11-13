# Sandbox Bictorys en ligne — préparation Cloudflare

Date : 13 novembre 2026. Demande : préparer un sandbox accessible en ligne, en conservant Firebase Spark et la démonstration actuelle. Cloudflare Workers Free est l’hébergement retenu pour cette préparation ; le compte appartient à l’utilisateur. Ce document décrit la cible, pas une intégration déjà active.

**Mise à jour :** le backend sandbox et son stockage isolé sont désormais publiés. Après confirmation par l’utilisateur de l’enregistrement du webhook, la création de paiements de test a été activée et son état public vérifié. Le parcours fournisseur de bout en bout reste à essayer ; aucun paiement fournisseur n’a été lancé par l’assistant. Voir [le guide d’accès et d’exploitation](../sandbox-bictorys/README.md). Les sections suivantes conservent la conception initiale ; le site Firebase et les badges réels ne sont pas connectés au sandbox.

## Séparation indispensable

- Le site Firebase actuel et ses recharges manuelles restent disponibles.
- Le backend sandbox sera un Worker distinct, explicitement identifié comme test.
- Les badges, soldes et historiques du sandbox seront fictifs et isolés ; aucune écriture de ce backend ne sera autorisée vers `repas-ndamatou-7f044`.
- Un paiement Bictorys de test ne devra jamais créditer un badge réel. Aucune clé de compte de service du projet réel n’est nécessaire pour ce premier sandbox.
- Les nouveaux modes de rémunération et calculs de répartition ne seront pas activés dans cette étape.

## Parcours visé

Une session de démonstration autorisée sélectionne un badge fictif et un montant de test. Le backend crée une tentative unique auprès de l’API sandbox Bictorys. Après paiement simulé, il reçoit la notification, vérifie son authenticité et rapproche référence, état, devise et montant avec la tentative attendue. Le crédit fictif et le journal de confirmation doivent être enregistrés atomiquement et une seule fois. Une redirection du navigateur ne prouve pas le paiement.

Le stockage envisagé est Cloudflare D1 dans son offre gratuite, séparé de Firestore. Le schéma devra imposer l’unicité des références de tentatives, transactions fournisseur et opérations de crédit. Le backend ne retournera un succès de traitement au fournisseur qu’après conservation durable de l’événement ou du résultat ; les notifications répétées ne devront pas recréditer le badge.

La création de tentatives devra être protégée par une session de test et des limites d’usage ; une simple restriction CORS ne constitue pas une authentification. Le webhook utilise son mécanisme de validation propre, indépendant de la session navigateur. Les opérateurs de paiement et leurs parcours de simulation seront vérifiés sur le compte sandbox avant tout essai.

## Configuration à mettre en place

| Élément | Traitement |
|---|---|
| Compte Cloudflare | Connexion effectuée par l’utilisateur ; aucun mot de passe ou jeton dans le chat |
| Offre Worker et stockage | Rester sur les offres gratuites ; vérifier quotas et limites CPU sur les scénarios, sans activation automatique d’un forfait payant |
| API Bictorys | Autoriser uniquement l’origine sandbox officielle ; refuser les clés et URL de production |
| Clé de test pour les paiements | Stockage comme secret de backend, hors React et hors dépôt ; la clé reçue ne sera pas recopiée dans cette documentation |
| Secret webhook | Secret dédié configuré à la fois dans le backend et dans le tableau de bord Bictorys en mode test |
| Clé privée Bictorys | Reste confidentielle ; aucun reversement demandé dans cette étape. N’utiliser que les identifiants requis par les opérations testées |
| Activation | Paiements de test désactivés tant que l’authentification, le stockage, les secrets et les vérifications ne sont pas validés |

La connexion Cloudflare est la prochaine dépendance d’accès. La configuration du webhook nécessitera ensuite l’URL réellement attribuée au Worker. Aucun secret ne doit être demandé comme texte dans la conversation.

## Vérifications avant ouverture des tests

Tests fictifs : accès non autorisé, configuration absente, clé ou URL de production refusée, montant invalide, paiement en attente/échoué, notification invalide, mauvais montant/devise/référence, double notification, crédit concurrent et réponse perdue. Vérifier aussi l’absence de toute configuration du projet réel dans le backend de test.

Une fois le sandbox vérifié, son URL pourra être proposée aux personnes autorisées. Le bouton de paiement réel du site reste désactivé. Une éventuelle liaison de l’interface actuelle vers une page de test devra indiquer explicitement que les soldes réels ne sont pas crédités.

## Sources officielles consultées

- [Offres et limites Cloudflare Workers](https://developers.cloudflare.com/workers/platform/pricing/)
- [Gestion des secrets Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Création d’un Worker dans le tableau de bord](https://developers.cloudflare.com/workers/get-started/dashboard/)
- [Intégration Bictorys](https://docs.bictorys.com/docs/integration)

Aucun backend n’est annoncé comme disponible tant que sa publication et ses tests ne sont pas confirmés. Le choix d’un futur encaissement réel restera distinct du sandbox.
