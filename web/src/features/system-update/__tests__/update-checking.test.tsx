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

import { useSystemUpdatePreferencesStore, useSystemUpdateStore } from '../store'
import { SystemUpdateAction } from '../system-update-action'
import { SYSTEM_UPDATE_INTERVAL, useSystemUpdate } from '../use-system-update'

const release = {
  tag_name: 'v1.0.0-rc.36',
  draft: false,
  prerelease: true,
  published_at: '2026-09-08T13:01:00Z',
  body: 'Release notes for administrators.',
}
const fetchMock = vi.fn<typeof fetch>()
let client: QueryClient

function Wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}

function respondWithRelease(tag = release.tag_name): void {
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify([{ ...release, tag_name: tag }]), {
        headers: { 'Content-Type': 'application/json' },
      })
  )
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
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  respondWithRelease()
  client = createAppQueryClient()
  client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.35' })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { version: 'v1.0.0-rc.35' } },
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

describe('administrator update entry', () => {
  test.each([null, ROLE.USER])(
    'hides the entry and makes no release request for role %s',
    (role) => {
      useAuthStore
        .getState()
        .auth.setUser(role === null ? null : { id: 2, username: 'user', role })
      render(
        <>
          <SystemUpdateAction />
          <SystemUpdateAction presentation='version' />
        </>,
        { wrapper: Wrapper }
      )
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  test.each([ROLE.ADMIN, ROLE.SUPER_ADMIN])(
    'automatically shows the update indicator for administrator role %s without opening a dialog',
    async (role) => {
      useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role })
      render(<SystemUpdateAction />, { wrapper: Wrapper })
      const button = await screen.findByRole('button', {
        name: 'New version available: v1.0.0-rc.36',
      })
      expect(button).toHaveAttribute('aria-haspopup', 'dialog')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]
      expect(String(url)).toBe(
        'https://api.github.com/repos/atelier-of-dongn/YMeng-CC-New-API/releases?per_page=100'
      )
      expect(options?.credentials).toBe('omit')
      expect(options?.headers).toEqual({
        Accept: 'application/vnd.github+json',
      })
    }
  )

  test('shares results with maintenance, opens release details by keyboard and returns focus on Escape', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SystemUpdateAction presentation='version' />
        <UpdateCheckerSection
          currentVersion='v1.0.0-rc.35'
          startTime={1_700_000_000}
        />
      </>,
      { wrapper: Wrapper }
    )
    const buttons = await screen.findAllByRole('button', {
      name: /New version available: v1\.0\.0-rc\.36/,
    })
    expect(buttons).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(within(buttons[0]).getByText('v1.0.0-rc.35')).toHaveClass('truncate')
    expect(within(buttons[0]).getByText('Update available')).toHaveClass(
      'hidden',
      '@min-[22rem]/system-brand:inline-flex'
    )
    expect(within(buttons[1]).getByText('Update available')).not.toHaveClass(
      'hidden'
    )

    buttons[0].focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'System updates' })
    expect(await within(dialog).findByText(release.body)).toBeInTheDocument()
    expect(within(dialog).getByText('Pre-release')).toBeInTheDocument()
    expect(within(dialog).getByText('Published at')).toBeInTheDocument()
    expect(
      within(dialog).queryByText(
        'Checks hourly while you are online, including pre-releases.'
      )
    ).not.toBeInTheDocument()
    expect(
      within(dialog).queryByText('Last successful check')
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'Go to GitHub' })
    ).toHaveAttribute(
      'href',
      'https://github.com/atelier-of-dongn/YMeng-CC-New-API/releases/tag/v1.0.0-rc.36'
    )
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(buttons[0]).toHaveFocus()
  })

  test('does not suggest a downgrade and updates every entry after a manual recheck', async () => {
    const user = userEvent.setup()
    client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.37' })
    render(
      <>
        <SystemUpdateAction />
        <SystemUpdateAction compact={false} />
      </>,
      { wrapper: Wrapper }
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await user.click(
      screen.getAllByRole('button', { name: 'Check for updates' })[0]
    )
    expect(
      await screen.findByText('No newer version available.')
    ).toBeInTheDocument()
    respondWithRelease('v1.0.0-rc.38')
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(
      await screen.findByText('New version available: v1.0.0-rc.38', {
        selector: 'p',
      })
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(
      screen.getAllByRole('button', {
        name: 'New version available: v1.0.0-rc.38',
      })
    ).toHaveLength(2)

    act(() =>
      client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.38' })
    )
    expect(
      await screen.findAllByRole('button', { name: 'Check for updates' })
    ).toHaveLength(2)
  })

  test.each(['', 'v0.0.0'])(
    'shows an unknown current version for %s and allows ignoring the fetched release',
    async (version) => {
      const user = userEvent.setup()
      client.setQueryData(STATUS_QUERY_KEY, { version })
      render(<SystemUpdateAction presentation='version' />, {
        wrapper: Wrapper,
      })
      const trigger = screen.getByRole('button', {
        name: 'System updates, current version: Unknown version',
      })
      await user.click(trigger)
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText('Unknown version')).toBeInTheDocument()
      expect(
        await within(dialog).findByRole('link', { name: 'Go to GitHub' })
      ).toBeInTheDocument()
      expect(
        within(dialog).queryByText('Unable to compare versions')
      ).not.toBeInTheDocument()
      expect(
        within(dialog).queryByText('No newer version available.')
      ).not.toBeInTheDocument()
      await user.click(
        within(dialog).getByRole('button', { name: 'Ignore this version' })
      )
      expect(
        within(dialog).getByText('This version is ignored')
      ).toBeInTheDocument()
      expect(trigger).not.toHaveAttribute(
        'title',
        expect.stringContaining('New version available')
      )
    }
  )

  test('ignores and restores reminders in every entry while keeping release details open', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SystemUpdateAction presentation='version' />
        <SystemUpdateAction compact={false} />
      </>,
      { wrapper: Wrapper }
    )
    const triggers = await screen.findAllByRole('button', {
      name: /New version available: v1\.0\.0-rc\.36/,
    })
    await user.click(triggers[0])
    const dialog = screen.getByRole('dialog')
    within(dialog).getByRole('button', { name: 'Ignore this version' }).focus()
    await user.keyboard('{Enter}')
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByText('This version is ignored')
    ).toBeInTheDocument()
    for (const trigger of triggers) {
      expect(
        within(trigger).queryByText('Update available')
      ).not.toBeInTheDocument()
      expect(
        within(trigger).getByRole('status', { hidden: true })
      ).toBeEmptyDOMElement()
      expect(trigger).not.toHaveAttribute(
        'title',
        expect.stringContaining('New version available')
      )
    }
    expect(
      within(dialog).getByRole('link', { name: 'Go to GitHub' })
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(triggers[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.click(
      screen.getByRole('button', { name: 'Restore notifications' })
    )
    expect(
      screen.queryByText('This version is ignored')
    ).not.toBeInTheDocument()
    for (const trigger of triggers) {
      expect(within(trigger).getByText('Update available')).toBeInTheDocument()
      expect(
        within(trigger).getByRole('status', { hidden: true })
      ).toHaveTextContent('New version available: v1.0.0-rc.36')
    }
  })

  test('keeps the previous release on automatic failure and reports a failed manual check once', async () => {
    const user = userEvent.setup()
    const oldCheck = Date.now() - SYSTEM_UPDATE_INTERVAL - 1
    const olderRelease = {
      ...release,
      tag_name: 'v1.0.0-rc.34',
      body: 'Older cached branch notes',
    }
    useSystemUpdateStore.getState().setSnapshot({
      source: 'atelier-of-dongn/YMeng-CC-New-API',
      releases: [release, olderRelease],
      lastCheckedAt: oldCheck,
      lastAttemptAt: oldCheck,
      error: null,
    })
    fetchMock.mockImplementation(async () => new Response('', { status: 429 }))
    const toastError = vi.spyOn(toast, 'error')
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(useSystemUpdateStore.getState().snapshot?.error).toBe('rate-limit')
    )
    expect(toastError).not.toHaveBeenCalled()
    await user.click(
      screen.getByRole('button', {
        name: 'New version available: v1.0.0-rc.36',
      })
    )
    expect(
      screen.getByText('Showing the last successfully checked releases.')
    ).toBeInTheDocument()
    expect(useSystemUpdateStore.getState().snapshot?.lastCheckedAt).toBe(
      oldCheck
    )
    expect(
      screen.getByRole('button', { name: /v1\.0\.0-rc\.34/ })
    ).toHaveAttribute('aria-expanded', 'false')
    expect(
      useSystemUpdateStore
        .getState()
        .snapshot?.releases.map((item) => item.tag_name)
    ).toEqual([release.tag_name, olderRelease.tag_name])
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1))
    expect(
      screen.getByText('GitHub rate limit reached. Try again later.')
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('release history', () => {
  test('sorts versions with only the latest expanded, preserves toggles on recheck and resets on reopen', async () => {
    const user = userEvent.setup()
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify([
            { ...release, tag_name: 'v1.9.0', body: 'Older branch notes' },
            {
              ...release,
              tag_name: 'v1.10.0',
              body: 'Latest branch notes',
              prerelease: false,
            },
          ])
        )
    )
    client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.9.0' })
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    const trigger = await screen.findByRole('button', {
      name: 'New version available: v1.10.0',
    })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog')
    const latest = within(dialog).getByRole('button', { name: /v1\.10\.0/ })
    const older = within(dialog).getByRole('button', { name: /v1\.9\.0/ })
    const versions = within(dialog).getAllByRole('button', {
      name: /v1\.(?:10|9)\.0/,
    })
    expect(versions).toEqual([latest, older])
    expect(latest).toHaveAttribute('aria-expanded', 'true')
    expect(older).toHaveAttribute('aria-expanded', 'false')
    expect(await within(dialog).findByText('Latest branch notes')).toBeVisible()
    expect(
      within(dialog).queryByText('Older branch notes')
    ).not.toBeInTheDocument()
    expect(within(older).getByText('Current version')).toBeInTheDocument()

    older.focus()
    await user.keyboard('{Enter}')
    expect(older).toHaveAttribute('aria-expanded', 'true')
    expect(await within(dialog).findByText('Older branch notes')).toBeVisible()
    expect(latest).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(older).toHaveAttribute('aria-expanded', 'false')
    await user.tab({ shift: true })
    expect(
      within(dialog).getByRole('link', { name: 'View release' })
    ).toHaveFocus()
    await user.tab({ shift: true })
    expect(latest).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(latest).toHaveAttribute('aria-expanded', 'false')
    await user.click(
      within(dialog).getByRole('button', { name: 'Check again' })
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
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
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith(
          'https://api.github.com/repos/atelier-of-dongn/YMeng-CC-New-API/'
        )
      )
    ).toBe(true)
  })

  test('expands the latest release when history arrives after the dialog opens', async () => {
    const user = userEvent.setup()
    let finishRequest: ((response: Response) => void) | undefined
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve
        })
    )
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    await user.click(
      screen.getByRole('button', { name: /System updates, current version/ })
    )
    expect(
      screen.getByText('Checking updates...', { selector: 'p' })
    ).toBeVisible()
    await act(async () => {
      finishRequest?.(new Response(JSON.stringify([release])))
    })
    const latest = await screen.findByRole('button', {
      name: /v1\.0\.0-rc\.36.*Latest release/,
    })
    expect(latest).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(release.body)).toBeVisible()
  })

  test('opens a newly discovered latest version after the previous latest was collapsed', async () => {
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: /New version available/ })
    )
    const latest = screen.getByRole('button', {
      name: /v1\.0\.0-rc\.36.*Latest release/,
    })
    await user.click(latest)
    expect(latest).toHaveAttribute('aria-expanded', 'false')
    respondWithRelease('v1.0.0-rc.37')
    await user.click(screen.getByRole('button', { name: 'Check again' }))
    expect(
      await screen.findByRole('button', {
        name: /v1\.0\.0-rc\.37.*Latest release/,
      })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText(release.body)).toBeVisible()
  })

  test('constrains long release titles and scrolls notes separately from dialog actions', async () => {
    const name =
      'A-release-title-without-spaces-for-checking-wrapping-on-narrow-mobile-dialogs'
    const body =
      '```text\nA-long-code-line-that-must-scroll-inside-the-release-notes-instead-of-widening-the-dialog\n```'
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify([{ ...release, name, body }]))
    )
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: /New version available/ })
    )
    const dialog = screen.getByRole('dialog')
    const history = within(dialog).getByRole('region', {
      name: 'Release history',
    })
    expect(within(history).getByText(name)).toHaveClass('wrap-anywhere')
    expect(history).toHaveClass('min-w-0')
    const notes = (
      await within(history).findByText(
        'A-long-code-line-that-must-scroll-inside-the-release-notes-instead-of-widening-the-dialog'
      )
    ).closest('pre')
    expect(notes).toBeVisible()
    const scrollBody = history.parentElement?.parentElement
    expect(scrollBody).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
      'overflow-x-hidden'
    )
    expect(
      scrollBody?.contains(
        within(dialog).getByRole('button', { name: 'Check again' })
      )
    ).toBe(false)
    expect(
      within(dialog).getByRole('link', { name: 'Go to GitHub' })
    ).toBeVisible()
  })

  test('shows an empty history when a successful check finds no releases', async () => {
    fetchMock.mockImplementation(async () => new Response('[]'))
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
      screen.queryByRole('link', { name: 'Go to GitHub' })
    ).not.toBeInTheDocument()
  })

  test('places managed installation after history and folds older install versions without enabling incompatible updates', async () => {
    const user = userEvent.setup()
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'root', role: ROLE.SUPER_ADMIN })
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/api/system-update/status') {
        return {
          data: {
            success: true,
            data: {
              supported: true,
              state: 'ready',
              reason: '',
              operation_id: '',
            },
          },
        }
      }
      if (url === '/api/system-update/releases') {
        return {
          data: {
            success: true,
            data: {
              releases: [
                {
                  tag: 'v1.9.0',
                  name: 'v1.9.0',
                  compatible: false,
                  reason: 'Incompatible deployment',
                },
                {
                  tag: 'v1.10.0',
                  name: 'v1.10.0',
                  compatible: true,
                  reason: '',
                },
              ],
            },
          },
        }
      }
      return { data: { success: true, data: { version: 'v1.0.0-rc.35' } } }
    })
    const post = vi.spyOn(api, 'post')
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', {
        name: 'New version available: v1.0.0-rc.36',
      })
    )
    const history = screen.getByRole('region', { name: 'Release history' })
    const managed = screen.getByRole('region', { name: 'Site updates' })
    expect(
      history.compareDocumentPosition(managed) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const versions = await within(managed).findAllByRole('button', {
      name: /v1\.(?:10|9)\.0/,
    })
    expect(versions[0]).toHaveTextContent('v1.10.0')
    expect(versions[0]).toHaveAttribute('aria-expanded', 'true')
    expect(versions[1]).toHaveAttribute('aria-expanded', 'false')
    expect(
      within(managed).getByRole('button', { name: 'Install update' })
    ).toBeEnabled()
    await user.click(versions[1])
    const incompatible = within(managed)
      .getByText('Incompatible deployment')
      .closest('[data-slot=accordion-content]')
    expect(
      within(incompatible as HTMLElement).getByRole('button', {
        name: 'Install update',
      })
    ).toBeDisabled()
    expect(post).not.toHaveBeenCalled()
  })

  test('uses the no-notes fallback for whitespace-only release bodies', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify([{ ...release, body: '  \n  ' }]))
    )
    const user = userEvent.setup()
    render(<SystemUpdateAction />, { wrapper: Wrapper })
    await user.click(
      await screen.findByRole('button', { name: /New version available/ })
    )
    expect(await screen.findByText('No release notes provided.')).toBeVisible()
  })
})

describe('version label presentation', () => {
  test('keeps the current version visible while checking and after finding no newer version', async () => {
    let finishRequest: ((response: Response) => void) | undefined
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve
        })
    )
    client.setQueryData(STATUS_QUERY_KEY, { version: release.tag_name })
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    const trigger = screen.getByRole('button', {
      name: 'System updates, current version: v1.0.0-rc.36',
    })
    expect(trigger).toHaveAttribute('aria-busy', 'true')
    expect(within(trigger).getByText(release.tag_name)).toBeInTheDocument()
    expect(
      within(trigger).queryByText('Check for updates')
    ).not.toBeInTheDocument()
    await act(async () => {
      finishRequest?.(new Response(JSON.stringify([release])))
    })
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'false'))
    expect(within(trigger).getByText(release.tag_name)).toBeInTheDocument()
    expect(
      within(trigger).queryByText('Update available')
    ).not.toBeInTheDocument()
  })

  test('shows an unknown-version label when the server has not supplied a version', async () => {
    client.setQueryData(STATUS_QUERY_KEY, { version: '' })
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    const trigger = screen.getByRole('button', {
      name: 'System updates, current version: Unknown version',
    })
    expect(within(trigger).getByText('Unknown version')).toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'false'))
    expect(
      within(trigger).queryByText('Update available')
    ).not.toBeInTheDocument()
  })

  test('retains the version after a failed check and exposes the error in its tooltip and details', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue(new Response('', { status: 429 }))
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    const trigger = await screen.findByRole('button', {
      name: /System updates, current version: v1\.0\.0-rc\.35.*Failed to check for updates/s,
    })
    expect(within(trigger).getByText('v1.0.0-rc.35')).toBeInTheDocument()
    expect(trigger).toHaveAttribute(
      'title',
      expect.stringContaining('Failed to check for updates')
    )
    await user.click(trigger)
    expect(
      screen.getByText('GitHub rate limit reached. Try again later.')
    ).toBeInTheDocument()
  })

  test('keeps a long version accessible in the tooltip while constraining its visible label', async () => {
    const version = 'v1.0.0+long-build-metadata-for-a-custom-deployment'
    client.setQueryData(STATUS_QUERY_KEY, { version })
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    const trigger = screen.getByRole('button', {
      name: `System updates, current version: ${version}`,
    })
    expect(trigger).toHaveAttribute('title', expect.stringContaining(version))
    expect(within(trigger).getByText(version)).toHaveClass(
      'truncate',
      'max-w-32',
      'hidden',
      '@min-[22rem]/system-brand:inline'
    )
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'false'))
  })
})

describe('version notification preferences', () => {
  test('keeps the ignored release after reload even when the update cache is cleared', async () => {
    const first = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(first.result.current.shouldNotify).toBe(true))
    act(() => first.result.current.setIgnored(true))
    expect(first.result.current.hasUpdate).toBe(true)
    expect(first.result.current.shouldNotify).toBe(false)
    const saved = localStorage.getItem(
      'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2'
    )
    expect(saved).not.toBeNull()
    first.unmount()
    client.clear()
    useSystemUpdateStore.setState({ snapshot: null })
    useSystemUpdateStore.persist.clearStorage()
    useSystemUpdatePreferencesStore.setState({ ignoredVersionsByUserId: {} })
    localStorage.setItem(
      'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2',
      String(saved)
    )
    await useSystemUpdatePreferencesStore.persist.rehydrate()
    client = createAppQueryClient()
    client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.35' })
    const second = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(second.result.current.hasUpdate).toBe(true))
    expect(second.result.current.isIgnored).toBe(true)
    expect(second.result.current.shouldNotify).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('keeps preferences across logout and isolates ignore and restore actions by administrator', async () => {
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
    act(() => hook.result.current.setIgnored(true))
    act(() => useAuthStore.getState().auth.reset())
    expect(hook.result.current.shouldNotify).toBe(false)
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'other-admin', role: ROLE.ADMIN })
    )
    expect(hook.result.current.shouldNotify).toBe(true)
    act(() => hook.result.current.setIgnored(true))
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 1, username: 'admin', role: ROLE.ADMIN })
    )
    expect(hook.result.current.isIgnored).toBe(true)
    act(() => hook.result.current.setIgnored(false))
    expect(hook.result.current.shouldNotify).toBe(true)
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'other-admin', role: ROLE.ADMIN })
    )
    expect(hook.result.current.isIgnored).toBe(true)
    expect(hook.result.current.shouldNotify).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('retains ignored tags after manual checks and failures while notifying for a different release', async () => {
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
    act(() => hook.result.current.setIgnored(true))
    await act(async () => hook.result.current.checkNow())
    expect(hook.result.current.isIgnored).toBe(true)
    expect(hook.result.current.shouldNotify).toBe(false)
    fetchMock.mockImplementation(async () => new Response('', { status: 429 }))
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.snapshot?.error).toBe('rate-limit')
    )
    expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    expect(hook.result.current.isIgnored).toBe(true)
    expect(hook.result.current.shouldNotify).toBe(false)
    respondWithRelease('v1.0.0-rc.37')
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe('v1.0.0-rc.37')
    )
    expect(hook.result.current.shouldNotify).toBe(true)
    expect(hook.result.current.isIgnored).toBe(false)
    respondWithRelease()
    await act(async () => hook.result.current.checkNow())
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    )
    expect(hook.result.current.isIgnored).toBe(true)
    expect(hook.result.current.shouldNotify).toBe(false)
  })

  test('updates every entry when another tab ignores a version or clears preferences', async () => {
    const first = renderHook(useSystemUpdate, { wrapper: Wrapper })
    const second = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(first.result.current.shouldNotify).toBe(true))
    const saved = JSON.stringify({
      state: { ignoredVersionsByUserId: { 1: [release.tag_name] } },
      version: 0,
    })
    act(() => {
      localStorage.setItem(
        'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2',
        saved
      )
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2',
          newValue: saved,
        })
      )
    })
    expect(first.result.current.shouldNotify).toBe(false)
    expect(second.result.current.shouldNotify).toBe(false)
    act(() => {
      localStorage.removeItem(
        'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2'
      )
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2',
          newValue: null,
        })
      )
    })
    expect(first.result.current.shouldNotify).toBe(true)
    expect(second.result.current.shouldNotify).toBe(true)
    act(() => first.result.current.setIgnored(true))
    act(() => {
      localStorage.clear()
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(first.result.current.shouldNotify).toBe(true)
    expect(second.result.current.shouldNotify).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test.each(['corrupt', 'invalid', 'blocked'])(
    'keeps ignore and restore usable when preference storage is %s',
    async (state) => {
      if (state === 'blocked') {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
          throw new Error('storage blocked')
        })
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new Error('storage blocked')
        })
      } else {
        localStorage.setItem(
          'system-update-preferences:atelier-of-dongn/YMeng-CC-New-API:v2',
          state === 'corrupt'
            ? '{bad json'
            : JSON.stringify({
                state: { ignoredVersionsByUserId: { 1: release.tag_name } },
                version: 0,
              })
        )
      }
      const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
      await waitFor(() => expect(hook.result.current.shouldNotify).toBe(true))
      act(() => hook.result.current.setIgnored(true))
      expect(hook.result.current.shouldNotify).toBe(false)
      act(() => hook.result.current.setIgnored(false))
      expect(hook.result.current.shouldNotify).toBe(true)
    }
  )
})

describe('update cache and scheduling', () => {
  test('does not restore source-unknown v1 releases or their ignored tags', async () => {
    const now = Date.now()
    localStorage.setItem(
      'system-update:v1',
      JSON.stringify({
        state: {
          snapshot: {
            release: {
              ...release,
              tag_name: 'v9.0.0',
              body: 'Old upstream notes',
            },
            lastCheckedAt: now,
            lastAttemptAt: now,
            error: null,
          },
        },
        version: 0,
      })
    )
    localStorage.setItem(
      'system-update-preferences:v1',
      JSON.stringify({
        state: { ignoredVersionsByUserId: { 1: [release.tag_name] } },
        version: 0,
      })
    )
    await useSystemUpdateStore.persist.rehydrate()
    await useSystemUpdatePreferencesStore.persist.rehydrate()
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    expect(hook.result.current.release).toBeNull()
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    )
    expect(hook.result.current.shouldNotify).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects another repository in the new snapshot cache before showing release details', async () => {
    const now = Date.now()
    localStorage.setItem(
      'system-update:atelier-of-dongn/YMeng-CC-New-API:v2',
      JSON.stringify({
        state: {
          snapshot: {
            source: 'another/project',
            releases: [{ ...release, tag_name: 'v9.0.0' }],
            lastCheckedAt: now,
            lastAttemptAt: now,
            error: null,
          },
        },
        version: 0,
      })
    )
    await useSystemUpdateStore.persist.rehydrate()
    expect(useSystemUpdateStore.getState().snapshot).toBeNull()
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('clears the previous history when a successful response contains no published releases', async () => {
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() =>
      expect(hook.result.current.release?.tag_name).toBe(release.tag_name)
    )
    fetchMock.mockImplementation(async () => new Response('[]'))
    await act(async () => hook.result.current.checkNow())
    await waitFor(() => expect(hook.result.current.releases).toEqual([]))
    expect(hook.result.current.release).toBeNull()
    expect(hook.result.current.shouldNotify).toBe(false)
  })

  test('refreshes the server version during a later automatic check and clears an installed update', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify([release]))
    )
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(hook.result.current.hasUpdate).toBe(true)
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { version: release.tag_name } },
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL + 1)
    })
    expect(hook.result.current.currentVersion).toBe(release.tag_name)
    expect(hook.result.current.hasUpdate).toBe(false)
  })

  test('restores a successful result from storage without requesting it again on reload', async () => {
    const first = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(first.result.current.hasUpdate).toBe(true))
    first.unmount()
    client.clear()
    const saved = localStorage.getItem(
      'system-update:atelier-of-dongn/YMeng-CC-New-API:v2'
    )
    expect(saved).not.toBeNull()
    useSystemUpdateStore.setState({ snapshot: null })
    localStorage.setItem(
      'system-update:atelier-of-dongn/YMeng-CC-New-API:v2',
      String(saved)
    )
    await useSystemUpdateStore.persist.rehydrate()
    client = createAppQueryClient()
    client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.35' })
    const second = renderHook(useSystemUpdate, { wrapper: Wrapper })
    expect(second.result.current.hasUpdate).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test.each(['corrupt', 'blocked', 'future'])(
    'keeps checking when persisted storage is %s',
    async (state) => {
      if (state === 'corrupt') {
        localStorage.setItem(
          'system-update:atelier-of-dongn/YMeng-CC-New-API:v2',
          '{bad json'
        )
        await useSystemUpdateStore.persist.rehydrate()
      } else if (state === 'future') {
        localStorage.setItem(
          'system-update:atelier-of-dongn/YMeng-CC-New-API:v2',
          JSON.stringify({
            state: {
              snapshot: {
                source: 'atelier-of-dongn/YMeng-CC-New-API',
                releases: [release],
                lastCheckedAt: 0,
                lastAttemptAt: Date.now() + 86_400_000,
                error: null,
              },
            },
            version: 0,
          })
        )
        await useSystemUpdateStore.persist.rehydrate()
      } else {
        vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
          throw new Error('storage blocked')
        })
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
          throw new Error('storage blocked')
        })
      }
      const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
      await waitFor(() => expect(hook.result.current.hasUpdate).toBe(true))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  )

  test('waits one hour across multiple consumers and stops polling after logout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify([release]))
    )
    const first = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(first.result.current.hasUpdate).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL / 2)
    })
    renderHook(useSystemUpdate, { wrapper: Wrapper })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL / 2)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL / 2)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    act(() => useAuthStore.getState().auth.reset())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('waits while hidden or offline and checks stale results after visibility or connectivity returns', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify([release]))
    )
    focusManager.setFocused(false)
    renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => focusManager.setFocused(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    act(() => onlineManager.setOnline(false))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SYSTEM_UPDATE_INTERVAL)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      onlineManager.setOnline(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('aborts an in-flight request when the administrator logs out', async () => {
    let requestSignal: AbortSignal | null | undefined
    fetchMock.mockImplementation((_url, init) => {
      requestSignal = init?.signal
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError'))
        )
      })
    })
    const view = render(<SystemUpdateAction />, { wrapper: Wrapper })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => useAuthStore.getState().auth.reset())
    expect(view.queryByRole('button')).not.toBeInTheDocument()
    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
    expect(useSystemUpdateStore.getState().snapshot).toBeNull()
  })

  test('times out after ten seconds without an immediate retry on focus or remount', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
    )
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001)
    })
    expect(hook.result.current.snapshot?.error).toBe('timeout')
    expect(hook.result.current.checking).toBe(false)
    hook.unmount()
    renderHook(useSystemUpdate, { wrapper: Wrapper })
    await act(async () => {
      focusManager.setFocused(false)
      await vi.advanceTimersByTimeAsync(1)
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test.each([
    [403, '[]', 'rate-limit'],
    [500, '[]', 'network'],
    [200, '{}', 'payload'],
    [200, '[{"tag_name":42}]', 'payload'],
    [200, 'not JSON', 'payload'],
  ])('records HTTP %s with body %s as %s', async (status, body, error) => {
    fetchMock.mockResolvedValue(new Response(body, { status }))
    const hook = renderHook(useSystemUpdate, { wrapper: Wrapper })
    await waitFor(() => expect(hook.result.current.snapshot?.error).toBe(error))
    expect(hook.result.current.hasUpdate).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
