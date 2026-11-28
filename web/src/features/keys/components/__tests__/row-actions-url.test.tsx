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
import type { Row } from '@tanstack/react-table'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { parseChannelConnectionInfo } from '@/lib/channel-connection-info'
import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'

import type { ApiKey } from '../../types'
import { ApiKeysProvider } from '../api-keys-provider'
import { DataTableRowActions } from '../data-table-row-actions'

let client: QueryClient

const sampleKey: ApiKey = {
  id: 42,
  name: 'Primary Key',
  key: 'masked',
  status: 1,
  remain_quota: 1000,
  used_quota: 0,
  unlimited_quota: false,
  expired_time: -1,
  created_time: 1700000000,
  accessed_time: 1700000000,
  group: 'default',
  auto_groups: null,
  cross_group_retry: false,
  model_limits_enabled: false,
  model_limits: '',
  allow_ips: '',
  allow_user_quota_query: false,
}

beforeEach(() => {
  localStorage.clear()
  client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  })
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: { key: 'secret-token' },
    },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

function renderRowActions(status: StatusData) {
  client.setQueryData(STATUS_QUERY_KEY, status)
  return render(
    <QueryClientProvider client={client}>
      <ApiKeysProvider>
        <DataTableRowActions row={{ original: sampleKey } as Row<ApiKey>} />
      </ApiKeysProvider>
    </QueryClientProvider>
  )
}

describe('DataTableRowActions URL resolution', () => {
  it('copies connection info with the first API address without appending v1', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderRowActions({
      server_address: 'https://console.example.com',
      api_info_enabled: true,
      api_info: [
        {
          url: 'https://api-primary.example.com/',
          route: 'Primary',
          description: 'Primary route',
          color: 'blue',
        },
        {
          url: 'https://api-backup.example.com',
          route: 'Backup',
          description: 'Backup route',
          color: 'green',
        },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy Connection Info' })
    )

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(parseChannelConnectionInfo(writeText.mock.calls[0][0])).toEqual({
      key: 'sk-secret-token',
      url: 'https://api-primary.example.com',
    })
  })

  it('falls back to server_address for connection info when API addresses are disabled', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderRowActions({
      server_address: 'https://console.example.com/',
      api_info_enabled: false,
      api_info: [
        {
          url: 'https://hidden.example.com',
          route: 'Hidden',
          description: 'Disabled',
          color: 'blue',
        },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(
      await screen.findByRole('menuitem', { name: 'Copy Connection Info' })
    )

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(parseChannelConnectionInfo(writeText.mock.calls[0][0])).toEqual({
      key: 'sk-secret-token',
      url: 'https://console.example.com',
    })
  })

  it('uses the first API address without appending v1 for chat shortcuts', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderRowActions({
      server_address: 'https://console.example.com',
      api_info_enabled: true,
      api_info: [
        {
          url: 'https://api-primary.example.com/',
          route: 'Primary',
          description: 'Primary route',
          color: 'blue',
        },
      ],
      chats: [
        {
          WebChat: 'https://chat.example.com/?endpoint={address}&key={key}',
        },
      ],
    })

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const chatSubmenu = await screen.findByRole('menuitem', { name: 'Chat' })
    chatSubmenu.focus()
    await user.keyboard('{ArrowRight}')
    const webChatItem = await screen.findByRole('menuitem', { name: 'WebChat' })
    webChatItem.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1))
    expect(openSpy).toHaveBeenCalledWith(
      `https://chat.example.com/?endpoint=${encodeURIComponent('https://api-primary.example.com')}&key=sk-secret-token`,
      '_blank',
      'noopener'
    )
  })
})
