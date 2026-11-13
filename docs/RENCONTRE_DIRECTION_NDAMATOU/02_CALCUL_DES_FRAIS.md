# Comprendre et équilibrer les frais

## 1. Les hypothèses à confirmer

Calculs illustratifs : Bictorys 1 % + Wave 1 %, tous deux calculés sur le même montant brut encaissé, soit 2 % additifs. Aucun frais fixe, de reversement ou taxe supplémentaire n'est inclus. Les décimales sont conservées pour expliquer le calcul ; les prélèvements réels dépendent des arrondis du prestataire.

Ces 2 % ne sont pas un tarif vérifié. La documentation officielle Bictorys décrit des frais marchand et client mais ne confirme pas ici votre grille contractuelle. Demander si le tarif Bictorys inclut déjà les frais Wave, si les prélèvements sont additifs ou successifs et qui supporte chaque frais.

Wave affiche pour son application de paiements physiques une gratuité des premiers 20 000 F quotidiens puis 1 %. Cette offre ne permet pas de conclure au tarif de votre intégration API via Bictorys.

## 2. Votre recharge de 500 F

Si l'agent verse 500 F, si l'on retient commercialement 1 % de ce versement pour déterminer son crédit, et si les frais externes sont 2 % du versement :

| Opération | Montant |
|---|---:|
| Versement brut agent | 500 F |
| Frais externes hypothétiques | 10 F |
| Encaissement net | 490 F |
| Crédit de badge promis : 500 × 99 % | 495 F |
| Écart entre encaissement net et crédit promis | 5 F |

Les 5 F doivent être financés par une partie désignée. Ils ne constituent pas votre bénéfice. Un badge à 495 F ne permet pas de payer une part de repas de 500 F sans complément ou changement explicite de la règle.

Si la règle est « crédit = 99 % du montant versé », obtenir 500 F de crédit demande 500 / 0,99 = 505,0505… F avant arrondi. C'est différent de « frais = 1 % du crédit », qui donne 505 F versés pour 500 F crédités. Le contrat doit choisir une formule.

Ne pas réduire le crédit à la recharge puis reprendre le même frais au débit du repas. Afficher distinctement montant versé, frais et crédit, et vérifier que la refacturation envisagée est permise par les conditions du prestataire de paiement.

## 3. Pourquoi 505 F + 505 F ne financent pas votre modèle

1 % de la part agent de 500 F = 5 F. 1 % de la part hôpital de 500 F = 5 F. 1 % du prix restaurant de 1 000 F = 10 F. Ensemble, cela représente 20 F, soit 2 % du repas, et non 3 % du repas.

Si agent et hôpital versent chacun 505 F via le circuit taxé à 2 % :

- total brut : 1 010 F ;
- frais externes : 20,20 F ;
- disponible net : 989,80 F ;
- restaurant après retenue de 1 % de 1 000 F : 990 F ;
- solde pour vous : −0,20 F.

Il manque déjà 0,20 F avant votre rémunération.

Si l'hôpital verse au contraire 505 F par virement sans frais et seul le versement agent passe à 2 %, le disponible est 505 × 98 % + 505 = 999,90 F. Après 990 F au restaurant, il reste 9,90 F. Le circuit de l'hôpital change donc fortement le résultat.

## 4. Partager sur une base commune

Pour que chaque partie supporte 1 % du prix de référence de 1 000 F, chacune supporte 10 F :

| Élément | Montant |
|---|---:|
| Agent : part 500 F + contribution 10 F | 510 F |
| Hôpital : subvention 500 F + contribution 10 F | 510 F |
| Encaissement brut total | 1 020 F |
| Frais externes : 2 % de 1 020 F | −20,40 F |
| Disponible net | 999,60 F |
| Restaurant : prix 1 000 F − contribution 10 F | −990 F |
| Rémunération restante pour vous | 9,60 F |

Le crédit de consommation agent est ici de 500 F pour un paiement de 510 F. Sa contribution est de 1 % du prix total du repas, soit 2 % de sa part de base. Il faut le dire clairement.

Ce modèle répartit bien 10 F de charge par partie mais votre rémunération est 0,96 % du repas, pas exactement 1 %. L'écart provient des frais sur les contributions supplémentaires encaissées.

Pour garder agent 510 F, restaurant 990 F et rémunération exacte de 10 F, si tous les versements subissent 2 %, l'hôpital devrait verser : (990 + 10) / 0,98 − 510 = 510,408163… F. Sa charge ne serait donc plus exactement 10 F. Une facture groupée et une règle d'arrondi sont nécessaires ; il ne faut pas utiliser un montant fractionnaire comme instruction de paiement XOF.

Si chaque partie doit supporter exactement la même charge et votre rémunération être exactement 10 F, la charge commune x satisfait : 0,98 × (1 000 + 2x) = (1 000 − x) + 10. D'où x = 30 / 2,96 = 10,135135… F. C'est mathématiquement équilibré mais moins simple à expliquer et à facturer.

## 5. Formule de référence pour le contrat

Rémunération disponible = encaissements bruts − frais externes réels − sommes dues au restaurant − remboursements et autres sommes dues.

Les crédits non consommés, avances et subventions en attente restent des obligations à rapprocher ; ils ne sont pas une rémunération disponible.

Pour un modèle avec rémunération contractuelle à 1 %, calculer cette rémunération séparément : 1 % × valeur de référence des repas servis éligibles. Définir ensuite qui finance les frais externes réels, les différences d'arrondi et les éventuels frais de sortie. Ne pas promettre simultanément les montants fixes 510/510/990 et 10 F de rémunération sous une hypothèse de 2 % sur tous les encaissements.

Recommandation commerciale : conserver 500 F de crédit pour la part agent et présenter les frais séparément ; choisir soit un partage avec rémunération résiduelle explicitement annoncée, soit 1 % exact avec ajustement documenté des contributions, soit l'abonnement. Les tableaux de ce dossier ne constituent pas une annexe tarifaire acceptée.

## 6. Questions à adresser à Bictorys avant signature

- Le 1 % communiqué inclut-il Wave ? Quel est le montant effectivement retenu sur 500, 505, 510 et 5 000 F ?
- Quelle base, quelles taxes et quels arrondis s'appliquent ? Existe-t-il des minimums ou frais fixes ?
- Quels frais s'appliquent aux reversements restaurant, virements, remboursements et échecs ?
- Peut-on refacturer des frais au personnel ou réduire le crédit pour une recharge ?
- Quel titulaire de compte marchand est admissible pour ce montage ? La collecte pour compte de tiers et le partage des règlements sont-ils autorisés ?
- Quels sont les délais de règlement, plafonds, justificatifs et mécanismes de rapprochement ?

## Sources consultées le 11 novembre 2026

- Bictorys, intégration : https://docs.bictorys.com/docs/integration
- Wave, application Business et paiements physiques : https://www.wave.com/fr/business-app/
- BCEAO, instruction n°001-01-2024 relative aux services de paiement : https://www.bceao.int/sites/default/files/2024-01/Instruction%20N%C2%B0001-01-2024%20relative%20aux%20services%20de%20paiement%20dans%20l%27UMOA_0.pdf

La réglementation des services de paiement impose de faire qualifier le circuit envisagé. Ce dossier ne détermine pas votre statut réglementaire et n'affirme pas qu'un simple mandat contractuel autorise la conservation de fonds de tiers.
