# Nouveau partage des frais — 11 novembre 2026

Modèle validé par le porteur du projet : `shared_510_505_v1`.

## Recharge et repas

La caisse Restaurant choisit Espèces, Wave ou Orange Money. Pour le mobile, elle saisit le montant réellement payé et confirme le paiement après vérification de sa preuve. Il n'y a pas de nouvelle intégration automatique Bictorys dans ce changement.

Pour un versement mobile G entier : crédit badge = arrondi(G × 101 / 102). La contribution agent est G moins ce crédit. Le calcul reproduit exactement 510 F versés → 505 F crédités, puis 5 100 → 5 050. Les crédits et soldes restent des entiers XOF. Les petits montants peuvent présenter un écart dû à cet arrondi ; le détail est affiché avant confirmation.

Les frais Bictorys/opérateur sont calculés à 2 % du brut et conservés en centimes comptables : 510 F → 10,20 F de frais et 499,80 F nets calculés. Le rapprochement doit tenir compte des arrondis réellement pratiqués par Bictorys. Les espèces restent créditées intégralement sans frais. Aucun frais de recharge supplémentaire n'est prélevé lors du repas.

Tarifs approuvés : repas 1 000 F ; part agent 500 F ; subvention de base 500 F. L'hôpital doit financer 505 F nets, soit sa subvention + 1 %. Le restaurant reçoit 990 F, soit la valeur du repas moins 1 %. Le tableau n'effectue ni encaissement de l'hôpital ni virement au restaurant.

Exemple : après la recharge, le repas et 505 F nets de l'hôpital, puis 990 F au restaurant, le compte conserve 14,80 F. Sur ce montant, 5 F restent dus sur le badge : le résiduel est 9,80 F avant autres charges, taxes, remboursements ou frais de sortie.

## Activation des tarifs existants

Les valeurs par défaut sont 1 000 / 500 / 500. Pour la base existante, la première connexion du propriétaire du projet (`smsgueye@gmail.com`, habilité par les règles Firebase) déclenche une transaction de mise à jour des seuls paramètres tarifaires, marquée `sharedFeeModelVersion`. Elle conserve les anciens prix dans `legacyAccountingPrices`. Les connexions ultérieures ne réinitialisent pas les paramètres.

Les autres utilisateurs continuent à utiliser les tarifs réellement présents dans Firebase tant que cette migration n'est pas confirmée par la base. Vérifier les valeurs dans Administration après connexion du propriétaire et avant ouverture du nouveau service. Aucun solde, reçu ou repas ancien n'est réécrit.

Les nouveaux repas conservent une ventilation financière validée par les règles et immuable. Les anciens repas gardent leurs tarifs antérieurs dans les états généraux. Le nouveau décompte de reversement exclut les anciens repas sans ventilation : leur règlement doit rester rapproché dans les états antérieurs.

## Contrôle et exports

Le tableau « Partage des frais et reversements » se trouve dans Restaurant → Recharge et dans Comptabilité. Son export CSV distingue les montants payés, les crédits, les contributions et le net calculé. Les sommes dues à l'hôpital et au restaurant concernent uniquement les nouveaux repas remis, payés, ordinaires, hors livraison.

Le total de collecte est avant remboursements/régularisations ; une correction de badge ne prouve pas un remboursement externe. La réserve des badges est affichée séparément. Le tableau ne présente pas la trésorerie comme un bénéfice et ne présume pas que les sommes dues par l'hôpital ont été versées. Les totaux sont limités aux opérations chargées pour la période affichée.

Les anciens reçus et demandes Wave restent compatibles avec leur formule d'origine. Les nouvelles recharges sont identifiées par la formule et le brut ; leur rejeu ne doit jamais doubler le crédit. Les nouvelles commandes doivent inclure la ventilation : après publication, les anciennes versions de l'application doivent être actualisées avant de commander.

## Publication

En mode Spark, publier ensemble les règles Firestore et le site compilé sur le projet Ndamatou ; aucune activation de facturation n'est nécessaire. Le code Functions est aussi adapté si ce mode est activé ultérieurement, mais le déploiement Functions n'est pas inclus dans le mode Spark actuel.

Vérifications locales :

```powershell
node --import tsx --test tests/topupRequests.test.ts tests/financeAccounting.test.ts tests/finance.test.cjs functions/topup.test.cjs
node --import tsx --test tests/spark.rules.test.cts
npm run lint
npm run build
```

La suite Spark nécessite l'émulateur Firestore sur 127.0.0.1:8087. Aucun paiement réel ni modification de données de production n'est nécessaire pour ces tests.
