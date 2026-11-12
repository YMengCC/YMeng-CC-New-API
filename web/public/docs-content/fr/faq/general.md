---
title: Questions fréquentes
description: Questions courantes sur le compte, le solde, les clés et les modèles.
---

## Le solde expire-t-il ?

Le solde obtenu par recharge ou par code d'échange n'expire pas. Les bons d'achat et le quota d'adhésion peuvent avoir une durée de validité, précisée dans leurs conditions respectives. Voir [Recharge et bons d'achat](/wallet).

## Pourquoi mon solde a-t-il diminué d'un montant inférieur à celui des Journaux d'utilisation ?

Les Journaux d'utilisation enregistrent le **coût total** de chaque requête. Si une partie de la requête a été couverte par des bons d'achat, seul le reste est débité de votre solde ; la différence est donc normale.

## Comment choisir un groupe ?

Le groupe détermine les modèles que vous pouvez appeler et le multiplicateur de facturation. Lors de la création d'une clé, la liste déroulante des groupes affiche pour chacun le multiplicateur, le multiplicateur après remise d'adhésion et l'acceptation ou non des bons d'achat. En règle générale :

- pour utiliser un modèle précis : vérifiez d'abord dans la [Place des modèles](/pricing) dans quels groupes il est disponible ;
- pour utiliser vos bons d'achat : choisissez un groupe indiqué comme « acceptant les bons d'achat » ;
- pour économiser : choisissez, parmi les groupes disponibles, celui dont le multiplicateur est le plus bas.

## Quels modèles sont pris en charge ?

Tous les modèles disponibles et leurs prix sont listés dans la [Place des modèles](/pricing) ; vous pouvez aussi les obtenir via l'[API de liste des modèles](/docs/api/models-and-pricing). Les modèles sont régulièrement mis à jour.

## Un compte peut-il créer plusieurs clés ?

Oui. Nous vous conseillons de créer une clé par usage, par exemple une pour Claude Code et une pour votre propre application, afin de suivre la consommation, fixer des limites ou désactiver chacune séparément.

## Que faire si ma clé a fuité ?

Désactivez-la ou supprimez-la immédiatement sur la page [Clés API](/keys), puis créez-en une nouvelle. Vous pouvez vérifier dans les [Journaux d'utilisation](/usage-logs/common) s'il y a eu des appels suspects.

## Comment voir le coût de chaque appel ?

Ouvrez les [Journaux d'utilisation](/usage-logs/common) : vous y verrez pour chaque requête l'heure, le modèle, le nombre de tokens et le montant débité.

## Que faire si les requêtes sont lentes ou expirent ?

1. Testez d'abord le même modèle dans l'[Aire de jeux](/playground) pour vérifier si c'est le modèle lui-même qui répond lentement ;
2. Vérifiez votre réseau local et essayez-en un autre ;
3. Changez de groupe : chaque groupe utilise des lignes différentes ;
4. Si le problème persiste, contactez l'administrateur du site et fournissez le request id.

## Où obtenir de l'aide ?

- Consultez [Erreurs courantes](/docs/faq/errors) pour diagnostiquer vous-même le problème ;
- Contactez l'administrateur du site en indiquant votre ID utilisateur sur le site.
