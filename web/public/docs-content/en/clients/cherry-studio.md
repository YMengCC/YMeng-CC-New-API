---
title: Cherry Studio
description: Add an OpenAI-compatible provider in Cherry Studio to connect to {{SYSTEM_NAME}}.
---

[Cherry Studio](https://cherry-ai.com) is an all-in-one desktop AI client with native support for OpenAI-compatible providers.

## Before you start

Create a key on the [API Keys](/keys) page and copy it. If you do not have a key yet, complete the first three steps of [Quick Start](/docs/quick-start) first.

## Setup

1. Open Cherry Studio and go to **Settings → Model Provider**;
2. Click **Add**, choose **OpenAI** as the provider type, and give it any name, for example `{{SYSTEM_NAME}}`;
3. Enter your key in **API Key**;
4. Enter the following in **API Host**:

```text
{{BASE_URL}}/v1
```

5. Click **Manage** or **Add Model** and enter the names of the models you want to use;
6. Go back to the chat screen, pick the model you just added at the top, and start chatting.

:::warning
The API Host must match the value above exactly: do not omit or duplicate `/v1`, and do not add a trailing slash.
:::

## Recommended models

- `gpt-4o-mini`
- `gpt-4.1`
- `claude-sonnet-5`

For model names, use the models available to your chosen group in the [Model Square](/pricing).

## Troubleshooting

| Symptom                        | Cause                                                                           | Solution                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 401 / Invalid API Key          | The key was copied incompletely, or it has been disabled or deleted             | Copy the full key again from the API Keys page and make sure the key is enabled     |
| model not found                | The model name does not match the models actually available to your group       | Pick one of the recommended models, or check the available list in the Model Square |
| Request hangs with no response | The address is missing `/v1`, has an extra `/v1`, or ends with a trailing slash | Enter the API Host exactly as shown on this page                                    |

## Try it now

To check that your key and model work first, send a message directly in the [Playground](/playground).
