---
title: Claude Code
description: Anthropic 公式の Claude Code に Base URL とトークンを設定するか、CC Switch でワンクリック取り込みします。
---

[Claude Code](https://docs.anthropic.com/en/docs/claude-code) は Anthropic 公式のコマンドライン型プログラミングアシスタントです。接続方法は 2 つあります。CC Switch でワンクリック取り込みする方法と、環境変数を手動で設定する方法です。

## 方法 1：CC Switch でワンクリック取り込み（おすすめ）

[CC Switch](https://ccswitch.io/zh/) は、複数の Claude Code 設定を管理してすばやく切り替えられる GUI ツールです。

1. CC Switch をインストールします。
2. [APIキー](/keys) ページで、キーの右側にある **⋯** メニューをクリックし、**CC Switch** を選択します。
3. ダイアログで、**アプリケーション** に `Claude` を選び、**プライマリモデル** を選択します（Haiku / Sonnet / Opus に対応するモデルも任意で指定できます）。
4. **CC Switch を開く** をクリックし、CC Switch で取り込みを確認してこの設定を有効にします。
5. ターミナルを開き直し、Claude Code を起動します。

## 方法 2：環境変数を手動で設定する

ターミナルで次の環境変数を設定します（`YOUR_API_KEY` はあなたのキーに置き換えてください）。

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

設定が完了したら、同じターミナルウィンドウで `claude` を実行してください。

:::danger アドレスの後ろに /v1 を付けないでください
Claude Code は自動で `/v1/messages` を付け加えます。`ANTHROPIC_BASE_URL` には `{{BASE_URL}}` のみを入力してください。`/v1` を付けるとリクエストが失敗します。
:::

## おすすめモデル

- `claude-sonnet-5`
- `claude-opus-5`

モデル名は、[モデル広場](/pricing) で選択したグループで利用できるモデルに従ってください。

## よくある問題

| 症状                                        | 原因                                                                          | 解決方法                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 401 / authentication_error                  | `ANTHROPIC_AUTH_TOKEN` が設定されていない、またはキーが無効化・削除されている | キーを作成し直し、現在のターミナルで設定済みであることを確認してください           |
| リクエストが Anthropic 公式に送られてしまう | `ANTHROPIC_BASE_URL` が反映されていない、または `/v1` が付いている            | このページのとおりにアドレスを入力し、パスは一切付けないでください                 |
| 設定を切り替えても古いアドレスに接続される  | ローカルに複数の設定が混在しており、CC Switch で切り替えていない              | CC Switch で複数の設定をまとめて管理し、切り替え後にターミナルを開き直してください |

## 今すぐ試す

キーとモデルが使えるかどうかを先に確認したい場合は、[プレイグラウンド](/playground) でそのままメッセージを送信してみてください。
