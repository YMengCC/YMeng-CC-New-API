---
title: Génération d'images
description: Générer et modifier des images via l'API Images compatible OpenAI.
---

L'API d'images suit le même format que l'API Images d'OpenAI.

## Générer une image

`POST /v1/images/generations`

```bash
curl {{BASE_URL}}/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "Un chat roux qui se prélasse au soleil sur le rebord d’une fenêtre, style aquarelle",
    "size": "1024x1024",
    "n": 1
  }'
```

Paramètres courants :

| Paramètre         | Description                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `model`           | Nom du modèle de génération d'images, selon la Place des modèles                          |
| `prompt`          | Description de l'image                                                                    |
| `size`            | Taille de l'image, par exemple `1024x1024` ; les valeurs possibles dépendent du modèle    |
| `n`               | Nombre d'images à générer, 128 au maximum par requête ; la limite réelle dépend du modèle |
| `response_format` | `url` ou `b64_json` ; certains modèles n'en prennent en charge qu'un seul                 |

## Modifier une image

`POST /v1/images/edits`

Envoyez l'image d'origine et la description en `multipart/form-data` :

```bash
curl {{BASE_URL}}/v1/images/edits \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F model="gpt-image-1" \
  -F image="@input.png" \
  -F prompt="Remplace l'arrière-plan par un coucher de soleil en bord de mer"
```

## Facturation

Les modèles de génération d'images peuvent être facturés à la requête ou aux tokens ; lorsque plusieurs images sont générées en une fois, le coût est cumulé par image. Pour les prix, consultez la [Place des modèles](/pricing) ; pour les règles de facturation, consultez [Facturation](/pricing).

:::tip
Les liens d'images renvoyés au format `url` ont généralement une durée de validité limitée ; téléchargez rapidement les images que vous souhaitez conserver.
:::

Les noms de modèles cités sur cette page ne sont que des exemples ; les modèles réellement disponibles sont ceux de la [Place des modèles](/pricing).
