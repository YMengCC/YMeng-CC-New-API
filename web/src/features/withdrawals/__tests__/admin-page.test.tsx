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
import type { Withdrawal, WithdrawalStatus } from '../api'

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
  role: number = ROLE.ADMIN
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
  }
  useAuthStore.getState().auth.setUser({ id: 2, username: 'viewer', role })
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/withdrawal/admin/42/qr') {
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
  const patch = vi.spyOn(api, 'patch').mockImplementation(async (_, body) => {
    application = {
      ...application,
      status: (body as { status: WithdrawalStatus }).status,
      updated_by: 2,
      updated_at: 1700000060,
    }
    return { data: { success: true, data: application } }
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
  return { get, patch, router }
}

it('shows snapshot money, user and status metadata without loading QR images for list rows', async () => {
  const { get } = await renderPage()
  expect(await screen.findByText('referrer')).toBeVisible()
  expect(screen.getByText('¥3.5')).toBeVisible()
  expect(screen.getByText('Awaiting withdrawal')).toBeVisible()
  expect(screen.getByText('Updated by: -')).toBeVisible()
  expect(get.mock.calls.some(([url]) => url.endsWith('/qr'))).toBe(false)
  expect(
    screen.getByRole('button', { name: 'Mark as awaiting withdrawal' })
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Mark withdrawal completed' })
  ).toBeEnabled()
})

it('loads the authenticated QR snapshot on demand and releases its object URL when closed', async () => {
  const user = userEvent.setup()
  const { get } = await renderPage()
  await user.click(
    await screen.findByRole('button', { name: 'View collection QR code' })
  )
  const dialog = await screen.findByRole('dialog', {
    name: 'Collection QR code snapshot',
  })
  expect(
    await within(dialog).findByRole('img', {
      name: 'Collection QR code preview',
    })
  ).toHaveAttribute('src', 'blob:snapshot')
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/admin/42/qr',
    expect.objectContaining({
      responseType: 'blob',
      signal: expect.any(AbortSignal),
    })
  )
  await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
  await waitFor(() =>
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:snapshot')
  )
})

it('requires confirmation before updating either status and refreshes administrator metadata', async () => {
  const user = userEvent.setup()
  const { patch } = await renderPage()
  await user.click(
    await screen.findByRole('button', { name: 'Mark withdrawal completed' })
  )
  let confirmation = await screen.findByRole('alertdialog', {
    name: 'Update withdrawal status',
  })
  expect(patch).not.toHaveBeenCalled()
  expect(
    within(confirmation).getByText(/This only changes the status/)
  ).toBeVisible()
  await user.click(within(confirmation).getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(patch).toHaveBeenCalledWith('/api/withdrawal/admin/42/status', {
      status: 'completed',
    })
  )
  expect(await screen.findByText('Withdrawal completed')).toBeVisible()
  expect(screen.getByText('Updated by: 2')).toBeVisible()
  await user.click(
    screen.getByRole('button', { name: 'Mark as awaiting withdrawal' })
  )
  confirmation = await screen.findByRole('alertdialog')
  await user.click(within(confirmation).getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(patch).toHaveBeenLastCalledWith('/api/withdrawal/admin/42/status', {
      status: 'pending',
    })
  )
  expect(await screen.findByText('Awaiting withdrawal')).toBeVisible()
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
