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
import { createInstance } from 'i18next'
import { expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

const resources = { en, zh, 'zh-TW': zhTW, fr, ja, ru, vi }

it.each(Object.entries(resources))(
  'resolves JingSoft gateway labels and validation from the translation namespace in %s without any legacy catfk or yunmao strings',
  async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { [language]: resource, en },
    })
    for (const key of [
      'Enable JingSoft',
      'JingSoft platform URL',
      'Test compatibility',
      'JingSoft store compatibility verified',
      'JingSoft store token',
      'JingSoft product mappings',
      'Auto-detect store products',
      'Auto-detect hidden slots',
      'Detected hidden card products',
      'Contact format must be Any',
      'Product must be on sale',
      'Check contact format',
      'JingSoft channels synced',
      'Channels are refreshed automatically when you save settings. Enable them by adding the matching payment methods in General.',
      'No JingSoft channels synced yet. Save settings to read available channels.',
      'Expected credited balance (USD)',
      'JingSoft product IDs must be unique',
      'Cancel payment',
      'Open Alipay to pay',
      'Waiting for payment confirmation',
      'Payment QR code',
      'Scan with Alipay to pay',
      'Scan with WeChat to pay',
      'Save QR code',
      'Save the QR code, then scan it from your photo album in WeChat',
      'View redemption code',
      'The code redeemed for this order',
      'Redemption code unavailable',
      'Redemption code is not available yet',
      'Payment successful',
      'Includes a {{rate}}% fee ({{fee}})',
      'Unable to check payment status. Retrying automatically.',
      'Contact method',
      'Enter QQ number (5-12 digits)',
      'Custom amounts are not supported',
      'JingSoft consignment store payments',
      'JingSoft payment setup guide',
      'Open JingSoft merchant console',
      'JingSoft available channels',
      'JingSoft Alipay',
      'JingSoft WeChat Pay',
      'Select payment type',
      'Custom Epay payment identifier',
      'Payment method display name',
      'Choose the payment provider.',
      'Custom Epay payment type key',
      'Enter payment type key',
      'Icon name or HTTPS image URL',
      'JingSoft payment identifiers must use the verified channel list',
      'JingSoft settlement mode',
      'JingSoft merchant token',
      'Direct-credit & auto-restock mode',
      'Redemption-code verification mode',
      'Auto fallback mode (direct first, fallback to redemption)',
      'Check merchant token',
      'JingSoft merchant token is valid',
      'JingSoft merchant token is invalid or expired',
      'Custom amounts are temporarily unavailable, please select a preset amount',
      'Direct-credit slot goods keys',
      'Reset quarantined slots',
      'Quarantined slots have been reset',
      'JingSoft payment channel is busy, please try again shortly',
      'Too many JingSoft payment requests, please try again shortly',
      'JingSoft single payment cannot exceed ¥{{amount}}',
      'Max single payment (CNY)',
      'Order rate limit (per minute)',
      'Maximum new JingSoft orders allowed per user or IP per minute.',
      'JingSoft quote is invalid or expired',
      'JingSoft order is unavailable',
      'Copy the part of the store link after /shop/ and paste it into the store token field. You can also paste the full store link.',
      'Paste either the goods key or the full product URL; the key and ID are recognized automatically.',
      'Match each product’s expected credited balance (USD) to an amount option in General. Use the balance value, not the CNY selling price or converted display amount. Unmatched presets cannot use this payment method.',
    ]) {
      expect(i18n.exists(key, { lng: language })).toBe(true)
      const translated = i18n.t(key)
      expect(translated).not.toMatch(/catfk|云猫|雲貓|雲猫|Yunmao|Cloud Cat/i)
      if (language !== 'en') expect(translated).not.toBe(key)
    }
    for (const [entryKey, value] of Object.entries(resource.translation)) {
      expect(entryKey).not.toMatch(/catfk|云猫|雲貓|雲猫|Yunmao|Cloud Cat/i)
      expect(String(value)).not.toMatch(/catfk|云猫|雲貓|雲猫|Yunmao|Cloud Cat/i)
    }
  }
)

it('shows exact JingSoft casing in Chinese and English and switches gateway labels with the language', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'zh', fallbackLng: 'en', resources })
  expect(i18n.t('Cancel payment')).toBe('取消支付')
  expect(i18n.t('Open Alipay to pay')).toBe('打开支付宝付款')
  expect(i18n.t('Waiting for payment confirmation')).toBe('等待付款确认')
  expect(i18n.t('Scan with Alipay to pay')).toBe('请使用支付宝扫码支付')
  expect(i18n.t('Scan with WeChat to pay')).toBe('请使用微信扫码支付')
  expect(i18n.t('Save QR code')).toBe('保存二维码')
  expect(i18n.t('View redemption code')).toBe('查看兑换码')
  expect(i18n.t('Payment successful')).toBe('支付成功')
  expect(
    i18n.t('Includes a {{rate}}% fee ({{fee}})', { rate: '1.8', fee: '0.18' })
  ).toBe('含 1.8% 手续费（0.18）')
  expect(i18n.t('Contact method')).toBe('联系方式')
  expect(i18n.t('Enter QQ number (5-12 digits)')).toBe(
    '请输入QQ号（5-12位数字）'
  )
  expect(i18n.t('Custom amounts are not supported')).toBe('不支持自定义金额')
  expect(i18n.t('Enable JingSoft')).toBe('启用 JingSoft 支付')
  expect(i18n.t('JingSoft consignment store payments')).toBe('JingSoft 店铺支付')
  expect(i18n.t('JingSoft payment setup guide')).toBe('JingSoft 支付设置指南')
  expect(i18n.t('JingSoft Alipay')).toBe('JingSoft 支付宝')
  expect(i18n.t('JingSoft WeChat Pay')).toBe('JingSoft 微信支付')
  expect(i18n.t('Test compatibility')).toBe('测试兼容')
  expect(i18n.t('Auto-detect store products')).toBe('自动识别店铺商品')
  expect(i18n.t('Select payment type')).toBe('请选择支付处理标识')
  await i18n.changeLanguage('en')
  expect(i18n.t('Enable JingSoft')).toBe('Enable JingSoft payments')
  await i18n.changeLanguage('zh-TW')
  expect(i18n.t('Custom amounts are not supported')).toBe('不支援自訂金額')
})
