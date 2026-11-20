'use strict'

const messages = {
  zh: {
    title: '萌萌的安全小屋',
    subtitle: '识别出的敏感内容在本机替换，站点只收到处理后的文本。',
    running: '正在保护',
    notConnected: '尚未连接站点',
    offline: '安全小屋已停止',
    siteTitle: '连接的站点',
    siteLabel: '站点地址',
    siteNone: '还没有连接站点',
    connect: '连接',
    siteHint: '在站点「安全与访问 → 隐私」里点「连接本站」可自动填写。只支持 https 地址。',
    clientTitle: '在客户端里填写这些地址',
    clientHint: 'API Key 不用改，照常填写站点发给你的 Key。',
    endpointOpenAI: 'OpenAI 兼容（Base URL）',
    endpointClaude: 'Claude / Anthropic',
    endpointGemini: 'Gemini',
    copy: '复制',
    copied: '已复制',
    statsTitle: '本次运行',
    statRequests: '已保护请求',
    statMasked: '已替换敏感信息',
    statRejected: '已在本机拦截',
    statFailed: '还原失败',
    statsHint: '只统计次数，不记录任何内容。',
    tryTitle: '试一试',
    tryLabel: '要检测的文本',
    tryPlaceholder: '例如：请联系 alice@example.com 或 13800138000',
    tryButton: '看看站点会收到什么',
    tryHint: '在本机检测，文本不会发出这台电脑。',
    tryCount: '替换了 {n} 处',
    tryNone: '没有发现需要替换的内容',
    tryRejected: '这段文本无法安全处理',
    settingsTitle: '设置',
    autostart: '开机时自动启动',
    quit: '退出安全小屋',
    quitConfirm: '退出后，填写了本地地址的客户端将无法使用。确定退出？',
    quitDone: '安全小屋已退出，可以关闭此页面。',
    limitProtocols: '支持纯文本的 Chat Completions、Completions、Responses、Claude Messages 与 Gemini 请求。',
    limitTools: '带工具调用、图片音频或服务端会话状态的请求会在本机拦截，不会发给站点。',
    limitDetector: '检测邮箱、中国大陆手机号、身份证号、IPv4、常见 API 密钥和私钥；可能漏检，不是保密保证。',
    footer: '萌萌的安全小屋',
    confirmTitle: '连接到这个站点？',
    confirmBody: '之后经过安全小屋的请求（包括你的 API Key）都会发送到这个站点。只连接你信任的站点。',
    confirmReplace: '这会替换当前连接的站点：{origin}',
    cancel: '取消',
    confirm: '连接',
    connected: '已连接',
    invalidSite: '请输入以 https:// 开头的站点地址',
    failed: '操作失败，请重试',
  },
  en: {
    title: "Mengmeng's Safe House",
    subtitle: 'Detected sensitive values are replaced on this computer before text is sent to the site.',
    running: 'Protecting',
    notConnected: 'No site connected',
    offline: 'Safe House stopped',
    siteTitle: 'Connected site',
    siteLabel: 'Site address',
    siteNone: 'No site connected yet',
    connect: 'Connect',
    siteHint: 'On the site, open Security & Access → Privacy and click "Connect this site" to fill this in. Only https addresses are accepted.',
    clientTitle: 'Use these addresses in your client',
    clientHint: 'Keep your API key unchanged and use the key from the site as usual.',
    endpointOpenAI: 'OpenAI compatible (Base URL)',
    endpointClaude: 'Claude / Anthropic',
    endpointGemini: 'Gemini',
    copy: 'Copy',
    copied: 'Copied',
    statsTitle: 'This session',
    statRequests: 'Protected requests',
    statMasked: 'Sensitive items replaced',
    statRejected: 'Blocked on this computer',
    statFailed: 'Restore failures',
    statsHint: 'Only counts are kept. No content is recorded.',
    tryTitle: 'Try it',
    tryLabel: 'Text to check',
    tryPlaceholder: 'e.g. Please contact alice@example.com or 13800138000',
    tryButton: 'See what the site receives',
    tryHint: 'Checked on this computer. The text never leaves it.',
    tryCount: '{n} item(s) replaced',
    tryNone: 'Nothing needed replacing',
    tryRejected: 'This text cannot be handled safely',
    settingsTitle: 'Settings',
    autostart: 'Start when I sign in',
    quit: 'Quit Safe House',
    quitConfirm: 'Clients using the local address will stop working. Quit?',
    quitDone: 'Safe House has quit. You can close this page.',
    limitProtocols: 'Supports plain-text Chat Completions, Completions, Responses, Claude Messages, and Gemini requests.',
    limitTools: 'Requests with tool calls, images, audio, or server-side state are blocked on this computer and never sent to the site.',
    limitDetector: 'Detects emails, Chinese mobile numbers, resident IDs, IPv4 addresses, common API secrets, and private keys. It may miss things and is not a confidentiality guarantee.',
    footer: "Mengmeng's Safe House",
    confirmTitle: 'Connect to this site?',
    confirmBody: 'Requests that go through the Safe House, including your API key, will be sent to this site. Only connect to sites you trust.',
    confirmReplace: 'This replaces the currently connected site: {origin}',
    cancel: 'Cancel',
    confirm: 'Connect',
    connected: 'Connected',
    invalidSite: 'Enter a site address starting with https://',
    failed: 'Something went wrong. Please try again.',
  },
}

const language = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
const text = messages[language]
const token = document.querySelector('meta[name="safehouse-token"]').content
const byId = (id) => document.getElementById(id)
let state = null
let toastTimer = 0

function t(key, values) {
  let value = text[key] || key
  for (const [name, replacement] of Object.entries(values || {})) {
    value = value.replace('{' + name + '}', replacement)
  }
  return value
}

function applyTranslations() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  document.title = t('title')
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n)
  }
  byId('try-input').placeholder = t('tryPlaceholder')
}

async function call(path, body) {
  const options = { headers: { 'X-Safehouse-Token': token }, cache: 'no-store' }
  if (body !== undefined) {
    options.method = 'POST'
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }
  const response = await fetch(path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || String(response.status))
  return data
}

function showToast(message) {
  const toast = byId('toast')
  toast.textContent = message
  toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.hidden = true
  }, 2400)
}

function renderStatus(kind) {
  const status = byId('status')
  status.className = kind === 'running' ? 'pill ok' : 'pill'
  status.textContent = t(kind)
}

function renderEndpoints(urls) {
  const list = byId('endpoints')
  if (list.dataset.rendered === 'true') return
  list.dataset.rendered = 'true'
  const rows = [
    ['endpointOpenAI', urls.openai],
    ['endpointClaude', urls.claude],
    ['endpointGemini', urls.gemini],
  ]
  for (const [labelKey, url] of rows) {
    const item = document.createElement('li')
    const label = document.createElement('span')
    label.className = 'label'
    label.textContent = t(labelKey)
    const value = document.createElement('div')
    value.className = 'value'
    const code = document.createElement('code')
    code.textContent = url
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'btn small'
    button.textContent = t('copy')
    button.setAttribute('aria-label', t('copy') + ' ' + t(labelKey))
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url)
        showToast(t('copied'))
      } catch {
        showToast(t('failed'))
      }
    })
    value.append(code, button)
    item.append(label, value)
    list.append(item)
  }
}

function render(next) {
  state = next
  const site = byId('site-current')
  if (next.upstream) {
    site.textContent = next.upstream
    site.className = 'site'
  } else {
    site.textContent = t('siteNone')
    site.className = 'site empty'
  }
  renderStatus(next.upstream ? 'running' : 'notConnected')
  renderEndpoints(next.base_urls)
  byId('stat-requests').textContent = next.stats.requests.toLocaleString()
  byId('stat-masked').textContent = next.stats.masked_entities.toLocaleString()
  byId('stat-rejected').textContent = next.stats.rejected.toLocaleString()
  byId('stat-failed').textContent = next.stats.failed.toLocaleString()
  byId('autostart-row').hidden = !next.autostart.supported
  byId('autostart').checked = next.autostart.enabled
  byId('version').textContent = next.version ? 'v' + next.version.replace(/^v/, '') : ''
}

async function refresh() {
  try {
    render(await call('/api/state'))
  } catch {
    renderStatus('offline')
  }
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value.trim())
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return ''
    if (url.username || url.password || url.search || url.hash) return ''
    if (url.pathname !== '/' && url.pathname !== '') return ''
    return url.origin
  } catch {
    return ''
  }
}

// Pairing always needs an explicit click that names the site, so a page that
// opens this panel with its own address cannot silently take over the proxy.
async function confirmPairing(origin) {
  const dialog = byId('confirm')
  byId('confirm-origin').textContent = origin
  const replace = byId('confirm-replace')
  const current = state && state.upstream
  replace.hidden = !current || current === origin
  replace.textContent = current ? t('confirmReplace', { origin: current }) : ''
  dialog.returnValue = ''
  dialog.showModal()
  await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }))
  if (dialog.returnValue !== 'ok') return
  try {
    await call('/api/pair', { upstream: origin })
    showToast(t('connected'))
    await refresh()
  } catch {
    showToast(t('failed'))
  }
}

function readConnectRequest() {
  const match = /^#connect=(.+)$/.exec(location.hash)
  history.replaceState(null, '', location.pathname)
  if (!match) return ''
  try {
    return normalizeOrigin(decodeURIComponent(match[1]))
  } catch {
    return ''
  }
}

function bindEvents() {
  byId('site-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const origin = normalizeOrigin(byId('site-input').value)
    if (!origin) {
      showToast(t('invalidSite'))
      return
    }
    confirmPairing(origin)
  })

  byId('try-button').addEventListener('click', async () => {
    const output = byId('try-output')
    try {
      const result = await call('/api/try', { text: byId('try-input').value })
      const summary = result.count > 0 ? t('tryCount', { n: result.count }) : t('tryNone')
      output.textContent = result.masked + '\n\n— ' + summary
    } catch {
      output.textContent = t('tryRejected')
    }
    output.hidden = false
  })

  byId('autostart').addEventListener('change', async (event) => {
    try {
      await call('/api/autostart', { enabled: event.target.checked })
    } catch {
      event.target.checked = !event.target.checked
      showToast(t('failed'))
    }
  })

  byId('quit').addEventListener('click', async () => {
    if (!confirm(t('quitConfirm'))) return
    try {
      await call('/api/quit', {})
    } finally {
      clearInterval(window.safehouseTimer)
      renderStatus('offline')
      showToast(t('quitDone'))
    }
  })
}

async function start() {
  applyTranslations()
  bindEvents()
  await refresh()
  const requested = readConnectRequest()
  if (requested) {
    byId('site-input').value = requested
    if (!state || state.upstream !== requested) await confirmPairing(requested)
  }
  window.safehouseTimer = setInterval(refresh, 3000)
}

start()
