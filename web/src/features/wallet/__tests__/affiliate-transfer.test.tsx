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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { Withdrawal } from '@/features/withdrawals/api'
import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { WithdrawalRecordsDialog } from '../components/dialogs/withdrawal-records-dialog'
import { Wallet } from '../index'

const clients: QueryClient[] = []

beforeEach(() => {
  localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:collection-qr')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
  localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

async function renderWallet(
  availableQuota: number,
  transferSucceeds = true,
  options: {
    hasQr?: boolean
    profileError?: boolean
    withdrawalError?: boolean
    summaryError?: boolean
    minimumQuota?: number
  } = {}
) {
  let remainingQuota = availableQuota
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    let data: unknown
    switch (url) {
      case '/api/user/self':
        data = {
          id: 1,
          username: 'referrer',
          quota: availableQuota - remainingQuota,
          used_quota: 0,
          request_count: 0,
          aff_quota: 0,
          invite_quota: options.summaryError ? availableQuota : undefined,
          aff_history_quota: 0,
          aff_count: 0,
          group: 'default',
        }
        break
      case '/api/withdrawal/profile':
        if (options.profileError) throw new Error('profile failed')
        data = {
          has_qr: options.hasQr ?? true,
          updated_at: 1,
          minimum_quota: options.minimumQuota ?? 5000000,
        }
        break
      case '/api/withdrawal/profile/qr':
        return { data: new Blob(['png'], { type: 'image/png' }) }
      case '/api/user/affiliate/summary':
        if (options.summaryError) throw new Error('summary failed')
        data = {
          available_quota: remainingQuota,
          total_quota: availableQuota,
          invitee_count: 1,
          commission_count: 1,
          pending_remainder: 0,
          rate_percent: 10,
          enabled: true,
          aff_code: 'referral',
        }
        break
      case '/api/user/aff':
        data = 'referral'
        break
      case '/api/user/topup/info':
        data = { min_topup: 1, pay_methods: [], amount_options: [] }
        break
      case '/api/subscription/plans':
        data = []
        break
      case '/api/subscription/self':
        data = { subscriptions: [], all_subscriptions: [] }
        break
      case '/api/status':
        data = { price: 1 }
        break
      default:
        throw new Error(`Unexpected GET ${url}`)
    }
    return { data: { success: true, data } }
  })
  const post = vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    if (url === '/api/user/amount') {
      return { data: { success: true, data: '1' } }
    }
    if (url === '/api/withdrawal/') {
      if (options.withdrawalError) throw new Error('connection lost')
      remainingQuota -= (body as { quota: number }).quota
      return { data: { success: true, data: { id: 1, ...(body as object) } } }
    }
    if (url !== '/api/user/aff_transfer') {
      throw new Error(`Unexpected POST ${url}`)
    }
    if (transferSucceeds) {
      remainingQuota -= (body as { quota: number }).quota
    }
    return {
      data: {
        success: transferSucceeds,
        message: transferSucceeds ? 'Transfer successful' : 'Transfer failed',
      },
    }
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  const root = createRootRoute()
  const walletRoute = createRoute({
    getParentRoute: () => root,
    path: '/wallet',
    component: Wallet,
  })
  const router = createRouter({
    routeTree: root.addChildren([walletRoute]),
    history: createMemoryHistory({ initialEntries: ['/wallet'] }),
  })
  await router.load()
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  )
  await screen.findByRole('button', { name: 'Transfer to Balance' })
  return { get, post, client }
}

it('uses the commission summary in the transfer dialog when self has no invite quota', async () => {
  const user = userEvent.setup()
  const { post } = await renderWallet(1000000)
  await user.click(screen.getByRole('button', { name: 'Transfer to Balance' }))
  const dialog = await screen.findByRole('dialog', { name: 'Transfer Rewards' })

  expect(within(dialog).getByText(formatQuota(1000000))).toBeInTheDocument()
  expect(within(dialog).getByRole('spinbutton')).toHaveValue(1)
  expect(
    within(dialog).getByRole('button', { name: /^Transfer$/ })
  ).toBeEnabled()
  await user.click(within(dialog).getByRole('button', { name: /^Transfer$/ }))

  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/aff_transfer', {
      quota: 500000,
    })
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  await user.click(screen.getByRole('button', { name: 'Transfer to Balance' }))
  const reopened = await screen.findByRole('dialog', {
    name: 'Transfer Rewards',
  })
  expect(within(reopened).getByRole('spinbutton')).toHaveAttribute('max', '1')
  expect(
    within(reopened).getByText(formatQuota(500000), { selector: '.text-2xl' })
  ).toBeInTheDocument()
})

it('disables transfer when the commission balance is below the minimum', async () => {
  const user = userEvent.setup()
  const { post } = await renderWallet(250000)
  await user.click(screen.getByRole('button', { name: 'Transfer to Balance' }))
  const dialog = await screen.findByRole('dialog', { name: 'Transfer Rewards' })
  expect(within(dialog).getByText(formatQuota(250000))).toBeInTheDocument()
  expect(
    within(dialog).getByRole('button', { name: /^Transfer$/ })
  ).toBeDisabled()
  expect(post).not.toHaveBeenCalledWith(
    '/api/user/aff_transfer',
    expect.anything()
  )
})

it('keeps the dialog and available commission balance after a rejected transfer', async () => {
  const user = userEvent.setup()
  await renderWallet(1000000, false)
  await user.click(screen.getByRole('button', { name: 'Transfer to Balance' }))
  const dialog = await screen.findByRole('dialog', { name: 'Transfer Rewards' })
  await user.click(within(dialog).getByRole('button', { name: /^Transfer$/ }))
  await waitFor(() =>
    expect(
      within(dialog).getByRole('button', { name: /^Transfer$/ })
    ).toBeEnabled()
  )
  expect(dialog).toBeInTheDocument()
  expect(within(dialog).getByText(formatQuota(1000000))).toBeInTheDocument()
})

it('keeps both zero-balance actions visible with Withdraw directly below Transfer', async () => {
  await renderWallet(0)
  const group = screen.getByRole('group', { name: 'Referral reward actions' })
  expect(group).toHaveClass('flex-col')
  const buttons = within(group).getAllByRole('button')
  expect(buttons.map((button) => button.textContent)).toEqual([
    'Transfer to Balance',
    'Withdraw',
  ])
  buttons.forEach((button) => expect(button).toBeDisabled())
  expect(
    screen.getByText('No referral rewards available to transfer or withdraw')
  ).toBeVisible()
})

it('keeps withdrawal disabled when the authoritative summary fails despite a stale self balance', async () => {
  await renderWallet(1000000, true, { summaryError: true })
  expect(screen.getByRole('button', { name: 'Withdraw' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Transfer to Balance' })
  ).toBeEnabled()
  expect(
    screen.getByText(
      'Withdrawal is unavailable until your referral rewards balance is loaded'
    )
  ).toBeVisible()
})

it('blocks the money form when no QR exists and links to the profile collection section', async () => {
  const user = userEvent.setup()
  const { post } = await renderWallet(250000, true, { hasQr: false })
  await user.click(screen.getByRole('button', { name: 'Withdraw' }))
  const dialog = await screen.findByRole('dialog', { name: 'Withdraw rewards' })
  expect(
    await within(dialog).findByRole('link', {
      name: 'Set up collection QR code',
    })
  ).toHaveAttribute('href', '/profile#collection-qr')
  expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument()
  expect(
    post.mock.calls.filter(([url]) => url === '/api/withdrawal/')
  ).toHaveLength(0)
})

it('shows a retryable metadata error without claiming the QR is missing', async () => {
  const user = userEvent.setup()
  await renderWallet(250000, true, { profileError: true })
  await user.click(screen.getByRole('button', { name: 'Withdraw' }))
  const dialog = await screen.findByRole('dialog', { name: 'Withdraw rewards' })
  expect(
    await within(dialog).findByText(
      'Failed to load collection QR code settings'
    )
  ).toBeVisible()
  expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeEnabled()
  expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
  expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument()
})

it('rejects a withdrawal amount with decimals', async () => {
  const user = userEvent.setup()
  const { post } = await renderWallet(5000000)
  await user.click(screen.getByRole('button', { name: 'Withdraw' }))
  const dialog = await screen.findByRole('dialog', { name: 'Withdraw rewards' })
  await within(dialog).findByRole('img')
  const input = within(dialog).getByRole('spinbutton', {
    name: 'Withdrawal amount',
  })
  expect(input).toHaveAttribute('step', '1')
  expect(
    within(dialog).getByText('Withdrawal amounts do not include decimals')
  ).toBeVisible()
  await user.type(input, '10.5')
  expect(
    within(dialog).getByRole('button', { name: 'Request withdrawal' })
  ).toBeDisabled()
  expect(post).not.toHaveBeenCalledWith('/api/withdrawal/', expect.anything())
  await user.clear(input)
  await user.type(input, '10')
  expect(
    within(dialog).getByRole('button', { name: 'Request withdrawal' })
  ).toBeEnabled()
})

it.each([
  [5000000, 10],
  [6500000, 13],
])(
  'withdraws all %s quota at or above the withdrawal minimum and refreshes the displayed balance',
  async (available, displayAmount) => {
    const user = userEvent.setup()
    const { post } = await renderWallet(available)
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw rewards',
    })
    await within(dialog).findByRole('img', {
      name: 'Collection QR code preview',
    })
    const input = within(dialog).getByRole('spinbutton', {
      name: 'Withdrawal amount',
    })
    await user.type(input, '0')
    expect(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    ).toBeDisabled()
    await user.clear(input)
    await user.type(input, '9.99')
    expect(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    ).toBeDisabled()
    expect(
      within(dialog).getByText('Minimum withdrawal amount is 10')
    ).toBeVisible()
    expect(input).toHaveAttribute('min', '10')
    await user.clear(input)
    await user.type(input, String(displayAmount + 1))
    expect(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    ).toBeDisabled()
    await user.click(
      within(dialog).getByRole('button', { name: 'Use all available rewards' })
    )
    expect(input).toHaveValue(displayAmount)
    await user.click(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    )
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/withdrawal/', {
        quota: available,
        request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(
      await screen.findByText(
        'No referral rewards available to transfer or withdraw'
      )
    ).toBeVisible()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:collection-qr')
  }
)

it('blocks a withdrawal below 10 even when all available rewards are selected', async () => {
  const user = userEvent.setup()
  const { post } = await renderWallet(4999999)
  await user.click(screen.getByRole('button', { name: 'Withdraw' }))
  const dialog = await screen.findByRole('dialog', { name: 'Withdraw rewards' })
  await within(dialog).findByRole('img')
  expect(
    within(dialog).getByText('Minimum withdrawal amount is 10')
  ).toBeVisible()
  await user.click(
    within(dialog).getByRole('button', { name: 'Use all available rewards' })
  )
  expect(
    within(dialog).getByRole('button', { name: 'Request withdrawal' })
  ).toBeDisabled()
  expect(
    post.mock.calls.filter(([url]) => url === '/api/withdrawal/')
  ).toHaveLength(0)
})

it('opens the withdrawal records dialog from the referral card', async () => {
  const user = userEvent.setup()
  const { get } = await renderWallet(5000000)
  get.mockImplementation(async (url) => {
    if (url === '/api/withdrawal/self') {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 7,
                user_id: 1,
                username: 'referrer',
                quota: 5000000,
                status: 'rejected',
                reject_reason: 'Incorrect Alipay account',
                created_at: 1700000000,
                updated_at: 1700000000,
                updated_by: 2,
                currency_snapshot: {
                  ...useSystemConfigStore.getState().config.currency,
                },
              },
            ],
            total: 1,
            p: 1,
            page_size: 10,
          },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  await user.click(screen.getByRole('button', { name: 'Withdrawal records' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Withdrawal records',
  })
  expect(await within(dialog).findByText('Rejected')).toBeVisible()
  expect(within(dialog).getByText('Incorrect Alipay account')).toBeVisible()
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/self',
    expect.objectContaining({ params: { p: 1, page_size: 10 } })
  )
})

async function openWithdrawalRecords(
  pages: Withdrawal[][],
  proofType = 'image/png'
) {
  const { get } = await renderWallet(5000000)
  let failProof = false
  get.mockImplementation(async (url, config) => {
    if (url === '/api/withdrawal/self') {
      const page = Number(
        (config?.params as { p?: number } | undefined)?.p ?? 1
      )
      return {
        data: {
          success: true,
          data: {
            items: pages[page - 1] ?? [],
            total: pages.length * 10,
            p: page,
            page_size: 10,
          },
        },
      }
    }
    if (url.startsWith('/api/withdrawal/self/') && url.endsWith('/proof')) {
      if (failProof) {
        return { data: new Blob(['{}'], { type: 'application/json' }) }
      }
      return { data: new Blob(['payment-proof'], { type: proofType }) }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Withdrawal records' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Withdrawal records',
  })
  await within(dialog).findAllByText('Withdrawal completed')
  return {
    user,
    get,
    dialog,
    setProofFailure: (value: boolean) => {
      failProof = value
    },
  }
}

function completedWithdrawal(
  id: number,
  changes: Partial<Withdrawal> = {}
): Withdrawal {
  return {
    id,
    user_id: 1,
    username: 'referrer',
    quota: 5000000,
    status: 'completed',
    proof_size: 25,
    created_at: 1700000000,
    updated_at: 1700000060,
    updated_by: 2,
    currency_snapshot: { ...useSystemConfigStore.getState().config.currency },
    ...changes,
  }
}

it('shows proof only for completed records with files and hides the reason column when none are rejected', async () => {
  const { user, get, dialog } = await openWithdrawalRecords([
    [
      completedWithdrawal(7),
      completedWithdrawal(8, { proof_size: 0 }),
      completedWithdrawal(9, { status: 'processing' }),
      completedWithdrawal(10, { status: 'pending' }),
    ],
  ])
  expect(
    within(dialog).queryByRole('columnheader', { name: 'Rejection reason' })
  ).not.toBeInTheDocument()
  const buttons = within(dialog).getAllByRole('button', { name: 'View proof' })
  expect(buttons).toHaveLength(1)
  expect(get.mock.calls.some(([url]) => url.endsWith('/proof'))).toBe(false)
  await user.click(buttons[0])
  const preview = await screen.findByRole('dialog', {
    name: 'Withdrawal proof',
  })
  expect(
    await within(preview).findByRole('img', { name: 'Withdrawal proof' })
  ).toHaveAttribute('src', 'blob:collection-qr')
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/self/7/proof',
    expect.objectContaining({
      responseType: 'blob',
      signal: expect.any(AbortSignal),
    })
  )
  await user.keyboard('{Escape}')
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Withdrawal proof' })
    ).not.toBeInTheDocument()
  )
  expect(dialog).toBeVisible()
  await waitFor(() => expect(buttons[0]).toHaveFocus())
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:collection-qr')
})

it.each(['image/jpeg', 'image/png', 'image/webp'])(
  'shows a %s proof preview from the user records',
  async (proofType) => {
    const { user, get, dialog } = await openWithdrawalRecords(
      [[completedWithdrawal(7)]],
      proofType
    )
    await user.click(within(dialog).getByRole('button', { name: 'View proof' }))
    const preview = await screen.findByRole('dialog', {
      name: 'Withdrawal proof',
    })
    expect(
      await within(preview).findByRole('img', { name: 'Withdrawal proof' })
    ).toHaveAttribute('src', 'blob:collection-qr')
    expect(get).toHaveBeenCalledWith(
      '/api/withdrawal/self/7/proof',
      expect.objectContaining({ responseType: 'blob' })
    )
  }
)

it('shows the reason column for mixed rejected rows and hides it again on a page with no rejected records', async () => {
  const { user, dialog } = await openWithdrawalRecords([
    [
      completedWithdrawal(7),
      completedWithdrawal(8, {
        status: 'rejected',
        reject_reason: 'Incorrect Alipay account',
      }),
    ],
    [completedWithdrawal(9)],
  ])
  expect(
    within(dialog).getByRole('columnheader', { name: 'Rejection reason' })
  ).toBeVisible()
  expect(within(dialog).getByText('Incorrect Alipay account')).toBeVisible()
  const rows = within(dialog).getAllByRole('row')
  expect(within(rows[1]).getAllByRole('cell')).toHaveLength(5)
  expect(within(rows[2]).getAllByRole('cell')).toHaveLength(5)
  await user.click(within(dialog).getByRole('button', { name: 'Next page' }))
  await waitFor(() =>
    expect(
      within(dialog).queryByRole('columnheader', { name: 'Rejection reason' })
    ).not.toBeInTheDocument()
  )
  expect(within(dialog).getAllByRole('row')).toHaveLength(2)
  expect(
    within(within(dialog).getAllByRole('row')[1]).getAllByRole('cell')
  ).toHaveLength(4)
})

it('rejects non-PNG proof responses, supports retry and clears the preview when records close', async () => {
  const { user, dialog, setProofFailure } = await openWithdrawalRecords([
    [completedWithdrawal(7)],
  ])
  setProofFailure(true)
  await user.click(within(dialog).getByRole('button', { name: 'View proof' }))
  const preview = await screen.findByRole('dialog', {
    name: 'Withdrawal proof',
  })
  expect(
    await within(preview).findByText('Failed to load withdrawal proof')
  ).toBeVisible()
  expect(within(preview).queryByRole('img')).not.toBeInTheDocument()
  setProofFailure(false)
  await user.click(within(preview).getByRole('button', { name: 'Retry' }))
  expect(
    await within(preview).findByRole('img', { name: 'Withdrawal proof' })
  ).toBeVisible()
  await user.click(within(preview).getAllByRole('button', { name: 'Close' })[0])
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Withdrawal proof' })
    ).not.toBeInTheDocument()
  )
  await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  await user.click(screen.getByRole('button', { name: 'Withdrawal records' }))
  await screen.findByRole('dialog', { name: 'Withdrawal records' })
  expect(
    screen.queryByRole('dialog', { name: 'Withdrawal proof' })
  ).not.toBeInTheDocument()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:collection-qr')
})

it('clears the selected proof if the records dialog is closed externally and reopened', async () => {
  const user = userEvent.setup()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/withdrawal/self') {
      return {
        data: {
          success: true,
          data: {
            items: [completedWithdrawal(7)],
            total: 1,
            p: 1,
            page_size: 10,
          },
        },
      }
    }
    if (url === '/api/withdrawal/self/7/proof') {
      return { data: new Blob(['proof'], { type: 'image/png' }) }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  const onOpenChange = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <WithdrawalRecordsDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  await user.click(await screen.findByRole('button', { name: 'View proof' }))
  expect(
    await screen.findByRole('img', { name: 'Withdrawal proof' })
  ).toBeVisible()
  view.rerender(
    <QueryClientProvider client={client}>
      <WithdrawalRecordsDialog open={false} onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  await waitFor(() =>
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:collection-qr')
  )
  view.rerender(
    <QueryClientProvider client={client}>
      <WithdrawalRecordsDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  expect(
    await screen.findByRole('dialog', { name: 'Withdrawal records' })
  ).toBeVisible()
  expect(
    screen.queryByRole('dialog', { name: 'Withdrawal proof' })
  ).not.toBeInTheDocument()
})

it.each([
  { mode: 'CNY' as const, available: 1000000, minimum: 833334 },
  { mode: 'TOKENS' as const, available: 20, minimum: 10 },
])(
  'submits exactly 10 in $mode using the server minimum quota without rounding below the threshold',
  async ({ mode, available, minimum }) => {
    const user = userEvent.setup()
    const { post } = await renderWallet(available, true, {
      minimumQuota: minimum,
    })
    act(() =>
      useSystemConfigStore.getState().setConfig({
        currency: {
          ...useSystemConfigStore.getState().config.currency,
          quotaDisplayType: mode,
          usdExchangeRate: 6,
        },
      })
    )
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw rewards',
    })
    await within(dialog).findByRole('img')
    await user.type(within(dialog).getByRole('spinbutton'), '10')
    await user.click(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    )
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/withdrawal/', {
        quota: minimum,
        request_id: expect.any(String),
      })
    )
  }
)

it('retains the amount and UUID across uncertain retries and prevents duplicate pending submissions', async () => {
  const user = userEvent.setup()
  const { post } = await renderWallet(5000000, true, { withdrawalError: true })
  await user.click(screen.getByRole('button', { name: 'Withdraw' }))
  const dialog = await screen.findByRole('dialog', { name: 'Withdraw rewards' })
  await within(dialog).findByRole('img')
  await user.click(
    within(dialog).getByRole('button', { name: 'Use all available rewards' })
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Request withdrawal' })
  )
  const retry = await within(dialog).findByRole('button', {
    name: 'Retry withdrawal',
  })
  expect(within(dialog).getByRole('spinbutton')).toHaveValue(10)
  expect(within(dialog).getByRole('spinbutton')).toBeDisabled()
  let release!: () => void
  post.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({ data: { success: false, message: 'Request failed' } })
      })
  )
  await user.click(retry)
  expect(retry).toBeDisabled()
  await user.click(retry)
  const requests = post.mock.calls.filter(([url]) => url === '/api/withdrawal/')
  expect(requests).toHaveLength(2)
  expect(requests[0][1]).toEqual(requests[1][1])
  release()
  await waitFor(() => expect(retry).toBeEnabled())
  expect(dialog).toBeVisible()
})

it.each([
  [10000000, 5000000],
  [5000000, 0],
])(
  'confirms an idempotent retry after the available balance changes from %s to %s without deducting again',
  async (original, remaining) => {
    const user = userEvent.setup()
    const { get, post, client } = await renderWallet(original, true, {
      withdrawalError: true,
    })
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw rewards',
    })
    await within(dialog).findByRole('img')
    await user.type(within(dialog).getByRole('spinbutton'), '10')
    await user.click(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    )
    const retry = await within(dialog).findByRole('button', {
      name: 'Retry withdrawal',
    })
    // A background refresh has already observed the original request's commit.
    act(() =>
      client.setQueryData(['affiliate', 'summary'], {
        available_quota: remaining,
        total_quota: original,
        invitee_count: 1,
        commission_count: 1,
        pending_remainder: 0,
        rate_percent: 10,
        enabled: true,
        aff_code: 'referral',
      })
    )
    post.mockResolvedValueOnce({
      data: { success: true, data: { id: 1, quota: 5000000 } },
    })
    get.mockRejectedValueOnce(new Error('summary refresh unavailable'))
    await user.click(retry)
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    if (remaining === 0) {
      expect(
        screen.getByText(
          'No referral rewards available to transfer or withdraw'
        )
      ).toBeVisible()
    } else {
      expect(screen.getByText(formatQuota(remaining))).toBeVisible()
    }
  }
)

it('submits a UUID v4 when randomUUID is unavailable on a remote HTTP origin', async () => {
  const user = userEvent.setup()
  const getRandomValues = crypto.getRandomValues.bind(crypto)
  vi.stubGlobal('crypto', { getRandomValues })
  try {
    const { post } = await renderWallet(5000000)
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw rewards',
    })
    await within(dialog).findByRole('img')
    await user.click(
      within(dialog).getByRole('button', { name: 'Use all available rewards' })
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Request withdrawal' })
    )
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/withdrawal/', {
        quota: 5000000,
        request_id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        ),
      })
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
