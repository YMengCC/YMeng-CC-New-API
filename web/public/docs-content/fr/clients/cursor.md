---
title: Cursor
description: Utiliser les modèles de {{SYSTEM_NAME}} dans Cursor grâce à cursor-byokcx.
---

[Cursor](https://cursor.com) est un IDE de programmation assistée par IA. Ses paramètres intégrés ne prennent que partiellement en charge les adresses personnalisées compatibles OpenAI ; nous recommandons donc de passer par l'outil open source [cursor-byokcx](https://github.com/leookun/cursor-byokcx).

## Prérequis

1. Créez une clé sur la page [Clés API](/keys) et copiez-la ;
2. Installez cursor-byokcx en suivant les instructions de la page du projet.

## Étapes de configuration

1. Dans cursor-byokcx, définissez **API Base URL** sur :

```text
{{BASE_URL}}/v1
```

2. Dans **API Key**, saisissez votre clé ;
3. Faites pointer le **modèle de conversation** et le **modèle de complétion** vers cette adresse personnalisée, et saisissez le nom du modèle à utiliser ;
4. Enregistrez la configuration puis **redémarrez Cursor**.

:::warning
Dans Cursor, la conversation et la complétion utilisent deux réglages de modèle indépendants. Si vous n'en modifiez qu'un seul, vous obtiendrez la situation « la complétion fonctionne, mais la conversation renvoie une erreur ».
:::

## Modèles recommandés

- `gpt-4.1`
- `claude-sonnet-5`
- `gpt-4o-mini`

Utilisez un nom de modèle disponible pour le groupe choisi dans la [Place des modèles](/pricing).

## Problèmes fréquents

| Symptôme                                                         | Cause                                                                                  | Solution                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Aucun modèle personnalisé dans la liste des modèles              | L'outil passerelle n'est pas installé ou activé, ou Cursor n'a pas été redémarré       | Terminez la configuration de cursor-byokcx et redémarrez Cursor avant de vérifier à nouveau                          |
| 401 / Invalid API Key                                            | La clé a été copiée de façon incomplète, ou elle a été désactivée ou supprimée         | Recopiez la clé complète depuis la page Clés API et vérifiez qu'elle est activée                                     |
| La complétion fonctionne mais la conversation renvoie une erreur | La conversation et la complétion ont deux réglages distincts, et un seul a été modifié | Dans cursor-byokcx, faites pointer le modèle de conversation et le modèle de complétion vers l'adresse personnalisée |

## Essayer maintenant

Pour vérifier d'abord que votre clé et le modèle fonctionnent, envoyez directement un message dans l'[Aire de jeux](/playground).
