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
import { useState } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import {
  JingSoftSettingsFields,
  type JingSoftFormValues,
} from '../jingsoft-settings-fields'
import { JingSoftSetupGuide } from '../jingsoft-setup-guide'
import { PaymentMethodDialog } from '../payment-method-dialog'
import { PaymentMethodsVisualEditor } from '../payment-methods-visual-editor'
import { PaymentSettingsSection } from '../payment-settings-section'

const defaults: JingSoftFormValues = {
  JingSoftEnabled: false,
  JingSoftBaseURL: 'https://wzyp.cn',
  JingSoftStoreToken: '',
  JingSoftProducts: '[]',
  JingSoftChannels: '[]',
}
function Fixture(props: {
  initial?: Partial<JingSoftFormValues>
  presetOptions?: number[]
  priceRatio?: number
}) {
  const [values, setValues] = useState({ ...defaults, ...props.initial })
  return (
    <JingSoftSettingsFields
      values={values}
      complianceConfirmed
      presetOptions={props.presetOptions}
      priceRatio={props.priceRatio}
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

test('store settings have a standalone JingSoft tab and preserve edited fields when switching back to General', async () => {
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
        JingSoftBaseURL: '',
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
    name: 'JingSoft consignment store payments',
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
  expect(screen.getByRole('switch', { name: 'Enable JingSoft' })).toBeVisible()
  await userEvent.type(
    screen.getByLabelText('JingSoft platform URL'),
    'https://wzyp.cn'
  )
  await userEvent.type(screen.getByLabelText('JingSoft store token'), 'my-shop')
  await userEvent.click(screen.getByRole('tab', { name: 'General' }))
  expect(
    screen.queryByRole('switch', { name: 'Enable JingSoft' })
  ).not.toBeInTheDocument()
  await userEvent.click(storeTab)
  expect(screen.getByLabelText('JingSoft platform URL')).toHaveValue(
    'https://wzyp.cn'
  )
  expect(screen.getByLabelText('JingSoft store token')).toHaveValue('my-shop')
})

test('clicking Setup guide opens the platform URL, token and goods key steps, links to the configured merchant console, and Close dismisses it', async () => {
  const user = userEvent.setup()
  render(<JingSoftSetupGuide baseUrl='https://wzyp.cn' />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Setup guide' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'JingSoft payment setup guide',
  })
  expect(
    within(dialog).getByRole('heading', {
      name: 'Configure platform URL & test compatibility',
    })
  ).toBeVisible()
  expect(
    within(dialog).getByRole('heading', { name: 'Get the store token' })
  ).toBeVisible()
  expect(
    within(dialog).getByRole('heading', { name: 'Add product mappings' })
  ).toBeVisible()
  const link = within(dialog).getByRole('link', {
    name: 'Open JingSoft merchant console',
  })
  expect(link).toHaveAttribute('href', 'https://wzyp.cn/merchant')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})

test('pasting a full store link splits platform URL and store token, and Test compatibility verifies the storefront', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        compatible: true,
        base_url: 'https://wzyp.cn',
        protocol_verified: true,
        store_verified: true,
        shop_name: 'MyShop',
        channel_count: 3,
        supported_channel_count: 2,
        product_count: 4,
        merchant_token_checked: false,
        merchant_token_valid: false,
        message_key: 'JingSoft store compatibility verified',
      },
    },
  })
  vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()
  render(<Fixture initial={{ JingSoftBaseURL: '' }} />, { wrapper: Wrapper })

  const testBtn = screen.getByRole('button', { name: 'Test compatibility' })
  expect(testBtn).toBeDisabled()

  await user.type(
    screen.getByLabelText('JingSoft platform URL'),
    'https://wzyp.cn/shop/MyShop'
  )
  expect(testBtn).toBeEnabled()

  await user.click(testBtn)
  expect(screen.getByLabelText('JingSoft platform URL')).toHaveValue(
    'https://wzyp.cn'
  )
  expect(screen.getByLabelText('JingSoft store token')).toHaveValue('MyShop')
  expect(post).toHaveBeenCalledWith('/api/option/jingsoft/compatibility/check', {
    base_url: 'https://wzyp.cn',
    store_token: 'MyShop',
    merchant_token: '',
  })
  expect(
    await screen.findByText(
      'Compatible JingSoft store "MyShop" (2 payment channels, 4 card products)'
    )
  ).toBeVisible()
})

test('Mode 1 Auto-detect store products infers expected USD credit from General options and imports compatible items in one click', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          goods_key: 'card_10',
          name: '10 USD Card',
          price_cny: '72.00',
          stock_count: 12,
          in_stock: true,
          compatible: true,
        },
        {
          goods_key: 'card_20',
          name: 'Recharge Tier',
          price_cny: '144.00',
          stock_count: 5,
          in_stock: true,
          compatible: true,
        },
        {
          goods_key: 'bad_card',
          name: 'Email Only Card',
          price_cny: '36.00',
          stock_count: 0,
          in_stock: false,
          compatible: false,
        },
      ],
    },
  })
  vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()
  render(
    <Fixture
      initial={{ JingSoftStoreToken: 'MyShop' }}
      presetOptions={[5, 10, 20]}
      priceRatio={7.2}
    />,
    { wrapper: Wrapper }
  )

  await user.click(
    screen.getByRole('button', { name: 'Auto-detect store products' })
  )
  expect(post).toHaveBeenCalledWith('/api/option/jingsoft/products/discover', {
    base_url: 'https://wzyp.cn',
    store_token: 'MyShop',
  })

  expect(await screen.findByText('Check contact format')).toBeVisible()
  const importMatchedBtn = screen.getByRole('button', {
    name: 'Import matched (2)',
  })
  await user.click(importMatchedBtn)

  expect(await screen.findByText('10 USD Card (card_10)')).toBeVisible()
  expect(screen.getByText('Recharge Tier (card_20)')).toBeVisible()
  expect(
    screen.queryByText('Email Only Card (bad_card)')
  ).not.toBeInTheDocument()
})

test('adds an available JingSoft Alipay method with its upstream channel binding', async () => {
  const user = userEvent.setup()
  const save = vi.fn()
  render(
    <PaymentMethodDialog
      open
      onOpenChange={vi.fn()}
      onSave={save}
      jingSoftChannels={[
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
    screen.getByRole('option', { name: /JingSoft: jingsoft_wxpay/ })
  ).toBeVisible()
  await user.click(
    screen.getByRole('option', { name: /JingSoft: jingsoft_alipay/ })
  )
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
    'JingSoft Alipay'
  )
  expect(
    screen.queryByRole('spinbutton', { name: 'Display fee (%)' })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add' }))
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'jingsoft_alipay',
      channel_id: 'alipay-id',
      name: 'JingSoft Alipay',
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
      jingSoftChannels={[
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
    name: /A payment channel with a deliberately long display name.*JingSoft: jingsoft_alipay/,
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

test('only offers JingSoft payment identifiers returned by channel discovery', async () => {
  const user = userEvent.setup()
  render(
    <PaymentMethodDialog
      open
      onOpenChange={vi.fn()}
      onSave={vi.fn()}
      jingSoftChannels={[
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
    await screen.findByRole('option', { name: /JingSoft: jingsoft_wxpay/ })
  ).toBeVisible()
  expect(
    screen.queryByRole('option', { name: /JingSoft: jingsoft_alipay/ })
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
    screen.queryByRole('switch', { name: 'Enable JingSoft' })
  ).not.toBeInTheDocument()
})

test('adding via pasted /item/ link auto-generates stable ID, selects preset chip, edits and confirms deletion', async () => {
  const user = userEvent.setup()
  render(<Fixture presetOptions={[10, 20]} />, { wrapper: Wrapper })
  await user.click(screen.getByRole('button', { name: 'Add product' }))
  await user.type(
    screen.getByRole('textbox', { name: 'JingSoft goods key' }),
    'https://wzyp.cn/item/tier_20/'
  )
  expect(
    screen.getByRole('textbox', { name: 'Stable product ID' })
  ).toHaveValue('tier_20')
  await user.type(
    screen.getByRole('textbox', { name: 'Product Name' }),
    'Basic'
  )
  expect(
    screen.getByRole('textbox', { name: 'JingSoft goods key' })
  ).toHaveValue('tier_20')
  await user.click(screen.getByRole('button', { name: '$20' }))
  expect(
    screen.getByRole('spinbutton', { name: 'Expected credited balance (USD)' })
  ).toHaveValue(20)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Basic (tier_20)')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Edit JingSoft product Basic' })
  )
  expect(
    screen.getByRole('textbox', { name: 'Stable product ID' })
  ).toBeDisabled()
  expect(
    screen.getByRole('spinbutton', { name: 'Expected credited balance (USD)' })
  ).toHaveValue(20)
  await user.clear(screen.getByRole('textbox', { name: 'Product Name' }))
  await user.type(
    screen.getByRole('textbox', { name: 'Product Name' }),
    'Updated'
  )
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Updated (tier_20)')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Delete JingSoft product Updated' })
  )
  await user.click(
    within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Delete',
    })
  )
  expect(await screen.findByText('No JingSoft products configured')).toBeVisible()
})

function PaymentSectionWithSave(props: {
  defaultOverrides?: Partial<
    React.ComponentProps<typeof PaymentSettingsSection>['defaultValues']
  >
}) {
  const [actionsContainer, setActionsContainer] =
    useState<HTMLDivElement | null>(null)
  return (
    <div>
      <div ref={setActionsContainer} />
      <SettingsPageProvider actionsContainer={actionsContainer}>
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
            JingSoftBaseURL: '',
            ...props.defaultOverrides,
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
        />
      </SettingsPageProvider>
    </div>
  )
}

test('saving JingSoft settings automatically reads and persists available channels without a manual read button', async () => {
  const channels = [
    { id: 'a', name: 'Alipay', icon: '', payment_type: 'alipay' },
    { id: 'w', name: 'WeChat Pay', icon: '', payment_type: 'wxpay' },
  ]
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: channels },
  })
  const put = vi.spyOn(api, 'put').mockResolvedValue({
    data: { success: true, message: '' },
  })
  vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()

  render(<PaymentSectionWithSave />, { wrapper: Wrapper })

  await user.click(
    screen.getByRole('tab', { name: 'JingSoft consignment store payments' })
  )
  expect(
    screen.queryByRole('button', { name: 'Read JingSoft channels' })
  ).not.toBeInTheDocument()

  await user.type(
    screen.getByLabelText('JingSoft platform URL'),
    'https://wzyp.cn'
  )
  await user.type(screen.getByLabelText('JingSoft store token'), 'MyShop')
  await user.click(screen.getByRole('button', { name: 'Save all settings' }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/option/jingsoft/channels', {
      base_url: 'https://wzyp.cn',
      store_token: 'MyShop',
    })
  )
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/api/option/', {
      key: 'jingsoft_setting.channels',
      value: JSON.stringify(channels),
    })
  )
  expect(await screen.findByText('jingsoft_wxpay')).toBeVisible()
  expect(screen.getByText('jingsoft_alipay')).toBeVisible()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
})

test('saving non-JingSoft settings on the General tab does not trigger JingSoft channel discovery', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: [] },
  })
  const put = vi.spyOn(api, 'put').mockResolvedValue({
    data: { success: true, message: '' },
  })
  vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()

  render(
    <PaymentSectionWithSave
      defaultOverrides={{ JingSoftBaseURL: 'https://wzyp.cn' }}
    />,
    { wrapper: Wrapper }
  )

  const priceInput = screen.getByLabelText('Price (local currency / USD)')
  await user.type(priceInput, '2')
  await user.click(screen.getByRole('button', { name: 'Save all settings' }))

  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/api/option/', {
      key: 'Price',
      value: 12,
    })
  )
  expect(post).not.toHaveBeenCalledWith(
    '/api/option/jingsoft/channels',
    expect.anything()
  )
})

test('a channel auto-read failure on save shows the error while still saving edited JingSoft fields', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: false, message: 'JingSoft protocol is not verified' },
  })
  const put = vi.spyOn(api, 'put').mockResolvedValue({
    data: { success: true, message: '' },
  })
  const errorNotice = vi.spyOn(toast, 'error').mockImplementation(() => 'err')
  vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()

  render(<PaymentSectionWithSave />, { wrapper: Wrapper })

  await user.click(
    screen.getByRole('tab', { name: 'JingSoft consignment store payments' })
  )
  await user.type(
    screen.getByLabelText('JingSoft platform URL'),
    'https://wzyp.cn'
  )
  await user.click(screen.getByRole('button', { name: 'Save all settings' }))

  await waitFor(() =>
    expect(errorNotice).toHaveBeenCalledWith(
      'JingSoft protocol is not verified'
    )
  )
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/api/option/', {
      key: 'jingsoft_setting.base_url',
      value: 'https://wzyp.cn',
    })
  )
})

test('invalid persisted mappings block edits and an unconfirmed account cannot enable JingSoft', () => {
  render(
    <JingSoftSettingsFields
      values={{ ...defaults, JingSoftProducts: 'null' }}
      complianceConfirmed={false}
      onChange={() => undefined}
    />,
    { wrapper: Wrapper }
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Invalid JingSoft mapping configuration'
  )
  expect(screen.getByRole('button', { name: 'Add product' })).toBeDisabled()
  expect(screen.getByRole('switch', { name: 'Enable JingSoft' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
})

test('switching to direct-credit mode configures slots without losing product mappings and rejects overlapping keys', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: { reset_count: 1 } },
  })
  const notice = vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()
  const existingProducts = JSON.stringify([
    { id: 'ten', name: 'Ten', goods_key: 'redeem-key', amount: 10 },
  ])
  let latestValues: JingSoftFormValues = {
    ...defaults,
    JingSoftProducts: existingProducts,
  }
  function ModeFixture() {
    const [values, setValues] = useState<JingSoftFormValues>(latestValues)
    latestValues = values
    return (
      <JingSoftSettingsFields
        values={values}
        complianceConfirmed
        onChange={(key, value) =>
          setValues((current) => ({ ...current, [key]: value }))
        }
      />
    )
  }
  render(<ModeFixture />, { wrapper: Wrapper })
  expect(screen.getByText('Ten (ten)')).toBeVisible()

  await user.click(
    screen.getByRole('combobox', { name: 'JingSoft settlement mode' })
  )
  await user.click(
    await screen.findByRole('option', {
      name: 'Direct-credit & auto-restock mode',
    })
  )

  expect(screen.getByLabelText('JingSoft merchant token')).toBeVisible()
  const slotInput = screen.getByRole('textbox', {
    name: 'Direct-credit slot goods key',
  })

  // Overlapping with redemption product goods_key is blocked.
  await user.type(slotInput, 'redeem-key')
  await user.click(screen.getByRole('button', { name: 'Add slot' }))
  expect(
    screen.getByText(
      'Direct-credit slot keys cannot overlap with redemption product keys'
    )
  ).toBeVisible()

  // Valid item URL normalizes to goods_key and can be removed.
  await user.clear(slotInput)
  await user.type(slotInput, 'https://wzyp.cn/item/direct-slot-1/')
  await user.click(screen.getByRole('button', { name: 'Add slot' }))
  expect(screen.getByText('direct-slot-1')).toBeVisible()
  expect(latestValues.JingSoftProducts).toBe(existingProducts)
  expect(latestValues.JingSoftDirectGoodsKeys).toBe('["direct-slot-1"]')

  await user.click(
    screen.getByRole('button', { name: 'Reset quarantined slots' })
  )
  await waitFor(() =>
    expect(notice).toHaveBeenCalledWith('Quarantined slots have been reset')
  )

  // Switching to auto fallback mode shows both direct slots and fallback product mappings.
  await user.click(
    screen.getByRole('combobox', { name: 'JingSoft settlement mode' })
  )
  await user.click(
    await screen.findByRole('option', {
      name: 'Auto fallback mode (direct first, fallback to redemption)',
    })
  )
  expect(latestValues.JingSoftMode).toBe('auto')
  expect(screen.getByText('direct-slot-1')).toBeVisible()
  expect(screen.getByText('Ten (ten)')).toBeVisible()

  const maxAmountInput = screen.getByRole('spinbutton', {
    name: 'Max single payment (CNY)',
  })
  const rateLimitInput = screen.getByRole('spinbutton', {
    name: 'Order rate limit (per minute)',
  })
  expect(maxAmountInput).toHaveValue(5000)
  expect(rateLimitInput).toHaveValue(15)
  await user.clear(maxAmountInput)
  await user.type(maxAmountInput, '2000')
  await user.clear(rateLimitInput)
  await user.type(rateLimitInput, '10')
  expect(latestValues.JingSoftMaxAmountCNY).toBe(2000)
  expect(latestValues.JingSoftMaxOrdersPerMinute).toBe(10)
})

test('Mode 2 Auto-detect hidden slots filters overlapping keys, highlights incompatible items, and adds compatible hidden slots', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          goods_key: 'slot_a',
          name: 'Hidden Slot A',
          price_cny: '1.00',
          stock_count: 15,
          in_stock: true,
          contact_format: 'any',
          compatible: true,
        },
        {
          goods_key: 'slot_b',
          name: 'Hidden Slot B',
          price_cny: '1.00',
          stock_count: 0,
          in_stock: false,
          contact_format: 'any',
          compatible: true,
        },
        {
          goods_key: 'slot_qq',
          name: 'Hidden QQ Slot',
          price_cny: '1.00',
          stock_count: 5,
          in_stock: true,
          contact_format: 'qq',
          compatible: false,
        },
        {
          goods_key: 'redeem-key',
          name: 'Overlapping Redemption',
          price_cny: '72.00',
          stock_count: 5,
          in_stock: true,
          contact_format: 'any',
          compatible: true,
        },
      ],
    },
  })
  vi.spyOn(toast, 'success').mockImplementation(() => 'ok')
  const user = userEvent.setup()
  render(
    <Fixture
      initial={{
        JingSoftMode: 'direct',
        JingSoftMerchantToken: 'merchant-secret',
        JingSoftProducts: JSON.stringify([
          { id: 'ten', name: 'Ten', goods_key: 'redeem-key', amount: 10 },
        ]),
      }}
    />,
    { wrapper: Wrapper }
  )

  await user.click(
    screen.getByRole('button', { name: 'Auto-detect hidden slots' })
  )
  expect(post).toHaveBeenCalledWith('/api/option/jingsoft/slots/discover', {
    base_url: 'https://wzyp.cn',
    merchant_token: 'merchant-secret',
  })

  expect(await screen.findByText('Contact format must be Any')).toBeVisible()
  expect(screen.queryByText('Overlapping Redemption')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Add compatible (2)' }))
  expect(screen.getByText('slot_a')).toBeVisible()
  expect(screen.getByText('slot_b')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Remove direct slot slot_qq' })).not.toBeInTheDocument()
})
