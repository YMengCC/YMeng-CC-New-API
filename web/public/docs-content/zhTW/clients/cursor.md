---
title: Cursor
description: 藉助 cursor-byokcx 在 Cursor 中使用 {{SYSTEM_NAME}} 的模型。
---

[Cursor](https://cursor.com) 是一款 AI 程式開發 IDE。它內建的設定對自訂 OpenAI 相容位址支援有限，建議藉助開源工具 [cursor-byokcx](https://github.com/leookun/cursor-byokcx) 接入。

## 準備工作

1. 在 [API 金鑰](/keys) 頁面建立一個金鑰並複製；
2. 按 cursor-byokcx 專案首頁的說明完成安裝。

## 設定步驟

1. 在 cursor-byokcx 中，把 **API Base URL** 設定為：

```text
{{BASE_URL}}/v1
```

2. **API Key** 填寫你的金鑰；
3. 把**對話模型**和**補全模型**都指向這個自訂位址，並填寫要使用的模型名稱；
4. 儲存設定後**重新啟動 Cursor**。

:::warning
Cursor 的對話和補全是兩套獨立的模型設定。只改了其中一套時，會出現「補全能用、對話報錯」的情況。
:::

## 推薦模型

- `gpt-4.1`
- `claude-sonnet-5`
- `gpt-4o-mini`

模型名稱以 [模型廣場](/pricing) 中你所選分組可用的模型為準。

## 常見問題

| 現象                   | 原因                                           | 解決方法                                                |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| 模型列表裡沒有自訂模型 | 橋接工具沒有安裝或啟用，或 Cursor 沒有重新啟動 | 完成 cursor-byokcx 設定並重新啟動 Cursor 後再檢查       |
| 401 / Invalid API Key  | 金鑰複製不完整，或金鑰已被停用、刪除           | 在 API 金鑰頁面重新複製完整金鑰，並確認金鑰處於啟用狀態 |
| 補全能用但對話報錯     | 對話和補全是兩套設定，只改了其中一套           | 在 cursor-byokcx 中把對話模型和補全模型都指向自訂位址   |

## 立即試用

想先確認金鑰和模型是否可用，可以在 [遊樂場](/playground) 裡直接傳送一則訊息。
