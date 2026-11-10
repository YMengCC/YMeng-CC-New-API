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
import { afterEach, beforeEach, expect, test } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { STORAGE_KEYS } from '../../../constants'
import type { Message } from '../../../types'
import {
  createConversation,
  getConversationTitle,
  loadHistory,
  pruneHistory,
  saveActiveConversationId,
  saveHistory,
  sanitizeConversationTitle,
} from '../conversation-storage'
import {
  clearPlaygroundData,
  getUserStorageKey,
  loadConfig,
  loadMessages,
  loadParameterEnabled,
  saveConfig,
  saveMessages,
  saveParameterEnabled,
} from '../storage'
import { MAX_STORED_CONVERSATIONS } from '../storage-schema'

const messages: Message[] = [
  {
    key: 'a-chat',
    from: 'user',
    versions: [{ id: 'a-version', content: 'Account A private chat' }],
  },
]

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

afterEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

test('switching accounts isolates config, messages and parameter toggles and preserves returning account data', () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
  saveConfig({ model: 'account-a-model' })
  saveMessages(messages)
  saveParameterEnabled({ temperature: true })

  useAuthStore.getState().auth.reset()
  useAuthStore.getState().auth.setUser({ id: 2, username: 'B', role: 1 })
  expect(loadConfig()).toEqual({})
  expect(loadMessages()).toBeNull()
  expect(loadParameterEnabled()).toEqual({})
  saveConfig({ model: 'account-b-model' })
  saveMessages([])
  saveParameterEnabled({ temperature: false })

  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
  expect(loadConfig()).toEqual({ model: 'account-a-model' })
  expect(loadMessages()).toEqual(messages)
  expect(loadParameterEnabled()).toEqual({ temperature: true })

  clearPlaygroundData()
  expect(loadMessages()).toBeNull()
  useAuthStore.getState().auth.setUser({ id: 2, username: 'B', role: 1 })
  expect(loadConfig()).toEqual({ model: 'account-b-model' })
  expect(loadMessages()).toEqual([])
  expect(loadParameterEnabled()).toEqual({ temperature: false })
})

test('legacy global data is removed instead of assigned to the first signed-in account', () => {
  localStorage.setItem(
    STORAGE_KEYS.CONFIG,
    JSON.stringify({ model: 'legacy-model' })
  )
  localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(messages))
  localStorage.setItem(
    STORAGE_KEYS.PARAMETER_ENABLED,
    JSON.stringify({ temperature: true })
  )
  useAuthStore.getState().auth.setUser({ id: 2, username: 'B', role: 1 })

  expect(loadConfig()).toEqual({})
  expect(loadMessages()).toBeNull()
  expect(loadParameterEnabled()).toEqual({})
  for (const key of Object.values(STORAGE_KEYS)) {
    expect(localStorage.getItem(key)).toBeNull()
  }
})

test('storage calls without a signed-in user do not persist shared data', () => {
  saveConfig({ model: 'signed-out-model' })
  saveMessages(messages)
  saveParameterEnabled({ temperature: true })
  expect(loadConfig()).toEqual({})
  expect(loadMessages()).toBeNull()
  expect(loadParameterEnabled()).toEqual({})
  expect(localStorage.length).toBe(0)
})

test('legacy messages are migrated into the first history conversation', () => {
  useAuthStore.getState().auth.setUser({ id: 7, username: 'A', role: 1 })
  saveMessages(messages)

  const history = loadHistory()
  expect(history.conversations).toHaveLength(1)
  expect(history.conversations[0].messages).toEqual(messages)
  expect(history.activeId).toBe(history.conversations[0].id)
  expect(
    localStorage.getItem(getUserStorageKey(STORAGE_KEYS.MESSAGES) ?? '')
  ).toBeNull()
  expect(loadHistory().conversations[0].messages).toEqual(messages)
})

test('conversation titles come from the first user message and are bounded', () => {
  expect(getConversationTitle(messages)).toBe('Account A private chat')
  expect(getConversationTitle([])).toBe('New chat')
  expect(
    getConversationTitle([createUserMessage('  # Hello   **world** ')])
  ).toBe('Hello world')
  expect(
    getConversationTitle([createUserMessage('x'.repeat(120))])
  ).toHaveLength(60)
  expect(sanitizeConversationTitle('   ')).toBe('New chat')
})

test('active conversation id is restored on reload and history is per-user', () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
  const first = createConversation(messages)
  const second = createConversation([])
  saveHistory({ activeId: second.id, conversations: [first, second] })
  saveActiveConversationId(second.id)
  expect(loadHistory().activeId).toBe(second.id)

  useAuthStore.getState().auth.reset()
  useAuthStore.getState().auth.setUser({ id: 2, username: 'B', role: 1 })
  const other = loadHistory()
  expect(other.conversations).toHaveLength(1)
  expect(other.conversations[0].messages).toEqual([])
  expect(other.activeId).not.toBe(second.id)

  useAuthStore.getState().auth.setUser({ id: 1, username: 'A', role: 1 })
  expect(loadHistory().activeId).toBe(second.id)
})

test('history is pruned to the conversation cap, keeping the active entry', () => {
  const conversations = Array.from(
    { length: MAX_STORED_CONVERSATIONS + 5 },
    (_, i) => createConversation([], 1000 + i)
  )
  const active = conversations[MAX_STORED_CONVERSATIONS + 4]
  const pruned = pruneHistory({ activeId: active.id, conversations })

  expect(pruned.conversations).toHaveLength(MAX_STORED_CONVERSATIONS)
  expect(pruned.activeId).toBe(active.id)
  expect(pruned.conversations.some((item) => item.id === active.id)).toBe(true)
})

test('corrupt history falls back to a fresh empty conversation', () => {
  useAuthStore.getState().auth.setUser({ id: 3, username: 'A', role: 1 })
  const key = getUserStorageKey(STORAGE_KEYS.HISTORY)
  if (key) localStorage.setItem(key, '{not-json')

  const history = loadHistory()
  expect(history.conversations).toHaveLength(1)
  expect(history.conversations[0].messages).toEqual([])
  expect(history.activeId).toBe(history.conversations[0].id)
})

test('clearing playground data removes the history keys too', () => {
  useAuthStore.getState().auth.setUser({ id: 4, username: 'A', role: 1 })
  saveHistory({ activeId: 'x', conversations: [createConversation()] })
  saveActiveConversationId('x')
  clearPlaygroundData()

  for (const baseKey of Object.values(STORAGE_KEYS)) {
    const key = getUserStorageKey(baseKey)
    if (key) expect(localStorage.getItem(key)).toBeNull()
  }
})

function createUserMessage(content: string): Message {
  return {
    key: `user-${content.length}`,
    from: 'user',
    versions: [{ id: 'v1', content }],
  }
}

test('dropped data-URL images are never persisted in conversation history', () => {
  useAuthStore.getState().auth.setUser({ id: 5, username: 'A', role: 1 })
  const conversation = createConversation([
    {
      key: 'with-image',
      from: 'user',
      versions: [{ id: 'v1', content: 'what is this?' }],
      images: ['data:image/png;base64,AAAA'],
    },
  ])
  saveHistory({ activeId: conversation.id, conversations: [conversation] })

  const raw = localStorage.getItem(
    getUserStorageKey(STORAGE_KEYS.HISTORY) ?? ''
  )
  expect(raw).not.toContain('data:image/png;base64,AAAA')

  const loaded = loadHistory()
  expect(loaded.conversations[0].messages[0].images).toBeUndefined()
  expect(loaded.conversations[0].messages[0].versions[0].content).toBe(
    'what is this?'
  )
})

test('pruneHistory strips session-only images but keeps remote media URLs', () => {
  const conversation = createConversation([
    {
      key: 'mixed',
      from: 'assistant',
      versions: [{ id: 'v1', content: '' }],
      images: ['data:image/png;base64,AAAA', 'https://example.com/remote.png'],
      media: [
        {
          type: 'image',
          prompt: 'a cat',
          status: 'succeeded',
          url: 'https://example.com/cat.png',
        },
      ],
    },
  ])

  const pruned = pruneHistory({
    activeId: conversation.id,
    conversations: [conversation],
  })
  const message = pruned.conversations[0].messages[0]

  expect(message.images).toEqual(['https://example.com/remote.png'])
  expect(message.media?.[0].url).toBe('https://example.com/cat.png')
})
