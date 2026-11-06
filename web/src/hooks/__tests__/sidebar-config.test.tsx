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
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { checkIsActive } from '@/components/layout/lib/url-utils'
import { invalidateModelPricing } from '@/features/model-pricing/api'
import {
  parseSidebarModulesAdmin,
  serializeSidebarModulesAdmin,
} from '@/features/system-settings/maintenance/config'
import {
  MODEL_PRICING_ISSUES_QUERY_KEY,
  type ModelPricingIssue,
} from '@/features/system-settings/models/pricing-issues'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { useSidebarConfig } from '../use-sidebar-config'
import { useSidebarData } from '../use-sidebar-data'
import { useSidebarView } from '../use-sidebar-view'

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAuthStore.getState().auth.reset()
})

function sidebarFor(admin?: object, user?: object, canConfigure = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], {
    SidebarModulesAdmin: admin ? JSON.stringify(admin) : '',
  })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'alice',
    role: 1,
    permissions: { sidebar_settings: canConfigure },
    sidebar_modules: user ? JSON.stringify(user) : '',
  })
  function Wrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {props.children}
      </QueryClientProvider>
    )
  }
  const result = renderHook(
    () => useSidebarConfig(useSidebarData().navGroups),
    { wrapper: Wrapper }
  )
  return result
}

describe('security sidebar visibility', () => {
  it('old configurations show Security & Access immediately after Profile and keep API Keys', () => {
    const { result } = sidebarFor(
      { personal: { enabled: true, personal: true, topup: true } },
      { personal: { enabled: true, personal: true } }
    )
    expect(
      result.current
        .find((group) => group.id === 'personal')
        ?.items.map((item) => item.title)
    ).toEqual(['Wallet', 'Support tickets', 'Profile', 'Security & Access'])
    expect(
      result.current
        .flatMap((group) => group.items)
        .some((item) => item.title === 'API Keys')
    ).toBe(true)
  })
  it.each([
    [{ personal: { enabled: true, security: false } }, undefined],
    [{ personal: { enabled: false } }, { personal: { security: true } }],
    [undefined, { personal: { enabled: true, security: false } }],
    [undefined, { personal: { enabled: false } }],
  ])(
    'admin or user disablement hides Security & Access (%j, %j)',
    (admin, user) => {
      const { result } = sidebarFor(admin, user)
      expect(
        result.current
          .flatMap((group) => group.items)
          .some((item) => item.title === 'Security & Access')
      ).toBe(false)
    }
  )
  it('users without sidebar configuration permission retain the admin view', () => {
    const { result } = sidebarFor(
      undefined,
      { personal: { security: false } },
      false
    )
    expect(
      result.current
        .flatMap((group) => group.items)
        .some((item) => item.title === 'Security & Access')
    ).toBe(true)
  })
})

describe('support ticket sidebar entries', () => {
  it('legacy configurations enable separate user and admin support ticket toggles', () => {
    const config = parseSidebarModulesAdmin(
      '{"personal":{"enabled":true},"admin":{"enabled":true}}'
    )
    expect(config.personal.support_ticket).toBe(true)
    expect(config.admin.support_ticket).toBe(true)
    const { result } = sidebarFor(config)
    const titles = result.current
      .flatMap((group) => group.items)
      .map((item) => item.title)
    expect(titles).toContain('Support tickets')
    expect(titles).toContain('Support ticket management')
  })

  it.each([
    [{ personal: { enabled: true, support_ticket: false } }, undefined],
    [undefined, { personal: { enabled: true, support_ticket: false } }],
  ])(
    'admin or user settings can hide Support tickets (%j, %j)',
    (admin, user) => {
      const { result } = sidebarFor(admin, user)
      const titles = result.current
        .flatMap((group) => group.items)
        .map((item) => item.title)
      expect(titles).not.toContain('Support tickets')
      expect(titles).toContain('Support ticket management')
    }
  )

  it('the admin support ticket toggle does not hide the user ticket entry', () => {
    const { result } = sidebarFor({
      admin: { enabled: true, support_ticket: false },
    })
    const titles = result.current
      .flatMap((group) => group.items)
      .map((item) => item.title)
    expect(titles).not.toContain('Support ticket management')
    expect(titles).toContain('Support tickets')
  })
})

describe('withdrawal management navigation', () => {
  it('adds the withdrawal entry to legacy defaults and preserves explicit administrator hiding', () => {
    const legacy = parseSidebarModulesAdmin(
      '{"admin":{"enabled":true,"invoice":true}}'
    )
    expect(legacy.admin.withdrawal).toBe(true)
    const visible = sidebarFor(legacy)
    expect(
      visible.result.current.flatMap((group) => group.items)
    ).toContainEqual(
      expect.objectContaining({
        title: 'Withdrawal management',
        url: '/admin-withdrawals',
        requiredRole: ROLE.ADMIN,
      })
    )
    visible.unmount()
    const hidden = sidebarFor({ admin: { enabled: true, withdrawal: false } })
    expect(
      hidden.result.current
        .flatMap((group) => group.items)
        .map((item) => item.title)
    ).not.toContain('Withdrawal management')
    const saved = parseSidebarModulesAdmin(
      '{"admin":{"enabled":true,"withdrawal":false}}'
    )
    expect(saved.admin.withdrawal).toBe(false)
  })
  it('lets personal visibility further hide the withdrawal entry', () => {
    const { result } = sidebarFor(undefined, {
      admin: { enabled: true, withdrawal: false },
    })
    expect(
      result.current.flatMap((group) => group.items).map((item) => item.title)
    ).not.toContain('Withdrawal management')
  })
})

describe('audit log sidebar entry', () => {
  it('admin settings default Audit Logs to visible and preserve its independent toggle when saved', () => {
    const config = parseSidebarModulesAdmin(
      '{"console":{"enabled":true,"log":true}}'
    )
    expect(config.console.audit).toBe(true)
    config.console.audit = false
    const saved = parseSidebarModulesAdmin(serializeSidebarModulesAdmin(config))
    const { result } = sidebarFor(saved)
    const titles = result.current
      .flatMap((group) => group.items)
      .map((item) => item.title)
    expect(titles).not.toContain('Audit Logs')
    expect(titles).toContain('Usage Logs')
  })

  it('legacy configurations show a separate Audit Logs link immediately after Usage Logs', () => {
    const { result } = sidebarFor(
      { console: { enabled: true, log: true } },
      { console: { enabled: true, log: true } }
    )
    const items =
      result.current.find((group) => group.id === 'general')?.items ?? []
    const usageIndex = items.findIndex((item) => item.title === 'Usage Logs')
    expect(items[usageIndex + 1]).toMatchObject({
      title: 'Audit Logs',
      url: '/usage-logs/audit',
    })
    const selected = items.filter((item) =>
      checkIsActive('/usage-logs/audit', item)
    )
    expect(selected.map((item) => item.title)).toEqual(['Audit Logs'])
  })

  it.each([
    [{ console: { enabled: true, audit: false } }, undefined],
    [{ console: { enabled: false } }, { console: { audit: true } }],
    [undefined, { console: { enabled: true, audit: false } }],
    [undefined, { console: { enabled: false } }],
  ])(
    'admin and personal visibility rules can hide Audit Logs (%j, %j)',
    (admin, user) => {
      const { result } = sidebarFor(admin, user)
      expect(
        result.current
          .flatMap((group) => group.items)
          .some((item) => item.title === 'Audit Logs')
      ).toBe(false)
    }
  )

  it('hiding Usage Logs does not hide the independently configured Audit Logs entry', () => {
    const { result } = sidebarFor({ console: { enabled: true, log: false } })
    const titles = result.current
      .flatMap((group) => group.items)
      .map((item) => item.title)
    expect(titles).not.toContain('Usage Logs')
    expect(titles).toContain('Audit Logs')
  })
})

describe('model pricing badge', () => {
  function issue(modelName: string, pluginKey: string): ModelPricingIssue {
    return {
      model_name: modelName,
      plugin_key: pluginKey,
      plugin_name: pluginKey,
      reason: 'unconfigured',
    }
  }

  /** Lists the sidebar entries of the current view that carry a badge. */
  function BadgedEntries() {
    const { navGroups } = useSidebarView()
    const entries = navGroups
      .flatMap((group) => group.items)
      .flatMap((item) => [item, ...(item.items ?? [])])
      .filter((item) => item.badge)
    return (
      <ul aria-label='Badged entries'>
        {entries.map((item) => (
          <li key={item.title}>{`${item.title}: ${item.badge}`}</li>
        ))}
      </ul>
    )
  }

  async function renderSidebar(
    path: string,
    role: number,
    issues: () => ModelPricingIssue[],
    badgeSetting: () => boolean = () => true
  ) {
    const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
      let data: object = {}
      if (url === '/api/option/model_pricing/issues') {
        data = issues()
      } else if (url === '/api/option/') {
        data = [
          {
            key: 'DisplayModelPricingIssueBadgeEnabled',
            value: String(badgeSetting()),
          },
        ]
      }
      return { data: { success: true, data } }
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(['status'], { SidebarModulesAdmin: '' })
    useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role })
    const router = createRouter({
      routeTree: createRootRoute({ component: BadgedEntries }),
      history: createMemoryHistory({ initialEntries: [path] }),
    })
    await router.load()
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    return { client, get }
  }

  function badgedEntries() {
    return screen
      .getByRole('list', { name: 'Badged entries' })
      .querySelectorAll('li')
  }

  it('counts each task model once on the System Settings entry of the main sidebar', async () => {
    await renderSidebar('/dashboard/overview', ROLE.SUPER_ADMIN, () => [
      issue('kling-v3', 'kling'),
      issue('shared-video', 'alpha'),
      issue('shared-video', 'beta'),
    ])

    expect(await screen.findByText('System Settings: 2')).toBeInTheDocument()
    expect(badgedEntries()).toHaveLength(1)
  })

  it('inside System Settings shows the count on Billing & Payment and Model Pricing', async () => {
    await renderSidebar('/system-settings/site', ROLE.SUPER_ADMIN, () => [
      issue('kling-v3', 'kling'),
    ])

    expect(await screen.findByText('Model Pricing: 1')).toBeInTheDocument()
    expect(screen.getByText('Billing & Payment: 1')).toBeInTheDocument()
    expect(badgedEntries()).toHaveLength(2)
  })

  it('follows plugin changes and saved prices without a page reload', async () => {
    let issues = [issue('kling-v3', 'kling')]
    const { client } = await renderSidebar(
      '/dashboard/overview',
      ROLE.SUPER_ADMIN,
      () => issues
    )
    await screen.findByText('System Settings: 1')

    // A plugin action refreshes the count it may have changed.
    issues = [issue('kling-v3', 'kling'), issue('vidu-q3', 'vidu')]
    await act(() =>
      client.invalidateQueries({ queryKey: MODEL_PRICING_ISSUES_QUERY_KEY })
    )
    expect(await screen.findByText('System Settings: 2')).toBeInTheDocument()

    // Every pricing save runs this invalidation.
    issues = []
    await act(() => invalidateModelPricing(client))
    await waitFor(() => expect(badgedEntries()).toHaveLength(0))
  })

  it('shows the count again as soon as the setting is enabled', async () => {
    let showBadge = false
    const { client } = await renderSidebar(
      '/dashboard/overview',
      ROLE.SUPER_ADMIN,
      () => [issue('kling-v3', 'kling')],
      () => showBadge
    )
    expect(
      await screen.findByRole('list', { name: 'Badged entries' })
    ).toBeInTheDocument()
    expect(badgedEntries()).toHaveLength(0)

    showBadge = true
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['system-options'] })
    })

    expect(await screen.findByText('System Settings: 1')).toBeInTheDocument()
  })

  it('hides the count on every navigation entry when the setting is off', async () => {
    const { get } = await renderSidebar(
      '/system-settings/site',
      ROLE.SUPER_ADMIN,
      () => [issue('kling-v3', 'kling')],
      () => false
    )

    expect(
      await screen.findByRole('list', { name: 'Badged entries' })
    ).toBeInTheDocument()
    expect(screen.queryByText('Billing & Payment: 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Model Pricing: 1')).not.toBeInTheDocument()
    expect(badgedEntries()).toHaveLength(0)
    expect(get).toHaveBeenCalledWith('/api/option/')
  })

  it('never asks for the count below the super administrator role', async () => {
    const { get } = await renderSidebar(
      '/dashboard/overview',
      ROLE.ADMIN,
      () => [issue('kling-v3', 'kling')]
    )

    expect(
      await screen.findByRole('list', { name: 'Badged entries' })
    ).toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/api/option/model_pricing/issues')
    expect(get).not.toHaveBeenCalledWith('/api/option/')
    expect(badgedEntries()).toHaveLength(0)
  })
})
