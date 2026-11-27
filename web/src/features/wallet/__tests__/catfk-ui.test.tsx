import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { useState, type ComponentProps, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { mapStatusDataToConfig } from '@/lib/status-query'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { BillingHistoryDialog } from '../components/dialogs/billing-history-dialog'
import { PaymentConfirmDialog } from '../components/dialogs/payment-confirm-dialog'
import { RechargeFormCard } from '../components/recharge-form-card'
import { useCatfkPayment } from '../hooks/use-catfk-payment'
import { useTopupInfo } from '../hooks/use-topup-info'
import type { TopupInfo } from '../types'

const channel = { id: 'wechat', name: 'WeChat', payment_type: 'wxpay' as const }
const product = { id: 'ten', name: 'Ten dollars', amount: 10 }
const quote = { quote_id: 'q1', amount: 72, currency: 'CNY', topup_amount: 10 }
const topupInfo: TopupInfo = {
  enable_online_topup: false,
  enable_stripe_topup: false,
  pay_methods: [],
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [20],
  discount: {},
  catfk: {
    enabled: true,
    available: true,
    products: [product],
    channels: [channel],
  },
}
const base: ComponentProps<typeof RechargeFormCard> = {
  topupInfo,
  presetAmounts: [{ value: 10 }, { value: 20 }],
  selectedPreset: 10,
  onSelectPreset: vi.fn(),
  topupAmount: 10,
  onTopupAmountChange: vi.fn(),
  paymentAmount: 140,
  calculating: false,
  onPaymentMethodSelect: vi.fn(),
  paymentLoading: null,
  redemptionCode: '',
  onRedemptionCodeChange: vi.fn(),
  onRedeem: vi.fn(),
  redeeming: false,
}
function wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {props.children}
    </QueryClientProvider>
  )
}
afterEach(() => {
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
  localStorage.clear()
  vi.restoreAllMocks()
})

it('places store channels in the same payment grid with identical button styling and no provider heading', () => {
  render(
    <RechargeFormCard
      {...base}
      topupInfo={{
        ...topupInfo,
        enable_online_topup: true,
        pay_methods: [
          { type: 'alipay', name: 'Existing Alipay' },
          { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
        ],
      }}
      onCatfkPaymentSelect={vi.fn()}
    />
  )
  const regular = screen.getByRole('button', { name: 'Existing Alipay' })
  const store = screen.getByRole('button', { name: 'WeChat' })
  expect(store.parentElement).toBe(regular.parentElement)
  expect(store.className).toBe(regular.className)
  expect(screen.queryByText('Catfk Payment')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'WeChat' })).toHaveLength(1)
})

it('does not show CatFK channels until a CatFK payment method is configured', () => {
  render(
    <RechargeFormCard
      {...base}
      topupInfo={{ ...topupInfo, enable_online_topup: true }}
      onCatfkPaymentSelect={vi.fn()}
    />
  )

  expect(
    screen.queryByRole('button', { name: 'WeChat' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(
      'No payment methods available. Please contact administrator.'
    )
  ).toBeVisible()
})

it('does not show a Catfk payment method whose configured channel does not match its identifier', () => {
  render(
    <RechargeFormCard
      {...base}
      topupInfo={{
        ...topupInfo,
        pay_methods: [
          {
            type: 'catfk_alipay',
            channel_id: 'alipay-id',
            name: 'Catfk Alipay',
          },
        ],
      }}
      onCatfkPaymentSelect={vi.fn()}
    />
  )

  expect(
    screen.queryByRole('button', { name: 'Catfk Alipay' })
  ).not.toBeInTheDocument()
})

it('adds the configured payment method display fee only to the You Pay amount', () => {
  render(
    <PaymentConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      topupAmount={10}
      paymentAmount={100}
      paymentMethod={{ type: 'alipay', name: 'Alipay' }}
      calculating={false}
      processing={false}
      paymentFeePercent={2.5}
    />
  )

  expect(screen.getByText('102.5')).toBeVisible()
  expect(screen.getByText('Includes a 2.5% fee (2.5)')).toBeVisible()
})

it('shows no fee note for a payment method without a display fee', () => {
  render(
    <PaymentConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      topupAmount={10}
      paymentAmount={100}
      paymentMethod={{ type: 'alipay', name: 'Alipay' }}
      calculating={false}
      processing={false}
    />
  )

  expect(screen.getByText('100')).toBeVisible()
  expect(screen.queryByText(/Includes a .* fee/)).not.toBeInTheDocument()
})

it('does not apply a configured display fee to CatFK and keeps its contact input', () => {
  render(
    <PaymentConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      topupAmount={10}
      paymentAmount={72}
      paymentMethod={{ type: 'catfk', name: 'Alipay', fee_percent: 25 }}
      calculating={false}
      processing={false}
      paymentFeePercent={25}
      catfk={{ quote, qq: '', onQQChange: vi.fn(), available: true }}
    />
  )

  expect(screen.getByText('72')).toBeVisible()
  expect(screen.getByRole('textbox', { name: /Contact method/ })).toBeRequired()
})

it('uses the original preset buttons and keeps custom input visible while quoting the selected amount', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: quote },
  })
  function WalletAmounts() {
    const payment = useCatfkPayment(topupInfo.catfk, 1)
    return (
      <>
        <RechargeFormCard
          {...base}
          topupInfo={{
            ...topupInfo,
            pay_methods: [
              { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
            ],
          }}
          catfkChannel={payment.channel}
          onCatfkPaymentSelect={(selectedChannel, selectedProduct) => {
            if (selectedProduct) {
              void payment.selectProduct(selectedProduct, selectedChannel)
            }
          }}
        />
        <PaymentConfirmDialog
          open={payment.open}
          onOpenChange={(open) => {
            if (!open) payment.reset()
          }}
          onConfirm={payment.confirm}
          topupAmount={payment.product?.amount ?? 0}
          paymentAmount={payment.quote?.amount ?? 0}
          paymentMethod={
            payment.channel ? { ...payment.channel, type: 'catfk' } : undefined
          }
          calculating={payment.calculating}
          processing={payment.processing}
          catfk={{
            quote: payment.quote,
            qq: payment.qq,
            onQQChange: payment.setQQ,
            available: true,
          }}
        />
      </>
    )
  }
  const user = userEvent.setup()
  render(<WalletAmounts />, { wrapper })
  const preset = screen.getByRole('button', { name: /^10 Pay/ })
  const presetText = preset.textContent
  expect(
    screen.getByRole('spinbutton', { name: 'Custom Amount' })
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: /WeChat/ }))
  await screen.findByRole('textbox', { name: /Contact method/ })
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/catfk/quote', {
      product_id: 'ten',
      channel_id: 'wechat',
    })
  )
  expect(preset.textContent).toBe(presetText)
  expect(
    screen.queryByRole('button', { name: /Ten dollars/ })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: /^10 Pay/ })).toHaveClass(
    'border-foreground'
  )
  expect(
    screen.getByRole('spinbutton', { name: 'Custom Amount' })
  ).toBeVisible()
  expect(post).toHaveBeenCalledOnce()
})

it('disables the store method for custom input even matching a tier and re-enables it after selecting a mapped preset', async () => {
  const pay = vi.fn()
  const regularPay = vi.fn()
  function WalletAmounts() {
    const [amount, setAmount] = useState(10)
    const [preset, setPreset] = useState<number | null>(10)
    return (
      <RechargeFormCard
        {...base}
        topupInfo={{
          ...topupInfo,
          enable_online_topup: true,
          pay_methods: [
            { type: 'alipay', name: 'Existing Alipay' },
            { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
          ],
        }}
        topupAmount={amount}
        selectedPreset={preset}
        onSelectPreset={(next) => {
          setAmount(next.value)
          setPreset(next.value)
        }}
        onTopupAmountChange={(next) => {
          setAmount(next)
          setPreset(null)
        }}
        onCatfkPaymentSelect={pay}
        onPaymentMethodSelect={regularPay}
      />
    )
  }
  const user = userEvent.setup()
  render(<WalletAmounts />)
  const store = screen.getByRole('button', { name: /WeChat/ })
  expect(store).toBeEnabled()
  expect(
    screen.queryByText('Custom amounts are not supported')
  ).not.toBeInTheDocument()
  const input = screen.getByRole('spinbutton', { name: 'Custom Amount' })
  await user.clear(input)
  await user.type(input, '10')
  expect(screen.getByText('Custom amounts are not supported')).toHaveClass(
    'text-[11px]',
    'text-muted-foreground',
    'font-normal'
  )
  expect(screen.getByRole('button', { name: /WeChat/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Existing Alipay' })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: 'Existing Alipay' }))
  expect(regularPay).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'alipay' })
  )
  await user.click(screen.getByRole('button', { name: /^10 Pay/ }))
  expect(
    screen.queryByText('Custom amounts are not supported')
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /WeChat/ })).toBeEnabled()
  await user.click(screen.getByRole('button', { name: /WeChat/ }))
  expect(pay).toHaveBeenCalledWith(channel, product)
})

it('shows the custom amount note on the initially disabled store method and hides it after choosing a mapped preset', async () => {
  function WalletAmounts() {
    const [preset, setPreset] = useState<number | null>(null)
    return (
      <RechargeFormCard
        {...base}
        selectedPreset={preset}
        onSelectPreset={(next) => setPreset(next.value)}
        topupInfo={{
          ...topupInfo,
          enable_online_topup: true,
          pay_methods: [
            { type: 'alipay', name: 'Existing Alipay' },
            { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
          ],
        }}
      />
    )
  }
  render(<WalletAmounts />)
  const store = screen.getByRole('button', { name: /WeChat/ })
  expect(store).toBeDisabled()
  expect(store).toHaveAccessibleName('WeChat. Custom amounts are not supported')
  expect(store).toHaveAttribute('title', 'Custom amounts are not supported')
  expect(screen.getByText('Custom amounts are not supported')).toHaveClass(
    'text-[11px]',
    'text-muted-foreground',
    'font-normal'
  )
  expect(screen.getByRole('button', { name: 'Existing Alipay' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: /^10 Pay/ }))
  expect(
    screen.queryByText('Custom amounts are not supported')
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'WeChat' })).toBeEnabled()
})

it('maps a shared preset to a newly configured product by credited USD amount rather than product name or ID', async () => {
  const pay = vi.fn()
  const added = { id: 'my-tier', name: 'New product', amount: 20 }
  render(
    <RechargeFormCard
      {...base}
      selectedPreset={20}
      topupAmount={20}
      topupInfo={{
        ...topupInfo,
        pay_methods: [
          { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
        ],
        catfk: {
          enabled: true,
          available: true,
          channels: [channel],
          products: [product, added],
        },
      }}
      onCatfkPaymentSelect={pay}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'WeChat' }))
  expect(pay).toHaveBeenCalledWith(channel, added)
  expect(
    screen.queryByText('Custom amounts are not supported')
  ).not.toBeInTheDocument()
})

it('disables an unmapped preset without replacing the shared amount buttons', () => {
  render(
    <RechargeFormCard
      {...base}
      selectedPreset={20}
      topupAmount={20}
      topupInfo={{
        ...topupInfo,
        pay_methods: [
          { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
        ],
      }}
    />
  )
  expect(screen.getByRole('button', { name: /WeChat/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /^20 Pay/ })).toBeEnabled()
})

it('displays the server unavailable reason and disables the store method without disabling shared presets', () => {
  render(
    <RechargeFormCard
      {...base}
      topupInfo={{
        ...topupInfo,
        pay_methods: [
          { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
        ],
        catfk: {
          enabled: true,
          products: [product],
          channels: [channel],
          available: false,
          unavailable_reason: 'Protocol not verified',
        },
      }}
    />
  )
  expect(screen.getByText('Protocol not verified')).toBeVisible()
  expect(screen.getByRole('button', { name: /WeChat/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /^10 Pay/ })).toBeEnabled()
})

it('loads the display fee from the selected payment method configuration', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...topupInfo,
        pay_methods: [
          { type: 'alipay', name: 'Alipay', fee_percent: '2.5' },
          { type: 'catfk', name: 'Catfk', fee_percent: '99' },
        ],
      },
    },
  })
  const select = vi.fn()
  function LoadedMethods() {
    const info = useTopupInfo()
    return (
      <RechargeFormCard
        {...base}
        topupInfo={info.topupInfo}
        presetAmounts={info.presetAmounts}
        loading={info.loading}
        onPaymentMethodSelect={select}
      />
    )
  }
  const user = userEvent.setup()
  render(<LoadedMethods />)
  await user.click(await screen.findByRole('button', { name: 'Alipay' }))
  expect(select).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'alipay', fee_percent: 2.5 })
  )
})

it('preserves the configured store method name and icon when loading payment settings', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...topupInfo,
        catfk: {
          ...topupInfo.catfk,
          channels: [{ id: 'alipay', name: 'Alipay', payment_type: 'alipay' }],
        },
        pay_methods: [
          {
            type: 'catfk_alipay',
            channel_id: 'alipay',
            name: 'Configured Alipay',
            icon: 'https://example.com/alipay.png',
          },
        ],
      },
    },
  })
  function LoadedMethods() {
    const info = useTopupInfo()
    return (
      <RechargeFormCard
        {...base}
        topupInfo={info.topupInfo}
        presetAmounts={info.presetAmounts}
        loading={info.loading}
      />
    )
  }
  render(<LoadedMethods />)
  const method = await screen.findByRole('button', {
    name: /Configured Alipay/,
  })
  expect(method).toBeVisible()
  expect(
    screen.getByRole('img', { name: 'Configured Alipay' })
  ).toHaveAttribute('src', 'https://example.com/alipay.png')
})
it.each([
  { quotaDisplayType: 'USD' as const, expected: '$10' },
  { quotaDisplayType: 'CNY' as const, expected: '¥70' },
  { quotaDisplayType: 'CUSTOM' as const, expected: '€ 9' },
])(
  'uses the site display currency for credited balance without converting the quoted payment: $quotaDisplayType',
  (currency) => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: currency.quotaDisplayType,
        usdExchangeRate: 7,
        customCurrencySymbol: '€',
        customCurrencyExchangeRate: 0.9,
      },
    })
    render(
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        topupAmount={10}
        paymentAmount={72}
        paymentMethod={{ type: 'catfk', name: 'Alipay' }}
        calculating={false}
        processing={false}
        catfk={{ quote, qq: '12345', onQQChange: vi.fn(), available: true }}
      />
    )
    expect(screen.getByText(currency.expected)).toBeVisible()
    expect(screen.getByText('72')).toBeVisible()
    expect(screen.getByRole('alertdialog')).not.toHaveTextContent('CNY')
  }
)

it('updates the credited balance symbol when site currency settings change while the dialog is open', () => {
  render(
    <PaymentConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      topupAmount={10}
      paymentAmount={72}
      paymentMethod={{ type: 'catfk', name: 'Alipay' }}
      calculating={false}
      processing={false}
      catfk={{ quote, qq: '12345', onQQChange: vi.fn(), available: true }}
    />
  )
  expect(screen.getByText('$10')).toBeVisible()
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  )
  expect(screen.getByText('¥70')).toBeVisible()
})

it.each(['zhCN', 'zhTW', 'en', 'fr', 'ru', 'ja', 'vi', 'invalid_locale!'])(
  'formats the site currency safely and follows language changes for %s',
  async (language) => {
    const i18n = createInstance()
    await i18n.init({ lng: language, fallbackLng: false, resources: {} })
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
    render(
      <I18nextProvider i18n={i18n}>
        <PaymentConfirmDialog
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          topupAmount={10.25}
          paymentAmount={72}
          paymentMethod={{ type: 'catfk', name: 'Alipay' }}
          calculating={false}
          processing={false}
          catfk={{
            quote: { ...quote, topup_amount: 10.25 },
            qq: '12345',
            onQQChange: vi.fn(),
            available: true,
          }}
        />
      </I18nextProvider>
    )
    expect(screen.getByText(/71[.,]75/)).toBeVisible()
    await act(() => i18n.changeLanguage('fr'))
    expect(screen.getByText(/^71,75\s¥$/)).toBeVisible()
    await act(() => i18n.changeLanguage('en'))
    expect(screen.getByText('¥71.75')).toBeVisible()
  }
)

it('requires a valid quote and ASCII QQ before confirmation', async () => {
  const confirm = vi.fn()
  function Payment() {
    const [qq, setQQ] = useState('')
    return (
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={confirm}
        topupAmount={10}
        paymentAmount={72}
        paymentMethod={{
          type: 'catfk_wxpay',
          channel_id: 'wechat',
          name: 'WeChat',
        }}
        calculating={false}
        processing={false}
        catfk={{ quote, qq, onQQChange: setQQ, available: true }}
      />
    )
  }
  const user = userEvent.setup()
  render(<Payment />)
  const button = screen.getByRole('button', { name: 'Confirm Payment' })
  const input = screen.getByRole('textbox', { name: /Contact method/ })
  expect(button).toBeDisabled()
  expect(input).toBeRequired()
  expect(input).toHaveAttribute('placeholder', 'Enter QQ number (5-12 digits)')
  expect(input).toHaveAttribute('inputmode', 'numeric')
  expect(input).toHaveClass('bg-muted/50', 'h-11')
  expect(input).toHaveAttribute('minlength', '5')
  expect(input).toHaveAttribute('maxlength', '12')
  await user.type(input, '1234')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(button).toBeDisabled()
  await user.clear(input)
  await user.type(input, '１２３')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(button).toBeDisabled()
  await user.clear(input)
  await user.type(input, '001234')
  expect(input).toHaveFocus()
  expect(input).toHaveAttribute('aria-invalid', 'false')
  expect(
    screen.queryByText(
      'Enter ASCII digits only. QQ is used for this payment, not as your account identity.'
    )
  ).not.toBeInTheDocument()
  expect(button).toBeEnabled()
  await user.click(button)
  expect(confirm).toHaveBeenCalledOnce()
  expect(screen.getByRole('alertdialog')).toBeVisible()
})
it.each([
  { calculating: true, valid: true, available: true },
  { calculating: false, valid: false, available: true },
  { calculating: false, valid: true, available: false },
])(
  'disables confirmation for incomplete, invalid or unavailable quotes: %j',
  (state) => {
    render(
      <PaymentConfirmDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        topupAmount={10}
        paymentAmount={72}
        paymentMethod={undefined}
        calculating={state.calculating}
        processing={false}
        catfk={{
          quote: state.valid ? quote : null,
          qq: '1234',
          onQQChange: vi.fn(),
          available: state.available,
        }}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Confirm Payment' })
    ).toBeDisabled()
  }
)
it('shows neither a resume button, an order status nor a QR code on the recharge card', () => {
  render(<RechargeFormCard {...base} />, { wrapper })
  expect(
    screen.queryByRole('button', { name: 'Resume payment' })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('img', { name: 'Payment QR code' })
  ).not.toBeInTheDocument()
})

function mockCatfkHistory(redemption: unknown) {
  return vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (String(url).endsWith('/redemption')) return { data: redemption }
    return {
      data: {
        success: true,
        data: {
          total: 5,
          items: [
            {
              id: 5,
              amount: 5000000,
              money: 72,
              trade_no: 'catfk-wxpay-order',
              payment_method: 'catfk_wxpay',
              payment_provider: 'catfk',
              status: 'success',
              create_time: 1,
            },
            {
              id: 4,
              amount: 5000000,
              money: 72,
              trade_no: 'catfk-alipay-order',
              payment_method: 'catfk_alipay',
              payment_provider: 'catfk',
              status: 'success',
              create_time: 1,
            },
            {
              id: 3,
              amount: 5000000,
              money: 72,
              trade_no: 'completed-catfk-order',
              payment_method: 'catfk',
              payment_provider: 'catfk',
              status: 'success',
              create_time: 1,
            },
            {
              id: 1,
              amount: 5000000,
              money: 72,
              trade_no: 'catfk-order',
              payment_method: 'catfk',
              payment_provider: 'catfk',
              status: 'pending',
              create_time: 1,
            },
            {
              id: 2,
              amount: 10,
              money: 72,
              trade_no: 'epay-order',
              payment_method: 'alipay',
              status: 'success',
              create_time: 1,
            },
          ],
        },
      },
    }
  })
}

it('labels Catfk payment channels separately while preserving legacy and regular methods', async () => {
  mockCatfkHistory({ success: true, data: {} })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })
  const dialog = await screen.findByRole('dialog')
  expect(await within(dialog).findByText('catfk Alipay')).toBeVisible()
  expect(within(dialog).getByText('catfk WeChat Pay')).toBeVisible()
  expect(within(dialog).getAllByText('Online Payment')).toHaveLength(2)
  expect(within(dialog).getByText('Alipay')).toBeVisible()
})

it('renders the currency image on both quota-based and USD-based order amounts', async () => {
  const imageUrl = 'https://assets.example.com/coin.svg'
  useSystemConfigStore.getState().setConfig(
    mapStatusDataToConfig({
      quota_display_type: 'CUSTOM',
      quota_per_unit: 500000,
      custom_currency_symbol: '¤',
      custom_currency_image_url: imageUrl,
      custom_currency_exchange_rate: 2,
    })
  )
  mockCatfkHistory({ success: true, data: {} })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })

  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByText('catfk-order')
  const symbols = within(dialog).getAllByRole('img', { name: '¤' })
  expect(symbols).toHaveLength(5)
  for (const symbol of symbols) {
    expect(symbol).toHaveAttribute('src', imageUrl)
  }
  expect(within(dialog).getAllByText('20')).toHaveLength(5)
  expect(dialog).not.toHaveTextContent(imageUrl)
})

it('offers a redemption code button on every Catfk history order and no status query', async () => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaPerUnit: 500000 },
  })
  mockCatfkHistory({ success: true, data: {} })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })
  await screen.findByText('catfk-order')
  expect(screen.getAllByText('$10')).toHaveLength(5)
  expect(
    screen.getAllByRole('button', { name: 'View redemption code' })
  ).toHaveLength(4)
  expect(
    screen.queryByRole('button', { name: 'Check status' })
  ).not.toBeInTheDocument()
})

it('shows the redeemed code of a completed Catfk order when its button is clicked', async () => {
  const get = mockCatfkHistory({
    success: true,
    data: {
      key: '0123456789abcdef0123456789abcdef',
      quota: 5000000,
      redeemed_time: 1,
    },
  })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })
  await screen.findByText('completed-catfk-order')
  await userEvent.click(
    screen.getAllByRole('button', { name: 'View redemption code' })[2]
  )
  const dialog = await screen.findByRole('dialog', { name: 'Redemption Code' })
  expect(
    await within(dialog).findByText('0123456789abcdef0123456789abcdef')
  ).toBeVisible()
  expect(
    within(dialog).getByRole('button', { name: 'Copy redemption code' })
  ).toBeVisible()
  expect(get).toHaveBeenCalledWith(
    '/api/user/catfk/orders/completed-catfk-order/redemption'
  )
})

it('explains that an unfinished Catfk order has no redemption code yet', async () => {
  mockCatfkHistory({
    success: false,
    message: 'Redemption code is not available yet',
    message_key: 'Redemption code is not available yet',
  })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })
  await screen.findByText('catfk-order')
  await userEvent.click(
    screen.getAllByRole('button', { name: 'View redemption code' })[1]
  )
  const dialog = await screen.findByRole('dialog', { name: 'Redemption Code' })
  expect(
    await within(dialog).findByText('Redemption code is not available yet')
  ).toBeVisible()
})

it('lists a wallet redemption in order history with its credited quota and no paid amount', async () => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaPerUnit: 500000 },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 1,
        items: [
          {
            id: 9,
            amount: 5000000,
            money: 0,
            trade_no: 'redemption:42',
            payment_method: 'redemption',
            payment_provider: 'redemption',
            status: 'success',
            create_time: 1,
          },
        ],
      },
    },
  })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })
  await screen.findByText('redemption:42')
  expect(screen.getByText('Redemption Code')).toBeVisible()
  expect(screen.getByText('$10')).toBeVisible()
  expect(screen.getByText('-')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'View redemption code' })
  ).not.toBeInTheDocument()
})

it('enables custom amounts and omits the QQ field in direct mode while hiding redemption codes for direct history records', async () => {
  const select = vi.fn()
  function DirectWallet() {
    const [amount, setAmount] = useState(15)
    const [preset, setPreset] = useState<number | null>(null)
    return (
      <RechargeFormCard
        {...base}
        topupAmount={amount}
        selectedPreset={preset}
        onSelectPreset={(next) => {
          setAmount(next.value)
          setPreset(next.value)
        }}
        onTopupAmountChange={(next) => {
          setAmount(next)
          setPreset(null)
        }}
        topupInfo={{
          ...topupInfo,
          min_topup: 5,
          pay_methods: [
            { type: 'catfk_wxpay', channel_id: 'wechat', name: 'WeChat' },
          ],
          catfk: {
            enabled: true,
            available: true,
            mode: 'direct',
            products: [],
            channels: [channel],
          },
        }}
        onCatfkPaymentSelect={select}
      />
    )
  }
  const user = userEvent.setup()
  render(<DirectWallet />)
  expect(
    screen.queryByText('Custom amounts are not supported')
  ).not.toBeInTheDocument()
  const methodButton = screen.getByRole('button', { name: 'WeChat' })
  expect(methodButton).toBeEnabled()
  await user.click(methodButton)
  expect(select).toHaveBeenCalledWith(channel, undefined, 15)

  const confirm = vi.fn()
  render(
    <PaymentConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={confirm}
      topupAmount={15}
      paymentAmount={108}
      paymentMethod={{ type: 'catfk', name: 'WeChat' }}
      calculating={false}
      processing={false}
      catfk={{
        quote: { ...quote, topup_amount: 15, amount: 108 },
        qq: '',
        onQQChange: vi.fn(),
        available: true,
        requireQQ: false,
      }}
    />
  )
  expect(
    screen.queryByRole('textbox', { name: /Contact method/ })
  ).not.toBeInTheDocument()
  const confirmBtn = screen.getByRole('button', { name: 'Confirm Payment' })
  expect(confirmBtn).toBeEnabled()
  await user.click(confirmBtn)
  expect(confirm).toHaveBeenCalledOnce()

  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        total: 2,
        items: [
          {
            id: 11,
            amount: 5000000,
            money: 72,
            trade_no: 'catfk-direct-history',
            payment_method: 'catfk_wxpay',
            payment_provider: 'catfk',
            catfk_mode: 'direct',
            status: 'success',
            create_time: 1,
          },
          {
            id: 12,
            amount: 5000000,
            money: 72,
            trade_no: 'catfk-redemption-history',
            payment_method: 'catfk_wxpay',
            payment_provider: 'catfk',
            catfk_mode: 'redemption',
            status: 'success',
            create_time: 1,
          },
        ],
      },
    },
  })
  render(<BillingHistoryDialog open onOpenChange={vi.fn()} />, { wrapper })
  await screen.findByText('catfk-direct-history')
  expect(
    screen.getAllByRole('button', { name: 'View redemption code' })
  ).toHaveLength(1)
})
