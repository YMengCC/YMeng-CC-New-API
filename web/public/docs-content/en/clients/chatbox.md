---
title: ChatBox
description: Connect ChatBox to {{SYSTEM_NAME}} using a custom OpenAI-compatible provider.
---

[ChatBox](https://chatboxai.app) is a cross-platform AI client that supports custom OpenAI-compatible APIs.

## Before you start

Create a key on the [API Keys](/keys) page and copy it. If you do not have a key yet, complete the first three steps of [Quick Start](/docs/quick-start) first.

## Setup

1. Open ChatBox and go to **Settings → Model**;
2. Add a **custom OpenAI-compatible** provider;
3. Enter your key in **API Key**;
4. Enter the following in **API Host**:

```text
{{BASE_URL}}/v1
```

5. Enter or select the model name you want to use in the model list, save, and start chatting.

:::tip
Some versions of ChatBox append `/v1` to the address automatically. If you get a 404 after entering the value above, change the address to `{{BASE_URL}}` and try again.
:::

## Recommended models

- `gpt-4o-mini`
- `gpt-4.1`
- `gemini-2.5-flash`

For model names, use the models available to your chosen group in the [Model Square](/pricing).

## Troubleshooting

| Symptom                               | Cause                                                               | Solution                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 401 / Invalid API Key                 | The key was copied incompletely, or it has been disabled or deleted | Copy the full key again from the API Keys page and make sure the key is enabled               |
| insufficient quota                    | Your account balance or voucher quota has run out                   | Top up on the Wallet page, or check whether your chosen group supports vouchers               |
| Connection times out on some networks | Your local network has an unstable connection to the address        | Retry on a different network, or contact the site administrator to confirm the service status |

## Try it now

To check that your key and model work first, send a message directly in the [Playground](/playground).
