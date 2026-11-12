---
title: Codex CLI
description: 通过环境变量让 OpenAI 官方的 Codex CLI 走 {{SYSTEM_NAME}}。
---

[Codex CLI](https://github.com/openai/codex) 是 OpenAI 官方的命令行编程助手。只需设置两个环境变量，就能让它通过 {{SYSTEM_NAME}} 调用模型。

## 准备工作

在 [API 密钥](/keys) 页面创建一个密钥并复制，然后按 Codex CLI 官方说明完成安装。

## 配置步骤

在终端中设置以下环境变量（把 `YOUR_API_KEY` 换成你的密钥）。

macOS / Linux：

```bash
export OPENAI_BASE_URL="{{BASE_URL}}/v1"
export OPENAI_API_KEY="YOUR_API_KEY"
```

Windows PowerShell：

```powershell
$env:OPENAI_BASE_URL = "{{BASE_URL}}/v1"
$env:OPENAI_API_KEY = "YOUR_API_KEY"
```

设置完成后，**在同一个终端窗口**中启动 Codex CLI 即可。

如果你在用 [CC Switch](https://ccswitch.io/zh/) 管理配置，也可以在 API 密钥列表的 **⋯** 菜单中选择 **CC Switch**，把**应用**选为 `Codex` 后一键导入，地址会自动带上 `/v1`。

:::tip 让配置长期生效
把上面的 `export` 语句写进 `~/.bashrc`、`~/.zshrc` 等 shell 配置文件，然后打开一个新终端。
:::

## 推荐模型

- `gpt-4.1`
- `gpt-4o-mini`

模型名称以 [模型广场](/pricing) 中你所选分组可用的模型为准。

## 常见问题

| 现象                     | 原因                                         | 解决方法                                                               |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| 401                      | 当前终端没有设置 `OPENAI_API_KEY`            | 在同一个终端窗口中设置，或写进 shell 配置文件后打开新终端              |
| 请求仍然发往 OpenAI 官方 | `OPENAI_BASE_URL` 没有生效，或被其他配置覆盖 | 运行 `echo $OPENAI_BASE_URL` 检查取值，排查 shell 启动脚本中的冲突设置 |
| model not found          | 模型名与所选分组实际可用的模型不一致         | 从推荐模型中选择，或到模型广场查看可用列表                             |

## 立即试用

想先确认密钥和模型是否可用，可以在 [游乐场](/playground) 里直接发一条消息。
