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

import { DEFAULT_CONVERSATION_TITLE } from '../../../constants'
import type {
  Message,
  PlaygroundConversation,
  PlaygroundHistory,
} from '../../../types'
import {
  createConversation,
  loadHistory,
  saveHistory,
} from '../conversation-storage'
import {
  buildPlaygroundBackup,
  MAX_IMPORT_FILE_BYTES,
  parsePlaygroundBackup,
  planPlaygroundImport,
} from '../history-transfer'
import {
  MAX_STORED_CONVERSATIONS,
  PLAYGROUND_BACKUP_FORMAT,
  PLAYGROUND_BACKUP_VERSION,
} from '../storage-schema'

function createMessage(
  key: string,
  from: 'user' | 'assistant',
  content: string,
  extra: Partial<Message> = {}
): Message {
  return {
    key,
    from,
    versions: [{ id: `${key}-v1`, content }],
    ...extra,
  }
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

afterEach(() => {
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

test('export and parse round-trip preserves conversations, rich message metadata, and config', () => {
  const conversation: PlaygroundConversation = {
    id: 'conv-1',
    title: 'Design review',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    messages: [
      createMessage('m1', 'user', 'Check this report', {
        attachments: [
          { name: 'report.pdf', mimeType: 'application/pdf', size: 1024 },
        ],
      }),
      createMessage('m2', 'assistant', 'Summary ready.', {
        status: 'complete',
        reasoning: { content: 'Analyzed sections.', duration: 2 },
        sources: [{ href: 'https://example.com/ref', title: 'Reference' }],
        media: [
          {
            type: 'image',
            prompt: 'chart',
            status: 'succeeded',
            url: 'https://example.com/chart.png',
          },
        ],
      }),
    ],
  }

  const backup = buildPlaygroundBackup(
    { activeId: 'conv-1', conversations: [conversation] },
    { model: 'gpt-4.1', group: 'vip', stream: false, web_search: true },
    1_700_000_200_000
  )

  const parsed = parsePlaygroundBackup(JSON.stringify(backup))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return

  expect(parsed.conversationCount).toBe(1)
  expect(parsed.messageCount).toBe(2)
  expect(parsed.hasConfig).toBe(true)
  expect(parsed.backup.exportedAt).toBe(1_700_000_200_000)
  expect(parsed.backup.config).toEqual({
    model: 'gpt-4.1',
    group: 'vip',
    stream: false,
    web_search: true,
  })
  expect(parsed.backup.history.activeId).toBe('conv-1')
  expect(parsed.backup.history.conversations[0].messages).toEqual(
    conversation.messages
  )
})

test('export and parse strip session-only base64 payloads, unsafe citations, extra attachment fields, and stuck streaming states', () => {
  const leakyAttachment = {
    name: 'secret.pdf',
    mimeType: 'application/pdf',
    size: 512,
    id: 'upload-123',
    url: 'data:application/pdf;base64,JVBERi0=',
  }
  const conversation: PlaygroundConversation = {
    id: 'conv-sanitize',
    title: 'Sanitize test',
    createdAt: 1000,
    updatedAt: 2000,
    messages: [
      createMessage('u1', 'user', 'Inspect', {
        images: ['data:image/png;base64,AAAA'],
        attachments: [leakyAttachment],
      }),
      createMessage('a1', 'assistant', 'Partial answer', {
        status: 'streaming',
        isReasoningStreaming: true,
        sources: [
          { href: 'https://example.com/safe', title: 'Safe' },
          { href: 'javascript:alert(1)', title: 'Unsafe' },
        ],
        media: [
          {
            type: 'image',
            prompt: 'inline',
            status: 'succeeded',
            url: 'data:image/png;base64,BBBB',
          },
          {
            type: 'image',
            prompt: 'remote',
            status: 'succeeded',
            url: 'https://example.com/ok.png',
          },
        ],
      }),
    ],
  }

  const backup = buildPlaygroundBackup(
    { activeId: 'conv-sanitize', conversations: [conversation] },
    { model: 'gpt-4o', group: 'default', stream: true, web_search: false }
  )
  const serialized = JSON.stringify(backup)
  expect(serialized).not.toContain('data:image/png;base64')
  expect(serialized).not.toContain('upload-123')
  expect(serialized).not.toContain('javascript:alert')

  const parsed = parsePlaygroundBackup(serialized)
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return

  const [userMsg, assistantMsg] =
    parsed.backup.history.conversations[0].messages
  expect(userMsg.attachments).toEqual([
    { name: 'secret.pdf', mimeType: 'application/pdf', size: 512 },
  ])
  expect(userMsg.images).toBeUndefined()
  expect(assistantMsg.status).toBe('complete')
  expect(assistantMsg.isReasoningStreaming).toBe(false)
  expect(assistantMsg.sources).toEqual([
    { href: 'https://example.com/safe', title: 'Safe' },
  ])
  expect(assistantMsg.media).toEqual([
    {
      type: 'image',
      prompt: 'remote',
      status: 'succeeded',
      url: 'https://example.com/ok.png',
    },
  ])
})

test('parsePlaygroundBackup reports distinct errors for oversized, malformed, unsupported, invalid, and empty inputs', () => {
  expect(parsePlaygroundBackup('x'.repeat(MAX_IMPORT_FILE_BYTES + 1))).toEqual({
    ok: false,
    error: 'file_too_large',
  })
  expect(parsePlaygroundBackup('{invalid')).toEqual({
    ok: false,
    error: 'invalid_json',
  })
  expect(
    parsePlaygroundBackup(
      JSON.stringify({
        format: PLAYGROUND_BACKUP_FORMAT,
        version: PLAYGROUND_BACKUP_VERSION + 1,
        history: { activeId: 'a', conversations: [] },
      })
    )
  ).toEqual({
    ok: false,
    error: 'unsupported_version',
  })
  expect(parsePlaygroundBackup(JSON.stringify({ hello: 'world' }))).toEqual({
    ok: false,
    error: 'invalid_format',
  })
  expect(
    parsePlaygroundBackup(
      JSON.stringify({
        format: PLAYGROUND_BACKUP_FORMAT,
        version: PLAYGROUND_BACKUP_VERSION,
        history: { activeId: 'a', conversations: [] },
      })
    )
  ).toEqual({
    ok: false,
    error: 'empty',
  })
})

test('merge mode drops a lone untouched default empty chat and keeps imported active conversation', () => {
  const placeholder = createConversation([], 5000)
  expect(placeholder.title).toBe(DEFAULT_CONVERSATION_TITLE)

  const imported: PlaygroundHistory = {
    activeId: 'imp-2',
    conversations: [
      {
        id: 'imp-1',
        title: 'Older chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [createMessage('m1', 'user', 'Hi')],
      },
      {
        id: 'imp-2',
        title: 'Selected chat',
        createdAt: 1500,
        updatedAt: 1800,
        messages: [createMessage('m2', 'user', 'Hello')],
      },
    ],
  }

  const plan = planPlaygroundImport(
    { activeId: placeholder.id, conversations: [placeholder] },
    imported,
    'merge'
  )

  expect(plan.droppedCount).toBe(0)
  expect(plan.history.conversations.map((item) => item.id)).toEqual([
    'imp-1',
    'imp-2',
  ])
  expect(plan.history.activeId).toBe('imp-2')
})

test('merge mode deduplicates matching IDs by newest updatedAt and is idempotent on re-import', () => {
  const current: PlaygroundHistory = {
    activeId: 'shared',
    conversations: [
      {
        id: 'shared',
        title: 'Local newer',
        createdAt: 1000,
        updatedAt: 5000,
        messages: [createMessage('l1', 'user', 'Updated locally')],
      },
      {
        id: 'local-only',
        title: 'Local only',
        createdAt: 1000,
        updatedAt: 3000,
        messages: [createMessage('l2', 'user', 'Keep me')],
      },
    ],
  }
  const imported: PlaygroundHistory = {
    activeId: 'remote-only',
    conversations: [
      {
        id: 'shared',
        title: 'Backup older',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [createMessage('r1', 'user', 'Older backup')],
      },
      {
        id: 'remote-only',
        title: 'From backup',
        createdAt: 1000,
        updatedAt: 4000,
        messages: [createMessage('r2', 'user', 'Imported')],
      },
    ],
  }

  const firstMerge = planPlaygroundImport(current, imported, 'merge')
  expect(firstMerge.history.activeId).toBe('shared')
  expect(firstMerge.history.conversations.map((item) => item.id)).toEqual([
    'shared',
    'remote-only',
    'local-only',
  ])
  expect(
    firstMerge.history.conversations.find((item) => item.id === 'shared')?.title
  ).toBe('Local newer')

  const secondMerge = planPlaygroundImport(
    firstMerge.history,
    imported,
    'merge'
  )
  expect(secondMerge.history.conversations).toEqual(
    firstMerge.history.conversations
  )
})

test('replace mode swaps all conversations and tracks droppedCount beyond the local cap', () => {
  const existing: PlaygroundHistory = {
    activeId: 'old',
    conversations: [
      {
        id: 'old',
        title: 'Existing',
        createdAt: 100,
        updatedAt: 100,
        messages: [createMessage('o1', 'user', 'Old')],
      },
    ],
  }
  const importedConversations = Array.from(
    { length: MAX_STORED_CONVERSATIONS + 4 },
    (_, index) => ({
      id: `imp-${index}`,
      title: `Chat ${index}`,
      createdAt: 1000 + index,
      updatedAt: 1000 + index,
      messages: [createMessage(`m-${index}`, 'user', `Msg ${index}`)],
    })
  )
  const newestId = importedConversations.at(-1)?.id ?? ''

  const plan = planPlaygroundImport(
    existing,
    { activeId: newestId, conversations: importedConversations },
    'replace'
  )

  expect(plan.importedCount).toBe(MAX_STORED_CONVERSATIONS + 4)
  expect(plan.totalCount).toBe(MAX_STORED_CONVERSATIONS)
  expect(plan.droppedCount).toBe(4)
  expect(plan.history.activeId).toBe(newestId)
  expect(plan.history.conversations.some((item) => item.id === 'old')).toBe(
    false
  )
})

test('importing a backup exported by account A into account B isolates both accounts', () => {
  useAuthStore
    .getState()
    .auth.setUser({ id: 10, username: 'accountA', role: 1 })
  const historyA: PlaygroundHistory = {
    activeId: 'a-1',
    conversations: [
      {
        id: 'a-1',
        title: 'Account A chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [createMessage('am1', 'user', 'Hello from A')],
      },
    ],
  }
  expect(saveHistory(historyA)).toBe(true)
  const backupJson = JSON.stringify(
    buildPlaygroundBackup(historyA, {
      model: 'gpt-4o',
      group: 'default',
      stream: true,
      web_search: false,
    })
  )

  useAuthStore
    .getState()
    .auth.setUser({ id: 20, username: 'accountB', role: 1 })
  const parsed = parsePlaygroundBackup(backupJson)
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return

  const planB = planPlaygroundImport(
    loadHistory(),
    parsed.backup.history,
    'merge'
  )
  expect(saveHistory(planB.history)).toBe(true)
  expect(loadHistory().conversations[0].id).toBe('a-1')

  // Modifying account B does not affect account A.
  expect(
    saveHistory({
      activeId: 'b-only',
      conversations: [
        {
          id: 'b-only',
          title: 'Account B edited',
          createdAt: 3000,
          updatedAt: 4000,
          messages: [],
        },
      ],
    })
  ).toBe(true)

  useAuthStore
    .getState()
    .auth.setUser({ id: 10, username: 'accountA', role: 1 })
  expect(loadHistory().conversations.map((item) => item.id)).toEqual(['a-1'])
})
