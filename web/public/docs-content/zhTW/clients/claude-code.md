---
title: Claude Code
description: 為 Anthropic 官方的 Claude Code 設定 Base URL 與令牌，或用 CC Switch 一鍵匯入。
---

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) 是 Anthropic 官方的命令列程式開發助理。有兩種接入方式：一鍵匯入 CC Switch，或手動設定環境變數。

## 方式一：用 CC Switch 一鍵匯入（推薦）

[CC Switch](https://ccswitch.io/zh/) 是一款圖形介面工具，可以管理多套 Claude Code 設定並快速切換。

1. 安裝 CC Switch；
2. 在 [API 金鑰](/keys) 頁面，點選金鑰右側的 **⋯** 選單，選擇 **CC Switch**；
3. 在彈出視窗中，**套用程式**選擇 `Claude`，選擇**主模型**（可選填 Haiku / Sonnet / Opus 對應的模型）；
4. 點選 **打開 CC Switch**，在 CC Switch 中確認匯入並啟用這套設定；
5. 重新開啟終端機，啟動 Claude Code。

## 方式二：手動設定環境變數

在終端機中設定以下環境變數（把 `YOUR_API_KEY` 換成你的金鑰）。

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

設定完成後，在同一個終端機視窗中執行 `claude` 即可。

:::danger 不要在位址後加 /v1
Claude Code 會自行拼接 `/v1/messages`。`ANTHROPIC_BASE_URL` 只填 `{{BASE_URL}}`，加了 `/v1` 會導致請求失敗。
:::

## 推薦模型

- `claude-sonnet-5`
- `claude-opus-5`

模型名稱以 [模型廣場](/pricing) 中你所選分組可用的模型為準。

## 常見問題

| 現象                        | 原因                                                  | 解決方法                                            |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| 401 / authentication_error  | 沒有設定 `ANTHROPIC_AUTH_TOKEN`，或金鑰已被停用、刪除 | 重新建立金鑰，並確認在目前的終端機中已經設定        |
| 請求仍然送往 Anthropic 官方 | `ANTHROPIC_BASE_URL` 沒有生效，或被加上了 `/v1`       | 嚴格按本頁填寫位址，不要加任何路徑                  |
| 切換設定後仍連線到舊位址    | 本機有多套設定混在一起，沒有用 CC Switch 切換         | 用 CC Switch 統一管理多套設定，切換後重新開啟終端機 |

## 立即試用

想先確認金鑰和模型是否可用，可以在 [遊樂場](/playground) 裡直接傳送一則訊息。
