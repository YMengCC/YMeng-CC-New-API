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
*/
import { render, screen } from '@testing-library/react'
import { createInstance, type i18n as I18n } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'

import { RegionNoticeDialog } from '../region-notice-dialog'
import { useRegionNotice } from '../use-region-notice'

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: 'Test Site', logo: '/logo.png' }),
}))
vi.mock('../use-region-notice', () => ({
  useRegionNotice: vi.fn(),
}))

const useRegionNoticeMock = useRegionNotice as unknown as {
  mockReturnValue: (value: ReturnType<typeof useRegionNotice>) => void
}
const notice = {
  restricted: true,
  country: 'CN',
  allowed_groups: ['default'],
  restricted_groups: ['overseas'],
  available_models: [{ model_name: 'model-a', groups: ['default'] }],
  overseas_only_models: [{ model_name: 'model-b', groups: ['overseas'] }],
  available_model_count: 1,
  overseas_model_count: 1,
  total_model_count: 2,
}

let testI18n: I18n

beforeEach(async () => {
  testI18n = createInstance()
  await testI18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en, zhCN, zhTW },
    interpolation: { escapeValue: false },
  })
  useRegionNoticeMock.mockReturnValue({
    notice,
    open: true,
    close: vi.fn(),
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('RegionNoticeDialog localization', () => {
  it('uses the current interface language instead of forcing Simplified Chinese', async () => {
    const { rerender } = render(
      <I18nextProvider i18n={testI18n}>
        <RegionNoticeDialog />
      </I18nextProvider>
    )

    expect(
      screen.getByText('Model availability in your region')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'I understand' })
    ).toBeInTheDocument()

    await testI18n.changeLanguage('zhTW')
    rerender(
      <I18nextProvider i18n={testI18n}>
        <RegionNoticeDialog />
      </I18nextProvider>
    )

    expect(screen.getByText('你所在區域的模型可用性')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '我知道了' })).toBeInTheDocument()
    expect(screen.queryByText('你所在地区的模型可用性')).not.toBeInTheDocument()
  })

  it('renders the region counts and filtered empty-state text from translations', async () => {
    await testI18n.changeLanguage('zhCN')
    render(
      <I18nextProvider i18n={testI18n}>
        <RegionNoticeDialog />
      </I18nextProvider>
    )

    expect(screen.getByText('你所在地区的模型可用性')).toBeInTheDocument()
    expect(screen.getByText('你当前可用的模型（1）')).toBeInTheDocument()
    expect(screen.getByText('仅海外网络可访问（1）')).toBeInTheDocument()
  })
})
