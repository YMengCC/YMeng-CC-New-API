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

import en from '../locales/en.json'
import fr from '../locales/fr.json'
import ja from '../locales/ja.json'
import ru from '../locales/ru.json'
import vi from '../locales/vi.json'
import zhTW from '../locales/zh-TW.json'
import zhCN from '../locales/zh.json'

const resources = { en, zhCN, zhTW, fr, ru, ja, vi }

const regionNoticeKeys = [
  'Model availability in your region',
  'We detected you are accessing from a mainland China network. Below are the models you can use now and the ones available only to overseas networks.',
  'This API service is strictly limited to personal learning and technical research use. Please do not use it for any commercial or illegal purpose.',
  'Do not remind today',
  'I understand',
  'Available now',
  'Overseas only',
  'Total models',
  'Search model names',
  'Available to you now ({{count}})',
  'No matching available models',
  'Overseas networks only ({{count}})',
  'The following models belong to groups that are not opened to mainland China networks. An overseas network environment is required to use them in the web interface.',
  'No matching restricted models',
]

const siteSettingsKeys = [
  'Mainland IP Web Visibility',
  'Enable Mainland IP UI filtering',
  'When enabled, Mainland China users only see the selected groups in the web interface. Model API calls are never restricted.',
  'Groups allowed for Mainland IPs',
  'Select allowed groups',
  'The list controls web visibility only. An empty list hides every model group from Mainland China users; API Key calls remain unaffected.',
  'Save IP visibility settings',
  'Affiliate Commission',
  'Commission is settled after each successful billing: the inviter receives the configured percentage of the invitee consumption. Amounts below one quota unit are carried over to the next settlement.',
  'Enable affiliate commission',
  'When disabled, no new commission is settled. Existing balances and history stay untouched.',
  'Commission rate (%)',
  'Percentage of the invitee consumption credited to the inviter. Allowed range is 0 to 100.',
  'Save affiliate settings',
  'Navigation order',
  'Drag items or use the arrow buttons to change their order.',
  '{{enabled}} / {{limit}} enabled',
  'Drag to reorder',
  'Custom navigation link',
  'Custom link to a site page or external URL.',
  'Navigation name',
  'For example: Community',
  'Jump link',
  'Use a site path beginning with / or a complete HTTP(S) URL.',
  '/page or https://example.com',
  'Move up',
  'Move down',
  'Delete custom navigation link',
  'Add custom navigation link',
  'Save navigation',
]

const prefillGroupKeys = [
  'Model Group',
  'Reusable sets of models you can attach to channels.',
  'Tag Group',
  'Collections of metadata tags for bulk operations.',
  'Endpoint Group',
  'HTTP endpoint mappings shared across providers.',
  'Group Type',
  'No description provided',
  'Items',
  'No endpoint mappings configured.',
  'No items configured yet.',
  '+{{count}} more',
  '{{count}} item',
  '{{count}} items',
]

it.each(Object.entries(resources))(
  'translates region notice, settings, and prefill group text in %s',
  async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { [language]: resource, en },
    })

    for (const key of [
      ...regionNoticeKeys,
      ...siteSettingsKeys,
      ...prefillGroupKeys,
    ]) {
      expect(i18n.exists(key, { lng: language })).toBe(true)
      if (language !== 'en') {
        expect(i18n.t(key)).not.toBe(i18n.t(key, { lng: 'en' }))
      }
    }
  }
)

it.each(Object.entries(resources))(
  'resolves invoice submission and available commission in %s',
  async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { [language]: resource, en },
    })

    for (const key of ['Submit invoice application', 'Available commission']) {
      expect(i18n.exists(key, { lng: language })).toBe(true)
      if (language !== 'en') expect(i18n.t(key)).not.toBe(key)
    }
  }
)

it.each(Object.entries(resources))(
  'translates the model pricing issue badge setting in %s',
  async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { [language]: resource, en },
    })

    for (const key of [
      'Show model pricing issue badge',
      'Show the number of task models whose price needs attention next to the navigation entries.',
    ]) {
      expect(i18n.exists(key, { lng: language })).toBe(true)
      if (language !== 'en') expect(i18n.t(key)).not.toBe(key)
    }
  }
)

it.each(Object.entries(resources))(
  'translates the playground attachment upload server messages in %s',
  async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { [language]: resource, en },
    })

    for (const key of [
      'Only PDF, PNG, JPEG, GIF, or WebP files are supported',
      'Each file must not exceed 10 MiB',
      'Too many pending attachments; send or remove some first',
      'Attachment storage is busy; try again later',
      'Attachments are unavailable while text masking is enabled',
      'Attachment upload failed',
      'Playground attachments require a browser session',
      'Attachment not found or already used',
    ]) {
      expect(i18n.exists(key, { lng: language })).toBe(true)
      if (language !== 'en') expect(i18n.t(key)).not.toBe(key)
    }
  }
)

it.each(Object.entries(resources))(
  "translates Mengmeng's Safe House in %s",
  async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: 'en',
      resources: { [language]: resource, en },
    })

    for (const key of [
      "Mengmeng's Safe House",
      "Enable Mengmeng's Safe House text masking",
      "How Mengmeng's Safe House works",
      'Mask on this site',
      'Mask on my computer',
      'Detected sensitive text is masked on your computer',
      'Connect this site',
      'The local program is not included in this build.',
      'Use it as the OpenAI-compatible base URL. Claude and Gemini clients use {{origin}}. Keep your API key unchanged.',
    ]) {
      expect(i18n.exists(key, { lng: language })).toBe(true)
      if (language !== 'en') expect(i18n.t(key)).not.toBe(key)
    }
    expect(i18n.exists('Mengmeng', { lng: language })).toBe(false)
  }
)

it('uses the requested Chinese translations', async () => {
  const i18n = createInstance()
  await i18n.init({ lng: 'zhCN', fallbackLng: 'en', resources })

  expect(i18n.t('Submit invoice application')).toBe('提交发票申请')
  expect(i18n.t('Available commission')).toBe('可用佣金')

  await i18n.changeLanguage('zhTW')
  expect(i18n.t('Submit invoice application')).toBe('提交發票申請')
  expect(i18n.t('Available commission')).toBe('可用佣金')
})
