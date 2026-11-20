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
import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../constants'
import { appendUserMessagePair } from '../../lib'
import type { Message } from '../../types'
import { useChatHandler } from '../use-chat-handler'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({
  api: { post },
  getFreshAuthHeaders: () => Promise.resolve({}),
}))

function renderChat() {
  let messages = appendUserMessagePair([], 'hello')
  const onMessageUpdate = (updater: (previous: Message[]) => Message[]) => {
    messages = updater(messages)
  }
  const view = renderHook(() =>
    useChatHandler({
      config: { ...DEFAULT_CONFIG, stream: false },
      parameterEnabled: DEFAULT_PARAMETER_ENABLED,
      onMessageUpdate,
    })
  )
  return { ...view, initial: messages, getMessages: () => messages }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(toast, 'error').mockImplementation(() => 1)
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('a non-streaming response is accepted and its citations become sources', async () => {
  post.mockResolvedValue({
    data: {
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: 'Answer',
            annotations: [
              {
                type: 'url_citation',
                url_citation: { url: 'https://example.com/a', title: 'A' },
              },
            ],
          },
        },
      ],
    },
  })
  const { result, initial, getMessages } = renderChat()

  let outcome: string | undefined
  await act(async () => {
    outcome = await result.current.sendChat(initial, ['tmp-1'])
  })

  expect(outcome).toBe('accepted')
  expect(post.mock.calls[0][1].messages.at(-1).content).toContainEqual({
    type: 'playground_file',
    playground_file: { id: 'tmp-1' },
  })
  expect(getMessages().at(-1)?.sources).toEqual([
    { href: 'https://example.com/a', title: 'A' },
  ])
})

test('a rejected request resolves as failed and shows the server message', async () => {
  post.mockRejectedValue({
    message: 'Request failed with status code 400',
    response: {
      data: {
        error: {
          message: 'Attachment expired, upload it again',
          code: 'playground_file_unavailable',
        },
      },
    },
  })
  const { result, initial, getMessages } = renderChat()

  let outcome: string | undefined
  await act(async () => {
    outcome = await result.current.sendChat(initial, ['tmp-1'])
  })

  expect(outcome).toBe('failed')
  expect(getMessages().at(-1)?.status).toBe('error')
  expect(getMessages().at(-1)?.errorCode).toBe('playground_file_unavailable')
  expect(getMessages().at(-1)?.versions[0].content).toContain(
    'Attachment expired, upload it again'
  )
  expect(toast.error).toHaveBeenCalledWith(
    'Attachment expired, upload it again'
  )
})

test('stopping before the response resolves the request as cancelled', async () => {
  post.mockReturnValue(new Promise(() => undefined))
  const { result, initial } = renderChat()

  let sending!: Promise<string>
  act(() => {
    sending = result.current.sendChat(initial)
  })
  act(() => result.current.stopGeneration())

  await expect(sending).resolves.toBe('cancelled')
})
