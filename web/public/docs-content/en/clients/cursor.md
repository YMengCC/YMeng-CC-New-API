---
title: Cursor
description: Use {{SYSTEM_NAME}} models in Cursor with cursor-byokcx.
---

[Cursor](https://cursor.com) is an AI coding IDE. Its built-in settings have limited support for custom OpenAI-compatible addresses, so we recommend connecting through the open-source tool [cursor-byokcx](https://github.com/leookun/cursor-byokcx).

## Before you start

1. Create a key on the [API Keys](/keys) page and copy it;
2. Install cursor-byokcx by following the instructions on its project page.

## Setup

1. In cursor-byokcx, set **API Base URL** to:

```text
{{BASE_URL}}/v1
```

2. Enter your key in **API Key**;
3. Point both the **chat model** and the **completion model** to this custom address, and enter the model names you want to use;
4. Save the configuration and **restart Cursor**.

:::warning
Cursor's chat and completion use two separate model settings. If you change only one of them, you may find that completion works but chat returns errors.
:::

## Recommended models

- `gpt-4.1`
- `claude-sonnet-5`
- `gpt-4o-mini`

For model names, use the models available to your chosen group in the [Model Square](/pricing).

## Troubleshooting

| Symptom                                       | Cause                                                                         | Solution                                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Custom models do not appear in the model list | The bridge tool is not installed or enabled, or Cursor has not been restarted | Finish configuring cursor-byokcx, restart Cursor, then check again                         |
| 401 / Invalid API Key                         | The key was copied incompletely, or it has been disabled or deleted           | Copy the full key again from the API Keys page and make sure the key is enabled            |
| Completion works but chat returns errors      | Chat and completion are separate settings, and only one was changed           | In cursor-byokcx, point both the chat model and the completion model to the custom address |

## Try it now

To check that your key and model work first, send a message directly in the [Playground](/playground).
