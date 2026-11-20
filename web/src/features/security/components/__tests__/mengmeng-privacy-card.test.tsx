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
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserProfile } from '@/features/profile/types'
import type { SafehouseArtifact } from '@/features/security/api'
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

const windowsBuild: SafehouseArtifact = {
  platform: 'windows',
  arch: 'amd64',
  file_name: 'mengmeng-safehouse-windows-amd64.exe',
  size: 8 * 1048576,
  sha256: 'a'.repeat(64),
}
const linuxBuild: SafehouseArtifact = {
  platform: 'linux',
  arch: 'amd64',
  file_name: 'mengmeng-safehouse-linux-amd64.tar.gz',
  size: 3 * 1048576,
  sha256: 'b'.repeat(64),
}

afterEach(() => vi.restoreAllMocks())

function mockGet(items: SafehouseArtifact[]) {
  return vi.spyOn(api, 'get').mockImplementation((url: string) => {
    if (url === '/api/user/safehouse/downloads') {
      return Promise.resolve({
        data: { success: true, data: { version: 'v1', items } },
      }) as never
    }
    if (url.startsWith('/api/user/safehouse/downloads/')) {
      return Promise.resolve({ data: new Blob(['build']) }) as never
    }
    if (url === '/api/status') {
      return Promise.resolve({
        data: {
          success: true,
          data: { server_address: 'https://api.example.com/console' },
        },
      }) as never
    }
    return Promise.reject(new Error(`unexpected request ${url}`)) as never
  })
}

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

describe("Mengmeng's Safe House site masking", () => {
  it('starts disabled and saves an opt-in through the dedicated endpoint', async () => {
    const put = vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true },
    })
    const user = userEvent.setup()
    const { onUpdate } = renderCard()

    const toggle = screen.getByRole('switch', {
      name: "Enable Mengmeng's Safe House text masking",
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

    await user.click(
      screen.getByRole('button', { name: "How Mengmeng's Safe House works" })
    )
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
      name: "Enable Mengmeng's Safe House text masking",
    })
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save Settings' }))

    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled()
  })

  it('reads an enabled value from the refreshed profile settings', () => {
    renderCard(JSON.stringify({ text_masking_enabled: true }))

    expect(
      screen.getByRole('switch', {
        name: "Enable Mengmeng's Safe House text masking",
      })
    ).toBeChecked()
  })
})

describe("Mengmeng's Safe House local program", () => {
  async function openLocalTab() {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('tab', { name: 'Mask on my computer' }))
    return user
  }

  it('lists the builds with the visitor platform first', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    )
    mockGet([linuxBuild, windowsBuild])
    await openLocalTab()

    const list = await screen.findByRole('list', {
      name: 'Safe House downloads',
    })
    const buttons = within(list).getAllByRole('button', {
      name: /^Download for/,
    })
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Download for Windows',
      'Download for Linux (x86_64)',
    ])
  })

  it('says the program is not included when the build has none', async () => {
    mockGet([])
    await openLocalTab()

    expect(
      await screen.findByText(
        'The local program is not included in this build.'
      )
    ).toBeVisible()
  })

  it('downloads a build as a blob through the console API', async () => {
    const get = mockGet([windowsBuild])
    // jsdom has no object URLs; restore whatever was there afterwards.
    const original = {
      createObjectURL: URL.createObjectURL,
      revokeObjectURL: URL.revokeObjectURL,
    }
    const createObjectURL = vi.fn(() => 'blob:safehouse')
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    try {
      const user = await openLocalTab()

      await user.click(
        await screen.findByRole('button', { name: 'Download for Windows' })
      )

      await waitFor(() => expect(click).toHaveBeenCalledOnce())
      expect(get).toHaveBeenCalledWith(
        '/api/user/safehouse/downloads/mengmeng-safehouse-windows-amd64.exe',
        { responseType: 'blob' }
      )
      expect(createObjectURL).toHaveBeenCalledOnce()
    } finally {
      Object.assign(URL, original)
    }
  })

  it('opens the local panel with the configured site origin and never calls localhost itself', async () => {
    const get = mockGet([windowsBuild])
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = await openLocalTab()

    await screen.findByText('https://api.example.com')
    await user.click(screen.getByRole('button', { name: 'Connect this site' }))

    expect(open).toHaveBeenCalledWith(
      'http://127.0.0.1:17860/#connect=https%3A%2F%2Fapi.example.com',
      '_blank',
      'noopener,noreferrer'
    )
    for (const [url] of get.mock.calls) {
      expect(String(url)).not.toContain('127.0.0.1')
    }
  })
})
