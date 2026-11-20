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

import type { ChatSendResult, Message } from '../../types'
import { usePlaygroundConversation } from '../use-playground-conversation'

const post = vi.hoisted(() => vi.fn())
const deleteRequest = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api: { post, delete: deleteRequest } }))

type UploadResponse = { data: Record<string, unknown> }

function uploaded(id: string): UploadResponse {
  return {
    data: {
      success: true,
      data: {
        id,
        filename: `${id}.pdf`,
        mime_type: 'application/pdf',
        size: 8,
        expires_at: 1,
      },
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

function pdf(name: string) {
  return new File(['%PDF-1.7'], name, { type: 'application/pdf' })
}

function renderConversation(sendResult: ChatSendResult = 'accepted') {
  let messages: Message[] = []
  const updateMessages = (
    updater: Message[] | ((previous: Message[]) => Message[])
  ) => {
    messages = typeof updater === 'function' ? updater(messages) : updater
  }
  const sendChat = vi.fn(
    async (_messages: Message[], _fileIds?: string[]) => sendResult
  )
  const view = renderHook(() =>
    usePlaygroundConversation({ messages, updateMessages, sendChat })
  )
  return { ...view, sendChat, getMessages: () => messages }
}

beforeEach(() => {
  vi.resetAllMocks()
  deleteRequest.mockResolvedValue({ data: { success: true } })
  vi.spyOn(toast, 'error').mockImplementation(() => 1)
})

afterEach(() => {
  vi.restoreAllMocks()
})

test('uploaded attachments are sent as temporary ids and kept only as display info', async () => {
  post
    .mockResolvedValueOnce(uploaded('tmp-1'))
    .mockResolvedValueOnce(uploaded('tmp-2'))
  const { result, sendChat, getMessages } = renderConversation()

  await act(() =>
    result.current.handleSendMessage('compare', [pdf('a.pdf'), pdf('b.pdf')])
  )

  expect(post).toHaveBeenCalledTimes(2)
  expect(post.mock.calls[0][0]).toBe('/pg/files')
  expect(post.mock.calls[0][1]).toBeInstanceOf(FormData)
  expect(sendChat).toHaveBeenCalledWith(getMessages(), ['tmp-1', 'tmp-2'])
  const userMessage = getMessages()[0]
  expect(userMessage.attachments).toEqual([
    { name: 'a.pdf', mimeType: 'application/pdf', size: 8 },
    { name: 'b.pdf', mimeType: 'application/pdf', size: 8 },
  ])
  expect(JSON.stringify(getMessages())).not.toContain('tmp-')
  expect(deleteRequest).not.toHaveBeenCalled()
})

test('a failed upload rejects, keeps the conversation unchanged and deletes earlier uploads', async () => {
  post.mockResolvedValueOnce(uploaded('tmp-1')).mockResolvedValueOnce({
    data: { success: false, message_key: 'Attachment upload failed' },
  })
  const { result, sendChat, getMessages } = renderConversation()

  await act(async () => {
    await expect(
      result.current.handleSendMessage('compare', [pdf('a.pdf'), pdf('b.pdf')])
    ).rejects.toThrow()
  })

  expect(sendChat).not.toHaveBeenCalled()
  expect(getMessages()).toEqual([])
  expect(deleteRequest).toHaveBeenCalledWith('/pg/files/tmp-1', {
    skipErrorHandler: true,
  })
  expect(toast.error).toHaveBeenCalledWith('Attachment upload failed')
  expect(result.current.isUploading).toBe(false)
})

test('cancelling during an upload aborts it, deletes finished uploads and ignores late results', async () => {
  const secondUpload = deferred<UploadResponse>()
  post
    .mockResolvedValueOnce(uploaded('tmp-1'))
    .mockReturnValueOnce(secondUpload.promise)
  const { result, sendChat, getMessages } = renderConversation()

  let sending!: Promise<void>
  act(() => {
    sending = result.current.handleSendMessage('compare', [
      pdf('a.pdf'),
      pdf('b.pdf'),
    ])
  })
  await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2))
  expect(result.current.isUploading).toBe(true)
  const signal = post.mock.calls[1][2].signal as AbortSignal

  act(() => result.current.cancelPendingSend())

  expect(signal.aborted).toBe(true)
  expect(deleteRequest).toHaveBeenCalledWith('/pg/files/tmp-1', {
    skipErrorHandler: true,
  })
  expect(result.current.isUploading).toBe(false)

  // The server answered before it saw the abort: the late id is discarded too.
  secondUpload.resolve(uploaded('tmp-late'))
  await act(async () => {
    await expect(sending).rejects.toThrow()
  })

  expect(deleteRequest).toHaveBeenCalledWith('/pg/files/tmp-late', {
    skipErrorHandler: true,
  })
  expect(sendChat).not.toHaveBeenCalled()
  expect(getMessages()).toEqual([])
  expect(toast.error).not.toHaveBeenCalled()
})

test('a chat request rejected before acceptance deletes its uploads and keeps the draft', async () => {
  post.mockResolvedValueOnce(uploaded('tmp-1'))
  const { result } = renderConversation('failed')

  await act(async () => {
    await expect(
      result.current.handleSendMessage('summarize', [pdf('a.pdf')])
    ).rejects.toThrow()
  })

  expect(deleteRequest).toHaveBeenCalledWith('/pg/files/tmp-1', {
    skipErrorHandler: true,
  })
})

test('a chat request stopped after it was sent keeps the draft without deleting consumed ids', async () => {
  post.mockResolvedValueOnce(uploaded('tmp-1'))
  const { result } = renderConversation('cancelled')

  await act(async () => {
    await expect(
      result.current.handleSendMessage('summarize', [pdf('a.pdf')])
    ).rejects.toThrow()
  })

  expect(deleteRequest).not.toHaveBeenCalled()
})

test('a text-only message is sent without uploads', async () => {
  const { result, sendChat, getMessages } = renderConversation()

  await act(() => result.current.handleSendMessage('hello'))

  expect(post).not.toHaveBeenCalled()
  expect(sendChat).toHaveBeenCalledWith(getMessages())
  expect(getMessages()[0].attachments).toBeUndefined()
})
