---
title: API Gemini
description: Appeler les modèles Gemini au format natif Google Gemini.
---

{{SYSTEM_NAME}} prend en charge l'API `generateContent` native de Gemini, avec des chemins au format `/v1beta/models/{nom du modèle}:{opération}`.

## generateContent

`POST /v1beta/models/{model}:generateContent`

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "Bonjour, Gemini" }] }
    ]
  }'
```

Pour le streaming, remplacez l'opération par `streamGenerateContent` et ajoutez `?alt=sse` à l'adresse :

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "Raconte-moi une courte histoire" }] }] }'
```

## Authentification

Utilisez l'une des trois méthodes suivantes :

| Méthode                         | Syntaxe                                 |
| ------------------------------- | --------------------------------------- |
| En-tête de requête (recommandé) | `x-goog-api-key: YOUR_API_KEY`          |
| Paramètre de requête            | Ajoutez `?key=YOUR_API_KEY` à l'adresse |
| En-tête générique               | `Authorization: Bearer YOUR_API_KEY`    |

:::warning
Lorsque la clé est transmise en paramètre de requête, elle peut être enregistrée dans les journaux d'un proxy ou dans l'historique du navigateur ; en production, privilégiez l'en-tête de requête.
:::

## Entrée vidéo

Utilisez les corps de requête suivants avec les points d'accès natifs `generateContent` et `streamGenerateContent` ci-dessus. Choisissez un modèle prenant en charge la compréhension vidéo.

### Jusqu'à 15 MB : utiliser une URL vidéo HTTPS

Placez une URL HTTPS de téléchargement public de la vidéo dans `fileData.fileUri`. Les URL signées doivent rester valides pendant la récupération par le fournisseur, sans connexion, cookies ni en-têtes supplémentaires.

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "fileData": {
            "mimeType": "video/mp4",
            "fileUri": "https://example.com/video.mp4"
          }
        },
        {
          "text": "Résume cette vidéo."
        }
      ]
    }
  ]
}
```

Ce site accepte camelCase et snake_case : `fileData` / `file_data`, `mimeType` / `mime_type` et `fileUri` / `file_uri`.

### Au-delà de 15 MB : utiliser Base64 en ligne

Les URL de vidéos externes de plus de 15 MB ne sont pas utilisables avec `fileData` / `file_data`. Lisez le fichier vidéo, encodez ses octets en Base64 et placez le résultat dans `inlineData.data` :

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<Contenu du fichier vidéo encodé en Base64>"
          }
        },
        {
          "text": "Résume cette vidéo."
        }
      ]
    }
  ]
}
```

Vous pouvez aussi utiliser `inline_data` et `mime_type`. `data` doit contenir la vidéo encodée en Base64, et non son URL.

Le corps JSON complet doit être inférieur à 100 MB, Base64, consignes et autres champs compris. Base64 augmente généralement la taille d'environ un tiers : gardez la vidéo d'origine sous environ 75 MB et réservez de la place au reste. Une vidéo d'origine de moins de 100 MB ne respecte pas nécessairement cette limite.

### Vidéos plus volumineuses et Files API

Le Base64 en ligne convient aux vidéos de petite taille ; la disponibilité et le délai dépendent du modèle et du canal. Le guide vidéo de Google recommande Files API au-delà de 20 MB de requête totale, pour les vidéos longues ou réutilisées. Si la requête en ligne complète approche ou dépasse 100 MB, compressez ou raccourcissez la vidéo, et contactez l'administrateur du site si nécessaire.

Références officielles : [Méthodes d'entrée de fichiers et limites](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods), [Compréhension vidéo](https://ai.google.dev/gemini-api/docs/video-understanding).

## Remarques

- L'opération `:countTokens` n'est pas encore prise en charge ; son appel renvoie une erreur 404.
- Vous pouvez aussi appeler les modèles Gemini via l'[API compatible OpenAI](/docs/api/openai) : il suffit d'indiquer un nom de modèle Gemini dans `model`.

Les noms de modèles cités sur cette page ne sont que des exemples ; les modèles réellement disponibles sont ceux de la [Place des modèles](/pricing).
