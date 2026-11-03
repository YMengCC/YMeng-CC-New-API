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
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
  type QueryClient,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { UpdateCheckerSection } from '@/features/system-settings/maintenance/update-checker-section'
import { api } from '@/lib/api'
import { createAppQueryClient } from '@/lib/query-client'
import { ROLE } from '@/lib/roles'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import {
  managedReleasesQueryOptions,
  type ManagedRelease,
} from '../managed-release-query'
import { SYSTEM_RELEASE_REPOSITORY, type SystemRelease } from '../releases'
import { useSystemUpdatePreferencesStore, useSystemUpdateStore } from '../store'
import { SystemUpdateAction } from '../system-update-action'
import { SYSTEM_UPDATE_INTERVAL, useSystemUpdate } from '../use-system-update'

const release = {
  tag_name: 'v1.10.0',
  name: 'Branch release',
  prerelease: false,
  published_at: '2026-11-02T13:01:00Z',
  body: 'Latest branch notes.',
} satisfies SystemRelease
const older = {
  ...release,
  tag_name: 'v1.9.0',
  name: 'Older release',
  body: 'Older branch notes.',
}
const snapshotKey = 'system-update:YMengCC/YMeng-CC-New-API:release-feed:v3'
const preferenceKey = 'system-update-preferences:YMengCC/YMeng-CC-New-API:v2'
const legacyPreferenceKey =
  'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2'
const feedRequest =
  vi.fn<(signal?: AbortSignal) => Promise<{ data: unknown }>>()
const browserFetch = vi.fn<typeof fetch>()
let client: QueryClient
let managedReleases: ManagedRelease[]
let controllerState: Record<string, unknown>
let runningVersion: string

function Wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}

function feedResponse(
  releases: SystemRelease[] = [older, release],
  error: string | null = null,
  lastCheckedAt = Date.now()
) {
  return {
    data: {
      success: true,
      data: {
        source: SYSTEM_RELEASE_REPOSITORY,
        releases,
        last_checked_at: lastCheckedAt,
        last_attempt_at: Date.now(),
        error,
      },
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  useSystemUpdateStore.setState({ snapshot: null })
  useSystemUpdatePreferencesStore.setState({ ignoredVersionsByUserId: {} })
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'admin', role: ROLE.ADMIN })
  focusManager.setFocused(true)
  onlineManager.setOnline(true)
  runningVersion = 'v1.9.0'
  managedReleases = [
    {
      tag: release.tag_name,
      name: release.name ?? '',
      compatible: true,
      reason: '',
      image: 'fixture',
    },
    {
      tag: older.tag_name,
      name: older.name ?? '',
      compatible: false,
      reason: 'Incompatible deployment',
      image: 'fixture',
    },
  ]
  controllerState = {
    supported: true,
    state: 'ready',
    reason: '',
    current_version: runningVersion,
    operation_id: '',
    draining: false,
  }
  feedRequest.mockReset().mockImplementation(async () => feedResponse())
  browserFetch.mockReset()
  vi.stubGlobal('fetch', browserFetch)
  client = createAppQueryClient()
  client.setQueryData(STATUS_QUERY_KEY, { version: runningVersion })
  vi.spyOn(api, 'get').mockImplementation(async (url, options) => {
    if (url === '/api/system-update/release-feed') {
      return feedRequest(options?.signal as AbortSignal | undefined)
    }
    if (url === '/api/system-update/status') {
      return { data: { success: true, data: controllerState } }
    }
    if (url === '/api/system-update/releases') {
      return { data: { success: true, data: { releases: managedReleases } } }
    }
    return { data: { success: true, data: { version: runningVersion } } }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useSystemUpdateStore.setState({ snapshot: null })
  useSystemUpdatePreferencesStore.setState({ ignoredVersionsByUserId: {} })
  useAuthStore.getState().auth.reset()
  localStorage.clear()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('backend update feed', () => {
  test.each([null, ROLE.USER])(
    'hides update entry and makes no release request for role %s',
    (role) => {
      useAuthStore
        .getState()
        .auth.setUser(role === null ? null : { id: 2, username: 'user', role })
      render(<SystemUpdateAction />, { wrapper: Wrapper })
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(feedRequest).not.toHaveBeenCalled()
      expect(browserFetch).not.toHaveBeenCalled()
    }
  )

  test.each([ROLE.ADMIN, ROLE.SUPER_ADMIN])(
    'loads through the project backend without root queries before opening for role %s',
    async (role) => {
      useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role })
      render(<SystemUpdateAction />, { wrapper: Wrapper })
      await screen.findByRole('button', {
        name: 'New version available: v1.10.0',
      })
      expect(api.get).toHaveBeenCalledWith(
        '/api/system-update/release-feed',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(feedRequest).toHaveBeenCalledTimes(1)
      expect(browserFetch).not.toHaveBeenCalled()
      expect(
        vi
          .mocked(api.get)
          .mock.calls.some(
            ([url]) =>
              url === '/api/system-update/releases' ||
              url === '/api/system-update/status'
          )
      ).toBe(false)
    }
  )

  test('shares one feed with maintenance and returns focus after keyboard open and Escape', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SystemUpdateAction presentation='version' />
        <UpdateCheckerSection currentVersion='v1.9.0' startTime={1700000000} />
      </>,
      { wrapper: Wrapper }
    )
    const triggers = await screen.findAllByRole('button', {
      name: /New version available: v1\.10\.0/,
    })
    expect(triggers).toHaveLength(2)
    expect(feedRequest).toHaveBeenCalledTimes(1)
    expect(within(triggers[0]).getByText('v1.9.0')).toHaveClass('truncate')
    triggers[0].focus()
    await user.keyboard('{Enter}')
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText(release.body)).toBeVisible()
    expect(
      within(dialog).getByRole('link', { name: 'Go to GitHub' })
    ).toHaveAttribute(
      'href',
      'https://github.com/YMengCC/YMeng-CC-New-API/releases/tag/v1.10.0'
    )
    expect(
      vi
        .mocked(api.get)
        .mock.calls.some(([url]) => url === '/api/system-update/status')
    ).toBe(false)
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(triggers[0]).toHaveFocus()
  })

  test('merges controller-only versions after a cold feed failure without unknown latest or duplicate lists', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'root', role: ROLE.SUPER_ADMIN })
    feedRequest.mockRejectedValue({
      response: {
        status: 503,
        data: {
          data: {
            source: SYSTEM_RELEASE_REPOSITORY,
            releases: [],
            last_checked_at: 0,
            last_attempt_at: Date.now(),
            error: 'rate-limit',
          },
        },
      },
    })
    const user = userEvent.setup()
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    await user.click(
      screen.getByRole('button', { name: /System updates, current version/ })
    )
    const dialog = screen.getByRole('dialog')
    await within(dialog).findByRole('button', {
      name: /v1\.10\.0.*Latest release/,
    })
    expect(
      within(dialog).getAllByRole('region', { name: 'Release history' })
    ).toHaveLength(1)
    expect(
      within(dialog).getAllByRole('button', {
        name: /v1\.10\.0.*Latest release/,
      })
    ).toHaveLength(1)
    expect(
      within(dialog).getAllByText('GitHub rate limit reached. Try again later.')
    ).toHaveLength(1)
    expect(
      within(dialog).queryByText('Updates have not been checked yet.')
    ).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Unknown')).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Install update' })
    ).toBeEnabled()
    expect(useSystemUpdateStore.getState().snapshot?.releases).toEqual([])
    expect(browserFetch).not.toHaveBeenCalled()
  })

  test('does not use root controller cache after switching to an ordinary administrator', async () => {
    client.setQueryData(managedReleasesQueryOptions.queryKey, [
      { ...managedReleases[0], tag: 'v99.0.0' },
    ])
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe('v1.10.0')
    )
    expect(hook.result.current.releases.map((item) => item.tag_name)).toEqual([
      'v1.10.0',
      'v1.9.0',
    ])
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 1, username: 'root', role: ROLE.SUPER_ADMIN })
    )
    expect(hook.result.current.release?.tag_name).toBe('v99.0.0')
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'admin', role: ROLE.ADMIN })
    )
    expect(hook.result.current.release?.tag_name).toBe('v1.10.0')
  })

  test('keeps public release notes readable when the root controller is unconfigured', async () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'root', role: ROLE.SUPER_ADMIN })
    controllerState = {
      supported: false,
      state: 'unconfigured',
      reason:
        'Connect the managed update controller before installing releases.',
    }
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: /New version available/ })
    )
    expect(await screen.findByText(release.body)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Install update' })
    ).not.toBeEnabled()
    expect(
      vi
        .mocked(api.get)
        .mock.calls.some(([url]) => url === '/api/system-update/releases')
    ).toBe(false)
  })

  test('preserves backend success timestamps and cached history when a refresh reports source failure', async () => {
    const oldTime = Date.now() - 10000
    feedRequest.mockImplementation(async () =>
      feedResponse([release], null, oldTime)
    )
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    )
    expect(hook.result.current.snapshot?.lastCheckedAt).toBe(oldTime)
    feedRequest.mockImplementation(async () =>
      feedResponse([release], 'rate-limit', oldTime)
    )
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.snapshot?.error).toBe('rate-limit')
    )
    expect(hook.result.current.snapshot?.lastCheckedAt).toBe(oldTime)
    expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
  })

  test('retains browser-cached notes when a restarted backend has not fetched releases successfully', async () => {
    const oldTime = Date.now() - 10000
    feedRequest.mockImplementation(async () =>
      feedResponse([release], null, oldTime)
    )
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() =>
      expect(hook.result.current.release?.body).toBe(release.body)
    )
    feedRequest.mockImplementation(async () =>
      feedResponse([], 'rate-limit', 0)
    )
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.snapshot?.error).toBe('rate-limit')
    )
    expect(hook.result.current.release?.body).toBe(release.body)
    expect(hook.result.current.snapshot?.lastCheckedAt).toBe(oldTime)
  })

  test('never maps backend authentication rejection to GitHub rate limiting or stale releases', async () => {
    feedRequest.mockRejectedValue({
      response: { status: 403, data: { message: 'Forbidden' } },
    })
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.checking).toBe(false))
    expect(hook.result.current.snapshot).toBeUndefined()
    expect(useSystemUpdateStore.getState().snapshot).toBeNull()
    expect(hook.result.current.releases).toEqual([])
    expect(browserFetch).not.toHaveBeenCalled()
  })
})

describe('one release history', () => {
  test('sorts numerically and allows keyboard toggles, preserving state on same-version refresh and resetting on reopen', async () => {
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    const trigger = await screen.findByRole('button', {
      name: /New version available/,
    })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog')
    const latest = within(dialog).getByRole('button', {
      name: /v1\.10\.0.*Latest release/,
    })
    const previous = within(dialog).getByRole('button', {
      name: /v1\.9\.0.*Current version/,
    })
    expect(
      within(dialog).getAllByRole('button', { name: /v1\.(10|9)\.0/ })
    ).toEqual([latest, previous])
    expect(latest).toHaveAttribute('aria-expanded', 'true')
    expect(previous).toHaveAttribute('aria-expanded', 'false')
    previous.focus()
    await user.keyboard('{Enter}')
    expect(await within(dialog).findByText(older.body)).toBeVisible()
    await user.keyboard(' ')
    expect(previous).toHaveAttribute('aria-expanded', 'false')
    await user.click(latest)
    expect(latest).toHaveAttribute('aria-expanded', 'false')
    await user.click(
      within(dialog).getByRole('button', { name: 'Check again' })
    )
    await waitFor(() => expect(feedRequest).toHaveBeenCalledTimes(2))
    expect(latest).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    await user.click(trigger)
    expect(
      screen.getByRole('button', { name: /v1\.10\.0.*Latest release/ })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: /v1\.9\.0.*Current version/ })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  test('expands the latest version when the backend response arrives after opening', async () => {
    let complete: ((value: { data: unknown }) => void) | undefined
    feedRequest.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const user = userEvent.setup()
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    await user.click(
      screen.getByRole('button', { name: /System updates, current version/ })
    )
    await act(async () => {
      complete?.(feedResponse())
    })
    expect(
      await screen.findByRole('button', { name: /v1\.10\.0.*Latest release/ })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(release.body)).toBeVisible()
  })

  test('treats successful empty history differently from a failed check', async () => {
    feedRequest.mockImplementation(async () => feedResponse([]))
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(
        useSystemUpdateStore.getState().snapshot?.lastCheckedAt
      ).toBeGreaterThan(0)
    )
    await user.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(
      screen.getByText('No releases found.', {
        selector: '[data-slot=empty-title]',
      })
    ).toBeVisible()
    expect(
      screen.queryByText('Failed to check for updates')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Go to GitHub' })
    ).not.toBeInTheDocument()
  })

  test('shows only one compact failure message instead of not-checked and a separate error panel', async () => {
    feedRequest.mockImplementation(async () =>
      feedResponse([], 'rate-limit', 0)
    )
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: 'Failed to check for updates' })
    )
    expect(
      screen.getAllByText('GitHub rate limit reached. Try again later.')
    ).toHaveLength(1)
    expect(
      screen.queryByText('Updates have not been checked yet.')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Oops! Something went wrong')
    ).not.toBeInTheDocument()
  })

  test('keeps long notes in the scrollable body and actions outside it', async () => {
    const name = 'Long-unbroken-release-title-that-must-wrap-on-mobile-screens'
    feedRequest.mockImplementation(async () =>
      feedResponse([
        {
          ...release,
          name,
          body: '```text\nlong-code-line-in-release-notes\n```',
        },
      ])
    )
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: /New version available/ })
    )
    const history = screen.getByRole('region', { name: 'Release history' })
    expect(within(history).getByText(name)).toHaveClass('wrap-anywhere')
    expect(
      await within(history).findByText('long-code-line-in-release-notes')
    ).toBeVisible()
    const body = history
      .closest('[data-slot=dialog-content]')
      ?.querySelector('.overscroll-contain')
    expect(body).toHaveClass('min-h-0', 'overflow-y-auto', 'overflow-x-hidden')
    expect(
      body?.contains(screen.getByRole('button', { name: 'Check again' }))
    ).toBe(false)
  })

  test('uses no-notes text for whitespace bodies and opens a newly discovered latest release', async () => {
    feedRequest.mockImplementation(async () =>
      feedResponse([{ ...release, body: ' \n ' }])
    )
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: /New version available/ })
    )
    expect(screen.getByText('No release notes provided.')).toBeVisible()
    feedRequest.mockImplementation(async () =>
      feedResponse([{ ...release, tag_name: 'v1.11.0' }, release])
    )
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(
      await screen.findByRole('button', { name: /v1\.11\.0.*Latest release/ })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /v1\.10\.0/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
})

describe('update notification preferences and persistence', () => {
  test('does not suggest downgrades and updates the reminder after running version changes', async () => {
    client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.11.0' })
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.release).not.toBeNull())
    expect(hook.result.current.hasUpdate).toBe(false)
    act(() => client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.9.0' }))
    await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
  })

  test.each(['', 'v0.0.0'])(
    'keeps unknown current version for %s while allowing notification preferences',
    async (version) => {
      client.setQueryData(STATUS_QUERY_KEY, { version })
      const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
      await waitFor(() => expect(hook.result.current.release).not.toBeNull())
      expect(hook.result.current.currentVersion).toBeUndefined()
      expect(hook.result.current.comparison).toBeNull()
      act(() => hook.result.current.setIgnored(true))
      expect(hook.result.current.isIgnored).toBe(true)
    }
  )

  test('ignores/restores across entries and keeps per-administrator preferences isolated', async () => {
    const one = renderHook(useSystemUpdate, { wrapper: Wrapper })
    const two = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(one.result.current.shouldNotify).toBe(true))
    act(() => one.result.current.setIgnored(true))
    expect(two.result.current.shouldNotify).toBe(false)
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'admin2', role: ROLE.ADMIN })
    )
    expect(one.result.current.shouldNotify).toBe(true)
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 1, username: 'admin', role: ROLE.ADMIN })
    )
    expect(two.result.current.isIgnored).toBe(true)
    act(() => two.result.current.setIgnored(false))
    expect(one.result.current.shouldNotify).toBe(true)
    expect(feedRequest).toHaveBeenCalledTimes(1)
  })

  test('preserves trusted cache and preferences across reload without refetching', async () => {
    const first = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(first.result.current.shouldNotify).toBe(true))
    act(() => first.result.current.setIgnored(true))
    const saved = localStorage.getItem(snapshotKey)
    const preferences = localStorage.getItem(preferenceKey)
    first.unmount()
    client.clear()
    useSystemUpdateStore.setState({ snapshot: null })
    useSystemUpdatePreferencesStore.setState({ ignoredVersionsByUserId: {} })
    if (saved === null || preferences === null) {
      throw new Error(
        'Expected release snapshot and notification preferences to be persisted'
      )
    }
    localStorage.setItem(snapshotKey, saved)
    localStorage.setItem(preferenceKey, preferences)
    await useSystemUpdateStore.persist.rehydrate()
    await useSystemUpdatePreferencesStore.persist.rehydrate()
    client = createAppQueryClient()
    client.setQueryData(STATUS_QUERY_KEY, { version: runningVersion })
    const second = renderHook(useSystemUpdate, { wrapper: Wrapper })
    expect(second.result.current.hasUpdate).toBe(true)
    expect(second.result.current.isIgnored).toBe(true)
    expect(feedRequest).toHaveBeenCalledTimes(1)
  })

  test('migrates only the known project alias notification preferences and rejects direct-GitHub snapshots', async () => {
    localStorage.removeItem(preferenceKey)
    localStorage.setItem(
      legacyPreferenceKey,
      JSON.stringify({
        state: { ignoredVersionsByUserId: { 1: [release.tag_name] } },
        version: 0,
      })
    )
    localStorage.setItem(
      'system-update:atelier-of-dongn/YMeng-CC-New-API:v2',
      JSON.stringify({
        state: {
          snapshot: {
            source: 'atelier-of-dongn/YMeng-CC-New-API',
            releases: [{ ...release, tag_name: 'v99.0.0' }],
            lastCheckedAt: Date.now(),
            lastAttemptAt: Date.now(),
            error: null,
          },
        },
        version: 0,
      })
    )
    await useSystemUpdateStore.persist.rehydrate()
    await useSystemUpdatePreferencesStore.persist.rehydrate()
    expect(useSystemUpdateStore.getState().snapshot).toBeNull()
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    )
    expect(hook.result.current.isIgnored).toBe(true)
  })

  test('does not replace existing current-repository preferences with an old alias', async () => {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify({ state: { ignoredVersionsByUserId: {} }, version: 0 })
    )
    localStorage.setItem(
      legacyPreferenceKey,
      JSON.stringify({
        state: { ignoredVersionsByUserId: { 1: [release.tag_name] } },
        version: 0,
      })
    )
    await useSystemUpdatePreferencesStore.persist.rehydrate()
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
  })

  test('synchronizes ignored versions from another tab and clears them when storage is cleared', async () => {
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
    act(() => {
      const value = JSON.stringify({
        state: { ignoredVersionsByUserId: { 1: [release.tag_name] } },
        version: 0,
      })
      localStorage.setItem(preferenceKey, value)
      window.dispatchEvent(
        new StorageEvent('storage', { key: preferenceKey, newValue: value })
      )
    })
    expect(hook.result.current.shouldNotify).toBe(false)
    act(() => {
      localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(hook.result.current.shouldNotify).toBe(true)
  })

  test.each(['blocked', 'corrupt', 'future', 'wrong-source'])(
    'checks backend despite %s persisted storage',
    async (state) => {
      if (state === 'blocked') {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
          throw new Error('blocked')
        })
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new Error('blocked')
        })
      } else {
        const value =
          state === 'corrupt'
            ? '{broken'
            : JSON.stringify({
                state: {
                  snapshot: {
                    source:
                      state === 'wrong-source'
                        ? 'another/project'
                        : SYSTEM_RELEASE_REPOSITORY,
                    releases: [release],
                    lastCheckedAt: 0,
                    lastAttemptAt: Date.now() + 86400000,
                    error: null,
                  },
                },
                version: 0,
              })
        localStorage.setItem(snapshotKey, value)
        await useSystemUpdateStore.persist.rehydrate()
      }
      const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
      await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
      act(() => hook.result.current.setIgnored(true))
      expect(hook.result.current.isIgnored).toBe(true)
    }
  )
})

describe('backend check scheduling and errors', () => {
  test('checks hourly across consumers and stops on logout', async () => {
    vi.useFakeTimers()
    const first = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(first.result.current.hasUpdate).toBe(true)
    renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL)
    })
    expect(feedRequest).toHaveBeenCalledTimes(2)
    act(() => useAuthStore.getState().auth.reset())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL)
    })
    expect(feedRequest).toHaveBeenCalledTimes(2)
  })

  test('waits while hidden or offline and refreshes when visibility or connectivity returns', async () => {
    vi.useFakeTimers()
    focusManager.setFocused(false)
    renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(feedRequest).not.toHaveBeenCalled()
    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(feedRequest).toHaveBeenCalledTimes(1)
    act(() => onlineManager.setOnline(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL)
    })
    expect(feedRequest).toHaveBeenCalledTimes(1)
    await act(async () => {
      onlineManager.setOnline(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(feedRequest).toHaveBeenCalledTimes(2)
  })

  test('aborts in-flight backend checks on logout without persisting failure', async () => {
    let signal: AbortSignal | undefined
    feedRequest.mockImplementation((value) => {
      signal = value
      return new Promise((_resolve, reject) =>
        value?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      )
    })
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await waitFor(() => expect(feedRequest).toHaveBeenCalledTimes(1))
    act(() => useAuthStore.getState().auth.reset())
    await waitFor(() => expect(signal?.aborted).toBe(true))
    expect(useSystemUpdateStore.getState().snapshot).toBeNull()
  })

  test('does not retry backend source failures immediately on focus or remount', async () => {
    vi.useFakeTimers()
    feedRequest.mockImplementation(async () => feedResponse([], 'timeout', 0))
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(hook.result.current.snapshot?.error).toBe('timeout')
    hook.unmount()
    renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(feedRequest).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(feedRequest).toHaveBeenCalledTimes(2)
  })

  test('preserves cached releases and reports one manual failure toast', async () => {
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.release).not.toBeNull())
    feedRequest.mockRejectedValue(new Error('offline backend'))
    const error = vi.spyOn(toast, 'error')
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.snapshot?.error).toBe('network')
    )
    expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    expect(error).toHaveBeenCalledTimes(1)
  })

  test('rejects malformed backend payloads and clears history on successful empty response', async () => {
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.release).not.toBeNull())
    feedRequest.mockResolvedValue({ data: { success: true, data: {} } })
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.snapshot?.error).toBe('payload')
    )
    expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    feedRequest.mockImplementation(async () => feedResponse([]))
    await act(async () => hook.result.current.checkNow())
    await waitFor(() => expect(hook.result.current.releases).toEqual([]))
    expect(hook.result.current.shouldNotify).toBe(false)
  })
})
