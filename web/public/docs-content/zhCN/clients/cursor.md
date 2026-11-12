---
title: Cursor
description: 借助 cursor-byokcx 在 Cursor 中使用 {{SYSTEM_NAME}} 的模型。
---

[Cursor](https://cursor.com) 是一款 AI 编程 IDE。它自带的设置对自定义 OpenAI 兼容地址支持有限，推荐借助开源工具 [cursor-byokcx](https://github.com/leookun/cursor-byokcx) 接入。

## 准备工作

1. 在 [API 密钥](/keys) 页面创建一个密钥并复制；
2. 按 cursor-byokcx 项目主页的说明完成安装。

## 配置步骤

1. 在 cursor-byokcx 中，把 **API Base URL** 设置为：

```text
{{BASE_URL}}/v1
```

2. **API Key** 填写你的密钥；
3. 把**对话模型**和**补全模型**都指向这个自定义地址，并填写要使用的模型名称；
4. 保存配置后**重启 Cursor**。

:::warning
Cursor 的对话和补全是两套独立的模型设置。只改了其中一套时，会出现「补全能用、对话报错」的情况。
:::

## 推荐模型

- `gpt-4.1`
- `claude-sonnet-5`
- `gpt-4o-mini`

模型名称以 [模型广场](/pricing) 中你所选分组可用的模型为准。

## 常见问题

| 现象                     | 原因                                       | 解决方法                                                |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| 模型列表里没有自定义模型 | 桥接工具没有安装或启用，或 Cursor 没有重启 | 完成 cursor-byokcx 配置并重启 Cursor 后再检查           |
| 401 / Invalid API Key    | 密钥复制不完整，或密钥已被禁用、删除       | 在 API 密钥页面重新复制完整密钥，并确认密钥处于启用状态 |
| 补全能用但对话报错       | 对话和补全是两套设置，只改了其中一套       | 在 cursor-byokcx 中把对话模型和补全模型都指向自定义地址 |

## 立即试用

想先确认密钥和模型是否可用，可以在 [游乐场](/playground) 里直接发一条消息。
