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
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { createAppQueryClient } from '@/lib/query-client'

import { AffiliateCommissionsDialog } from '../components/dialogs/affiliate-commissions-dialog'
import { AffiliateInviteesDialog } from '../components/dialogs/affiliate-invitees-dialog'
import { WithdrawalRecordsDialog } from '../components/dialogs/withdrawal-records-dialog'

const dialogs = [
  {
    title: 'Commission records',
    Component: AffiliateCommissionsDialog,
    empty: 'No commission records yet',
  },
  {
    title: 'Invited users',
    Component: AffiliateInviteesDialog,
    empty: 'No invited users yet',
  },
  {
    title: 'Withdrawal records',
    Component: WithdrawalRecordsDialog,
    empty: 'No withdrawal records yet',
  },
]
const redirect = vi.fn()
let client: ReturnType<typeof createAppQueryClient>

beforeEach(() => {
  client = createAppQueryClient(redirect)
  client.setDefaultOptions({ queries: { retry: false } })
})

afterEach(() => {
  cleanup()
  client.clear()
  onlineManager.setOnline(true)
})

it.each(dialogs)(
  '$title shows business and HTTP failures inline and retries to a genuine empty result',
  async ({ title, Component, empty }) => {
    const user = userEvent.setup()
    const emptyPage = { items: [], total: 0 }
    vi.spyOn(api, 'get')
      .mockResolvedValueOnce({
        data: {
          success: false,
          message: 'Records unavailable',
          data: emptyPage,
        },
      })
      .mockRejectedValueOnce({
        response: { status: 500, data: { message: 'Read failed' } },
      })
      .mockResolvedValueOnce({ data: { success: true, data: emptyPage } })
    render(
      <QueryClientProvider client={client}>
        <Component open onOpenChange={() => {}} />
      </QueryClientProvider>
    )
    const dialog = within(screen.getByRole('dialog', { name: title }))
    expect(await dialog.findByText('Records unavailable')).toBeVisible()
    expect(dialog.queryByText(empty)).not.toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Retry' }))
    expect(await dialog.findByText('Read failed')).toBeVisible()
    expect(redirect).not.toHaveBeenCalled()
    await user.click(dialog.getByRole('button', { name: 'Retry' }))
    expect(await dialog.findByText(empty)).toBeVisible()
    expect(
      dialog.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument()
  }
)

it('announces a pending request while offline and shows an empty result after reconnecting', async () => {
  onlineManager.setOnline(false)
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items: [], total: 0 } },
  })
  render(
    <QueryClientProvider client={client}>
      <AffiliateCommissionsDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  expect(screen.getByRole('status')).toHaveTextContent('Loading...')
  onlineManager.setOnline(true)
  expect(await screen.findByText('No commission records yet')).toBeVisible()
})

it('keeps long invitee names inside the scrollable table and pages independently of the scroll area', async () => {
  const user = userEvent.setup()
  const name = 'long-invitee-name-'.repeat(12)
  const invitee = {
    user_id: 8,
    display_name: name,
    masked_email: 'u***@example.test',
    registered_at: 1700000000,
    last_reward_at: 0,
    commission_count: 3,
    credited_quota: 500000,
  }
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: { success: true, data: { items: [invitee], total: 21 } },
    })
    .mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [{ ...invitee, user_id: 24, display_name: '' }],
          total: 21,
        },
      },
    })
  render(
    <QueryClientProvider client={client}>
      <AffiliateInviteesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  const region = await screen.findByRole('region', { name: 'Invited users' })
  expect(region).toHaveClass('overflow-x-auto')
  expect(region).toHaveAttribute('tabindex', '0')
  expect(within(region).getByRole('table')).toBeVisible()
  const identity = within(region).getByRole('cell', { name: new RegExp(name) })
  expect(identity).toHaveClass('whitespace-normal', 'wrap-anywhere')
  expect(within(identity).getByText(name).closest('.truncate')).toBeNull()
  const next = screen.getByRole('button', { name: 'Next page' })
  expect(region).not.toContainElement(next)
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  next.focus()
  await user.keyboard('{Enter}')
  expect(await screen.findByText('#24')).toBeVisible()
  expect(get).toHaveBeenLastCalledWith(
    '/api/user/affiliate/invitees',
    expect.objectContaining({ params: { page: 2, page_size: 20 } })
  )
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  expect(screen.getByText('Showing 21-21 of 21')).toBeVisible()
})
