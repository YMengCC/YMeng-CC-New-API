import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance, type i18n as I18n } from 'i18next'
import { useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { UpdateOptionRequest } from '../../types'
import { PricingSection } from '../pricing-section'

const defaults = {
  QuotaPerUnit: 500000,
  USDExchangeRate: 7,
  DisplayInCurrencyEnabled: true,
  DisplayTokenStatEnabled: true,
  DisplayModelPricingIssueBadgeEnabled: false,
  general_setting: {
    quota_display_type: 'CUSTOM' as const,
    custom_currency_symbol: 'HK$',
    custom_currency_exchange_rate: 8,
  },
}

let testI18n: I18n

function Fixture() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  )

  return (
    <I18nextProvider i18n={testI18n}>
      <QueryClientProvider client={client}>
        <div ref={setContainer} />
        <SettingsPageProvider actionsContainer={container}>
          <PricingSection defaultValues={defaults} />
        </SettingsPageProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
}

async function renderSettings() {
  const route = createRootRoute({ component: Fixture })
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  testI18n = createInstance()
  await testI18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en },
    interpolation: { escapeValue: false },
  })
})

describe('custom currency image setting', () => {
  it('previews a configured image and saves its absolute HTTP URL', async () => {
    const imageUrl = 'https://cdn.example.com/currency.svg?theme=dark'
    const put = vi.spyOn(api, 'put').mockImplementation(async () => ({
      data: { success: true, message: '' },
    }))
    const user = userEvent.setup()
    await renderSettings()

    const input = screen.getByLabelText('Custom Currency Symbol')
    await user.clear(input)
    await user.type(input, imageUrl)
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put).toHaveBeenCalledWith('/api/option/', {
      key: 'general_setting.custom_currency_symbol',
      value: imageUrl,
    } satisfies UpdateOptionRequest)
    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      imageUrl
    )
  })

  it.each([
    ['javascript:alert(1)', '8 characters or an HTTP(S) image URL'],
    ['/relative/coin.svg', '8 characters or an HTTP(S) image URL'],
  ])('rejects %s without saving', async (value, errorText) => {
    const put = vi.spyOn(api, 'put').mockImplementation(async () => ({
      data: { success: true, message: '' },
    }))
    const user = userEvent.setup()
    await renderSettings()

    const input = screen.getByLabelText('Custom Currency Symbol')
    await user.clear(input)
    await user.type(input, value)

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(
      await screen.findByText(errorText, { exact: false })
    ).toBeInTheDocument()
    expect(put).not.toHaveBeenCalled()
  })
})
