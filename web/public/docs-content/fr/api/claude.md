---
title: API Claude
description: Appeler les modèles Claude au format natif Anthropic Messages.
---

{{SYSTEM_NAME}} prend en charge l'API Messages native d'Anthropic. Si votre code utilise déjà le SDK Anthropic, il suffit de remplacer la Base URL et la clé.

## Messages

`POST /v1/messages`

```bash
curl {{BASE_URL}}/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-5",
    "max_tokens": 1024,
    "messages": [{ "role": "user", "content": "Bonjour, Claude" }]
  }'
```

Pour l'authentification, vous pouvez utiliser `x-api-key` ou `Authorization: Bearer YOUR_API_KEY`. Pour obtenir une réponse en streaming, ajoutez `"stream": true` au corps de la requête.

## Utiliser le SDK Anthropic

Python :

```python
import anthropic

client = anthropic.Anthropic(
    base_url="{{BASE_URL}}",
    api_key="YOUR_API_KEY",
)

message = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Bonjour, Claude"}],
)
print(message.content[0].text)
```

:::danger La Base URL ne doit pas contenir /v1
Le SDK Anthropic ajoute automatiquement `/v1/messages` ; dans `base_url`, saisissez uniquement `{{BASE_URL}}`.
:::

## Remarques

- Le paramètre `max_tokens` est obligatoire ; c'est une exigence de l'API Anthropic elle-même.
- `POST /v1/messages/count_tokens` n'est pas encore pris en charge.
- Vous pouvez aussi appeler les modèles Claude via l'[API compatible OpenAI](/docs/api/openai) : il suffit d'indiquer un nom de modèle Claude dans `model`.

Les noms de modèles cités sur cette page ne sont que des exemples ; les modèles réellement disponibles sont ceux de la [Place des modèles](/pricing).
