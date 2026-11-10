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
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { DEFAULT_CONFIG, VIDEO_POLL_MAX_ATTEMPTS } from '../../constants'
import type { Message } from '../../types'
import { useMediaGeneration } from '../use-media-generation'

const sendImageGeneration = vi.hoisted(() => vi.fn())
const submitVideoGeneration = vi.hoisted(() => vi.fn())
const fetchVideoTask = vi.hoisted(() => vi.fn())

vi.mock('../../api', () => ({
  sendImageGeneration,
  submitVideoGeneration,
  fetchVideoTask,
}))

function createHarness() {
  let messages: Message[] = []
  const updateMessages = vi.fn(
    (updater: Message[] | ((previous: Message[]) => Message[])) => {
      messages = typeof updater === 'function' ? updater(messages) : updater
    }
  )
  return { updateMessages, getMessages: () => messages }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('a successful image generation appends a user message and a result', async () => {
  sendImageGeneration.mockResolvedValue({
    data: [{ url: 'https://example.com/cat.png' }],
  })
  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  await act(async () => {
    await result.current.generateImage('a cat', { size: 'auto', n: 1 })
  })

  const messages = harness.getMessages()
  expect(messages).toHaveLength(2)
  expect(messages[0].from).toBe('user')
  expect(messages[1].media?.[0]).toMatchObject({
    type: 'image',
    status: 'succeeded',
    url: 'https://example.com/cat.png',
  })
  expect(messages[1].status).toBe('complete')
})

test('all image payloads in a multi-image response are preserved', async () => {
  sendImageGeneration.mockResolvedValue({
    data: [
      { url: 'https://example.com/one.png' },
      { revised_prompt: 'metadata only' },
      { url: 'https://example.com/two.png' },
      { b64_json: 'AAAA' },
    ],
  })
  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )
  await act(async () => {
    await result.current.generateImage('cats', { size: 'auto', n: 3 })
  })
  expect(harness.getMessages()[1].media?.map((media) => media.url)).toEqual([
    'https://example.com/one.png',
    'https://example.com/two.png',
    'data:image/png;base64,AAAA',
  ])
})

test('an object-shaped image response is displayed', async () => {
  sendImageGeneration.mockResolvedValue({
    data: { url: 'https://example.com/one.png' },
  })
  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )
  await act(async () => {
    await result.current.generateImage('a cat', { size: 'auto', n: 1 })
  })
  expect(harness.getMessages()[1].media?.[0].url).toBe(
    'https://example.com/one.png'
  )
})

test('a late image response after stopping cannot update the switched conversation', async () => {
  let resolveImage!: (value: unknown) => void
  sendImageGeneration.mockReturnValue(
    new Promise((resolve) => {
      resolveImage = resolve
    })
  )
  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.generateImage('a cat', { size: 'auto', n: 1 })
  })
  await act(async () => {
    result.current.stopGeneration()
  })
  const otherConversation: Message = {
    key: 'other',
    from: 'user',
    versions: [{ id: 'other-v', content: 'other conversation' }],
  }
  harness.updateMessages([otherConversation])
  const writesBeforeLateResponse = harness.updateMessages.mock.calls.length
  await act(async () => {
    resolveImage({ data: [{ url: 'https://example.com/late.png' }] })
    await pending
  })
  expect(harness.getMessages()).toEqual([otherConversation])
  expect(harness.updateMessages).toHaveBeenCalledTimes(writesBeforeLateResponse)
})

test('an empty image response marks the message as failed', async () => {
  sendImageGeneration.mockResolvedValue({ data: [] })
  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  await act(async () => {
    await result.current.generateImage('a cat', { size: 'auto', n: 1 })
  })

  expect(harness.getMessages()[1].media?.[0].status).toBe('failed')
})

test('an image request error is surfaced on the assistant message', async () => {
  sendImageGeneration.mockRejectedValue(new Error('upstream down'))
  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  await act(async () => {
    await result.current.generateImage('a cat', { size: 'auto', n: 1 })
  })

  expect(harness.getMessages()[1].media?.[0].error).toBe('upstream down')
  expect(harness.getMessages()[1].status).toBe('error')
})

test('a video task is polled until it succeeds', async () => {
  submitVideoGeneration.mockResolvedValue({
    task_id: 'task_1',
    status: 'processing',
  })
  fetchVideoTask
    .mockResolvedValueOnce({ task_id: 'task_1', status: 'processing' })
    .mockResolvedValueOnce({
      task_id: 'task_1',
      status: 'succeeded',
      url: 'https://example.com/wave.mp4',
    })

  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  let pending: Promise<void>
  await act(async () => {
    pending = result.current.generateVideo('a wave', {
      duration: 5,
      resolution: '720p',
    })
  })

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
    await vi.advanceTimersByTimeAsync(3000)
    await pending
  })

  expect(harness.getMessages()[1].media?.[0]).toMatchObject({
    type: 'video',
    status: 'succeeded',
    url: 'https://example.com/wave.mp4',
  })
  expect(fetchVideoTask).toHaveBeenCalledTimes(2)
})

test('a reported video failure stops polling and marks the message failed', async () => {
  submitVideoGeneration.mockResolvedValue({
    task_id: 'task_1',
    status: 'processing',
  })
  fetchVideoTask.mockResolvedValue({
    task_id: 'task_1',
    status: 'failed',
    error: { message: 'vendor rejected' },
  })

  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  let pending: Promise<void>
  await act(async () => {
    pending = result.current.generateVideo('a wave', {
      duration: 5,
      resolution: '720p',
    })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
  await act(async () => {
    await pending
  })

  expect(harness.getMessages()[1].media?.[0].error).toBe('vendor rejected')
  expect(fetchVideoTask).toHaveBeenCalledTimes(1)
})

test('stopGeneration cancels an in-flight video poll', async () => {
  submitVideoGeneration.mockResolvedValue({
    task_id: 'task_1',
    status: 'processing',
  })
  fetchVideoTask.mockResolvedValue({
    task_id: 'task_1',
    status: 'processing',
  })

  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  let pending: Promise<void>
  await act(async () => {
    pending = result.current.generateVideo('a wave', {
      duration: 5,
      resolution: '720p',
    })
  })
  await act(async () => {
    result.current.stopGeneration()
    await vi.advanceTimersByTimeAsync(3000)
    await pending
  })

  expect(fetchVideoTask).not.toHaveBeenCalled()
  expect(harness.getMessages()[1].media?.[0]).toMatchObject({
    status: 'failed',
    error: 'Generation was interrupted',
    taskId: 'task_1',
  })
  expect(harness.getMessages()[1].status).toBe('error')
})

test('video polling stops after the configured attempt cap', async () => {
  submitVideoGeneration.mockResolvedValue({
    task_id: 'task_1',
    status: 'processing',
  })
  fetchVideoTask.mockResolvedValue({
    task_id: 'task_1',
    status: 'processing',
  })

  const harness = createHarness()
  const { result } = renderHook(() =>
    useMediaGeneration({
      config: DEFAULT_CONFIG,
      updateMessages: harness.updateMessages,
    })
  )

  let pending: Promise<void>
  await act(async () => {
    pending = result.current.generateVideo('a wave', {
      duration: 5,
      resolution: '720p',
    })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000 * VIDEO_POLL_MAX_ATTEMPTS)
    await pending
  })

  expect(harness.getMessages()[1].media?.[0].error).toBe(
    'Video generation timed out'
  )
})
