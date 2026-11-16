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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/profile/types'
import { api } from '@/lib/api'

import { MengmengPrivacyCard } from '../mengmeng-privacy-card'

const profile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
  setting: JSON.stringify({ text_masking_enabled: false }),
}

afterEach(() => vi.restoreAllMocks())

function renderCard(setting = profile.setting) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onUpdate = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <MengmengPrivacyCard
        profile={{ ...profile, setting }}
        onUpdate={onUpdate}
      />
    </QueryClientProvider>
  )
  return { onUpdate }
}

describe('Mengmeng privacy settings', () => {
  it('starts disabled and saves an opt-in through the dedicated endpoint', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true },
    })
    const user = userEvent.setup()
    const { onUpdate } = renderCard()

    const toggle = screen.getByRole('switch', {
      name: 'Enable Mengmeng text masking',
    })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save Settings' }))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce())
    expect(put).toHaveBeenCalledWith('/api/user/privacy-settings', {
      text_masking_enabled: true,
    })
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('shows the deterministic demo after opening it without making a request', async () => {
    const put = vi.spyOn(api, 'put')
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'How Mengmeng works' }))
    expect(screen.getByText(/Illustrative sample only/)).toBeVisible()
    expect(screen.getByText('alex@example.com')).toBeVisible()
    expect(screen.getByText('[EMAIL_1]', { exact: true })).toBeVisible()
    expect(
      screen.getByText('Message prepared for alex@example.com.')
    ).toBeVisible()
    expect(put).not.toHaveBeenCalled()
  })

  it('restores the saved off state when the server rejects the opt-in', async () => {
    vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: false, message: 'Save failed' },
    })
    const user = userEvent.setup()
    renderCard()

    const toggle = screen.getByRole('switch', {
      name: 'Enable Mengmeng text masking',
    })
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save Settings' }))

    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
  })

  it('reads an enabled value from the refreshed profile settings', () => {
    renderCard(JSON.stringify({ text_masking_enabled: true }))

    expect(
      screen.getByRole('switch', { name: 'Enable Mengmeng text masking' })
    ).toBeChecked()
  })
})
