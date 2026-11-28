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
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'

import { CCSwitchDialog } from '../cc-switch-dialog'

let queryClient: QueryClient

beforeEach(() => {
  localStorage.clear()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
})

afterEach(() => {
  queryClient.clear()
  localStorage.clear()
  vi.restoreAllMocks()
})

function renderDialog(
  models = ['gpt-5.4', 'claude-sonnet-4-6'],
  status: StatusData = {}
) {
  queryClient.setQueryData(STATUS_QUERY_KEY, status)
  queryClient.setQueryData(['user-models-ccswitch'], {
    success: true,
    data: models,
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CCSwitchDialog open onOpenChange={vi.fn()} tokenKey='test-only' />
    </QueryClientProvider>
  )
}

describe('CC Switch model selection', () => {
  it.each(['Claude', 'Codex', 'Gemini'])(
    'opens %s models outside the clipping dialog and keeps the dialog open after selection',
    async (app) => {
      renderDialog()
      const user = userEvent.setup()
      await user.click(screen.getByRole('radio', { name: app }))
      const input = screen.getByRole('combobox', { name: 'Primary Model' })

      await user.click(input)

      expect(input).toHaveAttribute('aria-expanded', 'true')
      const list = await screen.findByRole('listbox')
      const dialog = screen.getByRole('dialog', { name: 'Import to CC Switch' })
      // The dialog is translated and clips overflow. Its popup must escape
      // that containing block to remain aligned and fully visible.
      expect(dialog).not.toContainElement(list)
      await user.click(screen.getByRole('option', { name: 'gpt-5.4' }))
      await waitFor(() => expect(input).toHaveValue('gpt-5.4'))
      expect(input).toHaveAttribute('aria-expanded', 'false')
      expect(dialog).toBeVisible()
    }
  )

  it('filters model names and supports keyboard selection and Escape without closing the dialog', async () => {
    renderDialog()
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Codex' }))
    const input = screen.getByRole('combobox', { name: 'Primary Model' })
    await user.click(input)
    await user.type(input, 'sonnet')

    expect(
      screen.queryByRole('option', { name: 'gpt-5.4' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'claude-sonnet-4-6' })
    ).toBeVisible()
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(input).toHaveValue('claude-sonnet-4-6'))
    await user.click(input)
    await user.keyboard('{Escape}')

    expect(input).toHaveValue('claude-sonnet-4-6')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  it('shows an empty result when no models are available and updates an open dropdown when models arrive', async () => {
    renderDialog([])
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Codex' }))
    const input = screen.getByRole('combobox', { name: 'Primary Model' })
    await user.click(screen.getByRole('button', { name: 'Primary Model' }))

    expect(await screen.findByText('No models found')).toBeVisible()
    await act(async () => {
      queryClient.setQueryData(['user-models-ccswitch'], {
        success: true,
        data: ['gpt-5.4'],
      })
    })
    await user.click(await screen.findByRole('option', { name: 'gpt-5.4' }))
    await waitFor(() => expect(input).toHaveValue('gpt-5.4'))
  })

  it('lets users edit the provider name without opening a model dropdown', async () => {
    renderDialog()
    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: 'Name' })

    await user.clear(input)
    await user.type(input, 'Development')

    expect(input).toHaveValue('Development')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('CC Switch import URL resolution', () => {
  it('uses the first API address without appending v1 for Claude and homepage', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderDialog(['claude-sonnet-4-6'], {
      server_address: 'https://console.example.com',
      api_info_enabled: true,
      api_info: [
        {
          url: 'https://api-primary.example.com/',
          route: 'Primary',
          description: 'Primary endpoint',
          color: 'blue',
        },
        {
          url: 'https://api-secondary.example.com',
          route: 'Secondary',
          description: 'Secondary endpoint',
          color: 'green',
        },
      ],
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Primary Model' }))
    await user.click(screen.getByRole('option', { name: 'claude-sonnet-4-6' }))
    await user.click(screen.getByRole('button', { name: 'Open CC Switch' }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const openedUrl = new URL(openSpy.mock.calls[0][0] as string)
    expect(openedUrl.searchParams.get('app')).toBe('claude')
    expect(openedUrl.searchParams.get('endpoint')).toBe(
      'https://api-primary.example.com'
    )
    expect(openedUrl.searchParams.get('homepage')).toBe(
      'https://api-primary.example.com'
    )
  })

  it('uses the first API address for Codex and avoids duplicating an existing v1 suffix', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderDialog(['gpt-5.4'], {
      server_address: 'https://console.example.com',
      api_info_enabled: true,
      api_info: [
        {
          url: 'https://api-primary.example.com/v1/',
          route: 'Primary',
          description: 'Primary endpoint',
          color: 'blue',
        },
      ],
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Codex' }))
    await user.click(screen.getByRole('combobox', { name: 'Primary Model' }))
    await user.click(screen.getByRole('option', { name: 'gpt-5.4' }))
    await user.click(screen.getByRole('button', { name: 'Open CC Switch' }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const openedUrl = new URL(openSpy.mock.calls[0][0] as string)
    expect(openedUrl.searchParams.get('app')).toBe('codex')
    expect(openedUrl.searchParams.get('endpoint')).toBe(
      'https://api-primary.example.com/v1'
    )
    expect(openedUrl.searchParams.get('homepage')).toBe(
      'https://api-primary.example.com/v1'
    )
  })

  it.each([
    {
      name: 'server_address when API addresses are disabled',
      status: {
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
      },
      expected: 'https://console.example.com',
    },
    {
      name: 'current origin when both API addresses and server_address are empty',
      status: {
        server_address: '',
        api_info_enabled: true,
        api_info: [],
      },
      expected: window.location.origin.replace(/\/+$/, ''),
    },
  ])('falls back to $name', async ({ status, expected }) => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    renderDialog(['claude-sonnet-4-6'], status)
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Primary Model' }))
    await user.click(screen.getByRole('option', { name: 'claude-sonnet-4-6' }))
    await user.click(screen.getByRole('button', { name: 'Open CC Switch' }))

    const openedUrl = new URL(openSpy.mock.calls[0][0] as string)
    expect(openedUrl.searchParams.get('endpoint')).toBe(expected)
    expect(openedUrl.searchParams.get('homepage')).toBe(expected)
  })
})
