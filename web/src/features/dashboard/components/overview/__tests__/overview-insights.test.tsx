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
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { createAppQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

import { OverviewInsights } from '../overview-insights'

let client: QueryClient
let requestedUrls: string[]
let modules: Record<string, boolean>
let logFailure: boolean
let pendingLogs: Promise<void> | undefined

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  requestedUrls = []
  modules = {}
  logFailure = false
  pendingLogs = undefined
  localStorage.clear()
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'overview-user',
    role: 1,
  })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    requestedUrls.push(url)
    if (url === '/api/status') {
      return { data: { success: true, data: { HeaderNavModules: modules } } }
    }
    if (url.startsWith('/api/log/self/stat?')) {
      await pendingLogs
      if (logFailure) {
        throw Object.assign(new Error('stats unavailable'), { status: 500 })
      }
      return {
        data: {
          success: true,
          data: { quota: 123, rpm: 4, tpm: 5, cache_rate: 0.25 },
        },
      }
    }
    if (url === '/api/rankings') {
      return {
        data: {
          success: true,
          data: {
            models: [
              {
                rank: 1,
                model_name: 'gpt-test',
                vendor: 'OpenAI',
                category: 'all',
                total_tokens: 1200,
                share: 0.8,
                growth_pct: 10,
              },
            ],
            vendors: [
              {
                rank: 1,
                vendor: 'OpenAI',
                total_tokens: 1200,
                share: 0.8,
                growth_pct: 10,
                models_count: 1,
                top_model: 'gpt-test',
              },
            ],
            top_movers: [],
            top_droppers: [],
            models_history: { points: [], models: [], buckets: 0 },
            vendor_share_history: { points: [], vendors: [], buckets: 0 },
          },
        },
      }
    }
    throw new Error(`Unexpected overview request: ${url}`)
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  localStorage.clear()
  vi.restoreAllMocks()
})

async function renderInsights() {
  const router = createRouter({
    routeTree: createRootRoute({ component: OverviewInsights }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('overview insights', () => {
  it('loads user log statistics and public model recommendations', async () => {
    await renderInsights()

    expect(await screen.findByText('gpt-test')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Open logs' }).getAttribute('href')
    ).toMatch(/^\/usage-logs\/common\?/)
    expect(await screen.findByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25'
    )
    expect(requestedUrls.some((url) => url.startsWith('/api/log/stat?'))).toBe(
      false
    )
    expect(
      requestedUrls.some((url) => url.includes('/upstream_cost_stat'))
    ).toBe(false)
    expect(requestedUrls).not.toContain(
      '/api/affiliate/analytics/admin/overview'
    )
  })

  it('loads administrator referral analytics without exposing it to users', async () => {
    useAuthStore.getState().auth.setUser({
      id: 1,
      username: 'overview-admin',
      role: 10,
    })
    vi.mocked(api.get).mockImplementation(async (url) => {
      requestedUrls.push(url)
      if (url === '/api/status') return { data: { success: true, data: {} } }
      if (url.startsWith('/api/log/upstream_cost_stat?')) {
        return {
          data: {
            success: true,
            data: {
              cost: 500000,
              revenue: 1000000,
              matched: 1,
              estimated: 0,
              unknown: 0,
              affiliate_cost: 0,
            },
          },
        }
      }
      if (url.startsWith('/api/log/stat?')) {
        return {
          data: {
            success: true,
            data: { quota: 123, rpm: 4, tpm: 5, cache_rate: 0.25 },
          },
        }
      }
      if (url === '/api/rankings') {
        return {
          data: {
            success: true,
            data: {
              models: [],
              vendors: [],
              top_movers: [],
              top_droppers: [],
              models_history: { points: [], models: [], buckets: 0 },
              vendor_share_history: { points: [], vendors: [], buckets: 0 },
            },
          },
        }
      }
      if (url === '/api/affiliate/analytics/admin/overview') {
        return {
          data: {
            success: true,
            data: {
              overview: {
                referral_count: 2,
                active_inviter_count: 1,
                commission_count: 3,
                credited_quota: 400,
              },
              trend: [],
            },
          },
        }
      }
      throw new Error(`Unexpected overview request: ${url}`)
    })

    await renderInsights()

    const referrals = await screen.findByRole('region', {
      name: 'Referral Analytics',
    })
    expect(
      await within(referrals).findByText('Referral registrations')
    ).toBeVisible()
    expect(within(referrals).getByText('2')).toBeVisible()
    expect(await screen.findByText('No model ranking data yet')).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide analytics amounts' })
    )
    expect(within(referrals).getByText('••••')).toBeVisible()
    const costs = screen.getByRole('region', { name: 'Upstream Cost' })
    expect(within(costs).getAllByText('Hidden')).toHaveLength(5)
    expect(
      requestedUrls.some((url) => url.startsWith('/api/log/self/stat?'))
    ).toBe(false)
  })

  it('keeps the rankings usable while log statistics fail and retries the failed request', async () => {
    const redirectToErrorPage = vi.fn()
    client = createAppQueryClient(redirectToErrorPage)
    client.setDefaultOptions({ queries: { retry: false } })
    logFailure = true
    await renderInsights()
    expect(
      await screen.findByText('Unable to load usage insights')
    ).toBeVisible()
    expect(await screen.findByRole('link', { name: 'gpt-test' })).toBeVisible()
    expect(redirectToErrorPage).not.toHaveBeenCalled()
    logFailure = false
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '25'
    )
  })

  it('keeps the detail link available while the log summary is loading', async () => {
    let resolveLogs = () => {}
    pendingLogs = new Promise<void>((resolve) => {
      resolveLogs = resolve
    })
    await renderInsights()
    const panel = await screen.findByRole('region', { name: 'Usage insights' })
    expect(panel).toHaveAttribute('aria-busy', 'true')
    const link = within(panel).getByRole('link', { name: 'Open logs' })
    const times = new URL(link.getAttribute('href') ?? '', 'http://localhost')
      .searchParams
    const seconds = new URLSearchParams(
      requestedUrls
        .find((url) => url.startsWith('/api/log/self/stat?'))
        ?.split('?')[1]
    )
    expect(Number(times.get('startTime'))).toBe(
      Number(seconds.get('start_timestamp')) * 1000
    )
    expect(Number(times.get('endTime')) - Number(times.get('startTime'))).toBe(
      86400000
    )
    resolveLogs()
    expect(await within(panel).findByRole('progressbar')).toBeVisible()
    expect(panel).toHaveAttribute('aria-busy', 'false')
  })

  it('omits disabled rankings and pricing modules without requesting the snapshot', async () => {
    modules = { rankings: false, pricing: false }
    await renderInsights()
    expect(await screen.findByRole('progressbar')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'View rankings' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull()
    expect(requestedUrls).not.toContain('/api/rankings')
  })
})
