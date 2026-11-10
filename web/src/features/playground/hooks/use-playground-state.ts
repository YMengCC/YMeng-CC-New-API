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

import {
  DEFAULT_CONFIG,
  DEFAULT_CONVERSATION_TITLE,
  DEFAULT_PARAMETER_ENABLED,
} from '../constants'
import {
  applyMessageStateUpdate,
  createConversation,
  getConversationTitle,
  loadHistory,
  loadHistoryCollapsed,
  pruneHistory,
  saveActiveConversationId,
  saveConfig,
  saveHistory,
  saveHistoryCollapsed,
  saveParameterEnabled,
  getInitialParameterEnabled,
  getInitialPlaygroundConfig,
  sanitizeConversationTitle,
  type MessageStateUpdater,
} from '../lib'
import type {
  Message,
  PlaygroundConfig,
  ParameterEnabled,
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

  const [parameterEnabled, setParameterEnabled] = useState<ParameterEnabled>(
    getInitialParameterEnabled
  )

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
        saveConfig(updated)
        return updated
      })
    },
    []
  )

  const updateParameterEnabled = useCallback(
    (key: keyof ParameterEnabled, value: boolean) => {
      setParameterEnabled((prev) => {
        const updated = { ...prev, [key]: value }
        saveParameterEnabled(updated)
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

  const setHistoryCollapsed = useCallback((collapsed: boolean) => {
    setIsHistoryCollapsed(collapsed)
    saveHistoryCollapsed(collapsed)
  }, [])

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG)
    setParameterEnabled(DEFAULT_PARAMETER_ENABLED)
    saveConfig(DEFAULT_CONFIG)
    saveParameterEnabled(DEFAULT_PARAMETER_ENABLED)
  }, [])

  return {
    // State
    config,
    parameterEnabled,
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
    updateParameterEnabled,
    updateMessages,
    clearMessages,
    newConversation,
    switchConversation,
    renameConversation,
    setHistoryCollapsed,
    resetConfig,
  }
}
