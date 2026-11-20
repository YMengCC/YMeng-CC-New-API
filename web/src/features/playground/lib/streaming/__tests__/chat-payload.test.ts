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
import { expect, test } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import type { Message } from '../../../types'
import { buildChatCompletionPayload } from '../payload-builder'

const attachment = { name: 'a.pdf', mimeType: 'application/pdf', size: 8 }

function userMessage(key: string, content: string, withFile = false): Message {
  return {
    key,
    from: 'user',
    versions: [{ id: `${key}-v`, content }],
    ...(withFile ? { attachments: [attachment] } : {}),
  }
}

function assistantMessage(key: string, content: string): Message {
  return {
    key,
    from: 'assistant',
    versions: [{ id: `${key}-v`, content }],
    status: 'complete',
  }
}

test('web search off omits web_search_options', () => {
  const payload = buildChatCompletionPayload(
    [userMessage('u1', 'hello')],
    DEFAULT_CONFIG,
    DEFAULT_PARAMETER_ENABLED
  )

  expect(payload).not.toHaveProperty('web_search_options')
})

test('web search on adds an empty web_search_options object', () => {
  const payload = buildChatCompletionPayload(
    [userMessage('u1', 'hello')],
    { ...DEFAULT_CONFIG, web_search: true },
    DEFAULT_PARAMETER_ENABLED
  )

  expect(payload.web_search_options).toEqual({})
})

test('temporary file ids are attached to the last user message only', () => {
  const payload = buildChatCompletionPayload(
    [
      userMessage('u1', 'first', true),
      assistantMessage('a1', 'reply'),
      userMessage('u2', 'summarize', true),
    ],
    DEFAULT_CONFIG,
    DEFAULT_PARAMETER_ENABLED,
    ['tmp-1', 'tmp-2']
  )

  expect(payload.messages).toEqual([
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'reply' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'summarize' },
        { type: 'playground_file', playground_file: { id: 'tmp-1' } },
        { type: 'playground_file', playground_file: { id: 'tmp-2' } },
      ],
    },
  ])
})

test('earlier attachments are sent as text only when no new files are given', () => {
  const payload = buildChatCompletionPayload(
    [userMessage('u1', 'first', true)],
    DEFAULT_CONFIG,
    DEFAULT_PARAMETER_ENABLED
  )

  expect(payload.messages).toEqual([{ role: 'user', content: 'first' }])
})

test('file ids are not attached when the last message is not from the user', () => {
  const payload = buildChatCompletionPayload(
    [userMessage('u1', 'first'), assistantMessage('a1', 'reply')],
    DEFAULT_CONFIG,
    DEFAULT_PARAMETER_ENABLED,
    ['tmp-1']
  )

  expect(JSON.stringify(payload)).not.toContain('playground_file')
})
