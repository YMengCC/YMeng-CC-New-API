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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { Route as WithdrawalRoute } from '@/routes/_authenticated/admin-withdrawals'
import { useAuthStore } from '@/stores/auth-store'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { AdminWithdrawalPage } from '../admin-page'
import type { Withdrawal } from '../api'

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore
    .getState()
    .auth.setUser({ id: 2, username: 'admin', role: ROLE.ADMIN })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:snapshot')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  vi.restoreAllMocks()
})

async function renderPage(
  path = '/admin-withdrawals',
  role: number = ROLE.ADMIN,
  initial: Partial<Withdrawal> = {}
) {
  let application: Withdrawal = {
    id: 42,
    user_id: 1,
    username: 'referrer',
    quota: 250000,
    status: 'pending',
    created_at: 1700000000,
    updated_at: 1700000000,
    updated_by: 0,
    currency_snapshot: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7,
    },
    ...initial,
  }
  useAuthStore.getState().auth.setUser({ id: 2, username: 'viewer', role })
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url.endsWith('/qr') || url.endsWith('/proof')) {
      return { data: new Blob(['png'], { type: 'image/png' }) }
    }
    if (url === '/api/withdrawal/admin/') {
      return {
        data: {
          success: true,
          data: { items: [application], total: 21, p: 1, page_size: 20 },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  const post = vi.spyOn(api, 'post').mockImplementation(async (url, body) => {
    if (url === '/api/withdrawal/admin/42/processing') {
      application = { ...application, status: 'processing' }
    }
    if (url === '/api/withdrawal/admin/42/proof') {
      application = { ...application, status: 'completed', proof_size: 10 }
    }
    if (url === '/api/withdrawal/admin/42/reject') {
      application = {
        ...application,
        status: 'rejected',
        reject_reason: (body as { reason: string }).reason,
      }
    }
    return { data: { success: true, data: null } }
  })
  const root = createRootRoute()
  const authenticated = createRoute({
    getParentRoute: () => root,
    id: '_authenticated',
  })
  const page = createRoute({
    getParentRoute: () => authenticated,
    path: 'admin-withdrawals/',
    validateSearch: WithdrawalRoute.options.validateSearch,
    beforeLoad: () => WithdrawalRoute.options.beforeLoad?.({} as never),
    component: AdminWithdrawalPage,
  })
  const forbidden = createRoute({
    getParentRoute: () => root,
    path: '/403',
    component: () => <p>Access denied</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([authenticated.addChildren([page]), forbidden]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { get, post, router }
}

it('shows money, user and status metadata without loading QR images for list rows', async () => {
  const { get } = await renderPage()
  expect(await screen.findByText('referrer')).toBeVisible()
  expect(screen.getByText('¥3.5')).toBeVisible()
  expect(screen.getByText('Awaiting withdrawal')).toBeVisible()
  expect(screen.getByText('Updated by: -')).toBeVisible()
  expect(get.mock.calls.some(([url]) => url.endsWith('/qr'))).toBe(false)
  expect(screen.getByRole('button', { name: 'Start processing' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
})

it('advances pending to processing and then uploads a PNG proof to complete', async () => {
  const user = userEvent.setup()
  const { post } = await renderPage()
  await user.click(
    await screen.findByRole('button', { name: 'Start processing' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/withdrawal/admin/42/processing')
  )
  expect(await screen.findByText('Processing')).toBeVisible()

  const input = document.querySelector('input[type="file"]')
  expect(input).not.toBeNull()
  const file = new File([new Uint8Array(10)], 'proof.png', {
    type: 'image/png',
  })
  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/withdrawal/admin/42/proof',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': null } })
    )
  )
  expect(await screen.findByText('Withdrawal completed')).toBeVisible()
  expect(
    await screen.findByRole('button', { name: 'View proof' })
  ).toBeVisible()
})

it('rejects a non-PNG proof without calling the upload endpoint', async () => {
  const { post } = await renderPage('/admin-withdrawals', ROLE.ADMIN, {
    status: 'processing',
  })
  const input = await waitFor(() => {
    const found = document.querySelector('input[type="file"]')
    expect(found).not.toBeNull()
    return found as HTMLInputElement
  })
  fireEvent.change(input, {
    target: {
      files: [new File(['pdf'], 'proof.pdf', { type: 'application/pdf' })],
    },
  })
  expect(post).not.toHaveBeenCalledWith(
    '/api/withdrawal/admin/42/proof',
    expect.anything(),
    expect.anything()
  )
})

it('requires a rejection reason, then displays it on the rejected row', async () => {
  const user = userEvent.setup()
  const { post } = await renderPage()
  await user.click(await screen.findByRole('button', { name: 'Reject' }))
  const dialog = await screen.findByRole('dialog', {
    name: 'Reject withdrawal application',
  })
  expect(
    within(dialog).getByText(/returned to the user referral rewards/)
  ).toBeVisible()
  await user.click(
    within(dialog).getByRole('button', { name: 'Reject withdrawal' })
  )
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    'Rejection reason is required'
  )
  expect(post).not.toHaveBeenCalled()
  await user.type(
    within(dialog).getByLabelText('Rejection reason'),
    'Incorrect Alipay account'
  )
  await user.click(
    within(dialog).getByRole('button', { name: 'Reject withdrawal' })
  )
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/withdrawal/admin/42/reject', {
      reason: 'Incorrect Alipay account',
    })
  )
  expect(await screen.findByText('Incorrect Alipay account')).toBeVisible()
  expect(screen.getByText('Rejected')).toBeVisible()
})

it('loads the current collection QR and the completion proof through authenticated blob requests', async () => {
  const user = userEvent.setup()
  const { get } = await renderPage('/admin-withdrawals', ROLE.ADMIN, {
    status: 'completed',
    proof_size: 10,
  })
  await user.click(
    await screen.findByRole('button', {
      name: 'Current collection QR code',
    })
  )
  const qrDialog = await screen.findByRole('dialog', {
    name: 'Current collection QR code',
  })
  expect(
    await within(qrDialog).findByRole('img', {
      name: 'Collection QR code preview',
    })
  ).toHaveAttribute('src', 'blob:snapshot')
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/admin/42/qr',
    expect.objectContaining({ responseType: 'blob' })
  )
  await user.click(
    within(qrDialog).getAllByRole('button', { name: 'Close' })[0]
  )
  await user.click(await screen.findByRole('button', { name: 'View proof' }))
  const proofDialog = await screen.findByRole('dialog', {
    name: 'Withdrawal proof',
  })
  expect(
    await within(proofDialog).findByRole('img', {
      name: 'Collection QR code preview',
    })
  ).toBeVisible()
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/admin/42/proof',
    expect.objectContaining({ responseType: 'blob' })
  )
})

it('shows a friendly message when the user has no collection QR code', async () => {
  const user = userEvent.setup()
  const { get } = await renderPage()
  get.mockImplementation(async (url) => {
    if (url === '/api/withdrawal/admin/') {
      return {
        data: {
          success: true,
          data: {
            items: [
              {
                id: 42,
                user_id: 1,
                username: 'referrer',
                quota: 250000,
                status: 'pending' as const,
                created_at: 1700000000,
                updated_at: 1700000000,
                updated_by: 0,
                currency_snapshot: DEFAULT_CURRENCY_CONFIG,
              },
            ],
            total: 1,
            p: 1,
            page_size: 20,
          },
        },
      }
    }
    throw new Error('boom')
  })
  await user.click(
    await screen.findByRole('button', {
      name: 'Current collection QR code',
    })
  )
  expect(
    await screen.findByText('The user has not configured a collection QR code')
  ).toBeVisible()
})

it('sends validated user/status filters and pagination from the route URL', async () => {
  const { get } = await renderPage(
    '/admin-withdrawals?page=2&pageSize=10&keyword=referrer&status=%5B%22completed%22%5D'
  )
  await screen.findByText('referrer')
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/admin/',
    expect.objectContaining({
      params: { p: 2, page_size: 10, keyword: 'referrer', status: 'completed' },
    })
  )
})

it('redirects a regular user away from the direct management URL before making any admin request', async () => {
  const { get } = await renderPage('/admin-withdrawals', ROLE.USER)
  expect(await screen.findByText('Access denied')).toBeVisible()
  expect(get).not.toHaveBeenCalled()
})
