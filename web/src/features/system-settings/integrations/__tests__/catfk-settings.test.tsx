import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import {
  CatFKSettingsFields,
  type CatFKFormValues,
} from '../catfk-settings-fields'
import { CatFKSetupGuide } from '../catfk-setup-guide'
import { PaymentMethodDialog } from '../payment-method-dialog'
import { PaymentMethodsVisualEditor } from '../payment-methods-visual-editor'
import { PaymentSettingsSection } from '../payment-settings-section'

const defaults: CatFKFormValues = {
  CatFKEnabled: false,
  CatFKStoreToken: '',
  CatFKProducts: '[]',
  CatFKChannels: '[]',
}
function Fixture(props: { initial?: Partial<CatFKFormValues> }) {
  const [values, setValues] = useState({ ...defaults, ...props.initial })
  return (
    <CatFKSettingsFields
      values={values}
      complianceConfirmed
      onChange={(key, value) =>
        setValues((current) => ({ ...current, [key]: value }))
      }
    />
  )
}
function Wrapper(props: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  )
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}
afterEach(() => vi.restoreAllMocks())

test('store settings have a standalone tab and preserve edited fields when switching back to General', async () => {
  render(
    <PaymentSettingsSection
      defaultValues={{
        PayAddress: '',
        EpayId: '',
        EpayKey: '',
        Price: 1,
        MinTopUp: 1,
        CustomCallbackAddress: '',
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
        ...defaults,
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
      complianceDefaults={{
        confirmed: true,
        termsVersion: 'v1',
        confirmedAt: 0,
        confirmedBy: 1,
      }}
    />,
    { wrapper: Wrapper }
  )
  expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const storeTab = screen.getByRole('tab', {
    name: 'Catfk consignment store payments',
  })
  expect(storeTab).toHaveAttribute('aria-selected', 'false')
  expect(
    screen.queryByRole('button', { name: 'Store payment settings' })
  ).not.toBeInTheDocument()
  await userEvent.click(storeTab)
  expect(storeTab).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: 'Setup guide' })).toBeVisible()
  expect(screen.getByRole('tablist')).toHaveClass('min-w-max')
  await userEvent.keyboard('{ArrowLeft}{Enter}')
  expect(screen.getByRole('tab', { name: 'Creem' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await userEvent.keyboard('{ArrowRight}{Enter}')
  expect(storeTab).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('switch', { name: 'Enable Catfk' })).toBeVisible()
  await userEvent.type(screen.getByLabelText('CatFK store token'), 'my-shop')
  await userEvent.click(screen.getByRole('tab', { name: 'General' }))
  expect(
    screen.queryByRole('switch', { name: 'Enable Catfk' })
  ).not.toBeInTheDocument()
  await userEvent.click(storeTab)
  expect(screen.getByLabelText('CatFK store token')).toHaveValue('my-shop')
})

test('clicking Setup guide opens the token and goods key steps, links to the merchant console in a new tab, and Close dismisses it', async () => {
  const user = userEvent.setup()
  render(<CatFKSetupGuide />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Setup guide' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Catfk payment setup guide',
  })
  expect(
    within(dialog).getByRole('heading', { name: 'Get the store token' })
  ).toBeVisible()
  expect(
    within(dialog).getByRole('heading', { name: 'Add product mappings' })
  ).toBeVisible()
  const link = within(dialog).getByRole('link', {
    name: 'Open Catfk merchant console',
  })
  expect(link).toHaveAttribute('href', 'https://catfk.com/merchant')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})

test('adds an available Catfk Alipay method with its upstream channel binding', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <PaymentMethodDialog
      open
      onOpenChange={vi.fn()}
      onSave={save}
      catfkChannels={[
        { id: 'alipay-id', name: 'Alipay', icon: '', payment_type: 'alipay' },
        {
          id: 'wechat-id',
          name: 'WeChat Pay',
          icon: '',
          payment_type: 'wxpay',
        },
      ]}
    />
  )
  await user.click(screen.getByRole('combobox', { name: 'Payment type key' }))
  expect(
    await screen.findByRole('option', { name: /Epay: alipay/ })
  ).toBeVisible()
  expect(
    screen.getByRole('option', { name: /Catfk: catfk_wxpay/ })
  ).toBeVisible()
  await user.click(screen.getByRole('option', { name: /Catfk: catfk_alipay/ }))
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'Catfk Alipay'
  )
  expect(
    screen.queryByRole('spinbutton', { name: 'Display fee (%)' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'catfk_alipay',
      channel_id: 'alipay-id',
      name: 'Catfk Alipay',
      icon: 'SiAlipay',
    })
  )
})

test('keeps long payment identifiers visible in the selection popup', async () => {
  const user = userEvent.setup()
  render(
    <PaymentMethodDialog
      open
      onOpenChange={vi.fn()}
      onSave={vi.fn()}
      catfkChannels={[
        {
          id: 'long-channel-id',
          name: 'A payment channel with a deliberately long display name',
          icon: '',
          payment_type: 'alipay',
        },
      ]}
    />
  )

  await user.click(screen.getByRole('combobox', { name: 'Payment type key' }))
  const listbox = await screen.findByRole('listbox')
  const popup = listbox.closest<HTMLElement>('[data-slot="select-content"]')
  const option = within(listbox).getByRole('option', {
    name: /A payment channel with a deliberately long display name.*Catfk: catfk_alipay/,
  })

  expect(popup).toBeInTheDocument()
  if (!popup) throw new Error('Payment type popup was not rendered')
  expect(popup).toHaveClass(
    'w-[min(28rem,calc(100vw-2rem))]',
    'max-w-[calc(100vw-2rem)]'
  )
  expect(option).toHaveClass(
    '[&_[data-slot=select-item-text]]:break-words',
    '[&_[data-slot=select-item-text]]:whitespace-normal'
  )
  expect(option).toBeVisible()
})

test('only offers Catfk payment identifiers returned by channel discovery', async () => {
  const user = userEvent.setup()
  render(
    <PaymentMethodDialog
      open
      onOpenChange={vi.fn()}
      onSave={vi.fn()}
      catfkChannels={[
        {
          id: 'wechat-id',
          name: 'WeChat Pay',
          icon: '',
          payment_type: 'wxpay',
        },
      ]}
    />
  )

  await user.click(screen.getByRole('combobox', { name: 'Payment type key' }))
  expect(
    await screen.findByRole('option', { name: /Catfk: catfk_wxpay/ })
  ).toBeVisible()
  expect(
    screen.queryByRole('option', { name: /Catfk: catfk_alipay/ })
  ).not.toBeInTheDocument()
})

test('configures and saves a per-method display fee for Epay payments', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(<PaymentMethodDialog open onOpenChange={vi.fn()} onSave={save} />)

  await user.click(screen.getByRole('combobox', { name: 'Payment type key' }))
  await user.click(await screen.findByRole('option', { name: /Epay: alipay/ }))
  const fee = screen.getByRole('spinbutton', { name: 'Display fee (%)' })
  expect(fee).toHaveValue(0)
  await user.clear(fee)
  await user.type(fee, '2.5')
  await user.click(screen.getByRole('button', { name: 'Add' }))

  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'alipay', fee_percent: '2.5' })
  )
})

test('the General payment method editor keeps store payments as a normal method without embedding gateway configuration', () => {
  render(<PaymentMethodsVisualEditor value='[]' onChange={vi.fn()} />)
  expect(
    screen.queryByRole('button', { name: 'Store payment settings' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('switch', { name: 'Enable Catfk' })
  ).not.toBeInTheDocument()
})

test('adding, editing and confirming deletion update the visible mapping while preserving its stable ID', async () => {
  const user = userEvent.setup()
  render(<Fixture />, { wrapper: Wrapper })
  await user.click(screen.getByRole('button', { name: 'Add product' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Stable product ID' }),
    'basic'
  )
  await user.type(
    screen.getByRole('textbox', { name: 'Product Name' }),
    'Basic'
  )
  await user.type(
    screen.getByRole('textbox', { name: 'CatFK goods key' }),
    'goods-basic'
  )
  const amount = screen.getByRole('spinbutton', {
    name: 'Expected credited balance (USD)',
  })
  await user.clear(amount)
  await user.type(amount, '12.5')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Basic (basic)')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Edit CatFK product Basic' })
  )
  expect(
    screen.getByRole('textbox', { name: 'Stable product ID' })
  ).toBeDisabled()
  expect(
    screen.getByRole('spinbutton', { name: 'Expected credited balance (USD)' })
  ).toHaveValue(12.5)
  await user.clear(screen.getByRole('textbox', { name: 'Product Name' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Product Name' }),
    'Updated'
  )
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Updated (basic)')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Delete CatFK product Updated' })
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete',
    })
  )
  expect(await screen.findByText('No CatFK products configured')).toBeVisible()
})

test('reading Catfk channels persists the complete returned channel snapshot without selection controls', async () => {
  const channels = [
    { id: 'a', name: 'Alipay', icon: '', payment_type: 'alipay' },
    { id: 'w', name: 'WeChat Pay', icon: '', payment_type: 'wxpay' },
  ]
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: channels },
  })
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(
    <CatFKSettingsFields
      values={defaults}
      complianceConfirmed
      onChange={onChange}
    />,
    { wrapper: Wrapper }
  )
  await user.click(screen.getByRole('button', { name: 'Read Catfk channels' }))
  expect(await screen.findByText('catfk_wxpay')).toBeVisible()
  expect(screen.getByText('catfk_alipay')).toBeVisible()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(onChange).toHaveBeenCalledWith(
    'CatFKChannels',
    JSON.stringify(channels)
  )
})

test('a successful channel read clears the snapshot when Catfk returns no channels', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: [] },
  })
  const onChange = vi.fn()
  const user = userEvent.setup()
  render(
    <CatFKSettingsFields
      values={{
        ...defaults,
        CatFKChannels: JSON.stringify([{ id: 'old', name: 'Old', icon: '' }]),
      }}
      complianceConfirmed
      onChange={onChange}
    />,
    { wrapper: Wrapper }
  )
  await user.click(screen.getByRole('button', { name: 'Read Catfk channels' }))
  expect(await screen.findByText('No Catfk channels returned')).toBeVisible()
  expect(onChange).toHaveBeenCalledWith('CatFKChannels', '[]')
})

test('an old channel response cannot populate channels after an external token reset', async () => {
  let resolvePending!: (value: {
    data: {
      success: boolean
      data: { id: string; name: string; icon: string }[]
    }
  }) => void
  const pending = new Promise<{
    data: {
      success: boolean
      data: { id: string; name: string; icon: string }[]
    }
  }>((resolve) => {
    resolvePending = resolve
  })
  vi.spyOn(api, 'post').mockReturnValue(pending)
  const user = userEvent.setup()
  const view = render(
    <CatFKSettingsFields
      values={{ ...defaults, CatFKStoreToken: 'old' }}
      complianceConfirmed
      onChange={() => undefined}
    />,
    { wrapper: Wrapper }
  )
  await user.click(screen.getByRole('button', { name: 'Read Catfk channels' }))
  expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
  view.rerender(
    <CatFKSettingsFields
      values={{ ...defaults, CatFKStoreToken: 'new' }}
      complianceConfirmed
      onChange={() => undefined}
    />
  )
  await act(async () =>
    resolvePending({
      data: {
        success: true,
        data: [{ id: 'old', name: 'Old channel', icon: '' }],
      },
    })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Read Catfk channels' })
    ).toBeEnabled()
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('a protocol failure is displayed without inventing available channels', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'CatFK protocol is not verified' },
  })
  const notice = vi.spyOn(toast, 'error').mockImplementation(() => 'test')
  const user = userEvent.setup()
  render(<Fixture />, { wrapper: Wrapper })
  await user.click(screen.getByRole('button', { name: 'Read Catfk channels' }))
  await waitFor(() =>
    expect(notice).toHaveBeenCalledWith('CatFK protocol is not verified')
  )
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(
    screen.queryByText(/provider protocol has not been verified/)
  ).not.toBeInTheDocument()
})

test('invalid persisted mappings block edits and an unconfirmed account cannot enable CatFK', () => {
  render(
    <CatFKSettingsFields
      values={{ ...defaults, CatFKProducts: 'null' }}
      complianceConfirmed={false}
      onChange={() => undefined}
    />,
    { wrapper: Wrapper }
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Invalid CatFK mapping configuration'
  )
  expect(screen.getByRole('button', { name: 'Add product' })).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'Enable Catfk' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
})
