---
title: Modèles et tarifs
description: Obtenir la liste des modèles disponibles et les tarifs publics via l'API.
---

## Liste des modèles

`GET /v1/models`

Renvoie les modèles que la clé API actuelle peut appeler :

```bash
curl {{BASE_URL}}/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

L'API renvoie automatiquement le format correspondant aux en-têtes de la requête :

| En-tête de requête                | Format de réponse |
| --------------------------------- | ----------------- |
| `Authorization: Bearer ...`       | Format OpenAI     |
| `x-api-key` + `anthropic-version` | Format Anthropic  |
| `x-goog-api-key` ou `?key=`       | Format Gemini     |

Pour interroger un modèle précis : `GET /v1/models/{model}`.

## Tarifs

`GET /api/pricing`

Renvoie les informations tarifaires publiques de tous les modèles ; c'est aussi l'API utilisée par la page [Place des modèles](/pricing). Aucune clé API n'est requise ; si le site réserve la Place des modèles aux utilisateurs connectés, vous devez d'abord vous connecter.

```bash
curl {{BASE_URL}}/api/pricing
```

Principaux champs de chaque modèle dans le tableau `data` :

| Champ              | Description                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `model_name`       | Nom du modèle                                                                                 |
| `quota_type`       | Mode de facturation : `0` pour la facturation à l'usage, `1` pour la facturation à la requête |
| `model_ratio`      | Multiplicateur du modèle (utilisé pour la facturation à l'usage)                              |
| `completion_ratio` | Rapport entre le prix de sortie et le prix d'entrée                                           |
| `model_price`      | Prix par requête (utilisé pour la facturation à la requête)                                   |
| `enable_groups`    | Groupes autorisés à utiliser ce modèle                                                        |

:::tip
La [Place des modèles](/pricing) est plus lisible : la page convertit déjà les multiplicateurs en prix par million de tokens et permet de filtrer par groupe.
:::
