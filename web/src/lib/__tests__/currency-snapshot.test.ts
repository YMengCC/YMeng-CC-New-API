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
import { afterEach, beforeEach, expect, it } from 'vitest'

import { toIntlLocale } from '@/i18n/languages'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
  type CurrencyConfig,
} from '@/stores/system-config-store'

import { formatQuotaWithCurrency } from '../currency'

beforeEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})
afterEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

it.each([
  ['USD', '$2'],
  ['CNY', '¥14'],
  ['CUSTOM', '€ 4'],
  ['TOKENS', '1000000'],
] as const)(
  'renders a %s withdrawal using its snapshot while current settings differ',
  (type, expected) => {
    const snapshot: CurrencyConfig = {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: type,
      usdExchangeRate: 7,
      customCurrencySymbol: '€',
      customCurrencyExchangeRate: 2,
    }
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaPerUnit: 10,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: 'X',
        customCurrencyExchangeRate: 3,
      },
    })
    const current = useSystemConfigStore.getState().config.currency
    expect(
      formatQuotaWithCurrency(
        1000000,
        { abbreviate: false, locale: 'en-US' },
        snapshot
      )
    ).toBe(expected)
    expect(useSystemConfigStore.getState().config.currency).toBe(current)
    expect(
      formatQuotaWithCurrency(10, { abbreviate: false, locale: 'en-US' })
    ).toBe('X 3')
  }
)

it.each(['zhCN', 'zhTW', 'en', 'fr', 'ru', 'ja', 'vi', 'invalid_locale'])(
  'preserves the existing %s currency presentation when formatting a stored snapshot',
  (language) => {
    const snapshot: CurrencyConfig = {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7,
    }
    const locale = toIntlLocale(language)
    useSystemConfigStore.getState().setConfig({ currency: snapshot })
    const original = formatQuotaWithCurrency(250001, {
      locale,
      abbreviate: false,
    })
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'TOKENS',
        quotaPerUnit: 10,
      },
    })
    expect(
      formatQuotaWithCurrency(250001, { locale, abbreviate: false }, snapshot)
    ).toBe(original)
  }
)
