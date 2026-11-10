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
import { beforeEach, expect, test, vi } from 'vitest'

import { fetchVideoTask, submitVideoGeneration } from '../api'

const post = vi.hoisted(() => vi.fn())
const get = vi.hoisted(() => vi.fn())
const getTaskArtifacts = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api: { post, get } }))
vi.mock('@/features/usage-logs/api', () => ({ getTaskArtifacts }))

beforeEach(() => {
  vi.resetAllMocks()
})

test('an OpenAI video submission id is normalized into a pollable task id', async () => {
  post.mockResolvedValue({
    data: { id: 'video-123', object: 'video', status: 'queued' },
  })
  expect(
    await submitVideoGeneration({ model: 'sora-2', prompt: 'a wave' })
  ).toEqual({
    task_id: 'video-123',
    status: 'queued',
  })
})

test('a legacy task envelope is normalized with its URL and status', async () => {
  get.mockResolvedValue({
    data: {
      code: 'success',
      data: {
        task_id: 'task-123',
        status: 'SUCCESS',
        result_url: 'https://example.com/wave.mp4',
      },
    },
  })
  expect(await fetchVideoTask('task-123')).toEqual({
    task_id: 'task-123',
    status: 'success',
    url: 'https://example.com/wave.mp4',
  })
  expect(getTaskArtifacts).not.toHaveBeenCalled()
})

test('OpenAI video result_urls are displayed without an extra artifact request', async () => {
  get.mockResolvedValue({
    data: {
      id: 'video-123',
      status: 'completed',
      result_urls: ['https://example.com/wave.mp4'],
    },
  })
  expect((await fetchVideoTask('video-123')).url).toBe(
    'https://example.com/wave.mp4'
  )
  expect(getTaskArtifacts).not.toHaveBeenCalled()
})

test('a completed video without URLs resolves a signed content URL through the artifact API', async () => {
  get.mockResolvedValue({ data: { id: 'video-123', status: 'completed' } })
  const signed =
    'https://example.com/v1/tasks/video-123/artifacts/video/content?access=signed'
  getTaskArtifacts.mockResolvedValue({
    artifacts: [{ type: 'video', content_url: signed }],
  })
  expect((await fetchVideoTask('video-123')).url).toBe(signed)
  expect(getTaskArtifacts).toHaveBeenCalledWith('video-123')
})

test('a bearer-protected native video content URL is resolved through the signed artifact API', async () => {
  get.mockResolvedValue({
    data: {
      id: 'video-123',
      status: 'completed',
      result_urls: ['https://example.com/v1/videos/video-123/content'],
    },
  })
  const signed =
    'https://example.com/v1/tasks/video-123/artifacts/video/content?access=signed'
  getTaskArtifacts.mockResolvedValue({
    artifacts: [],
    legacyContentUrl: signed,
  })
  expect((await fetchVideoTask('video-123')).url).toBe(signed)
})

test('a video failure preserves the OpenAI string error code', async () => {
  get.mockResolvedValue({
    data: {
      id: 'video-123',
      status: 'failed',
      error: {
        code: 'moderation_blocked',
        message: 'Rejected by provider',
      },
    },
  })
  expect((await fetchVideoTask('video-123')).error).toEqual({
    code: 'moderation_blocked',
    message: 'Rejected by provider',
  })
})

test('an aborted completed-video request never requests signed artifact access', async () => {
  const controller = new AbortController()
  controller.abort()
  get.mockResolvedValue({ data: { id: 'video-123', status: 'completed' } })
  await expect(fetchVideoTask('video-123', controller.signal)).rejects.toThrow()
  expect(getTaskArtifacts).not.toHaveBeenCalled()
})

test('missing video identifiers are rejected instead of starting an invalid poll', async () => {
  post.mockResolvedValue({ data: { status: 'queued' } })
  await expect(
    submitVideoGeneration({ model: 'sora-2', prompt: 'a wave' })
  ).rejects.toThrow('Video task id is missing')
})
