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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { DEFAULT_CONFIG, DEFAULT_CONVERSATION_TITLE } from '../constants'
import {
  applyMessageStateUpdate,
  buildPlaygroundBackup,
  createConversation,
  downloadPlaygroundBackup,
  getConversationTitle,
  getGroupFallback,
  getInitialPlaygroundConfig,
  getModelFallback,
  loadHistory,
  loadHistoryCollapsed,
  planPlaygroundImport,
  pruneHistory,
  removeConversation,
  sanitizeConversationTitle,
  saveActiveConversationId,
  saveConfig,
  saveHistory,
  saveHistoryCollapsed,
  type MessageStateUpdater,
  type PlaygroundBackupPayload,
  type PlaygroundImportOptions,
  type PlaygroundImportResult,
} from '../lib'
import type {
  Message,
  PlaygroundConfig,
  ModelOption,
  GroupOption,
  PlaygroundHistory,
} from '../types'

const MESSAGE_SAVE_DEBOUNCE_MS = 500

function createInitialHistory(): PlaygroundHistory {
  const conversation = createConversation()
  return { activeId: conversation.id, conversations: [conversation] }
}

/**
 * Main state management hook for playground
 */
export function usePlaygroundState() {
  const [config, setConfig] = useState<PlaygroundConfig>(
    getInitialPlaygroundConfig
  )
  const configRef = useRef(config)

  const [history, setHistory] =
    useState<PlaygroundHistory>(createInitialHistory)
  const historyRef = useRef(history)
  const [isLoadingMessages, setIsLoadingMessages] = useState(true)
  const [isHistoryCollapsed, setIsHistoryCollapsed] =
    useState(loadHistoryCollapsed)
  const messagesSaveTimerRef = useRef<number | null>(null)
  const hasLoadedMessagesRef = useRef(false)

  const [models, setModels] = useState<ModelOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const modelsRef = useRef(models)
  const groupsRef = useRef(groups)

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    modelsRef.current = models
  }, [models])

  useEffect(() => {
    groupsRef.current = groups
  }, [groups])

  const messages = useMemo(
    () =>
      history.conversations.find(
        (conversation) => conversation.id === history.activeId
      )?.messages ?? [],
    [history]
  )

  const scheduleSave = useCallback(() => {
    if (!hasLoadedMessagesRef.current) return

    if (messagesSaveTimerRef.current !== null) {
      window.clearTimeout(messagesSaveTimerRef.current)
    }

    messagesSaveTimerRef.current = window.setTimeout(() => {
      messagesSaveTimerRef.current = null
      saveHistory(historyRef.current)
    }, MESSAGE_SAVE_DEBOUNCE_MS)
  }, [])

  const flushSave = useCallback(() => {
    if (messagesSaveTimerRef.current === null) return

    window.clearTimeout(messagesSaveTimerRef.current)
    messagesSaveTimerRef.current = null
    if (hasLoadedMessagesRef.current) saveHistory(historyRef.current)
  }, [])

  const commitHistory = useCallback(
    (next: PlaygroundHistory) => {
      historyRef.current = next
      setHistory(next)
      scheduleSave()
    },
    [scheduleSave]
  )

  useEffect(() => {
    let cancelled = false

    window.setTimeout(() => {
      const loadedHistory = loadHistory()
      if (cancelled) return

      historyRef.current = loadedHistory
      hasLoadedMessagesRef.current = true
      setHistory(loadedHistory)
      setIsLoadingMessages(false)
    }, 0)

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (messagesSaveTimerRef.current !== null) {
        window.clearTimeout(messagesSaveTimerRef.current)
        saveHistory(historyRef.current)
      }
    },
    []
  )

  const updateConfig = useCallback(
    <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => {
      setConfig((prev) => {
        const updated = { ...prev, [key]: value }
        configRef.current = updated
        saveConfig(updated)
        return updated
      })
    },
    []
  )

  // Update the active conversation's messages, auto-saving to localStorage.
  const updateMessages = useCallback(
    (updater: MessageStateUpdater) => {
      const previousHistory = historyRef.current
      const activeConversation = previousHistory.conversations.find(
        (conversation) => conversation.id === previousHistory.activeId
      )
      const nextMessages: Message[] = applyMessageStateUpdate(
        activeConversation?.messages ?? [],
        updater
      )
      const title =
        activeConversation?.title === DEFAULT_CONVERSATION_TITLE
          ? getConversationTitle(nextMessages)
          : (activeConversation?.title ?? DEFAULT_CONVERSATION_TITLE)

      commitHistory({
        ...previousHistory,
        conversations: previousHistory.conversations.map((conversation) =>
          conversation.id === previousHistory.activeId
            ? {
                ...conversation,
                title,
                messages: nextMessages,
                updatedAt: Date.now(),
              }
            : conversation
        ),
      })
    },
    [commitHistory]
  )

  // Clear only the active conversation's messages; keep its history entry.
  const clearMessages = useCallback(() => {
    const previousHistory = historyRef.current
    commitHistory({
      ...previousHistory,
      conversations: previousHistory.conversations.map((conversation) =>
        conversation.id === previousHistory.activeId
          ? {
              ...conversation,
              title: DEFAULT_CONVERSATION_TITLE,
              messages: [],
              updatedAt: Date.now(),
            }
          : conversation
      ),
    })
  }, [commitHistory])

  const newConversation = useCallback(() => {
    flushSave()
    const conversation = createConversation()
    const nextHistory = pruneHistory({
      activeId: conversation.id,
      conversations: [conversation, ...historyRef.current.conversations],
    })
    commitHistory(nextHistory)
    saveActiveConversationId(nextHistory.activeId)
  }, [commitHistory, flushSave])

  const switchConversation = useCallback(
    (id: string) => {
      if (!historyRef.current.conversations.some((item) => item.id === id)) {
        return
      }

      flushSave()
      const nextHistory = { ...historyRef.current, activeId: id }
      commitHistory(nextHistory)
      saveActiveConversationId(id)
    },
    [commitHistory, flushSave]
  )

  const renameConversation = useCallback(
    (id: string, title: string) => {
      const previousHistory = historyRef.current
      commitHistory({
        ...previousHistory,
        conversations: previousHistory.conversations.map((conversation) =>
          conversation.id === id
            ? { ...conversation, title: sanitizeConversationTitle(title) }
            : conversation
        ),
      })
    },
    [commitHistory]
  )

  const deleteConversation = useCallback(
    (id: string) => {
      flushSave()
      const nextHistory = removeConversation(historyRef.current, id)
      if (nextHistory.conversations.length === 0) {
        const conversation = createConversation()
        const emptyHistory = {
          activeId: conversation.id,
          conversations: [conversation],
        }
        commitHistory(emptyHistory)
        saveActiveConversationId(emptyHistory.activeId)
        return
      }

      commitHistory(nextHistory)
      saveActiveConversationId(nextHistory.activeId)
    },
    [commitHistory, flushSave]
  )

  const clearHistory = useCallback(() => {
    flushSave()
    const conversation = createConversation()
    const nextHistory = {
      activeId: conversation.id,
      conversations: [conversation],
    }
    commitHistory(nextHistory)
    saveActiveConversationId(nextHistory.activeId)
  }, [commitHistory, flushSave])

  const setHistoryCollapsed = useCallback((collapsed: boolean) => {
    setIsHistoryCollapsed(collapsed)
    saveHistoryCollapsed(collapsed)
  }, [])

  const resetConfig = useCallback(() => {
    configRef.current = DEFAULT_CONFIG
    setConfig(DEFAULT_CONFIG)
    saveConfig(DEFAULT_CONFIG)
  }, [])

  const exportPlaygroundData = useCallback(() => {
    flushSave()
    const backup = buildPlaygroundBackup(historyRef.current, configRef.current)
    downloadPlaygroundBackup(backup)
    return { count: backup.history.conversations.length }
  }, [flushSave])

  const importPlaygroundData = useCallback(
    (
      backup: PlaygroundBackupPayload,
      options: PlaygroundImportOptions
    ): PlaygroundImportResult => {
      if (messagesSaveTimerRef.current !== null) {
        window.clearTimeout(messagesSaveTimerRef.current)
        messagesSaveTimerRef.current = null
      }

      const plan = planPlaygroundImport(
        historyRef.current,
        backup.history,
        options.mode
      )

      if (!saveHistory(plan.history)) {
        return { ok: false, error: 'storage_failed' }
      }

      saveActiveConversationId(plan.history.activeId)
      historyRef.current = plan.history
      hasLoadedMessagesRef.current = true
      setHistory(plan.history)
      setIsLoadingMessages(false)

      if (options.restoreConfig && backup.config) {
        const previousGroup = configRef.current.group
        const candidate: PlaygroundConfig = {
          ...DEFAULT_CONFIG,
          ...configRef.current,
          ...backup.config,
        }
        const resolvedGroup =
          getGroupFallback(groupsRef.current, candidate.group) ??
          candidate.group
        const resolvedModel =
          resolvedGroup === previousGroup
            ? (getModelFallback(modelsRef.current, candidate.model) ??
              candidate.model)
            : candidate.model
        const nextConfig: PlaygroundConfig = {
          ...candidate,
          group: resolvedGroup,
          model: resolvedModel,
        }
        configRef.current = nextConfig
        saveConfig(nextConfig)
        setConfig(nextConfig)
      }

      return {
        ok: true,
        importedCount: plan.importedCount,
        totalCount: plan.totalCount,
        droppedCount: plan.droppedCount,
      }
    },
    []
  )

  return {
    // State
    config,
    messages,
    history,
    isLoadingMessages,
    isHistoryCollapsed,
    models,
    groups,

    // Setters
    setModels,
    setGroups,

    // Actions
    updateConfig,
    updateMessages,
    clearMessages,
    newConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    clearHistory,
    setHistoryCollapsed,
    resetConfig,
    exportPlaygroundData,
    importPlaygroundData,
  }
}
