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
// Message types
export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'loading' | 'streaming' | 'complete' | 'error'

export type PlaygroundMessageLayoutMode = 'alternating' | 'left'

export interface MessageVersion {
  id: string
  content: string
}

export type PlaygroundModelMode = 'chat' | 'image' | 'video'
export type MediaType = 'image' | 'video'
export type MediaStatus = 'pending' | 'succeeded' | 'failed'

// Only URLs are persisted. Never store base64 payloads in conversation history.
export interface GeneratedMedia {
  type: MediaType
  url?: string
  prompt: string
  status: MediaStatus
  taskId?: string
  error?: string
  width?: number
  height?: number
  duration?: number
}

export interface Message {
  key: string
  from: MessageRole
  versions: MessageVersion[]
  createdAt?: number
  startedAt?: number
  completedAt?: number
  durationMs?: number
  media?: GeneratedMedia[]
  // Dropped/pasted images as data URLs. Session-only: never persisted.
  images?: string[]
  sources?: { href: string; title: string }[]
  reasoning?: {
    content: string
    duration: number
    startedAt?: number
    completedAt?: number
    durationMs?: number
  }
  isReasoningStreaming?: boolean
  isReasoningComplete?: boolean
  isContentComplete?: boolean
  status?: MessageStatus
  errorCode?: string | null
}

// Conversation history types
export interface PlaygroundConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
}

export interface PlaygroundHistory {
  activeId: string
  conversations: PlaygroundConversation[]
}

// API payload types
export interface ChatCompletionMessage {
  role: MessageRole
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
}

export interface ChatCompletionRequest {
  model: string
  group?: string
  messages: ChatCompletionMessage[]
  stream: boolean
  temperature?: number
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
}

export interface ChatCompletionChunk {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    delta: {
      role?: MessageRole
      content?: string
      reasoning_content?: string | null
      reasoning?: string | null
    }
    finish_reason: string | null
  }>
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: MessageRole
      content: string
      reasoning_content?: string | null
      reasoning?: string | null
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Media generation payloads (aligned with the /pg image & video endpoints)
export interface ImageGenerationRequest {
  model: string
  prompt: string
  group?: string
  n?: number
  size?: string
  // Optional reference image (data URL). Upstream support varies by model.
  image?: string
  response_format?: 'url'
}

export interface GeneratedImagePayload {
  url?: string
  b64_json?: string
  revised_prompt?: string
}

export interface ImageGenerationResponse {
  created?: number
  data?: GeneratedImagePayload | GeneratedImagePayload[]
}

export interface VideoGenerationRequest {
  model: string
  prompt: string
  group?: string
  duration?: number
  width?: number
  height?: number
  image?: string
  response_format?: 'url'
}

export interface VideoTaskResponse {
  task_id: string
  status: string
  url?: string
  format?: string
  error?: { code?: string | number; message?: string }
}

// Generation options collected by the composer
export interface ImageGenerationOptions {
  size: string
  n: number
}

export interface VideoGenerationOptions {
  duration: number
  resolution: string
  image?: string
}

// Configuration types
export interface PlaygroundConfig {
  model: string
  group: string
  temperature: number
  top_p: number
  max_tokens: number
  frequency_penalty: number
  presence_penalty: number
  seed: number | null
  stream: boolean
}

export interface ParameterEnabled {
  temperature: boolean
  top_p: boolean
  max_tokens: boolean
  frequency_penalty: boolean
  presence_penalty: boolean
  seed: boolean
}

// Model and group options
export interface ModelOption {
  label: string
  value: string
  mode?: PlaygroundModelMode
}

export interface GroupOption {
  label: string
  value: string
  ratio: number | string
  desc?: string
}
