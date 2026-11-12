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
// Authoring tool: fetch the upstream aiyunmao docs and bake the site-agnostic
// rewrite into web/public/docs-content/{locale}/…md. Run from web/:
//   node scripts/fetch-docs-content.mjs                 (fetch from network)
//   node scripts/fetch-docs-content.mjs --from-dir DIR  (rewrite a local raw copy)
// Every localized edit asserts its source text exists, so upstream content
// drift fails loudly instead of silently shipping unrewritten copy.
import fs from 'node:fs/promises'
import path from 'node:path'

const SOURCE_BASE = 'https://aiyunmao.com/docs-content'
const OUT_DIR = path.resolve('public/docs-content')

export const DOCS_LOCALES = ['en', 'zhCN', 'zhTW', 'fr', 'ja', 'ru', 'vi']

export const DOCS_PAGES = [
  'quick-start',
  'api/overview',
  'api/openai',
  'api/claude',
  'api/gemini',
  'api/images',
  'api/models-and-pricing',
  'api/usage-and-limits',
  'clients/cherry-studio',
  'clients/chatbox',
  'clients/cursor',
  'clients/codex',
  'clients/claude-code',
  'faq/errors',
  'faq/general',
]

// Applied to every file: dynamic base URL / brand tokens and dead-link remap.
const GLOBAL_REPLACEMENTS = [
  ['https://aiyunmao.com', '{{BASE_URL}}'],
  ['云猫', '{{SYSTEM_NAME}}'],
  ['/docs/billing/overview', '/pricing'],
  ['/docs/billing/top-up', '/wallet'],
  ['/docs/billing/membership', '/subscriptions'],
]

// Per-locale edits: [file, source text, replacement]. Removals use ''.
const LOCALIZED_EDITS = {
  zhCN: [
    [
      'faq/general.md',
      '4. 仍有问题时，加入交流群并提供 request id。',
      '4. 仍有问题时，联系站点管理员并提供 request id。',
    ],
    [
      'faq/general.md',
      '- 加入文档页顶部的 QQ 交流群，入群时请填写你的站内用户 ID。',
      '- 联系站点管理员，反馈时请提供你的站内用户 ID。',
    ],
    ['faq/errors.md', '加入交流群联系客服', '联系站点管理员'],
    [
      'faq/errors.md',
      '请记下返回信息中的 **request id**，加入页面顶部的 QQ 交流群联系客服，我们会据此快速定位问题。',
      '请记下返回信息中的 **request id**，联系站点管理员并提供该标识，便于快速定位问题。',
    ],
    ['api/usage-and-limits.md', '| 匿名生图 | IP | 24 小时 | 3 次 |\n', ''],
    [
      'api/usage-and-limits.md',
      '如有请携带该标识联系客服。',
      '如有请携带该标识联系站点管理员。',
    ],
    [
      'api/overview.md',
      '可以帮助客服快速定位问题',
      '可以帮助站点管理员快速定位问题',
    ],
    [
      'clients/chatbox.md',
      '或加入交流群联系客服确认服务状态',
      '或联系站点管理员确认服务状态',
    ],
    [
      'api/images.md',
      '\n不想写代码的话，也可以直接使用 [AI 生图台](/docs/image-studio/guide)。\n',
      '',
    ],
    [
      'api/gemini.md',
      '本站已验证 21.66 MB 视频以内联 Base64 方式可被多个渠道读取，具体可用性和耗时仍受模型及渠道限制。Google 视频文档另建议总请求超过 20 MB、视频较长或需要重复使用时采用 Files API。本站目前尚未提供 `/upload/v1beta/files` 上传代理；完整 inline 请求接近或超过 100 MB 时，请压缩、缩短视频或联系技术支持。',
      '内联 Base64 适合较小的视频，实际可用性和耗时取决于模型与渠道。Google 视频文档建议总请求超过 20 MB、视频较长或需要重复使用时采用 Files API。完整 inline 请求接近或超过 100 MB 时，请压缩或缩短视频，必要时联系站点管理员。',
    ],
  ],
  zhTW: [
    [
      'faq/general.md',
      '4. 仍有問題時，加入交流群並提供 request id。',
      '4. 仍有問題時，聯絡站點管理員並提供 request id。',
    ],
    [
      'faq/general.md',
      '- 加入文件頁頂部的 QQ 交流群，入群時請填寫你的站內使用者 ID。',
      '- 聯絡站點管理員，回報時請提供你的站內使用者 ID。',
    ],
    ['faq/errors.md', '加入交流群聯絡客服', '聯絡站點管理員'],
    [
      'faq/errors.md',
      '請記下回傳訊息中的 **request id**，加入頁面頂部的 QQ 交流群聯絡客服，我們會據此快速定位問題。',
      '請記下回傳訊息中的 **request id**，聯絡站點管理員並提供該識別碼，便於快速定位問題。',
    ],
    ['api/usage-and-limits.md', '| 匿名生圖 | IP | 24 小時 | 3 次 |\n', ''],
    [
      'api/usage-and-limits.md',
      '如有請攜帶該識別碼聯絡客服。',
      '如有請攜帶該識別碼聯絡站點管理員。',
    ],
    [
      'api/overview.md',
      '可以幫助客服快速定位問題',
      '可以幫助站點管理員快速定位問題',
    ],
    [
      'clients/chatbox.md',
      '或加入交流群聯絡客服確認服務狀態',
      '或聯絡站點管理員確認服務狀態',
    ],
    [
      'api/images.md',
      '\n不想寫程式碼的話，也可以直接使用 [AI 生圖台](/docs/image-studio/guide)。\n',
      '',
    ],
    [
      'api/gemini.md',
      '本站已驗證 21.66 MB 影片以內嵌 Base64 方式可被多個渠道讀取，實際可用性及耗時仍受模型與渠道限制。Google 影片文件另建議總請求超過 20 MB、影片較長或需要重複使用時採用 Files API。本站目前尚未提供 `/upload/v1beta/files` 上傳代理；完整 inline 請求接近或超過 100 MB 時，請壓縮、縮短影片或聯絡技術支援。',
      '內嵌 Base64 適合較小的影片，實際可用性與耗時取決於模型與渠道。Google 影片文件建議總請求超過 20 MB、影片較長或需要重複使用時採用 Files API。完整 inline 請求接近或超過 100 MB 時，請壓縮或縮短影片，必要時聯絡站點管理員。',
    ],
  ],
  en: [
    [
      'faq/general.md',
      '4. If the problem persists, join the group chat and provide the request id.',
      '4. If the problem persists, contact the site administrator and provide the request id.',
    ],
    [
      'faq/general.md',
      '- Join the QQ group chat shown at the top of the docs page, and enter your user ID on this site when joining.',
      '- Contact the site administrator, and include your user ID on this site when reporting an issue.',
    ],
    [
      'faq/errors.md',
      'Join the group chat and contact support',
      'Contact the site administrator',
    ],
    [
      'faq/errors.md',
      'Note down the **request id** in the response, join the QQ group chat shown at the top of the page and contact support; we will use it to locate the problem quickly.',
      'Note down the **request id** in the response and contact the site administrator with it so the problem can be located quickly.',
    ],
    [
      'api/usage-and-limits.md',
      '| Anonymous image generation | IP | 24 hours | 3 requests |\n',
      '',
    ],
    [
      'api/usage-and-limits.md',
      'and if so contact support with that identifier.',
      'and if so contact the site administrator with that identifier.',
    ],
    [
      'api/overview.md',
      'helps support locate the problem quickly',
      'helps the site administrator locate the problem quickly',
    ],
    [
      'clients/chatbox.md',
      'or join the group chat and contact support to confirm the service status',
      'or contact the site administrator to confirm the service status',
    ],
    [
      'api/images.md',
      '\nIf you would rather not write code, you can use the [AI Image Studio](/docs/image-studio/guide) instead.\n',
      '',
    ],
    [
      'api/gemini.md',
      "A 21.66 MB video has been read successfully through inline Base64 on multiple channels on this site; availability and response time still depend on the model and channel. Google's video guide also recommends the Files API for total requests over 20 MB, longer videos, or repeated use. This site does not currently proxy uploads to `/upload/v1beta/files`. If the complete inline request approaches or exceeds 100 MB, compress or shorten the video, or contact support.",
      "Inline Base64 works best for smaller videos; availability and response time depend on the model and channel. Google's video guide recommends the Files API for total requests over 20 MB, longer videos, or repeated use. If the complete inline request approaches or exceeds 100 MB, compress or shorten the video, and contact the site administrator if needed.",
    ],
  ],
  fr: [
    [
      'faq/general.md',
      "4. Si le problème persiste, rejoignez le groupe d'échange et fournissez le request id.",
      "4. Si le problème persiste, contactez l'administrateur du site et fournissez le request id.",
    ],
    [
      'faq/general.md',
      "- Rejoignez le groupe d'échange QQ indiqué en haut de la page de documentation ; lors de votre demande d'adhésion au groupe, indiquez votre ID utilisateur sur le site.",
      "- Contactez l'administrateur du site en indiquant votre ID utilisateur sur le site.",
    ],
    [
      'faq/errors.md',
      "Rejoignez le groupe d'échange pour contacter le support",
      "Contactez l'administrateur du site",
    ],
    [
      'faq/errors.md',
      "Notez le **request id** figurant dans la réponse, puis rejoignez le groupe d'échange QQ indiqué en haut de la page pour contacter le support ; il nous permettra de localiser rapidement le problème.",
      "Notez le **request id** figurant dans la réponse, puis contactez l'administrateur du site avec cet identifiant pour localiser rapidement le problème.",
    ],
    [
      'api/usage-and-limits.md',
      "| Génération d'images anonyme | IP | 24 heures | 3 requêtes |\n",
      '',
    ],
    [
      'api/usage-and-limits.md',
      'puis contactez le support avec cet identifiant.',
      "puis contactez l'administrateur du site avec cet identifiant.",
    ],
    [
      'api/overview.md',
      'aide le support à localiser rapidement le problème',
      "aide l'administrateur du site à localiser rapidement le problème",
    ],
    [
      'clients/chatbox.md',
      "ou rejoignez le groupe d'échange pour demander au support l'état du service",
      "ou contactez l'administrateur du site pour vérifier l'état du service",
    ],
    [
      'api/images.md',
      "\nSi vous ne voulez pas écrire de code, vous pouvez aussi utiliser directement le [Studio d'images IA](/docs/image-studio/guide).\n",
      '',
    ],
    [
      'api/gemini.md',
      "Une vidéo de 21,66 MB a été lue via Base64 en ligne sur plusieurs canaux de ce site ; la disponibilité et le délai dépendent toujours du modèle et du canal. Le guide vidéo de Google recommande également Files API au-delà de 20 MB de requête totale, pour les vidéos longues ou réutilisées. Ce site ne relaie pas actuellement les envois vers `/upload/v1beta/files`. Si la requête en ligne complète approche ou dépasse 100 MB, compressez ou raccourcissez la vidéo, ou contactez l'assistance.",
      "Le Base64 en ligne convient aux vidéos de petite taille ; la disponibilité et le délai dépendent du modèle et du canal. Le guide vidéo de Google recommande Files API au-delà de 20 MB de requête totale, pour les vidéos longues ou réutilisées. Si la requête en ligne complète approche ou dépasse 100 MB, compressez ou raccourcissez la vidéo, et contactez l'administrateur du site si nécessaire.",
    ],
  ],
  ja: [
    [
      'faq/general.md',
      '4. それでも解決しない場合は、コミュニティグループに参加して request id をお知らせください。',
      '4. それでも解決しない場合は、サイト管理者に request id を添えてお問い合わせください。',
    ],
    [
      'faq/general.md',
      '- ドキュメントページ上部の QQ コミュニティグループに参加してください。参加時にはサイト内のユーザー ID を入力してください。',
      '- サイト管理者にお問い合わせください。その際はサイト内のユーザー ID をお知らせください。',
    ],
    [
      'faq/errors.md',
      'コミュニティグループに参加してサポートにお問い合わせください',
      'サイト管理者にお問い合わせください',
    ],
    [
      'faq/errors.md',
      '返された情報に含まれる **request id** を控えて、ページ上部の QQ コミュニティグループに参加し、サポートにお問い合わせください。それをもとに問題を迅速に特定します。',
      '返された情報に含まれる **request id** を控えて、サイト管理者にお問い合わせください。それをもとに問題を迅速に特定できます。',
    ],
    ['api/usage-and-limits.md', '| 匿名画像生成 | IP | 24 時間 | 3 回 |\n', ''],
    [
      'api/usage-and-limits.md',
      'あればその識別子を添えてサポートに連絡してください。',
      'あればその識別子を添えてサイト管理者に連絡してください。',
    ],
    [
      'api/overview.md',
      'サポートが問題を素早く特定するのに役立ちます',
      'サイト管理者が問題を素早く特定するのに役立ちます',
    ],
    [
      'clients/chatbox.md',
      'コミュニティグループに参加してサポートにサービス状況を確認してください',
      'サイト管理者にサービス状況を確認してください',
    ],
    [
      'api/images.md',
      '\nコードを書きたくない場合は、[AI画像スタジオ](/docs/image-studio/guide) を直接使うこともできます。\n',
      '',
    ],
    [
      'api/gemini.md',
      '当サイトの複数チャネルで、21.66 MB の動画をインライン Base64 で読み取れることを確認しています。利用可否と応答時間はモデルやチャネルに依存します。Google の動画ガイドでは、リクエスト全体が 20 MB を超える場合、長い動画、繰り返し使用する動画には Files API も推奨しています。当サイトは現在 `/upload/v1beta/files` のアップロードを中継していません。インラインリクエスト全体が 100 MB に近い、または超える場合は、動画を圧縮・短縮するか、サポートへお問い合わせください。',
      'インライン Base64 は小さい動画に適しており、利用可否と応答時間はモデルやチャネルに依存します。Google の動画ガイドでは、リクエスト全体が 20 MB を超える場合、長い動画、繰り返し使用する動画には Files API を推奨しています。インラインリクエスト全体が 100 MB に近い、または超える場合は、動画を圧縮・短縮し、必要に応じてサイト管理者にお問い合わせください。',
    ],
  ],
  ru: [
    [
      'faq/general.md',
      '4. Если проблема сохраняется, обратитесь в чат сообщества и укажите request id.',
      '4. Если проблема сохраняется, свяжитесь с администратором сайта и укажите request id.',
    ],
    [
      'faq/general.md',
      '- Вступите в QQ-группу, ссылка на которую есть вверху страницы документации; при вступлении укажите свой ID пользователя на сайте.',
      '- Свяжитесь с администратором сайта, указав свой ID пользователя на сайте.',
    ],
    [
      'faq/errors.md',
      'Обратитесь в поддержку через чат сообщества',
      'Свяжитесь с администратором сайта',
    ],
    [
      'faq/errors.md',
      'Сохраните **request id** из ответа и обратитесь в поддержку через QQ-группу, ссылка на которую есть вверху страницы, — по нему мы быстро найдём причину.',
      'Сохраните **request id** из ответа и свяжитесь с администратором сайта — по нему можно быстро найти причину.',
    ],
    [
      'api/usage-and-limits.md',
      '| Анонимная генерация изображений | IP | 24 часа | 3 запроса |\n',
      '',
    ],
    [
      'api/usage-and-limits.md',
      'и при наличии обратитесь в поддержку с этим идентификатором.',
      'и при наличии свяжитесь с администратором сайта с этим идентификатором.',
    ],
    [
      'api/overview.md',
      'помогает поддержке быстро найти проблему',
      'помогает администратору сайта быстро найти проблему',
    ],
    [
      'clients/chatbox.md',
      'обратитесь в поддержку через чат сообщества, чтобы уточнить состояние сервиса',
      'свяжитесь с администратором сайта, чтобы уточнить состояние сервиса',
    ],
    [
      'api/images.md',
      '\nЕсли не хотите писать код, воспользуйтесь [AI-студией изображений](/docs/image-studio/guide).\n',
      '',
    ],
    [
      'api/gemini.md',
      'Видео размером 21,66 MB успешно прочитано через встроенный Base64 на нескольких каналах сайта; доступность и время ответа зависят от модели и канала. Видеоруководство Google также рекомендует Files API при полном размере запроса более 20 MB, для длинных видео или повторного использования. Сайт пока не проксирует загрузку через `/upload/v1beta/files`. Если полный встроенный запрос приближается к 100 MB или превышает этот размер, сожмите или сократите видео либо обратитесь в поддержку.',
      'Встроенный Base64 подходит для небольших видео; доступность и время ответа зависят от модели и канала. Видеоруководство Google рекомендует Files API при полном размере запроса более 20 MB, для длинных видео или повторного использования. Если полный встроенный запрос приближается к 100 MB или превышает этот размер, сожмите или сократите видео и при необходимости свяжитесь с администратором сайта.',
    ],
  ],
  vi: [
    [
      'faq/general.md',
      '4. Nếu vẫn gặp vấn đề, hãy tham gia nhóm trao đổi và cung cấp request id.',
      '4. Nếu vẫn gặp vấn đề, hãy liên hệ quản trị viên trang web và cung cấp request id.',
    ],
    [
      'faq/general.md',
      '- Tham gia nhóm QQ ở đầu trang tài liệu, khi vào nhóm vui lòng điền ID người dùng trên trang web của bạn.',
      '- Liên hệ quản trị viên trang web và cung cấp ID người dùng của bạn trên trang web.',
    ],
    [
      'faq/errors.md',
      'Tham gia nhóm trao đổi để liên hệ hỗ trợ',
      'Liên hệ quản trị viên trang web',
    ],
    [
      'faq/errors.md',
      'Hãy ghi lại **request id** trong thông tin trả về, tham gia nhóm QQ ở đầu trang để liên hệ hỗ trợ, chúng tôi sẽ dựa vào đó để nhanh chóng xác định vấn đề.',
      'Hãy ghi lại **request id** trong thông tin trả về và liên hệ quản trị viên trang web kèm mã đó để nhanh chóng xác định vấn đề.',
    ],
    [
      'api/usage-and-limits.md',
      '| Tạo ảnh ẩn danh | IP | 24 giờ | 3 yêu cầu |\n',
      '',
    ],
    [
      'api/usage-and-limits.md',
      'nếu có hãy liên hệ hỗ trợ kèm mã đó.',
      'nếu có hãy liên hệ quản trị viên trang web kèm mã đó.',
    ],
    [
      'api/overview.md',
      'giúp bộ phận hỗ trợ nhanh chóng xác định vấn đề',
      'giúp quản trị viên trang web nhanh chóng xác định vấn đề',
    ],
    [
      'clients/chatbox.md',
      'hoặc tham gia nhóm trao đổi để liên hệ hỗ trợ xác nhận trạng thái dịch vụ',
      'hoặc liên hệ quản trị viên trang web để xác nhận trạng thái dịch vụ',
    ],
    [
      'api/images.md',
      '\nNếu không muốn viết mã, bạn cũng có thể dùng trực tiếp [Xưởng ảnh AI](/docs/image-studio/guide).\n',
      '',
    ],
    [
      'api/gemini.md',
      'Video 21,66 MB đã được đọc thành công bằng Base64 nội tuyến trên nhiều kênh của trang này; khả năng sử dụng và thời gian phản hồi vẫn tùy mô hình và kênh. Hướng dẫn video của Google cũng khuyên dùng Files API khi tổng yêu cầu vượt 20 MB, video dài hoặc cần dùng lại. Trang này hiện chưa chuyển tiếp tải lên qua `/upload/v1beta/files`. Khi toàn bộ yêu cầu nội tuyến gần hoặc vượt 100 MB, hãy nén, rút ngắn video hoặc liên hệ hỗ trợ.',
      'Base64 nội tuyến phù hợp với video nhỏ; khả năng sử dụng và thời gian phản hồi tùy thuộc mô hình và kênh. Hướng dẫn video của Google khuyên dùng Files API khi tổng yêu cầu vượt 20 MB, video dài hoặc cần dùng lại. Khi toàn bộ yêu cầu nội tuyến gần hoặc vượt 100 MB, hãy nén hoặc rút ngắn video và liên hệ quản trị viên trang web nếu cần.',
    ],
  ],
}

// Patterns that must not survive the rewrite.
const FORBIDDEN_PATTERNS = [
  'aiyunmao',
  '云猫',
  'QQ',
  '客服',
  '交流群',
  '/docs/billing/',
  '/docs/image-studio',
  '21.66',
  '21,66',
]

function applyEdits(text, edits, label) {
  let result = text
  for (const [from, to] of edits) {
    if (!result.includes(from)) {
      throw new Error(`${label}: source text not found: ${from.slice(0, 80)}…`)
    }
    result = result.split(from).join(to)
  }
  return result
}

// Global token/link replacements are opportunistic: not every page mentions
// the brand or links to billing. The forbidden-pattern scan below still
// guarantees nothing upstream-specific survives.
function applyGlobalReplacements(text) {
  let result = text
  for (const [from, to] of GLOBAL_REPLACEMENTS) {
    result = result.split(from).join(to)
  }
  return result
}

async function loadRaw(fromDir, locale, page) {
  if (fromDir) {
    return fs.readFile(path.join(fromDir, locale, `${page}.md`), 'utf8')
  }
  const res = await fetch(`${SOURCE_BASE}/${locale}/${page}.md`)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${locale}/${page}`)
  }
  return res.text()
}

async function main() {
  const fromDirIndex = process.argv.indexOf('--from-dir')
  const fromDir =
    fromDirIndex === -1 ? null : path.resolve(process.argv[fromDirIndex + 1])
  let written = 0

  for (const locale of DOCS_LOCALES) {
    for (const page of DOCS_PAGES) {
      const label = `${locale}/${page}`
      let text = await loadRaw(fromDir, locale, page)
      text = applyGlobalReplacements(text)
      const edits = LOCALIZED_EDITS[locale]
        .filter(([file]) => file === `${page}.md`)
        .map(([, from, to]) => [from, to])
      text = applyEdits(text, edits, label)

      for (const pattern of FORBIDDEN_PATTERNS) {
        if (text.includes(pattern)) {
          throw new Error(`${label}: forbidden pattern survived: ${pattern}`)
        }
      }

      const target = path.join(OUT_DIR, locale, `${page}.md`)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, text, 'utf8')
      written++
    }
  }
  console.log(`Wrote ${written} localized documents to ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
