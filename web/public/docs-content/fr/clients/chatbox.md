---
title: ChatBox
description: Connecter ChatBox à {{SYSTEM_NAME}} via un fournisseur personnalisé compatible OpenAI.
---

[ChatBox](https://chatboxai.app) est un client d'IA multiplateforme qui prend en charge les API personnalisées compatibles OpenAI.

## Prérequis

Créez une clé sur la page [Clés API](/keys) et copiez-la. Si vous n'avez pas encore de clé, suivez d'abord les trois premières étapes du [Démarrage rapide](/docs/quick-start).

## Étapes de configuration

1. Ouvrez ChatBox et allez dans **Paramètres → Modèle** ;
2. Ajoutez un fournisseur de type **personnalisé compatible OpenAI** ;
3. Dans **Clé API**, saisissez votre clé ;
4. Dans **Adresse de l'API (API Host)**, saisissez :

```text
{{BASE_URL}}/v1
```

5. Dans la liste des modèles, saisissez ou sélectionnez le nom du modèle à utiliser, enregistrez, et vous pouvez commencer à discuter.

:::tip
Certaines versions de ChatBox ajoutent automatiquement `/v1` à la fin de l'adresse. Si vous obtenez une erreur 404 avec la configuration ci-dessus, remplacez l'adresse par `{{BASE_URL}}` et réessayez.
:::

## Modèles recommandés

- `gpt-4o-mini`
- `gpt-4.1`
- `gemini-2.5-flash`

Utilisez un nom de modèle disponible pour le groupe choisi dans la [Place des modèles](/pricing).

## Problèmes fréquents

| Symptôme                                        | Cause                                                                          | Solution                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 401 / Invalid API Key                           | La clé a été copiée de façon incomplète, ou elle a été désactivée ou supprimée | Recopiez la clé complète depuis la page Clés API et vérifiez qu'elle est activée                        |
| insufficient quota                              | Le solde du compte ou le montant des bons d'achat est épuisé                   | Rechargez depuis la page du portefeuille, ou vérifiez que le groupe choisi accepte les bons d'achat     |
| Délai de connexion dépassé sur certains réseaux | L'accès à cette adresse depuis votre réseau local est instable                 | Réessayez depuis un autre réseau, ou contactez l'administrateur du site pour vérifier l'état du service |

## Essayer maintenant

Pour vérifier d'abord que votre clé et le modèle fonctionnent, envoyez directement un message dans l'[Aire de jeux](/playground).
