---
title: API compatible OpenAI
description: Exemples d'appels pour Chat Completions, Responses, Embeddings, l'audio et le reranking.
---

La Base URL de l'API compatible OpenAI est `{{BASE_URL}}/v1`. Le SDK officiel d'OpenAI, ainsi que tout outil permettant de personnaliser la Base URL, peut l'utiliser directement.

## Chat Completions

`POST /v1/chat/completions`

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "Tu es un assistant serviable." },
      { "role": "user", "content": "Présente-toi en une phrase" }
    ]
  }'
```

Pour obtenir une réponse en streaming, ajoutez `"stream": true` au corps de la requête ; la réponse est alors renvoyée par fragments sous forme de Server-Sent Events.

## Utiliser le SDK officiel

Python :

```python
from openai import OpenAI

client = OpenAI(
    base_url="{{BASE_URL}}/v1",
    api_key="YOUR_API_KEY",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Bonjour"}],
)
print(response.choices[0].message.content)
```

Node.js :

```javascript
import OpenAI from 'openai'

const client = new OpenAI({
  baseURL: '{{BASE_URL}}/v1',
  apiKey: process.env.API_KEY,
})

const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Bonjour' }],
})
console.log(response.choices[0].message.content)
```

## Responses

`POST /v1/responses`

```bash
curl {{BASE_URL}}/v1/responses \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "input": "Explique en trois phrases ce qu’est une passerelle d’API"
  }'
```

:::info
La prise en charge de l'API Responses dépend du modèle lui-même. Si un modèle indique qu'il ne la prend pas en charge, utilisez plutôt Chat Completions.
:::

## Embeddings

`POST /v1/embeddings`

```bash
curl {{BASE_URL}}/v1/embeddings \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": "Texte à vectoriser"
  }'
```

## Audio

| Usage                           | Méthode et chemin               |
| ------------------------------- | ------------------------------- |
| Synthèse vocale                 | `POST /v1/audio/speech`         |
| Transcription audio             | `POST /v1/audio/transcriptions` |
| Traduction audio vers l'anglais | `POST /v1/audio/translations`   |

Le format des requêtes est identique à celui de l'API officielle d'OpenAI ; pour la transcription, le fichier audio doit être envoyé en `multipart/form-data`.

## Autres API

| Usage                                  | Méthode et chemin      |
| -------------------------------------- | ---------------------- |
| Reranking                              | `POST /v1/rerank`      |
| Modération de contenu                  | `POST /v1/moderations` |
| Complétion de texte (ancienne version) | `POST /v1/completions` |

Les noms de modèles cités sur cette page ne sont que des exemples ; les modèles réellement disponibles sont ceux de la [Place des modèles](/pricing).
