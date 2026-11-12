---
title: 快速开始
description: 5 步完成注册、充值、创建 API 密钥、配置客户端和第一次调用。
---

本页带你从零走完一次完整流程：**注册 → 充值 → 创建 API 密钥 → 配置客户端 → 首次调用**。全程只需几分钟。

:::info 先记住这两项
- **Base URL**：`{{BASE_URL}}/v1`（OpenAI 兼容客户端和 SDK 使用）
- **鉴权方式**：请求头 `Authorization: Bearer 你的 API 密钥`
:::

## 第 1 步：注册账号

打开 [注册页面](/sign-up)，填写用户名和密码完成注册。如果站点开放了邮箱、GitHub 等其他登录方式，也可以直接使用。

![注册页面](/docs-assets/quick-start/zhCN/step-1-sign-up.png '注册页面')

## 第 2 步：充值

登录后点击左侧菜单的 **积分**，进入 [钱包页面](/wallet)。在「添加资金」区域选择预设金额或输入自定义金额，再选择付款方式完成支付。如果你拿到了兑换码，也可以在同一页面兑换。

![钱包页面的充值区域](/docs-assets/quick-start/zhCN/step-2-top-up.png '在「添加资金」中选择金额和付款方式')

:::tip
充值得到的余额不会过期。具体的金额档位、付款方式和最低充值金额以页面显示为准。计费规则见 [计费说明](/pricing)。
:::

## 第 3 步：创建 API 密钥

进入 [API 密钥](/keys) 页面，点击右上角 **创建 API 密钥**：

1. **名称**：随意填写，方便自己区分用途，例如 `my-first-key`。
2. **分组**：分组决定这个密钥可以调用哪些模型，以及按什么倍率计费。下拉框里会显示每个分组的倍率和是否支持代金券。
3. **过期时间**、**额度**：保持默认即可（永不过期、无限额度）；需要控制风险时再按需设置。
4. 点击 **保存更改**。

![创建 API 密钥](/docs-assets/quick-start/zhCN/step-3-create-key.png '填写名称并选择分组')

:::warning 请像保管密码一样保管 API 密钥
密钥可以直接消费你的余额。不要把它发到群聊、截图或公开代码仓库里；一旦泄露，请立刻在列表中禁用或删除该密钥，再重新创建。
:::

## 第 4 步：配置客户端

在密钥列表中点击密钥旁的复制图标，或点击右侧 **⋯** 菜单选择 **复制密钥**。同一个菜单里还有：

- **CC Switch**：一键把密钥导入 CC Switch，适合 Claude Code 用户。
- **聊天**：直接在已适配的聊天客户端中打开。

![密钥操作菜单](/docs-assets/quick-start/zhCN/step-4-key-menu.png '复制密钥，或一键导入客户端')

然后在客户端里填写两项：

| 客户端类型                                     | 地址（Base URL / API Host）  | 密钥          |
| ---------------------------------------------- | ---------------------------- | ------------- |
| OpenAI 兼容客户端（Cherry Studio、ChatBox 等） | `{{BASE_URL}}/v1`            | 你的 API 密钥 |
| Claude Code                                    | `{{BASE_URL}}`（不加 `/v1`） | 你的 API 密钥 |

:::danger 最常见的错误：地址多写或少写了 /v1
OpenAI 兼容客户端通常要带 `/v1`，Claude Code 则**不能**带 `/v1`。部分客户端会自动补 `/v1`，此时只填 `{{BASE_URL}}` 即可。地址末尾不要多加斜杠。各客户端的具体填法见 [客户端接入](/docs/clients/cherry-studio)。
:::

## 第 5 步：发起第一次调用

把下面命令中的 `YOUR_API_KEY` 换成你的密钥，在终端运行：

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "你好，这是我的第一次调用" }]
  }'
```

返回里出现 `choices` 字段，就说明接入成功。模型名称请以 [模型广场](/pricing) 中你所选分组可用的模型为准。

不想用命令行的话，可以打开 [游乐场](/playground)，选择模型后直接发送消息测试。

![在游乐场中测试](/docs-assets/quick-start/zhCN/step-5-playground.png '在游乐场中发送第一条消息')

## 下一步

- 了解费用是怎么算的：[计费说明](/pricing)
- 为常用客户端配置接入：[Cherry Studio](/docs/clients/cherry-studio)、[Claude Code](/docs/clients/claude-code)
- 在代码中调用：[API 概览](/docs/api/overview)
- 遇到报错：[常见错误](/docs/faq/errors)
