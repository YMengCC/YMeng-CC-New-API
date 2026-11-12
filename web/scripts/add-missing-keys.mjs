/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'API Guide': 'API Guide',
    '{{name}} API Guide': '{{name}} API Guide',
    'Quick Start': 'Quick Start',
    'API Reference': 'API Reference',
    'Client Integrations': 'Client Integrations',
    'API Overview': 'API Overview',
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': 'Models and Pricing',
    'Usage and Limits': 'Usage and Limits',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': 'Common Errors',
    'General FAQ': 'General FAQ',
    'Search docs': 'Search docs',
    'Search docs...': 'Search docs...',
    'Search the API guide': 'Search the API guide',
    'On this page': 'On this page',
    'Documentation menu': 'Documentation menu',
    'Failed to load the documentation.': 'Failed to load the documentation.',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.',
    'Register, top up, and make your first call in five steps.':
      'Register, top up, and make your first call in five steps.',
    'Endpoints, parameters, and examples for every supported protocol.':
      'Endpoints, parameters, and examples for every supported protocol.',
    'Step-by-step setup guides for popular AI clients.':
      'Step-by-step setup guides for popular AI clients.',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      'Troubleshooting errors and answers about accounts, keys, and billing.',
  },
  zh: {
    'API Guide': 'API指南',
    '{{name}} API Guide': '{{name}} API指南',
    'Quick Start': '快速开始',
    'API Reference': 'API 参考',
    'Client Integrations': '客户端接入',
    'API Overview': 'API 概览',
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': '模型与价格',
    'Usage and Limits': '用量与限制',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': '常见错误',
    'General FAQ': '常见问题',
    'Search docs': '搜索文档',
    'Search docs...': '搜索文档…',
    'Search the API guide': '搜索 API 指南',
    'On this page': '本页目录',
    'Documentation menu': '文档菜单',
    'Failed to load the documentation.': '文档加载失败。',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      '接入所需的全部内容：快速开始、API 参考、客户端配置与常见问题解答。',
    'Register, top up, and make your first call in five steps.':
      '五步完成注册、充值并发起第一次调用。',
    'Endpoints, parameters, and examples for every supported protocol.':
      '各协议的端点、参数与示例。',
    'Step-by-step setup guides for popular AI clients.':
      '常用 AI 客户端的分步配置指南。',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      '错误排查与账户、密钥、计费相关解答。',
  },
  'zh-TW': {
    'API Guide': 'API指南',
    '{{name}} API Guide': '{{name}} API指南',
    'Quick Start': '快速開始',
    'API Reference': 'API 參考',
    'Client Integrations': '用戶端接入',
    'API Overview': 'API 概覽',
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': '模型與價格',
    'Usage and Limits': '用量與限制',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': '常見錯誤',
    'General FAQ': '常見問題',
    'Search docs': '搜尋文件',
    'Search docs...': '搜尋文件…',
    'Search the API guide': '搜尋 API 指南',
    'On this page': '本頁目錄',
    'Documentation menu': '文件選單',
    'Failed to load the documentation.': '文件載入失敗。',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      '接入所需的全部內容：快速開始、API 參考、用戶端設定與常見問題解答。',
    'Register, top up, and make your first call in five steps.':
      '五步完成註冊、儲值並發起第一次呼叫。',
    'Endpoints, parameters, and examples for every supported protocol.':
      '各協定的端點、參數與範例。',
    'Step-by-step setup guides for popular AI clients.':
      '常用 AI 用戶端的逐步設定指南。',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      '錯誤排查與帳戶、金鑰、計費相關解答。',
  },
  fr: {
    'API Guide': 'Guide API',
    '{{name}} API Guide': 'Guide API de {{name}}',
    'Quick Start': 'Démarrage rapide',
    'API Reference': 'Référence API',
    'Client Integrations': 'Intégration des clients',
    'API Overview': "Vue d'ensemble de l'API",
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': 'Modèles et tarifs',
    'Usage and Limits': 'Utilisation et limites',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': 'Erreurs courantes',
    'General FAQ': 'FAQ générale',
    'Search docs': 'Rechercher dans la doc',
    'Search docs...': 'Rechercher dans la doc…',
    'Search the API guide': 'Rechercher dans le guide API',
    'On this page': 'Sur cette page',
    'Documentation menu': 'Menu de la documentation',
    'Failed to load the documentation.':
      'Échec du chargement de la documentation.',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      'Tout pour intégrer : démarrage rapide, référence API, configuration des clients et réponses aux questions courantes.',
    'Register, top up, and make your first call in five steps.':
      'Inscrivez-vous, rechargez et passez votre premier appel en cinq étapes.',
    'Endpoints, parameters, and examples for every supported protocol.':
      'Points de terminaison, paramètres et exemples pour chaque protocole pris en charge.',
    'Step-by-step setup guides for popular AI clients.':
      'Guides de configuration pas à pas pour les clients IA populaires.',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      'Diagnostic des erreurs et réponses sur les comptes, les clés et la facturation.',
  },
  ja: {
    'API Guide': 'APIガイド',
    '{{name}} API Guide': '{{name}} APIガイド',
    'Quick Start': 'クイックスタート',
    'API Reference': 'APIリファレンス',
    'Client Integrations': 'クライアント連携',
    'API Overview': 'API概要',
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': 'モデルと料金',
    'Usage and Limits': '使用量と制限',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': 'よくあるエラー',
    'General FAQ': 'よくある質問',
    'Search docs': 'ドキュメントを検索',
    'Search docs...': 'ドキュメントを検索…',
    'Search the API guide': 'APIガイドを検索',
    'On this page': 'このページの内容',
    'Documentation menu': 'ドキュメントメニュー',
    'Failed to load the documentation.':
      'ドキュメントの読み込みに失敗しました。',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      '導入に必要なすべて：クイックスタート、APIリファレンス、クライアント設定、よくある質問への回答。',
    'Register, top up, and make your first call in five steps.':
      '5つのステップで登録・チャージ・最初の呼び出し。',
    'Endpoints, parameters, and examples for every supported protocol.':
      '各プロトコルのエンドポイント・パラメータ・サンプル。',
    'Step-by-step setup guides for popular AI clients.':
      '人気AIクライアントのステップ別設定ガイド。',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      'エラー対処とアカウント・キー・課金に関する回答。',
  },
  ru: {
    'API Guide': 'Руководство API',
    '{{name}} API Guide': 'Руководство API {{name}}',
    'Quick Start': 'Быстрый старт',
    'API Reference': 'Справочник API',
    'Client Integrations': 'Подключение клиентов',
    'API Overview': 'Обзор API',
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': 'Модели и цены',
    'Usage and Limits': 'Использование и лимиты',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': 'Частые ошибки',
    'General FAQ': 'Общие вопросы',
    'Search docs': 'Поиск по документации',
    'Search docs...': 'Поиск по документации…',
    'Search the API guide': 'Поиск по руководству API',
    'On this page': 'На этой странице',
    'Documentation menu': 'Меню документации',
    'Failed to load the documentation.': 'Не удалось загрузить документацию.',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      'Всё для интеграции: быстрый старт, справочник API, настройка клиентов и ответы на частые вопросы.',
    'Register, top up, and make your first call in five steps.':
      'Регистрация, пополнение и первый вызов за пять шагов.',
    'Endpoints, parameters, and examples for every supported protocol.':
      'Эндпоинты, параметры и примеры для всех поддерживаемых протоколов.',
    'Step-by-step setup guides for popular AI clients.':
      'Пошаговые руководства по настройке популярных AI-клиентов.',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      'Разбор ошибок и ответы об аккаунтах, ключах и оплате.',
  },
  vi: {
    'API Guide': 'Hướng dẫn API',
    '{{name}} API Guide': 'Hướng dẫn API {{name}}',
    'Quick Start': 'Bắt đầu nhanh',
    'API Reference': 'Tham chiếu API',
    'Client Integrations': 'Tích hợp ứng dụng khách',
    'API Overview': 'Tổng quan API',
    'OpenAI API': 'OpenAI API',
    'Claude API': 'Claude API',
    'Gemini API': 'Gemini API',
    'Models and Pricing': 'Mô hình và giá',
    'Usage and Limits': 'Mức dùng và giới hạn',
    'Cherry Studio': 'Cherry Studio',
    Chatbox: 'Chatbox',
    Cursor: 'Cursor',
    Codex: 'Codex',
    'Claude Code': 'Claude Code',
    'Common Errors': 'Lỗi thường gặp',
    'General FAQ': 'Câu hỏi thường gặp',
    'Search docs': 'Tìm trong tài liệu',
    'Search docs...': 'Tìm trong tài liệu…',
    'Search the API guide': 'Tìm trong hướng dẫn API',
    'On this page': 'Trong trang này',
    'Documentation menu': 'Menu tài liệu',
    'Failed to load the documentation.': 'Không tải được tài liệu.',
    'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.':
      'Mọi thứ cần để tích hợp: bắt đầu nhanh, tham chiếu API, cấu hình ứng dụng khách và giải đáp câu hỏi thường gặp.',
    'Register, top up, and make your first call in five steps.':
      'Đăng ký, nạp tiền và gọi lần đầu trong năm bước.',
    'Endpoints, parameters, and examples for every supported protocol.':
      'Endpoint, tham số và ví dụ cho mọi giao thức được hỗ trợ.',
    'Step-by-step setup guides for popular AI clients.':
      'Hướng dẫn cấu hình từng bước cho các ứng dụng khách AI phổ biến.',
    'Troubleshooting errors and answers about accounts, keys, and billing.':
      'Khắc phục lỗi và giải đáp về tài khoản, khóa và thanh toán.',
  },
}

async function main() {
  let totalAdded = 0

  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.prototype.hasOwnProperty.call(json.translation, key)) {
        json.translation[key] = value
        count++
      } else if (json.translation[key] !== value) {
        json.translation[key] = value
        count++
      }
    }

    if (count > 0) {
      json.translation = Object.fromEntries(
        Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }

    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }

  console.log(`\nTotal: ${totalAdded} translations applied`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
