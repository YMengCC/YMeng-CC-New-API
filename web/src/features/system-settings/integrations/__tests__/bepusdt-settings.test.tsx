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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import {
  BEPUSDT_GUIDE_STORAGE_KEY,
  BEPUSDT_PROJECT_URL,
  BEpusdtSetupGuide,
} from '../bepusdt-setup-guide'
import { PaymentMethodDialog } from '../payment-method-dialog'
import { PaymentSettingsSection } from '../payment-settings-section'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/json-code-editor', () => ({
  JsonCodeEditor: (props: {
    value: string
    onChange: (value: string) => void
  }) => (
    <textarea
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}))

function Wrapper(props: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsPageProvider actionsContainer={null}>
        {props.children}
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

function renderPaymentSettings(tokenConfigured = false) {
  return render(
    <PaymentSettingsSection
      defaultValues={{
        PayAddress: '',
        EpayId: '',
        EpayKey: '',
        Price: 7.3,
        MinTopUp: 1,
        CustomCallbackAddress: 'https://epay-only.example.com',
        PayMethods: '[]',
        AmountOptions: '[]',
        AmountDiscount: '{}',
        StripeApiSecret: '',
        StripeWebhookSecret: '',
        StripePriceId: '',
        StripeUnitPrice: 1,
        StripeMinTopUp: 1,
        StripePromotionCodesEnabled: false,
        CreemApiKey: '',
        CreemWebhookSecret: '',
        CreemTestMode: false,
        CreemProducts: '[]',
        JingSoftEnabled: false,
        JingSoftMode: 'auto',
        JingSoftBaseURL: '',
        JingSoftStoreToken: '',
        JingSoftMerchantToken: '',
        JingSoftProducts: '[]',
        JingSoftDirectGoodsKeys: '[]',
        JingSoftAutoRestockMin: 5,
        JingSoftAutoRestockBatch: 20,
        JingSoftMaxAmountCNY: 5000,
        JingSoftMaxOrdersPerMinute: 15,
        JingSoftChannels: '[]',
      }}
      waffoDefaultValues={{
        WaffoEnabled: false,
        WaffoApiKey: '',
        WaffoPrivateKey: '',
        WaffoPublicCert: '',
        WaffoSandboxPublicCert: '',
        WaffoSandboxApiKey: '',
        WaffoSandboxPrivateKey: '',
        WaffoSandbox: false,
        WaffoMerchantId: '',
        WaffoCurrency: 'USD',
        WaffoUnitPrice: 1,
        WaffoMinTopUp: 1,
        WaffoNotifyUrl: '',
        WaffoReturnUrl: '',
        WaffoPayMethods: '[]',
      }}
      waffoPancakeDefaultValues={{
        WaffoPancakeMerchantID: '',
        WaffoPancakePrivateKey: '',
        WaffoPancakeReturnURL: '',
      }}
      bepusdtDefaultValues={{
        BEpusdtEnabled: false,
        BEpusdtApiUrl: 'https://bepusdt.ymeng.cc',
        BEpusdtApiToken: '',
        BEpusdtCallbackAddress: '',
        BEpusdtPayMethods: '[]',
      }}
      bepusdtTokenConfigured={tokenConfigured}
      serverAddress='https://site.example.com'
      complianceDefaults={{
        confirmed: true,
        termsVersion: 'v1',
        confirmedAt: 1700000000,
        confirmedBy: 1,
      }}
    />,
    { wrapper: Wrapper }
  )
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('BEpusdt payment settings', () => {
  test('auto-opens BEpusdt setup guide once on first entry, links to BEpusdt GitHub repo, and remembers dismissal', async () => {
    localStorage.clear()
    const user = userEvent.setup()

    renderPaymentSettings(true)

    const bepusdtTab = screen.getByRole('tab', { name: 'BEpusdt' })
    await user.click(bepusdtTab)

    const guideDialog = await screen.findByRole('dialog', {
      name: 'BEpusdt setup guide',
    })
    expect(
      within(guideDialog).getByText('Gateway status & API credentials')
    ).toBeVisible()
    expect(
      within(guideDialog).getByText('Channels & General binding')
    ).toBeVisible()

    const githubLink = within(guideDialog).getByRole('link', {
      name: 'BEpusdt GitHub',
    })
    expect(githubLink).toHaveAttribute('href', BEPUSDT_PROJECT_URL)
    expect(githubLink).toHaveAttribute('target', '_blank')
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer')

    const consoleLink = within(guideDialog).getByRole('link', {
      name: 'Open BEpusdt console',
    })
    expect(consoleLink).toHaveAttribute('href', 'https://bepusdt.ymeng.cc')

    await user.click(within(guideDialog).getByRole('button', { name: 'Got it' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(localStorage.getItem(BEPUSDT_GUIDE_STORAGE_KEY)).toBe('1')

    const inlineProjectLink = screen.getByRole('link', {
      name: BEPUSDT_PROJECT_URL,
    })
    expect(inlineProjectLink).toHaveAttribute('href', BEPUSDT_PROJECT_URL)

    await user.click(screen.getByRole('tab', { name: 'General' }))
    await user.click(bepusdtTab)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Setup guide can be reopened anytime after dismissal', async () => {
    localStorage.setItem(BEPUSDT_GUIDE_STORAGE_KEY, '1')
    const user = userEvent.setup()

    render(<BEpusdtSetupGuide apiUrl='https://bepusdt.ymeng.cc/' autoOpen />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Setup guide' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'BEpusdt setup guide',
    })
    expect(
      within(dialog).getByRole('heading', {
        name: 'Deploy BEpusdt & get the API token',
      })
    ).toBeVisible()
    expect(
      within(dialog).getByRole('link', { name: 'Open BEpusdt console' })
    ).toHaveAttribute('href', 'https://bepusdt.ymeng.cc')
  })

  test('renders BEpusdt tab, ignores Epay callback address, falls back to ServerAddress, and supports custom origin', async () => {
    localStorage.setItem(BEPUSDT_GUIDE_STORAGE_KEY, '1')
    const user = userEvent.setup()
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, message: '' } })

    renderPaymentSettings(true)

    await user.click(screen.getByRole('tab', { name: 'BEpusdt' }))

    // Blank BEpusdtCallbackAddress falls back to ServerAddress (not Epay's CustomCallbackAddress)
    expect(
      screen.getByText('https://site.example.com/api/bepusdt/webhook')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('https://epay-only.example.com/api/bepusdt/webhook')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Token configured')).toBeInTheDocument()

    // Entering a site origin overrides the preview; entering a path displays inline validation error
    const callbackInput = screen.getByLabelText('Callback address')
    await user.type(callbackInput, 'https://bep-cb.example.com/')
    expect(
      screen.getByText('https://bep-cb.example.com/api/bepusdt/webhook')
    ).toBeInTheDocument()

    await user.clear(callbackInput)
    await user.type(
      callbackInput,
      'https://bep-cb.example.com/api/bepusdt/webhook'
    )
    expect(
      screen.getByText(
        'BEpusdt callback address must be a valid site origin without a path'
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Test connection' }))

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/option/bepusdt/test', {
        api_url: 'https://bepusdt.ymeng.cc',
        api_token: '',
      })
    })
  })

  test('adds a BEpusdt channel without requiring a display name and renders masked address preview', async () => {
    localStorage.setItem(BEPUSDT_GUIDE_STORAGE_KEY, '1')
    const user = userEvent.setup()
    renderPaymentSettings(true)

    await user.click(screen.getByRole('tab', { name: 'BEpusdt' }))
    await user.click(screen.getByRole('button', { name: 'Add payment method' }))

    expect(screen.queryByLabelText(/Display name/i)).not.toBeInTheDocument()
    await user.type(
      screen.getByLabelText('Receiving wallet address (optional)'),
      'TWalletAddress1234567890ABCDEFGH'
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('usdt.trc20')).toBeInTheDocument()
    expect(screen.getByText('bepusdt_usdt.trc20')).toBeInTheDocument()
    expect(screen.getByText('TWalletA...CDEFGH')).toBeInTheDocument()
  })

  test('General payment method dialog auto-populates display name from BEpusdt channel and blocks bepusdt prefix in custom Epay', async () => {
    const user = userEvent.setup()
    const save = vi.fn()

    render(
      <PaymentMethodDialog
        open
        onOpenChange={vi.fn()}
        onSave={save}
        bepusdtPayMethods={[
          {
            trade_type: 'usdt.trc20',
            address: 'TWalletAddress1234567890ABCDEFGH',
          },
          {
            trade_type: 'cashier',
            currencies: 'USDT,USDC',
          },
        ]}
      />
    )

    await user.click(screen.getByRole('combobox', { name: 'Payment type key' }))
    expect(
      await screen.findByRole('option', {
        name: /USDT \(TRC20\) · TWalletA\.\.\.CDEFGH \(BEpusdt: bepusdt_usdt\.trc20\)/,
      })
    ).toBeVisible()
    expect(
      screen.getByRole('option', { name: /BEpusdt: bepusdt_cashier/ })
    ).toBeVisible()

    await user.click(
      screen.getByRole('option', { name: 'Custom Epay payment identifier' })
    )
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Fake Epay')
    await user.type(
      screen.getByPlaceholderText('Enter payment type key'),
      'bepusdt_usdt.trc20'
    )
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(
      await screen.findByText(
        'BEpusdt payment identifiers must be selected from BEpusdt channels'
      )
    ).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()

    await user.clear(screen.getByRole('textbox', { name: 'Name' }))
    await user.click(screen.getByRole('combobox', { name: 'Payment type key' }))
    await user.click(
      await screen.findByRole('option', {
        name: /BEpusdt: bepusdt_usdt\.trc20/,
      })
    )
    expect(
      screen.queryByRole('spinbutton', { name: 'Display fee (%)' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'USDT (TRC20)',
          type: 'bepusdt_usdt.trc20',
          channel_id: '0',
          icon: 'SiTether',
        })
      )
    })
    const savedPayload = save.mock.calls[0]?.[0] as Record<string, unknown>
    expect(savedPayload).not.toHaveProperty('fee_percent')
  })
})
