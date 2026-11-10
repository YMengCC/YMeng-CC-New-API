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
import { MAX_IMAGE_N, MAX_VIDEO_DURATION_SECONDS } from '../../constants'
import type {
  ChatCompletionRequest,
  ImageGenerationOptions,
  ImageGenerationRequest,
  Message,
  PlaygroundConfig,
  ParameterEnabled,
  VideoGenerationOptions,
  VideoGenerationRequest,
} from '../../types'
import { formatMessageForAPI, isValidMessage } from '../message/message-utils'

const RESOLUTION_DIMENSIONS: Record<string, { width: number; height: number }> =
  {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
  }

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.round(value), min), max)
}

/**
 * Image generation payload. `n` is bounded to the backend billing limit.
 */
export function buildImageGenerationPayload(
  prompt: string,
  config: PlaygroundConfig,
  options: ImageGenerationOptions,
  image?: string
): ImageGenerationRequest {
  return {
    model: config.model,
    group: config.group,
    prompt: prompt.trim(),
    n: clamp(options.n, 1, MAX_IMAGE_N),
    size: options.size,
    ...(image?.trim() ? { image: image.trim() } : {}),
    response_format: 'url',
  }
}

/**
 * Video generation payload. `duration` is bounded to the backend billing limit.
 */
export function buildVideoGenerationPayload(
  prompt: string,
  config: PlaygroundConfig,
  options: VideoGenerationOptions
): VideoGenerationRequest {
  const dimensions = RESOLUTION_DIMENSIONS[options.resolution]

  return {
    model: config.model,
    group: config.group,
    prompt: prompt.trim(),
    duration: clamp(options.duration, 1, MAX_VIDEO_DURATION_SECONDS),
    ...dimensions,
    ...(options.image?.trim() ? { image: options.image.trim() } : {}),
    response_format: 'url',
  }
}

/**
 * Build API request payload from messages and config
 */
export function buildChatCompletionPayload(
  messages: Message[],
  config: PlaygroundConfig,
  parameterEnabled: ParameterEnabled
): ChatCompletionRequest {
  // Filter and format valid messages
  const processedMessages = messages
    .filter(isValidMessage)
    .map(formatMessageForAPI)

  const payload: ChatCompletionRequest = {
    model: config.model,
    group: config.group,
    messages: processedMessages,
    stream: config.stream,
  }

  if (parameterEnabled.temperature) {
    payload.temperature = config.temperature
  }

  if (parameterEnabled.top_p) {
    payload.top_p = config.top_p
  }

  if (parameterEnabled.max_tokens) {
    payload.max_tokens = config.max_tokens
  }

  if (parameterEnabled.frequency_penalty) {
    payload.frequency_penalty = config.frequency_penalty
  }

  if (parameterEnabled.presence_penalty) {
    payload.presence_penalty = config.presence_penalty
  }

  if (parameterEnabled.seed && config.seed !== null) {
    payload.seed = config.seed
  }

  return payload
}
