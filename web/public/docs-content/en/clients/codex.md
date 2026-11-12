---
title: Codex CLI
description: Route OpenAI's official Codex CLI through {{SYSTEM_NAME}} with environment variables.
---

[Codex CLI](https://github.com/openai/codex) is OpenAI's official command-line coding assistant. Set just two environment variables to have it call models through {{SYSTEM_NAME}}.

## Before you start

Create a key on the [API Keys](/keys) page and copy it, then install Codex CLI by following its official instructions.

## Setup

Set the following environment variables in your terminal (replace `YOUR_API_KEY` with your key).

macOS / Linux:

```bash
export OPENAI_BASE_URL="{{BASE_URL}}/v1"
export OPENAI_API_KEY="YOUR_API_KEY"
```

Windows PowerShell:

```powershell
$env:OPENAI_BASE_URL = "{{BASE_URL}}/v1"
$env:OPENAI_API_KEY = "YOUR_API_KEY"
```

Once they are set, start Codex CLI **in the same terminal window**.

If you use [CC Switch](https://ccswitch.io/zh/) to manage configurations, you can also open the **⋯** menu in the API key list, choose **CC Switch**, set **Application** to `Codex`, and import in one click. The address will include `/v1` automatically.

:::tip Make the configuration permanent
Add the `export` lines above to a shell config file such as `~/.bashrc` or `~/.zshrc`, then open a new terminal.
:::

## Recommended models

- `gpt-4.1`
- `gpt-4o-mini`

For model names, use the models available to your chosen group in the [Model Square](/pricing).

## Troubleshooting

| Symptom                              | Cause                                                                       | Solution                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 401                                  | `OPENAI_API_KEY` is not set in the current terminal                         | Set it in the same terminal window, or add it to your shell config file and open a new terminal                 |
| Requests still go to OpenAI directly | `OPENAI_BASE_URL` has not taken effect, or is overridden by another setting | Run `echo $OPENAI_BASE_URL` to check its value, and look for conflicting settings in your shell startup scripts |
| model not found                      | The model name does not match the models actually available to your group   | Pick one of the recommended models, or check the available list in the Model Square                             |

## Try it now

To check that your key and model work first, send a message directly in the [Playground](/playground).
