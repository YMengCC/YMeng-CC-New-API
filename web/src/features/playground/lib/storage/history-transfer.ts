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
import dayjs from '@/lib/dayjs'

import { DEFAULT_CONVERSATION_TITLE } from '../../constants'
import type {
  PlaygroundConfig,
  PlaygroundConversation,
  PlaygroundHistory,
} from '../../types'
import { sanitizeMessagesOnLoad } from '../message/message-streaming-utils'
import {
  normalizeConversationOnLoad,
  pruneHistory,
  sanitizeConversationTitle,
} from './conversation-storage'
import {
  MAX_IMPORT_FILE_BYTES,
  PLAYGROUND_BACKUP_FORMAT,
  PLAYGROUND_BACKUP_VERSION,
  playgroundBackupSchema,
  playgroundConfigSchema,
} from './storage-schema'

export type PlaygroundBackupPayload = {
  format: typeof PLAYGROUND_BACKUP_FORMAT
  version: typeof PLAYGROUND_BACKUP_VERSION
  exportedAt?: number
  history: PlaygroundHistory
  config?: Partial<PlaygroundConfig>
}

export type PlaygroundImportMode = 'merge' | 'replace'

export type PlaygroundImportOptions = {
  mode: PlaygroundImportMode
  restoreConfig: boolean
}

export type PlaygroundBackupParseError =
  | 'file_too_large'
  | 'invalid_json'
  | 'unsupported_version'
  | 'invalid_format'
  | 'empty'

export type PlaygroundBackupParsed = {
  ok: true
  backup: PlaygroundBackupPayload
  conversationCount: number
  messageCount: number
  hasConfig: boolean
}

export type PlaygroundBackupParseResult =
  | PlaygroundBackupParsed
  | {
      ok: false
      error: PlaygroundBackupParseError
    }

export type PlaygroundImportPlan = {
  history: PlaygroundHistory
  importedCount: number
  totalCount: number
  droppedCount: number
}

export type PlaygroundImportResult =
  | {
      ok: true
      importedCount: number
      totalCount: number
      droppedCount: number
    }
  | {
      ok: false
      error: 'storage_failed'
    }

export { MAX_IMPORT_FILE_BYTES }

function sanitizeConversationForTransfer(
  conversation: PlaygroundConversation
): PlaygroundConversation {
  const normalized = normalizeConversationOnLoad(conversation)
  const messages = sanitizeMessagesOnLoad(normalized.messages)
  const title = sanitizeConversationTitle(normalized.title)

  if (messages === normalized.messages && title === normalized.title) {
    return normalized
  }

  return {
    ...normalized,
    title,
    messages,
  }
}

function pickPreferredConversation(
  existing: PlaygroundConversation,
  candidate: PlaygroundConversation
): PlaygroundConversation {
  if (candidate.updatedAt > existing.updatedAt) {
    return candidate
  }
  if (candidate.updatedAt < existing.updatedAt) {
    return existing
  }
  return candidate.messages.length > existing.messages.length
    ? candidate
    : existing
}

function deduplicateConversations(
  conversations: PlaygroundConversation[]
): PlaygroundConversation[] {
  const byId = new Map<string, PlaygroundConversation>()
  for (const conversation of conversations) {
    const existing = byId.get(conversation.id)
    byId.set(
      conversation.id,
      existing
        ? pickPreferredConversation(existing, conversation)
        : conversation
    )
  }
  return [...byId.values()]
}

function isUntouchedEmptyConversation(
  conversation: PlaygroundConversation
): boolean {
  return (
    conversation.messages.length === 0 &&
    conversation.title === DEFAULT_CONVERSATION_TITLE
  )
}

export function buildPlaygroundBackup(
  history: PlaygroundHistory,
  config: Partial<PlaygroundConfig>,
  now: number = Date.now()
): PlaygroundBackupPayload {
  const sanitizedConversations = deduplicateConversations(
    history.conversations.map(sanitizeConversationForTransfer)
  ).sort((a, b) => b.updatedAt - a.updatedAt)

  const activeId = sanitizedConversations.some(
    (conversation) => conversation.id === history.activeId
  )
    ? history.activeId
    : (sanitizedConversations[0]?.id ?? history.activeId)

  const parsedConfig = playgroundConfigSchema.parse(config)

  return playgroundBackupSchema.parse({
    format: PLAYGROUND_BACKUP_FORMAT,
    version: PLAYGROUND_BACKUP_VERSION,
    exportedAt: now,
    history: {
      activeId,
      conversations: sanitizedConversations,
    },
    config: parsedConfig,
  }) as PlaygroundBackupPayload
}

export function downloadPlaygroundBackup(
  backup: PlaygroundBackupPayload
): void {
  const content = `${JSON.stringify(backup, null, 2)}\n`
  const blob = new Blob([content], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const timestamp = dayjs(backup.exportedAt ?? Date.now()).format(
    'YYYYMMDD-HHmmss'
  )

  link.href = url
  link.download = `playground-backup-${timestamp}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function parsePlaygroundBackup(
  rawText: string
): PlaygroundBackupParseResult {
  if (rawText.length > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: 'file_too_large' }
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(rawText)
  } catch {
    return { ok: false, error: 'invalid_json' }
  }

  if (
    parsedJson &&
    typeof parsedJson === 'object' &&
    'format' in parsedJson &&
    (parsedJson as { format?: unknown }).format === PLAYGROUND_BACKUP_FORMAT &&
    'version' in parsedJson &&
    (parsedJson as { version?: unknown }).version !== PLAYGROUND_BACKUP_VERSION
  ) {
    return { ok: false, error: 'unsupported_version' }
  }

  const validated = playgroundBackupSchema.safeParse(parsedJson)
  if (!validated.success) {
    return { ok: false, error: 'invalid_format' }
  }

  if (validated.data.history.conversations.length === 0) {
    return { ok: false, error: 'empty' }
  }

  const sanitizedConversations = deduplicateConversations(
    validated.data.history.conversations.map(sanitizeConversationForTransfer)
  ).sort((a, b) => b.updatedAt - a.updatedAt)

  const activeId = sanitizedConversations.some(
    (conversation) => conversation.id === validated.data.history.activeId
  )
    ? validated.data.history.activeId
    : sanitizedConversations[0].id

  const config =
    validated.data.config && Object.keys(validated.data.config).length > 0
      ? validated.data.config
      : undefined

  const backup: PlaygroundBackupPayload = {
    format: PLAYGROUND_BACKUP_FORMAT,
    version: PLAYGROUND_BACKUP_VERSION,
    ...(validated.data.exportedAt !== undefined
      ? { exportedAt: validated.data.exportedAt }
      : {}),
    history: {
      activeId,
      conversations: sanitizedConversations,
    },
    ...(config ? { config } : {}),
  }

  const messageCount = sanitizedConversations.reduce(
    (total, conversation) => total + conversation.messages.length,
    0
  )

  return {
    ok: true,
    backup,
    conversationCount: sanitizedConversations.length,
    messageCount,
    hasConfig: Boolean(config),
  }
}

export function planPlaygroundImport(
  currentHistory: PlaygroundHistory,
  importedHistory: PlaygroundHistory,
  mode: PlaygroundImportMode
): PlaygroundImportPlan {
  const importedConversations = deduplicateConversations(
    importedHistory.conversations
  )
  const importedCount = importedConversations.length

  if (mode === 'replace') {
    const pruned = pruneHistory({
      activeId: importedHistory.activeId,
      conversations: importedConversations,
    })

    return {
      history: pruned,
      importedCount,
      totalCount: pruned.conversations.length,
      droppedCount: Math.max(
        0,
        importedConversations.length - pruned.conversations.length
      ),
    }
  }

  const dropCurrentPlaceholder =
    currentHistory.conversations.length === 1 &&
    isUntouchedEmptyConversation(currentHistory.conversations[0])
  const baseConversations = dropCurrentPlaceholder
    ? []
    : currentHistory.conversations
  const mergedConversations = deduplicateConversations([
    ...baseConversations,
    ...importedConversations,
  ])
  const preferredActiveId =
    !dropCurrentPlaceholder &&
    mergedConversations.some(
      (conversation) => conversation.id === currentHistory.activeId
    )
      ? currentHistory.activeId
      : importedHistory.activeId

  const pruned = pruneHistory({
    activeId: preferredActiveId,
    conversations: mergedConversations,
  })

  return {
    history: pruned,
    importedCount,
    totalCount: pruned.conversations.length,
    droppedCount: Math.max(
      0,
      mergedConversations.length - pruned.conversations.length
    ),
  }
}
