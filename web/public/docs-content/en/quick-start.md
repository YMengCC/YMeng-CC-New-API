---
title: Quick Start
description: Sign up, top up, create an API key, configure a client and make your first call in 5 steps.
---

This page walks you through the complete flow from scratch: **Sign up → Top up → Create an API key → Configure a client → Make your first call**. It only takes a few minutes.

:::info Remember these two things
- **Base URL**: `{{BASE_URL}}/v1` (used by OpenAI-compatible clients and SDKs)
- **Authentication**: request header `Authorization: Bearer your API key`
:::

## Step 1: Create an account

Open the [sign-up page](/sign-up) and enter a username and password to register. If the site offers other sign-in methods such as email or GitHub, you can use those as well.

![Sign-up page](/docs-assets/quick-start/en/step-1-sign-up.png 'Sign-up page')

## Step 2: Top up

After signing in, click **Points** in the left menu to open the [Wallet page](/wallet). In the **Add Funds** area, pick a preset amount or enter a custom amount, then choose a payment method and complete the payment. If you have a redemption code, you can redeem it on the same page.

![Top-up area on the Wallet page](/docs-assets/quick-start/en/step-2-top-up.png 'Choose an amount and payment method in Add Funds')

:::tip
Balance from top-ups never expires. The available amounts, payment methods and minimum top-up amount are whatever the page shows. For billing rules, see [Billing Overview](/pricing).
:::

## Step 3: Create an API key

Go to the [API Keys](/keys) page and click **Create API Key** in the top-right corner:

1. **Name**: anything you like, to help you tell keys apart, for example `my-first-key`.
2. **Group**: the group determines which models this key can call and which multiplier it is billed at. The dropdown shows each group's multiplier and whether it supports vouchers.
3. **Expiration Time**, **Quota**: the defaults are fine (never expires, unlimited quota); set them only when you need to limit risk.
4. Click **Save Changes**.

![Create API Key](/docs-assets/quick-start/en/step-3-create-key.png 'Enter a name and choose a group')

:::warning Protect your API key like a password
A key can spend your balance directly. Never post it in group chats, screenshots or public code repositories. If it leaks, immediately disable or delete the key in the list, then create a new one.
:::

## Step 4: Configure a client

In the key list, click the copy icon next to the key, or open the **⋯** menu on the right and choose **Copy Key**. The same menu also offers:

- **CC Switch**: import the key into CC Switch in one click, ideal for Claude Code users.
- **Chat**: open it directly in a supported chat client.

![Key actions menu](/docs-assets/quick-start/en/step-4-key-menu.png 'Copy the key, or import it into a client in one click')

Then fill in two fields in your client:

| Client type                                              | Address (Base URL / API Host)  | Key          |
| -------------------------------------------------------- | ------------------------------ | ------------ |
| OpenAI-compatible clients (Cherry Studio, ChatBox, etc.) | `{{BASE_URL}}/v1`              | Your API key |
| Claude Code                                              | `{{BASE_URL}}` (without `/v1`) | Your API key |

:::danger The most common mistake: an extra or missing /v1
OpenAI-compatible clients usually need `/v1`, while Claude Code must **not** include `/v1`. Some clients append `/v1` automatically; in that case, enter just `{{BASE_URL}}`. Do not add a trailing slash to the address. For client-specific instructions, see [Client Setup](/docs/clients/cherry-studio).
:::

## Step 5: Make your first call

Replace `YOUR_API_KEY` in the command below with your key and run it in a terminal:

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hello, this is my first call" }]
  }'
```

If the response contains a `choices` field, you are connected. For model names, use the models available to your chosen group in the [Model Square](/pricing).

If you would rather not use the command line, open the [Playground](/playground), pick a model and send a message to test.

![Testing in the Playground](/docs-assets/quick-start/en/step-5-playground.png 'Send your first message in the Playground')

## Next steps

- Learn how costs are calculated: [Billing Overview](/pricing)
- Set up your favorite clients: [Cherry Studio](/docs/clients/cherry-studio), [Claude Code](/docs/clients/claude-code)
- Call the API from code: [API Overview](/docs/api/overview)
- Seeing errors: [Common Errors](/docs/faq/errors)
