import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  // The shared test setup already initialized its singleton with lng: 'en'.
  // Give the production initializer a fresh instance, as on a cold page load.
  vi.doMock('i18next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('i18next')>()
    return { ...actual, default: actual.createInstance() }
  })
})

afterEach(() => {
  localStorage.removeItem('i18nextLng')
  vi.doUnmock('i18next')
  vi.doUnmock('../locales/ja.json')
})

it.each([
  ['zh-CN', 'zhCN', '重试'],
  ['zh-TW', 'zhTW', '重試'],
])(
  'starts %s with only the selected dictionary and English',
  async (tag, code, retry) => {
    localStorage.setItem('i18nextLng', tag)
    const { default: i18n, i18nReady } = await import('../config')
    await i18nReady

    expect(i18n.resolvedLanguage).toBe(code)
    expect(i18n.t('Retry')).toBe(retry)
    expect(Object.keys(i18n.store.data).sort()).toEqual(['en', code])
  }
)

it('loads Japanese on selection and reuses Chinese when switching back', async () => {
  localStorage.setItem('i18nextLng', 'zhCN')
  const { default: i18n, i18nReady } = await import('../config')
  await i18nReady
  const chinese = i18n.getResourceBundle('zhCN', 'translation')
  expect(i18n.hasResourceBundle('ja', 'translation')).toBe(false)

  await i18n.changeLanguage('ja')
  expect(i18n.t('Retry')).toBe('再試行')
  await i18n.changeLanguage('zhCN')
  expect(i18n.t('Retry')).toBe('重试')
  expect(i18n.getResourceBundle('zhCN', 'translation')).toBe(chinese)
})

it('renders the bundled English translation when the initial dictionary fails', async () => {
  localStorage.setItem('i18nextLng', 'ja')
  vi.doMock('../locales/ja.json', () => {
    throw new Error('offline')
  })
  const { default: i18n, i18nReady } = await import('../config')
  await i18nReady

  expect(i18n.resolvedLanguage).toBe('en')
  expect(i18n.t('Retry')).toBe('Retry')
  await i18n.changeLanguage('zhTW')
  expect(i18n.t('Retry')).toBe('重試')
})
