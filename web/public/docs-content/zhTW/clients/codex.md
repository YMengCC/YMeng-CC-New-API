---
title: Codex CLI
description: 透過環境變數讓 OpenAI 官方的 Codex CLI 經由 {{SYSTEM_NAME}} 呼叫。
---

[Codex CLI](https://github.com/openai/codex) 是 OpenAI 官方的命令列程式開發助理。只需設定兩個環境變數，就能讓它透過 {{SYSTEM_NAME}} 呼叫模型。

## 準備工作

在 [API 金鑰](/keys) 頁面建立一個金鑰並複製，然後按 Codex CLI 官方說明完成安裝。

## 設定步驟

在終端機中設定以下環境變數（把 `YOUR_API_KEY` 換成你的金鑰）。

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

設定完成後，**在同一個終端機視窗**中啟動 Codex CLI 即可。

如果你在用 [CC Switch](https://ccswitch.io/zh/) 管理設定，也可以在 API 金鑰列表的 **⋯** 選單中選擇 **CC Switch**，把**套用程式**選為 `Codex` 後一鍵匯入，位址會自動帶上 `/v1`。

:::tip 讓設定長期生效
把上面的 `export` 語句寫進 `~/.bashrc`、`~/.zshrc` 等 shell 設定檔，然後開啟一個新的終端機。
:::

## 推薦模型

- `gpt-4.1`
- `gpt-4o-mini`

模型名稱以 [模型廣場](/pricing) 中你所選分組可用的模型為準。

## 常見問題

| 現象                     | 原因                                         | 解決方法                                                               |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------- |
| 401                      | 目前的終端機沒有設定 `OPENAI_API_KEY`        | 在同一個終端機視窗中設定，或寫進 shell 設定檔後開啟新的終端機          |
| 請求仍然送往 OpenAI 官方 | `OPENAI_BASE_URL` 沒有生效，或被其他設定覆蓋 | 執行 `echo $OPENAI_BASE_URL` 檢查取值，排查 shell 啟動腳本中的衝突設定 |
| model not found          | 模型名稱與所選分組實際可用的模型不一致       | 從推薦模型中選擇，或到模型廣場查看可用列表                             |

## 立即試用

想先確認金鑰和模型是否可用，可以在 [遊樂場](/playground) 裡直接傳送一則訊息。
