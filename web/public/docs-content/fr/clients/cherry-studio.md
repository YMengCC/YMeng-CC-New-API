---
title: Cherry Studio
description: Ajouter un fournisseur compatible OpenAI dans Cherry Studio pour se connecter à {{SYSTEM_NAME}}.
---

[Cherry Studio](https://cherry-ai.com) est un client d'IA de bureau polyvalent qui prend en charge nativement les fournisseurs compatibles OpenAI.

## Prérequis

Créez une clé sur la page [Clés API](/keys) et copiez-la. Si vous n'avez pas encore de clé, suivez d'abord les trois premières étapes du [Démarrage rapide](/docs/quick-start).

## Étapes de configuration

1. Ouvrez Cherry Studio et allez dans **Paramètres → Services de modèles** ;
2. Cliquez sur **Ajouter**, choisissez **OpenAI** comme type de fournisseur et donnez-lui le nom que vous voulez, par exemple `{{SYSTEM_NAME}}` ;
3. Dans **Clé API**, saisissez votre clé ;
4. Dans **Adresse de l'API**, saisissez :

```text
{{BASE_URL}}/v1
```

5. Cliquez sur **Gérer** ou **Ajouter un modèle** et saisissez le nom du modèle à utiliser ;
6. Revenez à l'écran de conversation et sélectionnez en haut le modèle que vous venez d'ajouter pour commencer à discuter.

:::warning
L'adresse de l'API doit être exactement celle indiquée ci-dessus : n'oubliez pas `/v1`, ne le dupliquez pas, et n'ajoutez pas de barre oblique à la fin.
:::

## Modèles recommandés

- `gpt-4o-mini`
- `gpt-4.1`
- `claude-sonnet-5`

Utilisez un nom de modèle disponible pour le groupe choisi dans la [Place des modèles](/pricing).

## Problèmes fréquents

| Symptôme                              | Cause                                                                                       | Solution                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 401 / Invalid API Key                 | La clé a été copiée de façon incomplète, ou elle a été désactivée ou supprimée              | Recopiez la clé complète depuis la page Clés API et vérifiez qu'elle est activée                    |
| model not found                       | Le nom du modèle ne correspond pas aux modèles réellement disponibles dans le groupe choisi | Choisissez l'un des modèles recommandés, ou consultez la liste disponible dans la Place des modèles |
| La requête reste bloquée sans réponse | `/v1` manque ou est en trop dans l'adresse, ou il y a une barre oblique finale              | Saisissez l'adresse de l'API exactement comme indiqué sur cette page                                |

## Essayer maintenant

Pour vérifier d'abord que votre clé et le modèle fonctionnent, envoyez directement un message dans l'[Aire de jeux](/playground).
