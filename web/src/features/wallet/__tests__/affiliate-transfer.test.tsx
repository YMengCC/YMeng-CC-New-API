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

import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { useSystemConfigStore } from '@/stores/system-config-store'

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

it.each([
  [5000000, 10],
  [6250000, 12.5],
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
