---
title: Présentation de l'API
description: Base URL, méthodes d'authentification, protocoles pris en charge et format des réponses d'erreur.
---

{{SYSTEM_NAME}} propose, à la même adresse, trois familles d'API — compatible OpenAI, native Claude (Anthropic) et native Gemini — toutes appelées avec la même clé API.

## Base URL

| Protocole         | Base URL              | Remarques                                                               |
| ----------------- | --------------------- | ----------------------------------------------------------------------- |
| Compatible OpenAI | `{{BASE_URL}}/v1`     | Convient à la grande majorité des SDK et des clients                    |
| Natif Claude      | `{{BASE_URL}}`        | Le SDK Anthropic et Claude Code ajoutent automatiquement `/v1/messages` |
| Natif Gemini      | `{{BASE_URL}}/v1beta` | Pour le SDK Google Gen AI ou les appels directs                         |

## Authentification

Toutes les API acceptent la clé dans l'en-tête de requête :

```http
Authorization: Bearer YOUR_API_KEY
```

Certaines API acceptent aussi la syntaxe native des SDK de chaque fournisseur :

| En-tête / paramètre                                   | API concernées                                            |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `x-api-key: YOUR_API_KEY`                             | API Claude `/v1/messages`, liste des modèles `/v1/models` |
| `x-goog-api-key: YOUR_API_KEY` ou `?key=YOUR_API_KEY` | API Gemini `/v1beta/models/...`, liste des modèles        |

:::warning
La clé API ne doit être stockée que côté serveur ou dans une configuration locale. Ne l'intégrez jamais dans du code front-end (pages web, mini-programmes, etc.), sinon n'importe qui pourra la voir et l'utiliser.
:::

## Liste des API

| Catégorie         | Méthode et chemin                                   | Documentation                                     |
| ----------------- | --------------------------------------------------- | ------------------------------------------------- |
| Conversation      | `POST /v1/chat/completions`                         | [API compatible OpenAI](/docs/api/openai)         |
| Responses         | `POST /v1/responses`                                | [API compatible OpenAI](/docs/api/openai)         |
| Embeddings        | `POST /v1/embeddings`                               | [API compatible OpenAI](/docs/api/openai)         |
| Audio             | `POST /v1/audio/speech`, `/v1/audio/transcriptions` | [API compatible OpenAI](/docs/api/openai)         |
| Reranking         | `POST /v1/rerank`                                   | [API compatible OpenAI](/docs/api/openai)         |
| Messages Claude   | `POST /v1/messages`                                 | [API Claude](/docs/api/claude)                    |
| Gemini            | `POST /v1beta/models/{model}:generateContent`       | [API Gemini](/docs/api/gemini)                    |
| Images            | `POST /v1/images/generations`, `/v1/images/edits`   | [Génération d'images](/docs/api/images)           |
| Liste des modèles | `GET /v1/models`                                    | [Modèles et tarifs](/docs/api/models-and-pricing) |

Les modèles que vous pouvez appeler dépendent du groupe de votre clé API ; reportez-vous à la [Place des modèles](/pricing).

## Réponses d'erreur

En cas d'échec, la requête renvoie un code d'état autre que 2xx, avec un corps de réponse JSON. Pour l'API compatible OpenAI, le format est le suivant :

```json
{
  "error": {
    "code": "",
    "message": "Invalid token (request id: 2026093010545547265...)",
    "type": "new_api_error"
  }
}
```

Le request id à la fin de `message` aide l'administrateur du site à localiser rapidement le problème ; fournissez-le lorsque vous nous contactez.

Codes d'état courants :

| Code d'état | Signification                                                                    |
| ----------- | -------------------------------------------------------------------------------- |
| 400         | Paramètres de requête incorrects, par exemple nom de modèle manquant             |
| 401         | Aucune clé fournie, ou clé invalide, expirée ou désactivée                       |
| 403         | Solde insuffisant, ou pas d'autorisation pour ce groupe / modèle                 |
| 429         | Trop de requêtes ; réessayez plus tard (voir l'en-tête de réponse `Retry-After`) |
| 503         | Aucune ligne disponible pour le moment dans ce groupe                            |

Pour la cause et la solution de chaque erreur, consultez [Erreurs courantes](/docs/faq/errors).
