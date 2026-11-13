# Mise en service Repas Ndamatou — Firebase Spark

Projet : repas-ndamatou-7f044. Site : https://repas-ndamatou-7f044.web.app
Dossier de référence : C:/Users/Test/Documents/plateforme-repas-ndamatou.
Firestore : base (default), europe-west9.

## Paiements sans Blaze

La configuration VITE_SECURE_BALANCE_FUNCTIONS=false active les transactions Firestore du navigateur et leurs règles de sécurité. Aucun déploiement Cloud Functions ni activation de facturation n'est requis. Le site reste soumis aux quotas gratuits Firebase Spark.

Une recharge nécessite un compte de caisse autorisé et un encaissement réel. Le nouveau solde, le reçu cashTransactions et le journal immuable walletOperations sont enregistrés ensemble. Un identifiant conservé pendant une reprise empêche le double crédit. Les badges inactifs et les dépassements de plafond sont refusés.

Wave reste une validation manuelle par la caisse après vérification du paiement reçu. Il n'y a pas de confirmation bancaire automatique. Les frais proviennent des paramètres de l'établissement.

Les cartes prépayées, corrections tracées et remboursements de caisse utilisent le même circuit. Les journaux financiers ne peuvent pas être effacés depuis l'interface. L'annulation avec remboursement par l'agent reste désactivée ; la caisse traite les remboursements autorisés.

Les commandes recalculent le tarif depuis le catalogue et les paramètres institutionnels. Le débit, les compteurs de portions et le stock sont atomiques. Les règles contrôlent aussi le créneau et le quota, même pour un appel direct. Une commande peut contenir jusqu'à deux articles distincts, dans la limite de portions configurée (deux par défaut).

## Publication PowerShell

Depuis le dossier de référence :

~~~powershell
$env:NODE_USE_SYSTEM_CA = '1'
npm run lint
npm run build
firebase deploy --only "firestore:rules,hosting" --project repas-ndamatou-7f044
~~~

La configuration firebase.json ne déploie pas de fonctions. Leur ancien code est conservé séparément pour une éventuelle évolution future.

## Vérification

Tests locaux sans encaissement réel :

~~~powershell
node --test tests/topupRequests.test.ts functions/topup.test.cjs
firebase emulators:exec --only firestore --project demo-ndamatou-spark --config firebase.emulators.json "node --test --test-concurrency=1 tests/spark.rules.test.cts"
~~~

Après publication, se connecter avec un compte réel de caisse. Lors du prochain encaissement réel, vérifier le reçu et le nouveau solde, puis actualiser le compte personnel. Une commande réelle doit décrémenter le solde et le stock. Aucun compte ni paiement de test n'est créé sur la base de production par ces vérifications locales.

## Publication vérifiée

Le 24 octobre 2026 : règles Firestore et Hosting publiés avec succès sur repas-ndamatou-7f044. Page publique HTTP 200 et bundle identique au build local. TypeScript et compilation réussis ; 40 cas émulateur validés en suite et lots ciblés, et 10 tests existants réussis. Aucun paiement réel effectué pendant ces tests.
