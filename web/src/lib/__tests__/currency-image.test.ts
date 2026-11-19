import { afterEach, beforeEach, expect, it } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import {
  formatBillingCurrencyFromUSD,
  formatCurrencyFromUSD,
  formatQuotaWithCurrency,
  getCurrencyDisplay,
  getCurrencyImageUrl,
  isCurrencyImageUrl,
} from '../currency'

beforeEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

afterEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

it.each([
  ['https://cdn.example.com/coin.svg', true],
  ['http://cdn.example.com/coin.svg?size=32', true],
  [' https://cdn.example.com/coin.png ', true],
  ['/coin.svg', false],
  ['ftp://cdn.example.com/coin.svg', false],
  ['javascript:alert(1)', false],
  ['HK$', false],
  ['', false],
  [undefined, false],
])('classifies %s as an image URL: %s', (value, expected) => {
  expect(isCurrencyImageUrl(value)).toBe(expected)
})

it('uses the generic mark in text formatting while keeping the image URL for UI rendering', () => {
  const imageUrl = 'https://cdn.example.com/coin.svg?v=2'
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: imageUrl,
      customCurrencyExchangeRate: 2,
    },
  })

  expect(formatQuotaWithCurrency(500000)).toBe('¤ 2')
  expect(formatCurrencyFromUSD(1)).toBe('¤ 2')
  const meta = getCurrencyDisplay().meta
  expect(meta.kind === 'tokens' ? '' : meta.symbol).toBe('¤')
  expect(getCurrencyImageUrl()).toBe(imageUrl)
})

it('keeps short text symbols and exchange rate formatting unchanged', () => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: '€',
      customCurrencyExchangeRate: 2,
    },
  })

  expect(formatQuotaWithCurrency(500000)).toBe('€ 2')
  expect(getCurrencyImageUrl()).toBeNull()
})

it('formats historical billing snapshots without using the current image', () => {
  const snapshot = {
    ...DEFAULT_CURRENCY_CONFIG,
    quotaDisplayType: 'CUSTOM' as const,
    customCurrencySymbol: '€',
    customCurrencyExchangeRate: 2,
  }
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: 'https://cdn.example.com/coin.svg',
      customCurrencyExchangeRate: 3,
    },
  })

  expect(formatBillingCurrencyFromUSD(1, {}, snapshot)).toBe('€ 2')
})

it('uses the server-provided image URL when the symbol is already masked', () => {
  const imageUrl = 'https://cdn.example.com/coin.png'
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: '¤',
      customCurrencyImageUrl: imageUrl,
      customCurrencyExchangeRate: 2,
    },
  })

  expect(formatQuotaWithCurrency(500000)).toBe('¤ 2')
  const meta = getCurrencyDisplay().meta
  expect(meta.kind === 'tokens' ? '' : meta.symbol).toBe('¤')
  expect(getCurrencyImageUrl()).toBe(imageUrl)
})

it('renders URL-shaped legacy values above the text limit as the generic mark', () => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: 'ftp://cdn.example.com/coin.png',
      customCurrencyExchangeRate: 2,
    },
  })

  expect(formatQuotaWithCurrency(500000)).toBe('¤ 2')
  expect(getCurrencyImageUrl()).toBeNull()
})

it('keeps short URL-shaped text symbols verbatim', () => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: 'a://b',
      customCurrencyExchangeRate: 2,
    },
  })

  expect(formatQuotaWithCurrency(500000)).toBe('a://b 2')
  expect(getCurrencyImageUrl()).toBeNull()
})

it('resolves an image carried by a currency snapshot', () => {
  const snapshot = {
    ...DEFAULT_CURRENCY_CONFIG,
    quotaDisplayType: 'CUSTOM' as const,
    customCurrencySymbol: '¤',
    customCurrencyImageUrl: 'https://cdn.example.com/snapshot.svg',
    customCurrencyExchangeRate: 2,
  }

  expect(getCurrencyImageUrl(snapshot)).toBe(
    'https://cdn.example.com/snapshot.svg'
  )
  expect(formatQuotaWithCurrency(500000, {}, snapshot)).toBe('¤ 2')
})
