---
title: Интерфейс Gemini
description: Вызов моделей Gemini в нативном формате Google Gemini.
---

{{SYSTEM_NAME}} поддерживает нативный интерфейс Gemini `generateContent`; формат пути — `/v1beta/models/{модель}:{операция}`.

## generateContent

`POST /v1beta/models/{model}:generateContent`

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "Привет, Gemini" }] }
    ]
  }'
```

Для потокового вывода замените операцию на `streamGenerateContent` и добавьте к адресу `?alt=sse`:

```bash
curl "{{BASE_URL}}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "contents": [{ "role": "user", "parts": [{ "text": "Расскажи короткую историю" }] }] }'
```

## Способы авторизации

Выберите любой из трёх способов:

| Способ                            | Как указать                           |
| --------------------------------- | ------------------------------------- |
| Заголовок запроса (рекомендуется) | `x-goog-api-key: YOUR_API_KEY`        |
| Параметр запроса                  | Добавьте к адресу `?key=YOUR_API_KEY` |
| Общий заголовок запроса           | `Authorization: Bearer YOUR_API_KEY`  |

:::warning
При передаче ключа в параметре запроса он может сохраниться в логах прокси или в истории браузера. В рабочей среде рекомендуем использовать заголовок запроса.
:::

## Видеовход

Следующие тела запросов подходят для нативных методов `generateContent` и `streamGenerateContent`, указанных выше. Выберите модель с поддержкой понимания видео.

### До 15 MB включительно: HTTPS URL видео

Укажите публично доступную прямую HTTPS-ссылку на видео в `fileData.fileUri`. Подписанная ссылка должна оставаться действительной во время загрузки провайдером и не требовать входа, cookies или дополнительных заголовков.

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
          "text": "Кратко опиши это видео."
        }
      ]
    }
  ]
}
```

Сайт поддерживает camelCase и snake_case: `fileData` / `file_data`, `mimeType` / `mime_type` и `fileUri` / `file_uri`.

### Более 15 MB: встроенные данные Base64

Внешние URL видео размером более 15 MB нельзя использовать с `fileData` / `file_data`. Прочитайте видеофайл, закодируйте его байты в Base64 и поместите результат в `inlineData.data`:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "video/mp4",
            "data": "<Содержимое видеофайла в Base64>"
          }
        },
        {
          "text": "Кратко опиши это видео."
        }
      ]
    }
  ]
}
```

Также поддерживаются `inline_data` и `mime_type`. Поле `data` должно содержать видео в Base64, а не URL видео.

Полное тело JSON-запроса должно быть меньше 100 MB, включая Base64, инструкции и остальные поля. Base64 обычно увеличивает размер примерно на треть, поэтому исходное видео должно быть меньше примерно 75 MB с запасом для остального содержимого. Размер исходного видео менее 100 MB сам по себе недостаточен.

### Более крупные видео и Files API

Встроенный Base64 подходит для небольших видео; доступность и время ответа зависят от модели и канала. Видеоруководство Google рекомендует Files API при полном размере запроса более 20 MB, для длинных видео или повторного использования. Если полный встроенный запрос приближается к 100 MB или превышает этот размер, сожмите или сократите видео и при необходимости свяжитесь с администратором сайта.

Официальные материалы: [Способы передачи файлов и ограничения](https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods), [Понимание видео](https://ai.google.dev/gemini-api/docs/video-understanding).

## Особенности

- Операция `:countTokens` пока не поддерживается — вызов вернёт 404.
- Модели Gemini можно вызывать и через [OpenAI-совместимый интерфейс](/docs/api/openai) — достаточно указать в `model` название модели Gemini.

Названия моделей в тексте приведены только для примера; фактически доступные модели смотрите в [Витрине моделей](/pricing).
