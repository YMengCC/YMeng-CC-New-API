---
title: Claude Code
description: Set the Base URL and token for Anthropic's official Claude Code, or import them in one click with CC Switch.
---

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) is Anthropic's official command-line coding assistant. There are two ways to connect it: import in one click with CC Switch, or set environment variables manually.

## Option 1: Import in one click with CC Switch (recommended)

[CC Switch](https://ccswitch.io/zh/) is a graphical tool for managing multiple Claude Code configurations and switching between them quickly.

1. Install CC Switch;
2. On the [API Keys](/keys) page, open the **⋯** menu to the right of your key and choose **CC Switch**;
3. In the dialog, set **Application** to `Claude` and choose the **Primary Model** (optionally, also set the models for Haiku / Sonnet / Opus);
4. Click **Open CC Switch**, then confirm the import in CC Switch and enable the configuration;
5. Reopen your terminal and start Claude Code.

## Option 2: Set environment variables manually

Set the following environment variables in your terminal (replace `YOUR_API_KEY` with your key).

macOS / Linux:

```bash
export ANTHROPIC_BASE_URL="{{BASE_URL}}"
export ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"
```

Windows PowerShell:

```powershell
$env:ANTHROPIC_BASE_URL = "{{BASE_URL}}"
$env:ANTHROPIC_AUTH_TOKEN = "YOUR_API_KEY"
```

Once they are set, run `claude` in the same terminal window.

:::danger Do not add /v1 to the address
Claude Code appends `/v1/messages` on its own. Set `ANTHROPIC_BASE_URL` to just `{{BASE_URL}}`; adding `/v1` will cause requests to fail.
:::

## Recommended models

- `claude-sonnet-5`
- `claude-opus-5`

For model names, use the models available to your chosen group in the [Model Square](/pricing).

## Troubleshooting

| Symptom                                                            | Cause                                                                                 | Solution                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 401 / authentication_error                                         | `ANTHROPIC_AUTH_TOKEN` is not set, or the key has been disabled or deleted            | Create a new key and make sure it is set in the current terminal                |
| Requests still go to Anthropic directly                            | `ANTHROPIC_BASE_URL` has not taken effect, or `/v1` was added to it                   | Enter the address exactly as shown on this page, without any path               |
| Still connecting to the old address after switching configurations | Multiple local configurations are mixed together and were not switched with CC Switch | Manage all configurations in CC Switch, and reopen the terminal after switching |

## Try it now

To check that your key and model work first, send a message directly in the [Playground](/playground).
