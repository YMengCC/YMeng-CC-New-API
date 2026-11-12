---
title: 快速開始
description: 5 個步驟完成註冊、儲值、建立 API 金鑰、設定用戶端和第一次呼叫。
---

本頁帶你從零走完一次完整流程：**註冊 → 儲值 → 建立 API 金鑰 → 設定用戶端 → 首次呼叫**。全程只需幾分鐘。

:::info 先記住這兩項
- **Base URL**：`{{BASE_URL}}/v1`（OpenAI 相容用戶端和 SDK 使用）
- **驗證方式**：請求標頭 `Authorization: Bearer 你的 API 金鑰`
:::

## 第 1 步：註冊帳號

開啟 [註冊頁面](/sign-up)，填寫使用者名稱和密碼完成註冊。如果網站開放了電子郵件、GitHub 等其他登入方式，也可以直接使用。

![註冊頁面](/docs-assets/quick-start/zhTW/step-1-sign-up.png '註冊頁面')

## 第 2 步：儲值

登入後點選左側選單的 **積分**，進入 [錢包頁面](/wallet)。在「增加資金」區域選擇預設金額或輸入自訂金額，再選擇付款方式完成支付。如果你拿到了兌換碼，也可以在同一頁面兌換。

![錢包頁面的儲值區域](/docs-assets/quick-start/zhTW/step-2-top-up.png '在「增加資金」中選擇金額和付款方式')

:::tip
儲值得到的餘額不會過期。具體的金額級距、付款方式和最低儲值金額以頁面顯示為準。計費規則請見 [計費說明](/pricing)。
:::

## 第 3 步：建立 API 金鑰

進入 [API 金鑰](/keys) 頁面，點選右上角 **建立 API 金鑰**：

1. **名稱**：隨意填寫，方便自己區分用途，例如 `my-first-key`。
2. **分組**：分組決定這個金鑰可以呼叫哪些模型，以及按什麼倍率計費。下拉選單裡會顯示每個分組的倍率和是否支援代金券。
3. **過期時間**、**額度**：保持預設即可（永不過期、無限額度）；需要控制風險時再視需要設定。
4. 點選 **儲存變更**。

![建立 API 金鑰](/docs-assets/quick-start/zhTW/step-3-create-key.png '填寫名稱並選擇分組')

:::warning 請像保管密碼一樣保管 API 金鑰
金鑰可以直接消費你的餘額。不要把它傳到群組聊天、截圖或公開程式碼儲存庫裡；一旦外洩，請立刻在列表中停用或刪除該金鑰，再重新建立。
:::

## 第 4 步：設定用戶端

在金鑰列表中點選金鑰旁的複製圖示，或點選右側 **⋯** 選單選擇 **複製金鑰**。同一個選單裡還有：

- **CC Switch**：一鍵把金鑰匯入 CC Switch，適合 Claude Code 使用者。
- **聊天**：直接在已適配的聊天用戶端中開啟。

![金鑰操作選單](/docs-assets/quick-start/zhTW/step-4-key-menu.png '複製金鑰，或一鍵匯入用戶端')

然後在用戶端裡填寫兩項：

| 用戶端類型                                     | 位址（Base URL / API Host）  | 金鑰          |
| ---------------------------------------------- | ---------------------------- | ------------- |
| OpenAI 相容用戶端（Cherry Studio、ChatBox 等） | `{{BASE_URL}}/v1`            | 你的 API 金鑰 |
| Claude Code                                    | `{{BASE_URL}}`（不加 `/v1`） | 你的 API 金鑰 |

:::danger 最常見的錯誤：位址多寫或少寫了 /v1
OpenAI 相容用戶端通常要帶 `/v1`，Claude Code 則**不能**帶 `/v1`。部分用戶端會自動補上 `/v1`，此時只填 `{{BASE_URL}}` 即可。位址結尾不要多加斜線。各用戶端的具體填法請見 [用戶端接入](/docs/clients/cherry-studio)。
:::

## 第 5 步：發起第一次呼叫

把下面指令中的 `YOUR_API_KEY` 換成你的金鑰，在終端機執行：

```bash
curl {{BASE_URL}}/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "你好，這是我的第一次呼叫" }]
  }'
```

回應中出現 `choices` 欄位，就代表接入成功。模型名稱請以 [模型廣場](/pricing) 中你所選分組可用的模型為準。

不想用命令列的話，可以開啟 [遊樂場](/playground)，選擇模型後直接傳送訊息測試。

![在遊樂場中測試](/docs-assets/quick-start/zhTW/step-5-playground.png '在遊樂場中傳送第一則訊息')

## 下一步

- 了解費用是怎麼計算的：[計費說明](/pricing)
- 為常用用戶端設定接入：[Cherry Studio](/docs/clients/cherry-studio)、[Claude Code](/docs/clients/claude-code)
- 在程式碼中呼叫：[API 概覽](/docs/api/overview)
- 遇到錯誤：[常見錯誤](/docs/faq/errors)
