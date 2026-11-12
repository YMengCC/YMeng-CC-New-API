---
title: Claude Code
description: 为 Anthropic 官方的 Claude Code 设置 Base URL 与令牌，或用 CC Switch 一键导入。
---

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 是 Anthropic 官方的命令行编程助手。有两种接入方式：一键导入 CC Switch，或手动设置环境变量。

## 方式一：用 CC Switch 一键导入（推荐）

[CC Switch](https://ccswitch.io/zh/) 是一款图形界面工具，可以管理多套 Claude Code 配置并快速切换。

1. 安装 CC Switch；
2. 在 [API 密钥](/keys) 页面，点击密钥右侧的 **⋯** 菜单，选择 **CC Switch**；
3. 在弹窗中，**应用**选择 `Claude`，选择**主模型**（可选填 Haiku / Sonnet / Opus 对应的模型）；
4. 点击 **打开 CC Switch**，在 CC Switch 中确认导入并启用这套配置；
5. 重新打开终端，启动 Claude Code。

## 方式二：手动设置环境变量

在终端中设置以下环境变量（把 `YOUR_API_KEY` 换成你的密钥）。

macOS / Linux：

```bash
export ANTHROPIC_BASE_URL="{{BASE_URL}}"
export ANTHROPIC_AUTH_TOKEN="YOUR_API_KEY"
```

Windows PowerShell：

```powershell
$env:ANTHROPIC_BASE_URL = "{{BASE_URL}}"
$env:ANTHROPIC_AUTH_TOKEN = "YOUR_API_KEY"
```

设置完成后，在同一个终端窗口中运行 `claude` 即可。

:::danger 不要在地址后加 /v1
Claude Code 会自己拼接 `/v1/messages`。`ANTHROPIC_BASE_URL` 只填 `{{BASE_URL}}`，加了 `/v1` 会导致请求失败。
:::

## 推荐模型

- `claude-sonnet-5`
- `claude-opus-5`

模型名称以 [模型广场](/pricing) 中你所选分组可用的模型为准。

## 常见问题

| 现象                        | 原因                                                  | 解决方法                                          |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| 401 / authentication_error  | 没有设置 `ANTHROPIC_AUTH_TOKEN`，或密钥已被禁用、删除 | 重新创建密钥，并确认在当前终端中已经设置          |
| 请求仍然发往 Anthropic 官方 | `ANTHROPIC_BASE_URL` 没有生效，或被加上了 `/v1`       | 严格按本页填写地址，不要加任何路径                |
| 切换配置后仍连接旧地址      | 本地有多套配置混在一起，没有用 CC Switch 切换         | 用 CC Switch 统一管理多套配置，切换后重新打开终端 |

## 立即试用

想先确认密钥和模型是否可用，可以在 [游乐场](/playground) 里直接发一条消息。
