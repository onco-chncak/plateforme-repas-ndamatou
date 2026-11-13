# Sandbox Bictorys Ndamatou

Espace séparé du site hospitalier : https://ndamatou-bictorys-sandbox.smsgueye.workers.dev

Le backend utilise uniquement l’API Bictorys de test et une base Cloudflare D1 contenant deux badges fictifs. Il n’a aucun accès à Firebase. Le site hospitalier, ses tarifs, ses recharges manuelles et ses badges réels restent inchangés.

## Accès et secrets

Le mot de passe se trouve dans le champ `DEMO_PASSWORD` du fichier local `.secrets.local.json`. Ce fichier est ignoré par Git et ne doit pas être envoyé dans un message, commité ou publié. Les valeurs nécessaires sont enregistrées comme secrets du Worker ; elles ne sont pas servies au navigateur.

Le webhook est :

`https://ndamatou-bictorys-sandbox.smsgueye.workers.dev/webhooks/bictorys`

La valeur `BICTORYS_WEBHOOK_SECRET` doit correspondre à celle du tableau de bord Bictorys en mode TEST. La clé privée de reversement n’est pas utilisée.

## État au 13 novembre 2026

- Connexion Cloudflare effectuée par l’utilisateur ; Worker et base D1 créés, secrets enregistrés.
- Configuration publiée et connexion de démonstration vérifiées avant activation ; accès anonyme aux badges refusé.
- L’utilisateur a confirmé l’enregistrement du webhook en mode test. Ce réglage du tableau de bord n’a pas été vérifié directement par l’assistant.
- `PAYMENTS_ENABLED` passe à `true` pour ouvrir les essais sandbox ; ni un paiement fournisseur ni une simulation opérateur ne sont lancés par le déploiement.
- Après publication, `/health` confirme `configured=true`, `paymentsEnabled=true` et `realBadgesConnected=false`. La connexion de démonstration répond HTTP 200, les deux badges fictifs sont accessibles avec session et une demande anonyme de création de paiement est refusée HTTP 401. Ces vérifications n’ont créé aucun paiement fournisseur.
- Le parcours Bictorys complet reste à vérifier avec les moyens de simulation fournis par Bictorys. Aucun succès de paiement de bout en bout n’est annoncé sur la seule base de l’activation.
- Le bouton Bictorys du site hospitalier reste « bientôt disponible » : le sandbox ne crédite pas les badges réels.

## Essai manuel

1. Ouvrir l’espace sandbox et se connecter avec le mot de passe local.
2. Sélectionner `DEMO-001` ou `DEMO-002`, puis un montant fictif, par exemple 510 F.
3. Préparer le paiement de TEST et ouvrir le lien retourné par Bictorys.
4. Utiliser uniquement les scénarios, numéros et moyens de simulation confirmés par Bictorys ; ne pas utiliser un moyen de paiement réel.
5. Revenir et actualiser les soldes et tentatives. Le crédit attend une notification authentifiée ; une redirection « succès » seule ne crédite rien.

Le calcul financier actuel est réutilisé pour les badges fictifs : 510 F de test correspondent à 505 F fictifs. Aucun nouveau modèle de commission n’est ajouté. Une seule tentative est réutilisée pour le même badge et le même montant dans ce navigateur, afin d’éviter un doublon après une réponse perdue. Pour plusieurs scénarios identiques, il faudra prévoir une action explicite de nouvelle tentative avant d’enchaîner des essais.

Une tentative `review` nécessite une vérification ; ne pas recommencer à l’aveugle. Les notifications de renversement sont conservées pour revue sans effacer le journal ni retirer automatiquement un crédit. L’espace est limité à 20 tentatives par jour. Les limites et quotas de l’offre Cloudflare restent applicables ; aucun forfait payant ni changement de facturation n’est activé par les commandes de cette préparation.

## Vérification locale et exploitation

```powershell
npm.cmd --prefix sandbox-bictorys test
$env:NODE_USE_SYSTEM_CA = "1"
npx.cmd --yes wrangler@4.161.0 deploy --config sandbox-bictorys/wrangler.jsonc
```

Les 11 tests utilisent un fournisseur simulé et SQLite en mémoire : ils ne lancent aucun paiement Bictorys. Une relecture indépendante a trouvé puis confirmé la correction d’une concurrence entre notification précoce et réponse de création.

Complément de diagnostic : la suite comporte désormais 23 tests, dont deux exécutant le code compilé dans le moteur officiel Miniflare/workerd. Toutes les requêtes fournisseur y sont interceptées et le stockage D1 est local et éphémère. Le correctif local du mode de redirection est décrit dans `docs/CORRECTIF_REDIRECT_CLOUDFLARE_SANDBOX.md` ; ce document indique son état de publication, distinct des résultats de test.

Pour suspendre les nouvelles tentatives, remettre `PAYMENTS_ENABLED` à `false` dans `wrangler.jsonc`, puis publier le Worker. Les notifications des tentatives déjà créées restent traitables pour préserver leur rapprochement. Ne jamais remplacer l’URL de test ou les clés de test par celles de production dans ce backend.
