# Rémunération configurable du développeur — conception

Date : 13 novembre 2026. Statut : **proposition documentaire à négocier avec la direction**. Aucun paramètre créé dans Firebase, aucun nouveau calcul activé, aucune interface ajoutée et aucun déploiement.

## 1. Décision attendue et fonctionnement actuel

La rémunération du développeur n’est pas décidée. L’exemple de 1 % de la part agent est une possibilité contractuelle, pas un tarif accepté. Le fonctionnement actuel de démonstration sur Spark reste inchangé.

Dans le code existant, `functions/finance.cjs` porte la politique fixe `shared_510_505_v1`. `quoteMealSettlement` calcule notamment une retenue restaurant sur le prix de base total ; cette retenue ne constitue pas une définition distincte et configurable de la rémunération du développeur. Les rapports utilisent cette politique via les instantanés des commandes. Il ne faut ni la renommer en commission développeur, ni modifier ses calculs pour interpréter les opérations anciennes selon un nouveau contrat.

La proposition est de conserver cette politique historique, puis de prévoir trois modes contractuels exclusifs, associés à des versions datées. Un simple ensemble de pourcentages indépendants favoriserait les doubles activations et les confusions ; un mode unique explicite facilite la validation et la désactivation. Cette architecture est proposée, pas déjà implémentée.

## 2. Trois modes configurables

| Mode proposé | Paramètres | Commission sur repas | Abonnement |
|---|---|---|---|
| `meal_commission` | Taux, base de calcul, payeur, règle d’arrondi et événement d’acquisition | Active selon le contrat | Inactif |
| `institution_subscription` | Montant, périodicité mensuelle ou annuelle, début de période et payeur institutionnel | Nulle | Actif |
| `none` | Date d’effet et motif | Nulle | Inactif |

Le taux de commission sera stocké en points de base entiers : **100 points de base = 1 %**. Avec une part agent hors frais de 500 F, cet exemple donne 5 F par repas admissible. La base proposée est la part agent du repas, hors frais de recharge, hors frais opérateur et hors supplément de livraison. Le contrat doit confirmer cette base et qui supporte effectivement la rémunération.

Un taux nul désactive le calcul de commission. Si aucune autre rémunération ne s’applique, l’interface proposera de publier une version `none`, plus lisible qu’un mode commission à taux nul. Le bouton « Désactiver la rémunération » préparera cette nouvelle version ; une confirmation administrative indiquera sa date d’effet et son impact avant publication. Ce bouton ne modifiera ni les versions passées ni les tarifs existants implicitement.

### Exception contractuelle de cumul

Le fonctionnement normal interdit commission et abonnement simultanés, dans l’interface **et** les règles Firestore futures. Si un cumul est explicitement négocié, il nécessitera un avenant identifié, approuvé par une administration habilitée, avec les deux composantes, leurs payeurs, leur date d’effet et une durée ou date de fin. Une case libre « autoriser le cumul » ne suffira pas.

Les trois modes restent les options ordinaires. L’exception sera représentée séparément par une autorisation contractuelle de cumul et une composante complémentaire. Elle sera refusée si la référence de l’avenant, sa validation ou ses dates manquent. Aucune option de cumul n’est activée pour la démonstration.

## 3. Séparer les flux financiers

| Élément | Signification et traitement futur |
|---|---|
| Prix du repas et parts agent/hôpital | Prix et subvention définis par une politique de répartition distincte |
| Frais Bictorys | Frais du prestataire, attendus puis rapprochés du montant réel prélevé |
| Frais Mobile Money | Frais opérateur ; distinguer une ligne séparée d’une commission déjà comprise dans le prélèvement Bictorys |
| Frais de reversement | Coût effectif du virement ou transfert au restaurant, distinct des frais de recharge |
| Commission développeur | Rémunération par repas selon mode, base, taux, payeur et contrat |
| Abonnement développeur | Dette institutionnelle par période ; jamais une retenue implicite sur chaque repas |
| Retenue restaurant | Retenue contractuelle distincte, avec motif, bénéficiaire et règle de calcul explicites |
| Solde de badge non consommé | Engagement envers l’agent ; ne finance ni abonnement ni commission sur repas non consommé |

Un prélèvement global de 2 % déjà ventilé entre Bictorys et l’opérateur ne doit pas être compté une deuxième fois comme deux frais supplémentaires. Prévoir une référence de prélèvement commune, le total réel, ses composantes connues et un indicateur de ventilation. Une ventilation inconnue doit rester à rapprocher, sans montants inventés.

La commission ne doit pas être prélevée à la recharge puis une deuxième fois à la consommation. Les frais de recharge et la rémunération liée au repas sont deux événements distincts.

### Montant dû au restaurant

**Aucun montant fixe de 995 F, 990 F ou 1 000 F ne découle automatiquement du choix du mode.** Le montant dû dépend du prix du repas et des retenues, frais ou participations effectivement supportés par le restaurant selon la politique de répartition approuvée.

La commission et une éventuelle retenue restaurant doivent avoir des identifiants distincts. Si le contrat fait financer la commission par le restaurant, une ligne de financement explicite reliera les deux ; elle ne doit pas être additionnée comme une seconde charge identique. Si elle est payée par l’hôpital ou prélevée sur une enveloppe de frais, le restaurant n’est pas débité pour cette commission.

Par exemple, supprimer une commission de 5 F financée par le restaurant pourrait augmenter son dû de 5 F, **uniquement si le reste de cette répartition est contractuellement inchangé**. Le même effet ne s’applique pas si la commission était financée par l’hôpital. Ce sont des scénarios de négociation, pas de nouveaux calculs applicables.

Avant publication d’un changement de mode, une simulation devra montrer séparément : part agent, part hôpital, crédit de badge, dette restaurant, commission, abonnement et frais externes. Une répartition incomplète ou déséquilibrée devra empêcher l’activation. Désactiver une commission sans répartition de remplacement approuvée doit conduire à préparer un brouillon, pas à choisir silencieusement un montant restaurant.

## 4. Modèle de données proposé, non créé

Séparer les nouveaux documents des paramètres institutionnels actuels, dont les accès sont plus larges. Noms indicatifs :

| Document / collection proposée | Contenu et contraintes |
|---|---|
| `developerCompensationPolicies/{versionId}` | Version publiée immuable : mode, commission, abonnement, éventuelle exception contractuelle, dates d’effet, contrat, motif, auteur et approbateur |
| `financialAllocationPolicies/{versionId}` | Prix et parts validés, retenues restaurant, payeurs des frais et méthode d’arrondi ; version distincte de la rémunération |
| `financialPolicyControl/current` | Révision de contrôle, version courante et éventuelle prochaine version planifiée, références de rémunération et répartition compatibles |
| `financialConfigurationEvents/{eventId}` | Historique append-only : proposition, approbation, planification, remplacement d’une planification ou désactivation, avec références avant/après et date serveur |
| `developerSubscriptionPeriods/{periodId}` | Futur décompte d’abonnement par période et version : montant dû, avoirs éventuels, statut, preuve de paiement ; aucune facturation automatique aujourd’hui |

Champs essentiels d’une version de rémunération :

```text
versionId, schemaVersion, currency = XOF
mode = meal_commission | institution_subscription | none
effectiveFrom : horodatage UTC
commission : { rateBps, base = agent_meal_share_excluding_fees, payer, roundingPolicy }
subscription : { amount, period = monthly | yearly, periodAnchor, payer }
contractReference, changeReason, approvedBy, approvedAt
allocationPolicyVersionId
combinedException : null ou autorisation contractuelle explicite et datée
```

Ces champs décrivent un schéma futur, pas un objet à copier dans la configuration actuelle. Les montants devront être des entiers dans une unité explicite ; les pourcentages ne devront pas dépendre de nombres flottants approximatifs. L’unité de calcul comptable, l’arrondi au franc lors d’un paiement et le traitement des reliquats doivent être arrêtés avant développement.

Invariants :

- Sans exception approuvée, `meal_commission` impose abonnement nul ; `institution_subscription` impose taux nul ; `none` impose les deux nuls.
- Un taux, montant ou payeur manquant ou négatif ne peut pas être publié. Les limites maximales et le zéro autorisé sont explicités et validés côté règles.
- Une version publiée ne peut être modifiée ni supprimée ; une correction crée une nouvelle version et un événement.
- Aucun changement rétroactif ; une version déjà consommée reste consultable.
- La référence de répartition associée doit exister, être approuvée et couvrir le même effet contractuel.
- Une date d’effet n’est pas une autorisation de décaissement ; facturation, validation et paiement restent distincts.

## 5. Date d’effet, historique et transactions anciennes

Afficher les dates en heure de Dakar et les conserver comme horodatages UTC. La source de temps faisant autorité sera celle des règles Firestore (`request.time`), pas l’horloge du téléphone.

Proposition pour conserver des transactions reproductibles : figer les références de politiques et les montants calculés **au paiement de la commande**, comme l’instantané financier actuel. La commission ne sera acquise qu’à la remise effective d’un repas admissible ; elle utilisera l’instantané de la commande et ne sera pas recalculée au taux du jour. Ce choix sur les commandes payées avant une date d’effet doit être confirmé dans le contrat.

Chaque future opération conservera `compensationPolicyVersionId`, `allocationPolicyVersionId`, base de commission, taux, commission calculée, payeur, retenue restaurant distincte, montants dus et règle d’arrondi. Une annulation ou un remboursement utilisera l’instantané d’origine et, si nécessaire, une écriture de contrepassation liée ; jamais une modification de l’écriture passée.

Les transactions actuelles conservent leur politique historique. Une absence de référence de rémunération ne signifie ni commission nulle ni droit à recalculer : elle signifie « opération antérieure au nouveau paramétrage ». Les rapports devront séparer les périodes et versions sans retraiter le passé.

Pour rester simple sur Spark, prévoir au plus une prochaine version planifiée dans le document de contrôle. Une transaction lira le contrôle, les politiques applicables et la commande ; les règles vérifieront les dates et les références. À compter de la date d’effet, la version planifiée sera exigée pour les nouvelles opérations, même sans tâche planifiée ni application ouverte à minuit. Une promotion du pointeur pourra intervenir dans une transaction ultérieure ; elle ne devra pas être nécessaire au respect de la date d’effet.

La publication ou le remplacement d’une planification utilisera une transaction et une révision attendue pour empêcher qu’un administrateur écrase le changement d’un autre. Toute ancienne planification restera dans l’historique, même remplacée avant sa prise d’effet.

## 6. Abonnement indépendant des repas

Un abonnement mensuel ou annuel devra préciser le début des périodes, le traitement des mois incomplets, la date d’exigibilité et la règle de renouvellement. Par défaut proposé : aucun prélèvement automatique et génération administrative d’un décompte de période identifié de façon unique.

Passer à `none` ou à la commission arrêtera les nouvelles périodes selon la date et le contrat ; cela n’effacera pas les créances antérieures. Une période déjà facturée ne sera ni annulée ni proratisée silencieusement : un avoir lié et motivé pourra être nécessaire. Une dette d’abonnement ne sera pas répartie entre repas dans les rapports comme si elle était une commission.

## 7. Administration habilitée et Spark

Prévoir une capacité spécifique `manageDeveloperCompensation`, accordée et retirée uniquement par l’administration de plus haut niveau. Le rôle restaurant, caissier, comptable ou DRH ne donne pas automatiquement ce droit. Un utilisateur ne peut pas s’octroyer cette capacité en modifiant son profil. La liste des approbateurs habilités et la séparation éventuelle entre auteur et approbateur seront à valider avec la direction.

Les règles futures devront contrôler les habilitations, champs autorisés, modes exclusifs, références contractuelles, dates, immutabilité des politiques publiées et présence de l’événement historique dans la même transaction. Les données contractuelles seront visibles uniquement par les personnes habilitées. Les autres utilisateurs ne recevront que les montants et références strictement nécessaires à leurs opérations, sans accès général aux contrats.

Le contrôle d’habilitation doit aussi protéger les politiques de répartition et l’exception de cumul. Cacher un écran ou un bouton ne suffit pas. Les règles actuelles ne sont pas présentées comme fournissant déjà ces protections : elles nécessiteront des tests spécifiques avant activation.

Cette conception peut s’appuyer sur Firestore et ses transactions, sans Cloud Functions, Cloud Run, Secret Manager ou tâche planifiée. Elle n’active aucun service ni dépense Firebase aujourd’hui. Le budget d’expressions et de lectures des règles devra être testé, car les règles existantes sont déjà complexes. L’encaissement automatique Bictorys reste un chantier serveur distinct, non couvert par ce paramétrage Spark.

## 8. Présentation au directeur

Formulation proposée : « La rémunération reste à négocier. La solution pourra fonctionner avec une commission par repas, un abonnement mensuel ou annuel, ou sans rémunération. Les frais opérateur et les sommes dues au restaurant seront présentés séparément. Tout changement sera daté, autorisé et conservé dans l’historique. »

| Exemple de négociation, non actif | Conséquence illustrative |
|---|---|
| Commission de 1 % sur part agent de 500 F | Commission de 5 F sur un repas admissible ; financement et répartition à confirmer |
| Abonnement de montant à négocier | Montant institutionnel par mois ou par an ; commission par repas nulle |
| Aucune rémunération | Commission nulle, aucun nouvel abonnement ; montant restaurant selon répartition validée, sans hypothèse automatique de 995 F |

L’écran de paramétrage n’existe pas encore. Cette souplesse est une conception future ; elle ne doit pas être montrée comme une fonction déjà disponible pendant la démonstration.

## 9. Décisions à prendre avant développement et tests futurs

À confirmer contractuellement : mode retenu, taux ou montant, base et payeur de la commission, frais réellement inclus, retenue restaurant indépendante, répartition après désactivation, date d’effet, commande ou remise comme événement de référence, arrondis, abonnement et prorata, approbateurs et conditions de tout cumul exceptionnel.

Tests futurs sur données fictives :

1. Chaque mode seul ; taux nul et désactivation ; refus de cumul ordinaire ; exception contractuelle valide, absente ou expirée.
2. Changement à la date d’effet, commandes avant/après, fuseau Dakar et horloge client erronée.
3. Anciennes commandes inchangées ; remboursement au taux d’origine ; aucun prélèvement sur badges non consommés.
4. Simulation de répartition restaurant : aucun 995 F implicite, aucun double comptage de retenue, commission ou frais opérateur.
5. Concurrence de publication, historique obligatoire, refus de suppression et d’auto-habilitation.
6. Abonnement mensuel/annuel, unicité par période, sortie de mode, avoir et absence de génération double.
7. Régression des parcours agent, caisse, restaurant, comptabilité, DRH, livraison et administration dans l’émulateur Spark.

**Cette étape livre uniquement la conception. Aucun de ces nouveaux comportements n’est implémenté ou activé.**
