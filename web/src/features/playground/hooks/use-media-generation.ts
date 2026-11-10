import { nanoid } from 'nanoid'
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

import {
  fetchVideoTask,
  sendImageGeneration,
  submitVideoGeneration,
} from '../api'
import {
  MESSAGE_STATUS,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_MAX_ATTEMPTS,
} from '../constants'
import { createUserMessage } from '../lib/message/message-utils'
import {
  buildImageGenerationPayload,
  buildVideoGenerationPayload,
} from '../lib/streaming/payload-builder'
import type {
  GeneratedMedia,
  ImageGenerationOptions,
  Message,
  PlaygroundConfig,
  VideoGenerationOptions,
} from '../types'

type UpdateMessages = (
  updater: Message[] | ((previous: Message[]) => Message[])
) => void

type UseMediaGenerationOptions = {
  config: PlaygroundConfig
  updateMessages: UpdateMessages
}

function createPendingAssistant(media: GeneratedMedia): Message {
  return {
    key: nanoid(),
    from: 'assistant',
    versions: [{ id: nanoid(), content: '' }],
    createdAt: Date.now(),
    status: MESSAGE_STATUS.LOADING,
    media: [media],
  }
}

function updateMedia(
  messages: Message[],
  key: string,
  media: GeneratedMedia[]
): Message[] {
  return messages.map((message) =>
    message.key === key ? { ...message, media } : message
  )
}

function finishMessage(messages: Message[], key: string): Message[] {
  return messages.map((message) =>
    message.key === key
      ? { ...message, status: MESSAGE_STATUS.COMPLETE, completedAt: Date.now() }
      : message
  )
}

function failMessage(
  messages: Message[],
  key: string,
  error: string
): Message[] {
  return messages.map((message) =>
    message.key === key
      ? {
          ...message,
          status: MESSAGE_STATUS.ERROR,
          errorCode: error,
          completedAt: Date.now(),
          media: (message.media ?? []).map((item) => ({
            ...item,
            status: 'failed' as const,
            error,
          })),
        }
      : message
  )
}

function extractImageUrls(
  data?: Array<{ url?: string; b64_json?: string }>
): string[] {
  return (data ?? [])
    .map((item) => {
      if (item.url) return item.url
      // base64 is deliberately not persisted; keep it only for this session.
      return item.b64_json ? `data:image/png;base64,${item.b64_json}` : null
    })
    .filter((url): url is string => Boolean(url))
}

function isVideoDone(status: string): boolean {
  const normalized = status.toLowerCase()
  return (
    normalized === 'succeeded' ||
    normalized === 'success' ||
    normalized === 'completed' ||
    normalized === 'done'
  )
}

function isVideoFailed(status: string): boolean {
  const normalized = status.toLowerCase()
  return (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'cancelled'
  )
}

export function useMediaGeneration({
  config,
  updateMessages,
}: UseMediaGenerationOptions) {
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const activeMessageKeyRef = useRef<string | null>(null)

  const stopGeneration = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    const activeKey = activeMessageKeyRef.current
    activeMessageKeyRef.current = null
    if (activeKey) {
      updateMessages((previous) =>
        failMessage(previous, activeKey, 'Generation was interrupted')
      )
    }
    setIsGenerating(false)
  }, [updateMessages])

  useEffect(
    () => () => {
      generationRef.current += 1
      abortRef.current?.abort()
    },
    []
  )

  const appendGeneration = useCallback(
    (prompt: string, type: 'image' | 'video') => {
      const media: GeneratedMedia = {
        type,
        prompt,
        status: 'pending',
      }
      const assistant = createPendingAssistant(media)
      updateMessages((previous) => [
        ...previous,
        createUserMessage(prompt),
        assistant,
      ])
      return assistant.key
    },
    [updateMessages]
  )

  const generateImage = useCallback(
    async (prompt: string, options: ImageGenerationOptions, image?: string) => {
      const generation = generationRef.current + 1
      generationRef.current = generation
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setIsGenerating(true)
      const key = appendGeneration(prompt, 'image')
      activeMessageKeyRef.current = key

      try {
        const response = await sendImageGeneration(
          buildImageGenerationPayload(prompt, config, options, image),
          controller.signal
        )
        if (generation !== generationRef.current) return
        let imageData = response.data ?? []
        if (!Array.isArray(imageData)) imageData = [imageData]
        const urls = extractImageUrls(imageData)
        if (urls.length === 0) {
          updateMessages((previous) =>
            failMessage(previous, key, 'No image was returned')
          )
          return
        }

        updateMessages((previous) =>
          finishMessage(
            updateMedia(
              previous,
              key,
              urls.map((url) => ({
                type: 'image' as const,
                prompt,
                url,
                status: 'succeeded' as const,
              }))
            ),
            key
          )
        )
      } catch (error) {
        if (generation !== generationRef.current) return
        const message =
          error instanceof Error ? error.message : 'Image generation failed'
        updateMessages((previous) => failMessage(previous, key, message))
      } finally {
        if (generation === generationRef.current) {
          abortRef.current = null
          activeMessageKeyRef.current = null
          setIsGenerating(false)
        }
      }
    },
    [appendGeneration, config, updateMessages]
  )

  const generateVideo = useCallback(
    async (prompt: string, options: VideoGenerationOptions) => {
      const generation = generationRef.current + 1
      generationRef.current = generation
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setIsGenerating(true)
      const key = appendGeneration(prompt, 'video')
      activeMessageKeyRef.current = key

      const fail = (error: string) => {
        updateMessages((previous) => failMessage(previous, key, error))
      }

      try {
        const submitted = await submitVideoGeneration(
          buildVideoGenerationPayload(prompt, config, options),
          controller.signal
        )
        const taskId = submitted.task_id
        if (generation !== generationRef.current) return
        if (!taskId) {
          fail('Video task id is missing')
          return
        }
        updateMessages((previous) =>
          updateMedia(previous, key, [
            {
              type: 'video',
              prompt,
              status: 'pending',
              taskId,
            },
          ])
        )

        for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt++) {
          if (generation !== generationRef.current) return
          await new Promise<void>((resolve) => {
            const finish = () => {
              window.clearTimeout(timer)
              controller.signal.removeEventListener('abort', finish)
              resolve()
            }
            const timer = window.setTimeout(finish, VIDEO_POLL_INTERVAL_MS)
            controller.signal.addEventListener('abort', finish, { once: true })
          })
          if (generation !== generationRef.current) return

          const task = await fetchVideoTask(taskId, controller.signal)
          if (generation !== generationRef.current) return

          if (isVideoDone(task.status) && task.url) {
            updateMessages((previous) =>
              finishMessage(
                updateMedia(previous, key, [
                  {
                    type: 'video',
                    prompt,
                    url: task.url,
                    status: 'succeeded',
                    taskId,
                    duration: options.duration,
                  },
                ]),
                key
              )
            )
            return
          }
          if (isVideoFailed(task.status)) {
            fail(task.error?.message ?? 'Video generation failed')
            return
          }
        }

        fail('Video generation timed out')
      } catch (error) {
        if (generation !== generationRef.current) return
        const message =
          error instanceof Error ? error.message : 'Video generation failed'
        fail(message)
      } finally {
        if (generation === generationRef.current) {
          abortRef.current = null
          activeMessageKeyRef.current = null
          setIsGenerating(false)
        }
      }
    },
    [appendGeneration, config, updateMessages]
  )

  return { generateImage, generateVideo, stopGeneration, isGenerating }
}
