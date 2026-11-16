import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { AxiosResponse } from 'axios'
import { createElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useUpdateOption } from '../use-update-option'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

it.each([
  'console_setting.announcements',
  'console_setting.announcements_enabled',
])(
  'refreshes the cached status when saving %s so the header ticker updates',
  async (key) => {
    vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: true },
    } as AxiosResponse)
    vi.spyOn(toast, 'success').mockReturnValue('saved')
    window.localStorage.setItem('status', '{"announcements":[]}')

    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result, unmount } = renderHook(() => useUpdateOption(), {
      wrapper: (props: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, props.children),
    })

    await act(async () => {
      await result.current.mutateAsync({ key, value: '[]' })
    })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['status'] })
    expect(window.localStorage.getItem('status')).toBeNull()

    unmount()
    client.clear()
  }
)
