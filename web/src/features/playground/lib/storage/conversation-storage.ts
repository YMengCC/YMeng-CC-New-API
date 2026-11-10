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
import { nanoid } from 'nanoid'

import {
  DEFAULT_CONVERSATION_TITLE,
  MAX_CONVERSATION_TITLE_CHARS,
  MESSAGE_ROLES,
  STORAGE_KEYS,
} from '../../constants'
import type {
  Message,
  PlaygroundConversation,
  PlaygroundHistory,
} from '../../types'
import { getMessageContent } from '../message/message-utils'
import {
  getUserStorageKey,
  loadMessages,
  normalizeStoredMessageForLoad,
  readStoredValue,
  trimMessages,
  trimMessagesByContentSize,
  unwrapStoredValue,
  writeStoredValue,
} from './storage'
import {
  MAX_STORED_CONVERSATIONS,
  MAX_STORED_HISTORY_BYTES,
  playgroundHistorySchema,
} from './storage-schema'

export function createConversation(
  messages: Message[] = [],
  now: number = Date.now()
): PlaygroundConversation {
  return {
    id: nanoid(),
    title: getConversationTitle(messages),
    createdAt: now,
    updatedAt: now,
    messages,
  }
}

export function getConversationTitle(messages: Message[]): string {
  const sourceMessage =
    messages.find((message) => message.from === MESSAGE_ROLES.USER) ??
    messages[0]
  const content = sourceMessage ? getMessageContent(sourceMessage) : ''
  const title = content
    .replace(/^#{1,6}\s+/, '')
    .replaceAll(/[*_`>[\]()#]/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()

  if (!title) return DEFAULT_CONVERSATION_TITLE

  return title.slice(0, MAX_CONVERSATION_TITLE_CHARS)
}

export function sanitizeConversationTitle(title: string): string {
  const normalized = title.replaceAll(/\s+/g, ' ').trim()
  return normalized
    ? normalized.slice(0, MAX_CONVERSATION_TITLE_CHARS)
    : DEFAULT_CONVERSATION_TITLE
}

function stripSessionOnlyMedia(message: Message): Message {
  const media = message.media?.filter((item) => !item.url?.startsWith('data:'))
  const images = message.images?.filter((url) => !url.startsWith('data:'))
  const mediaChanged = media && media.length !== (message.media?.length ?? 0)
  const imagesChanged =
    images && images.length !== (message.images?.length ?? 0)

  if (!mediaChanged && !imagesChanged) return message

  return {
    ...message,
    ...(mediaChanged ? { media } : {}),
    ...(imagesChanged ? { images } : {}),
  }
}

function trimConversationMessages(
  conversation: PlaygroundConversation
): PlaygroundConversation {
  const trimmed = trimMessagesByContentSize(trimMessages(conversation.messages))
  const messages = trimmed.map(stripSessionOnlyMedia)
  const unchanged =
    trimmed === conversation.messages &&
    messages.every((message, index) => message === trimmed[index])

  return unchanged ? conversation : { ...conversation, messages }
}

function normalizeConversationOnLoad(
  conversation: PlaygroundConversation
): PlaygroundConversation {
  const trimmed = trimConversationMessages(conversation)
  const messages = trimmed.messages.map(normalizeStoredMessageForLoad)

  if (messages.every((message, index) => message === trimmed.messages[index])) {
    return trimmed
  }

  return { ...trimmed, messages }
}

function sortByUpdatedAt(conversations: PlaygroundConversation[]) {
  return [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
}

function getHistoryWithinByteLimit(
  conversations: PlaygroundConversation[]
): PlaygroundConversation[] {
  const result: PlaygroundConversation[] = []

  for (const conversation of conversations) {
    result.push(conversation)
    if (
      result.length > 1 &&
      JSON.stringify({ activeId: '', conversations: result }).length >
        MAX_STORED_HISTORY_BYTES
    ) {
      result.pop()
      break
    }
  }

  return result
}

export function pruneHistory(history: PlaygroundHistory): PlaygroundHistory {
  const conversations = getHistoryWithinByteLimit(
    sortByUpdatedAt(history.conversations)
      .slice(0, MAX_STORED_CONVERSATIONS)
      .map(trimConversationMessages)
  )
  const activeId = conversations.some(
    (conversation) => conversation.id === history.activeId
  )
    ? history.activeId
    : (conversations[0]?.id ?? history.activeId)

  return { activeId, conversations }
}

export function loadHistory(): PlaygroundHistory {
  try {
    const saved = readStoredValue(STORAGE_KEYS.HISTORY)
    if (saved) {
      const parsed = playgroundHistorySchema.parse(unwrapStoredValue(saved))
      const history: PlaygroundHistory = {
        activeId: parsed.activeId,
        conversations: sortByUpdatedAt(
          parsed.conversations.map(normalizeConversationOnLoad)
        ),
      }
      const savedActiveId = loadActiveConversationId()
      if (
        savedActiveId &&
        history.conversations.some(
          (conversation) => conversation.id === savedActiveId
        )
      ) {
        history.activeId = savedActiveId
      }
      const pruned = pruneHistory(history)
      if (JSON.stringify(pruned) !== JSON.stringify(parsed)) {
        saveHistory(pruned)
      }
      return pruned
    }

    // One-time migration: the legacy single conversation becomes the first entry.
    const legacyMessages = loadMessages() ?? []
    const legacyKey = getUserStorageKey(STORAGE_KEYS.MESSAGES)
    if (legacyKey) localStorage.removeItem(legacyKey)

    const conversation = createConversation(legacyMessages)
    const history = {
      activeId: conversation.id,
      conversations: [conversation],
    }
    saveHistory(history)
    return history
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load conversation history:', error)
    const conversation = createConversation()
    return { activeId: conversation.id, conversations: [conversation] }
  }
}

export function saveHistory(history: PlaygroundHistory): void {
  try {
    writeStoredValue(STORAGE_KEYS.HISTORY, pruneHistory(history))
  } catch (error) {
    // Keep the in-memory state intact when the browser quota is exhausted.
    // eslint-disable-next-line no-console
    console.error('Failed to save conversation history:', error)
  }
}

export function loadActiveConversationId(): string | null {
  try {
    const saved = readStoredValue(STORAGE_KEYS.ACTIVE_ID)
    return typeof unwrapStoredValue(saved) === 'string'
      ? (unwrapStoredValue(saved) as string)
      : null
  } catch {
    return null
  }
}

export function saveActiveConversationId(id: string): void {
  try {
    writeStoredValue(STORAGE_KEYS.ACTIVE_ID, id)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save active conversation:', error)
  }
}

export function loadHistoryCollapsed(): boolean {
  try {
    return (
      unwrapStoredValue(readStoredValue(STORAGE_KEYS.HISTORY_COLLAPSED)) ===
      true
    )
  } catch {
    return false
  }
}

export function saveHistoryCollapsed(collapsed: boolean): void {
  try {
    writeStoredValue(STORAGE_KEYS.HISTORY_COLLAPSED, collapsed)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to save history sidebar state:', error)
  }
}
