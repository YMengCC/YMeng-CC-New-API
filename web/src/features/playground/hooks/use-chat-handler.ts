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
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'

import { sendChatCompletion } from '../api'
import { ERROR_MESSAGES } from '../constants'
import {
  applyMessageSources,
  applyStreamingChunk,
  buildChatCompletionPayload,
  updateAssistantMessageWithError,
  updateLastAssistantMessage,
  parseRequestErrorDetails,
  applyChatCompletionResponse,
  completeAssistantMessage,
  hasChatCompletionChoice,
  isAssistantMessageFinal,
  isAssistantMessagePending,
} from '../lib'
import type {
  ChatSendResult,
  Message,
  MessageSource,
  PlaygroundConfig,
} from '../types'
import { useStreamRequest } from './use-stream-request'

interface UseChatHandlerOptions {
  config: PlaygroundConfig
  onMessageUpdate: (updater: (prev: Message[]) => Message[]) => void
}

type PendingSend = {
  generation: number
  resolve: (result: ChatSendResult) => void
}

const KNOWN_ERROR_MESSAGES = new Set<string>(Object.values(ERROR_MESSAGES))
const STREAM_UPDATE_FLUSH_MS = 50

type PendingStreamChunks = {
  generation: number
  content: string
  reasoning: string
}

function mergePendingStreamChunk(
  currentChunk: string,
  nextChunk: string
): string {
  if (!currentChunk || !nextChunk.startsWith(currentChunk)) {
    return currentChunk + nextChunk
  }

  return nextChunk
}

/**
 * Hook for handling chat message sending and receiving
 */
export function useChatHandler({
  config,
  onMessageUpdate,
}: UseChatHandlerOptions) {
  const { t } = useTranslation()
  const { sendStreamRequest, stopStream, isStreaming } = useStreamRequest()
  const [isRequesting, setIsRequesting] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestGenerationRef = useRef(0)
  const pendingStreamChunksRef = useRef<PendingStreamChunks>({
    generation: 0,
    content: '',
    reasoning: '',
  })
  const streamFlushTimerRef = useRef<number | null>(null)
  const pendingSendRef = useRef<PendingSend | null>(null)

  // Resolve the caller's promise for a request exactly once.
  const settleSend = useCallback(
    (generation: number, result: ChatSendResult) => {
      const pending = pendingSendRef.current
      if (!pending || pending.generation !== generation) return
      pendingSendRef.current = null
      pending.resolve(result)
    },
    []
  )

  const beginSend = useCallback(
    (generation: number): Promise<ChatSendResult> => {
      const previous = pendingSendRef.current
      pendingSendRef.current = null
      previous?.resolve('cancelled')
      return new Promise<ChatSendResult>((resolve) => {
        pendingSendRef.current = { generation, resolve }
      })
    },
    []
  )

  const discardPendingStreamUpdates = useCallback((generation: number) => {
    if (streamFlushTimerRef.current !== null) {
      window.clearTimeout(streamFlushTimerRef.current)
      streamFlushTimerRef.current = null
    }
    pendingStreamChunksRef.current = {
      generation,
      content: '',
      reasoning: '',
    }
  }, [])

  const flushStreamUpdates = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
        streamFlushTimerRef.current = null
      }

      const pendingChunks = pendingStreamChunksRef.current
      if (pendingChunks.generation !== generation) return
      if (!pendingChunks.reasoning && !pendingChunks.content) {
        return
      }

      pendingStreamChunksRef.current = {
        generation,
        content: '',
        reasoning: '',
      }
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) => {
          let updatedMessage = message

          if (pendingChunks.reasoning) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'reasoning',
              pendingChunks.reasoning
            )
          }

          if (pendingChunks.content) {
            updatedMessage = applyStreamingChunk(
              updatedMessage,
              'content',
              pendingChunks.content
            )
          }

          return updatedMessage
        })
      })
    },
    [onMessageUpdate]
  )

  const scheduleStreamFlush = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      if (streamFlushTimerRef.current !== null) {
        return
      }

      streamFlushTimerRef.current = window.setTimeout(() => {
        flushStreamUpdates(generation)
      }, STREAM_UPDATE_FLUSH_MS)
    },
    [flushStreamUpdates]
  )

  useEffect(
    () => () => {
      requestGenerationRef.current += 1
      if (streamFlushTimerRef.current !== null) {
        window.clearTimeout(streamFlushTimerRef.current)
      }
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      const pending = pendingSendRef.current
      pendingSendRef.current = null
      pending?.resolve('cancelled')
    },
    []
  )

  const getDisplayError = useCallback(
    (error: string) => {
      if (KNOWN_ERROR_MESSAGES.has(error)) {
        return t(error)
      }

      const connectionClosedSuffix = `: ${ERROR_MESSAGES.CONNECTION_CLOSED}`
      if (error.endsWith(connectionClosedSuffix)) {
        return `${error.slice(0, -ERROR_MESSAGES.CONNECTION_CLOSED.length)}${t(
          ERROR_MESSAGES.CONNECTION_CLOSED
        )}`
      }

      return error
    },
    [t]
  )

  // Handle stream update
  const handleStreamUpdate = useCallback(
    (generation: number, type: 'reasoning' | 'content', chunk: string) => {
      if (generation !== requestGenerationRef.current) return
      if (pendingStreamChunksRef.current.generation !== generation) return
      pendingStreamChunksRef.current[type] = mergePendingStreamChunk(
        pendingStreamChunksRef.current[type],
        chunk
      )
      scheduleStreamFlush(generation)
    },
    [scheduleStreamFlush]
  )

  // Citations are only shown when the upstream actually returned them.
  const handleStreamSources = useCallback(
    (generation: number, sources: MessageSource[]) => {
      if (generation !== requestGenerationRef.current) return
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) =>
          applyMessageSources(message, sources)
        )
      })
    },
    [onMessageUpdate]
  )

  // Handle stream complete
  const handleStreamComplete = useCallback(
    (generation: number) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateLastAssistantMessage(prev, (message) =>
          isAssistantMessageFinal(message)
            ? message
            : completeAssistantMessage(message)
        )
      })
    },
    [flushStreamUpdates, onMessageUpdate]
  )

  // Handle stream error
  const handleStreamError = useCallback(
    (generation: number, error: string, errorCode?: string) => {
      if (generation !== requestGenerationRef.current) return
      flushStreamUpdates(generation)
      setIsRequesting(false)
      const displayError = getDisplayError(error)
      handleServerError(new Error(displayError))
      const errorTitle = t(ERROR_MESSAGES.API_REQUEST_ERROR)
      onMessageUpdate((prev) => {
        if (generation !== requestGenerationRef.current) return prev
        return updateAssistantMessageWithError(
          prev,
          displayError,
          errorCode,
          errorTitle
        )
      })
    },
    [flushStreamUpdates, getDisplayError, onMessageUpdate, t]
  )

  // Send streaming chat request
  const sendStreamingChat = useCallback(
    (messages: Message[], fileIds?: string[]): Promise<ChatSendResult> => {
      const generation = requestGenerationRef.current + 1
      requestGenerationRef.current = generation
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      discardPendingStreamUpdates(generation)
      const result = beginSend(generation)
      setIsRequesting(true)
      const payload = buildChatCompletionPayload(messages, config, fileIds)
      void sendStreamRequest(payload, {
        onUpdate: (type, chunk) => handleStreamUpdate(generation, type, chunk),
        onSources: (sources) => handleStreamSources(generation, sources),
        onAccepted: () => settleSend(generation, 'accepted'),
        onComplete: () => {
          settleSend(generation, 'accepted')
          handleStreamComplete(generation)
        },
        onError: (error, errorCode) => {
          settleSend(generation, 'failed')
          handleStreamError(generation, error, errorCode)
        },
      })
      return result
    },
    [
      config,
      sendStreamRequest,
      discardPendingStreamUpdates,
      beginSend,
      settleSend,
      handleStreamUpdate,
      handleStreamSources,
      handleStreamComplete,
      handleStreamError,
    ]
  )

  // Send non-streaming chat request
  const sendNonStreamingChat = useCallback(
    (messages: Message[], fileIds?: string[]): Promise<ChatSendResult> => {
      const payload = buildChatCompletionPayload(messages, config, fileIds)
      const generation = requestGenerationRef.current + 1
      const abortController = new AbortController()

      requestGenerationRef.current = generation
      stopStream()
      discardPendingStreamUpdates(generation)
      abortControllerRef.current?.abort()
      abortControllerRef.current = abortController
      const result = beginSend(generation)
      setIsRequesting(true)

      const request = async () => {
        try {
          const response = await sendChatCompletion(
            payload,
            abortController.signal
          )
          if (
            abortController.signal.aborted ||
            requestGenerationRef.current !== generation
          ) {
            return
          }
          settleSend(generation, 'accepted')

          if (!hasChatCompletionChoice(response)) {
            handleStreamError(generation, ERROR_MESSAGES.API_REQUEST_ERROR)
            return
          }

          onMessageUpdate((prev) => {
            if (requestGenerationRef.current !== generation) return prev
            return updateLastAssistantMessage(prev, (message) => {
              const updatedMessage = applyChatCompletionResponse(
                message,
                response
              )

              return updatedMessage ?? message
            })
          })
        } catch (error: unknown) {
          if (
            abortController.signal.aborted ||
            requestGenerationRef.current !== generation
          ) {
            return
          }

          settleSend(generation, 'failed')
          const { errorCode, errorMessage } = parseRequestErrorDetails(error)
          handleStreamError(generation, errorMessage, errorCode)
        } finally {
          if (requestGenerationRef.current === generation) {
            abortControllerRef.current = null
            setIsRequesting(false)
          }
        }
      }
      void request()

      return result
    },
    [
      config,
      stopStream,
      discardPendingStreamUpdates,
      beginSend,
      settleSend,
      onMessageUpdate,
      handleStreamError,
    ]
  )

  /**
   * Send a chat request (stream or non-stream based on config). `fileIds`
   * attach temporary uploads to the last user message. The promise resolves
   * once the server accepted the request, it failed, or it was cancelled.
   */
  const sendChat = useCallback(
    (messages: Message[], fileIds?: string[]): Promise<ChatSendResult> =>
      config.stream
        ? sendStreamingChat(messages, fileIds)
        : sendNonStreamingChat(messages, fileIds),
    [config.stream, sendStreamingChat, sendNonStreamingChat]
  )

  // Stop generation
  const stopGeneration = useCallback(() => {
    const stoppedGeneration = requestGenerationRef.current
    flushStreamUpdates(stoppedGeneration)
    settleSend(stoppedGeneration, 'cancelled')
    const idleGeneration = stoppedGeneration + 1
    requestGenerationRef.current = idleGeneration
    discardPendingStreamUpdates(idleGeneration)
    stopStream()
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsRequesting(false)
    onMessageUpdate((prev) => {
      if (requestGenerationRef.current !== idleGeneration) return prev
      return updateLastAssistantMessage(prev, (message) =>
        isAssistantMessagePending(message)
          ? completeAssistantMessage(message)
          : message
      )
    })
  }, [
    stopStream,
    flushStreamUpdates,
    settleSend,
    discardPendingStreamUpdates,
    onMessageUpdate,
  ])

  return {
    sendChat,
    stopGeneration,
    isGenerating: isStreaming || isRequesting,
  }
}
