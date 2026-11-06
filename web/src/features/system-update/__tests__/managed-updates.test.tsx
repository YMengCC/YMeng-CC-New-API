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
import { QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { createAppQueryClient } from '@/lib/query-client'
import { useAuthStore } from '@/stores/auth-store'

import { ManagedUpdateSection } from '../managed-update-section'
import { ReleaseHistory } from '../release-history'
import type { SystemRelease } from '../releases'

let client: ReturnType<typeof createAppQueryClient>
let status: {
  supported: boolean
  state: string
  reason: string
  reason_code?: string
  current_version: string
  target_version: string
  operation_id: string
  draining: boolean
  cleanup_supported?: boolean
  can_update?: boolean
  can_cleanup?: boolean
  cleanup?: { cleanup_id: string; target_name: string; phase: string }
}

beforeEach(() => {
  client = createAppQueryClient()
  status = {
    supported: true,
    state: 'ready',
    reason: 'Managed update controller is ready.',
    current_version: 'v1.2.1',
    target_version: '',
    operation_id: '',
    draining: false,
  }
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/system-update/status') {
      return { data: { success: true, data: { ...status } } }
    }
    if (url === '/api/verify/methods') {
      return {
        data: {
          success: true,
          data: {
            scope: 'system.update.cleanup',
            methods: [{ method: 'password', available: true }],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        },
      }
    }
    return {
      data: {
        success: true,
        data: {
          releases: [
            {
              tag: 'v1.2.2',
              name: 'v1.2.2',
              compatible: true,
              reason: '',
              image: 'test-image',
            },
            {
              tag: 'v1.2.1',
              name: 'v1.2.1',
              compatible: true,
              reason: '',
              image: 'test-image',
            },
          ],
        },
      },
    }
  })
})

afterEach(async () => {
  cleanup()
  await i18next.changeLanguage('en')
  i18next.removeResourceBundle('zhCN', 'translation')
  client.clear()
  useAuthStore.getState().auth.reset()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function retainOldInstance(): void {
  Object.assign(status, {
    state: 'completed',
    cleanup_supported: true,
    can_update: false,
    can_cleanup: true,
    cleanup: {
      cleanup_id: 'cleanup-1',
      target_name: 'old-blue',
      phase: 'retained',
    },
  })
}

const feedReleases: SystemRelease[] = [
  {
    tag_name: 'v1.2.2',
    name: 'v1.2.2',
    prerelease: false,
    body: 'Latest branch release notes',
  },
  {
    tag_name: 'v1.2.1',
    name: 'v1.2.1',
    prerelease: false,
    body: 'Previous branch release notes',
  },
]

function renderUpdates(releases = feedReleases) {
  return render(
    <QueryClientProvider client={client}>
      <ManagedUpdateSection enabled>
        {(managed) => (
          <>
            {managed.statusContent}
            <ReleaseHistory
              releases={releases}
              currentVersion={status.current_version}
              renderReleaseAction={managed.renderReleaseAction}
            />
            <button
              type='button'
              disabled={managed.refreshing}
              onClick={() => void managed.refresh()}
            >
              Refresh controller
            </button>
          </>
        )}
      </ManagedUpdateSection>
    </QueryClientProvider>
  )
}

describe('retained instance cleanup', () => {
  test('does not expose cleanup on an old controller or for a non-root administrator', async () => {
    renderUpdates()
    await screen.findByRole('button', { name: 'Install update' })
    expect(
      screen.queryByRole('button', { name: 'Clean up old instance' })
    ).not.toBeInTheDocument()
    retainOldInstance()
    act(() =>
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'admin', role: 10 })
    )
    expect(
      screen.getByRole('region', { name: 'Release history' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Install update' })
    ).not.toBeInTheDocument()
  })

  test('honors a controller installation denial even when the legacy state is ready', async () => {
    status.can_update = false
    renderUpdates()
    expect(
      await screen.findByRole('button', { name: 'Install update' })
    ).toBeDisabled()
  })

  test.each([false, true])(
    'requires confirmation and a bound proof when retrying a failed drain is %s',
    async (failedDrain) => {
      retainOldInstance()
      if (failedDrain) {
        status.state = 'cleanup_failed'
        status.draining = true
      }
      const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
        if (url === '/api/verify') {
          return {
            data: {
              success: true,
              data: {
                proof_token: 'cleanup-proof',
                scope: 'system.update.cleanup',
                method: 'password',
                expires_at: Math.floor(Date.now() / 1000) + 60,
              },
            },
          }
        }
        Object.assign(status, {
          state: 'cleaning',
          operation_id: 'cleanup-operation',
          can_cleanup: false,
        })
        return { status: 202, data: { success: true, data: { ...status } } }
      })
      const user = userEvent.setup()
      renderUpdates()
      await user.click(
        await screen.findByRole('button', { name: 'Clean up old instance' })
      )
      expect(screen.getByRole('alertdialog')).toHaveTextContent('old-blue')
      expect(post).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Continue' }))
      await user.type(
        await screen.findByLabelText('Password', { selector: 'input' }),
        'local-password'
      )
      await user.click(screen.getByRole('button', { name: 'Verify' }))
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith(
          '/api/system-update/cleanup',
          { cleanup_id: 'cleanup-1' },
          expect.objectContaining({
            headers: {
              'X-Requested-With': 'YMeng-Update',
              'X-Security-Proof': 'cleanup-proof',
            },
            skipAuthRefresh: true,
          })
        )
      )
      expect(post).toHaveBeenCalledWith(
        '/api/verify',
        expect.objectContaining({
          scope: 'system.update.cleanup',
          context: { cleanup_id: 'cleanup-1' },
        }),
        expect.anything()
      )
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeDisabled()
      expect(screen.getByRole('status')).toHaveTextContent(
        'Cleaning up old instance...'
      )
      expect(
        screen.queryByRole('button', { name: 'Clean up old instance' })
      ).not.toBeInTheDocument()
      Object.assign(status, {
        state: 'ready',
        operation_id: '',
        draining: false,
        can_update: true,
        can_cleanup: false,
        cleanup: undefined,
      })
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['managed-system-update'] })
      })
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Install update' })
        ).toBeEnabled()
      )
      expect(
        screen.queryByRole('button', { name: 'Clean up old instance' })
      ).not.toBeInTheDocument()
    }
  )

  test.each(['confirmation', 'verification'] as const)(
    'cancels %s without posting cleanup',
    async (stage) => {
      retainOldInstance()
      const post = vi.spyOn(api, 'post')
      const user = userEvent.setup()
      renderUpdates()
      await user.click(
        await screen.findByRole('button', { name: 'Clean up old instance' })
      )
      if (stage === 'verification') {
        await user.click(screen.getByRole('button', { name: 'Continue' }))
        await screen.findByLabelText('Password', { selector: 'input' })
      }
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(post).not.toHaveBeenCalled()
    }
  )

  test('invalidates a confirmation when the cleanup generation changes', async () => {
    retainOldInstance()
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post')
    renderUpdates()
    await user.click(
      await screen.findByRole('button', { name: 'Clean up old instance' })
    )
    status.cleanup = {
      cleanup_id: 'cleanup-2',
      target_name: 'old-green',
      phase: 'retained',
    }
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ['managed-system-update', 'status'],
      })
    })
    expect(screen.getByRole('alertdialog')).toHaveTextContent('old-blue')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    )
    expect(post).not.toHaveBeenCalled()
  })

  test.each(['generation changes', 'automatic cleanup starts'])(
    'does not submit a proof obtained after %s',
    async (change) => {
      retainOldInstance()
      let finishProof: ((value: unknown) => void) | undefined
      const post = vi.spyOn(api, 'post').mockImplementation(
        () =>
          new Promise((resolve) => {
            finishProof = resolve
          })
      )
      const user = userEvent.setup()
      renderUpdates()
      await user.click(
        await screen.findByRole('button', { name: 'Clean up old instance' })
      )
      await user.click(screen.getByRole('button', { name: 'Continue' }))
      await user.type(
        await screen.findByLabelText('Password', { selector: 'input' }),
        'local-password'
      )
      await user.click(screen.getByRole('button', { name: 'Verify' }))
      if (change === 'generation changes') {
        status.cleanup = {
          cleanup_id: 'cleanup-2',
          target_name: 'old-green',
          phase: 'retained',
        }
      } else {
        status.state = 'cleaning'
        status.operation_id = 'cleanup-1'
        status.can_cleanup = false
      }
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ['managed-system-update', 'status'],
        })
      })
      await act(async () => {
        finishProof?.({
          data: {
            success: true,
            data: {
              proof_token: 'stale-proof',
              scope: 'system.update.cleanup',
              method: 'password',
              expires_at: Math.floor(Date.now() / 1000) + 60,
            },
          },
        })
      })
      expect(
        post.mock.calls.filter(([url]) => url === '/api/system-update/cleanup')
      ).toHaveLength(0)
    }
  )

  test.each(['draining', 'cleaning', 'cleanup_failed'])(
    'polls %s without an operation ID until automatic cleanup restores installation',
    async (state) => {
      vi.useFakeTimers()
      retainOldInstance()
      Object.assign(status, {
        state,
        operation_id: '',
        draining: state === 'draining',
        can_cleanup: state === 'cleanup_failed',
      })
      const post = vi.spyOn(api, 'post')
      renderUpdates()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeDisabled()
      if (state === 'cleanup_failed') {
        expect(
          screen.getByRole('button', { name: 'Clean up old instance' })
        ).toBeEnabled()
      } else {
        expect(
          screen.queryByRole('button', { name: 'Clean up old instance' })
        ).not.toBeInTheDocument()
      }
      Object.assign(status, {
        state: 'ready',
        operation_id: '',
        draining: false,
        can_update: true,
        can_cleanup: false,
        cleanup: undefined,
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3001)
      })
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeEnabled()
      expect(screen.queryByText('old-blue')).not.toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    }
  )

  test('cancels unfinished verification on unmount without submitting cleanup', async () => {
    retainOldInstance()
    let finishProof: ((value: unknown) => void) | undefined
    const post = vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProof = resolve
        })
    )
    const user = userEvent.setup()
    const view = renderUpdates()
    await user.click(
      await screen.findByRole('button', { name: 'Clean up old instance' })
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(
      await screen.findByLabelText('Password', { selector: 'input' }),
      'local-password'
    )
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    view.unmount()
    await act(async () => {
      finishProof?.({
        data: {
          success: true,
          data: {
            proof_token: 'stale-proof',
            scope: 'system.update.cleanup',
            method: 'password',
            expires_at: Math.floor(Date.now() / 1000) + 60,
          },
        },
      })
    })
    expect(
      post.mock.calls.filter(([url]) => url === '/api/system-update/cleanup')
    ).toHaveLength(0)
  })

  test('refreshes after a failed cleanup and allows a new confirmation and proof', async () => {
    retainOldInstance()
    const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
      if (url === '/api/verify') {
        return {
          data: {
            success: true,
            data: {
              proof_token: 'cleanup-proof',
              scope: 'system.update.cleanup',
              method: 'password',
              expires_at: Math.floor(Date.now() / 1000) + 60,
            },
          },
        }
      }
      Object.assign(status, {
        state: 'cleanup_failed',
        reason: 'Cleanup could not be completed safely.',
      })
      throw new Error('Cleanup could not be completed safely.')
    })
    const user = userEvent.setup()
    renderUpdates()
    await user.click(
      await screen.findByRole('button', { name: 'Clean up old instance' })
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(
      await screen.findByLabelText('Password', { selector: 'input' }),
      'local-password'
    )
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await screen.findByText('Cleanup could not be completed safely.')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Clean up old instance' })
      ).toBeEnabled()
    )
    await user.click(
      screen.getByRole('button', { name: 'Clean up old instance' })
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      await screen.findByLabelText('Password', { selector: 'input' })
    ).toHaveValue('')
    expect(
      post.mock.calls.filter(([url]) => url === '/api/system-update/cleanup')
    ).toHaveLength(1)
  })
})

describe('single release list', () => {
  test('composes installation with the matching release notes and never renders a second version list', async () => {
    renderUpdates()
    const history = screen.getByRole('region', { name: 'Release history' })
    await waitFor(() =>
      expect(
        within(history).getByRole('button', { name: 'Install update' })
      ).toBeEnabled()
    )
    expect(
      await within(history).findByText('Latest branch release notes')
    ).toBeVisible()
    expect(screen.getAllByRole('button', { name: /v1\.2\.2/ })).toHaveLength(1)
    expect(
      screen.queryByRole('heading', { name: 'Site updates' })
    ).not.toBeInTheDocument()
  })

  test('does not grant installation to a different full tag even when its numeric version matches', async () => {
    renderUpdates([{ ...feedReleases[0], tag_name: '1.2.2' }])
    expect(
      await screen.findByRole('button', { name: 'Install update' })
    ).toBeDisabled()
  })

  test('keeps notes visible when the controller is unavailable', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('controller unavailable'))
    renderUpdates()
    expect(await screen.findByText('Latest branch release notes')).toBeVisible()
    expect(
      await screen.findByText('Unable to contact the update service.')
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Install update' })
    ).toBeDisabled()
  })

  test('refreshes controller status and the configured installation list from one action', async () => {
    const user = userEvent.setup()
    renderUpdates()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeEnabled()
    )
    const statusCalls = vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => url === '/api/system-update/status').length
    const releaseCalls = vi
      .mocked(api.get)
      .mock.calls.filter(
        ([url]) => url === '/api/system-update/releases'
      ).length
    await user.click(screen.getByRole('button', { name: 'Refresh controller' }))
    await waitFor(() =>
      expect(
        vi
          .mocked(api.get)
          .mock.calls.filter(([url]) => url === '/api/system-update/releases')
      ).toHaveLength(releaseCalls + 1)
    )
    expect(
      vi
        .mocked(api.get)
        .mock.calls.filter(([url]) => url === '/api/system-update/status')
    ).toHaveLength(statusCalls + 1)
  })

  test('renders public history for ordinary administrators without starting root queries', async () => {
    useAuthStore.getState().auth.setUser({ id: 2, username: 'admin', role: 10 })
    renderUpdates()
    expect(await screen.findByText('Latest branch release notes')).toBeVisible()
    expect(api.get).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Install update' })
    ).not.toBeInTheDocument()
  })
})

describe('managed installation availability', () => {
  test('translates automatic retry status after switching interface language', async () => {
    retainOldInstance()
    status.state = 'cleanup_failed'
    status.reason_code = 'cleanup_engine_unavailable'
    status.reason =
      'The container engine is temporarily unavailable. Cleanup will retry automatically.'
    renderUpdates()
    expect(await screen.findByText(status.reason)).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Automatic cleanup will retry in 30 seconds.'
    )
    i18next.addResourceBundle('zhCN', 'translation', zh.translation)
    await act(async () => {
      await i18next.changeLanguage('zhCN')
    })
    expect(
      screen.getByText('容器引擎暂时不可用，将自动重试清理。')
    ).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(
      '将在 30 秒后自动重试清理。'
    )
    expect(screen.getByRole('button', { name: '清理旧实例' })).toBeEnabled()
  })

  test.each([
    { state: 'completed', operation_id: '', draining: false },
    { state: 'draining', operation_id: '', draining: true },
    { state: 'operation', operation_id: 'existing-operation', draining: false },
  ])(
    'blocks installation while controller state is $state',
    async (controllerState) => {
      Object.assign(status, controllerState)
      const post = vi.spyOn(api, 'post')
      renderUpdates()
      expect(
        await screen.findByRole('button', { name: 'Install update' })
      ).toBeDisabled()
      expect(post).not.toHaveBeenCalled()
    }
  )

  test('labels the installed release as current and prevents reinstalling it', async () => {
    const user = userEvent.setup()
    renderUpdates()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeEnabled()
    )
    await user.click(
      screen.getByRole('button', { name: /v1\.2\.1.*Current version/ })
    )
    expect(
      screen.getByRole('button', { name: 'Current version' })
    ).toBeDisabled()
  })

  test('translates the retained-container status when switching interface language', async () => {
    status.state = 'completed'
    status.reason =
      'Update completed; the previous container was retained after draining. Manual cleanup is required before another update.'
    renderUpdates()
    expect(await screen.findByText(status.reason)).toBeVisible()
    i18next.addResourceBundle('zhCN', 'translation', zh.translation)
    await act(async () => {
      await i18next.changeLanguage('zhCN')
    })
    expect(
      screen.getByText(
        '更新已完成，旧实例已排空并保留。再次更新前，需要管理员手动清理旧实例。'
      )
    ).toBeVisible()
    expect(screen.queryByText(status.reason)).not.toBeInTheDocument()
  })

  test('translates the draining status in the single panel after a language change', async () => {
    status.state = 'draining'
    status.draining = true
    status.reason =
      'Traffic switched to the verified candidate; waiting for the previous container to drain.'
    renderUpdates()
    expect(await screen.findByText(status.reason)).toBeVisible()
    i18next.addResourceBundle('zhCN', 'translation', zh.translation)
    await act(async () => {
      await i18next.changeLanguage('zhCN')
    })
    expect(
      screen.getByText(
        '流量已切换到已验证的新实例，正在等待旧实例完成已有请求。'
      )
    ).toBeVisible()
    expect(screen.queryByText(status.reason)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '安装更新' })).toBeDisabled()
  })

  test('blocks a confirmation when the exact tag loses controller compatibility', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post')
    renderUpdates()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeEnabled()
    )
    await user.click(screen.getByRole('button', { name: 'Install update' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    act(() => client.setQueryData(['managed-system-update', 'releases'], []))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    )
    expect(post).not.toHaveBeenCalled()
  })

  test('refreshes controller status after a rejected install and closes the stale confirmation', async () => {
    const user = userEvent.setup()
    const error = {
      response: {
        status: 409,
        data: {
          message: 'update controller rejected the operation (HTTP 409)',
        },
      },
    }
    vi.spyOn(api, 'post').mockImplementation(async () => {
      status.state = 'completed'
      throw error
    })
    const toastError = vi.spyOn(toast, 'error')
    renderUpdates()
    await user.click(
      await screen.findByRole('button', { name: 'Install update' })
    )
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Install update' })
      ).toBeDisabled()
    )
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  test('blocks an open confirmation when a fresh status requires cleanup', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post')
    renderUpdates()
    await user.click(
      await screen.findByRole('button', { name: 'Install update' })
    )
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    status.state = 'completed'
    await client.invalidateQueries({
      queryKey: ['managed-system-update', 'status'],
    })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    )
    expect(post).not.toHaveBeenCalled()
  })
})
