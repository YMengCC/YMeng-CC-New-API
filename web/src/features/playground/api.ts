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
import { getPricing } from '@/features/pricing/api'
import { getTaskArtifacts } from '@/features/usage-logs/api'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { API_ENDPOINTS } from './constants'
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ModelOption,
  GroupOption,
  VideoGenerationRequest,
  VideoTaskResponse,
} from './types'

/**
 * Send chat completion request (non-streaming)
 */
export async function sendChatCompletion(
  payload: ChatCompletionRequest,
  signal?: AbortSignal
): Promise<ChatCompletionResponse> {
  const res = await api.post(API_ENDPOINTS.CHAT_COMPLETIONS, payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

/**
 * Get user available models
 */
export async function getUserModels(group: string): Promise<ModelOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_MODELS, {
    params: { group },
  })
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !Array.isArray(data.data)) {
    return []
  }

  return data.data.map((model: string) => ({
    label: model,
    value: model,
  }))
}

/**
 * Fetch model pricing metadata to derive playground model capabilities.
 * Returns null when pricing is unavailable so callers can degrade gracefully.
 */
export async function getPricingModels() {
  try {
    const data = await getPricing()
    requireServerSuccess(data)
    return data.data ?? []
  } catch {
    return null
  }
}

/**
 * Generate images through the session-authenticated playground route.
 */
export async function sendImageGeneration(
  payload: ImageGenerationRequest,
  signal?: AbortSignal
): Promise<ImageGenerationResponse> {
  const res = await api.post(API_ENDPOINTS.IMAGE_GENERATIONS, payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return res.data
}

function normalizeVideoTask(value: unknown): VideoTaskResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Error parsing response data')
  }
  const envelope = value as Record<string, unknown>
  requireServerSuccess(envelope)
  if (envelope.code && envelope.code !== 'success' && !envelope.status) {
    throw new Error(
      typeof envelope.message === 'string'
        ? envelope.message
        : 'Video generation failed'
    )
  }
  const data =
    envelope.data &&
    typeof envelope.data === 'object' &&
    !Array.isArray(envelope.data)
      ? (envelope.data as Record<string, unknown>)
      : envelope
  const taskId = typeof data.task_id === 'string' ? data.task_id : data.id
  if (typeof taskId !== 'string' || !taskId.trim()) {
    throw new Error('Video task id is missing')
  }
  const status =
    typeof data.status === 'string' ? data.status.toLowerCase() : 'queued'
  const urls = Array.isArray(data.result_urls) ? data.result_urls : []
  const candidates = [data.url, data.result_url, ...urls]
  // Native content paths require bearer headers that img/video elements cannot
  // supply. Resolve those through the existing signed task-artifact API below.
  const url = candidates.find((candidate): candidate is string => {
    if (typeof candidate !== 'string' || !/^https?:\/\//i.test(candidate)) {
      return false
    }
    try {
      const parsed = new URL(candidate)
      return !/\/v1\/videos\/[^/]+\/content$/.test(parsed.pathname)
    } catch {
      return false
    }
  })
  let error: VideoTaskResponse['error']
  if (data.error && typeof data.error === 'object') {
    const details = data.error as Record<string, unknown>
    error = {
      ...(typeof details.message === 'string'
        ? { message: details.message }
        : {}),
      ...(typeof details.code === 'string' || typeof details.code === 'number'
        ? { code: details.code }
        : {}),
    }
  } else if (typeof data.fail_reason === 'string' && data.fail_reason) {
    error = { message: data.fail_reason }
  }
  return {
    task_id: taskId,
    status,
    ...(url ? { url } : {}),
    ...(error ? { error } : {}),
  }
}

/**
 * Submit a video generation task. The response carries a task id to poll.
 */
export async function submitVideoGeneration(
  payload: VideoGenerationRequest,
  signal?: AbortSignal
): Promise<VideoTaskResponse> {
  const res = await api.post(API_ENDPOINTS.VIDEO_GENERATIONS, payload, {
    signal,
    skipErrorHandler: true,
  } as Record<string, unknown>)
  return normalizeVideoTask(res.data)
}

/**
 * Fetch the current status of a video generation task.
 */
export async function fetchVideoTask(
  taskId: string,
  signal?: AbortSignal
): Promise<VideoTaskResponse> {
  const res = await api.get(
    `${API_ENDPOINTS.VIDEO_TASK}/${encodeURIComponent(taskId)}`,
    {
      signal,
      skipErrorHandler: true,
    } as Record<string, unknown>
  )
  const task = normalizeVideoTask(res.data)
  if (
    !task.url &&
    ['succeeded', 'success', 'completed', 'done'].includes(task.status)
  ) {
    signal?.throwIfAborted()
    const projection = await getTaskArtifacts(task.task_id)
    signal?.throwIfAborted()
    const video = projection.artifacts.find(
      (artifact) => artifact.type === 'video'
    )
    task.url = video?.content_url ?? projection.legacyContentUrl
    if (!task.url) throw new Error('No media was returned')
  }
  return task
}

/**
 * Get user groups
 */
export async function getUserGroups(): Promise<GroupOption[]> {
  const res = await api.get(API_ENDPOINTS.USER_GROUPS)
  const { data } = res
  requireServerSuccess(data)

  if (!data.success || !data.data) {
    return []
  }

  const groupData = data.data as Record<
    string,
    { desc: string; ratio: number | string }
  >

  // label is for button display (name only); desc is for dropdown content
  return Object.entries(groupData).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info.ratio,
    desc: info.desc,
  }))
}
