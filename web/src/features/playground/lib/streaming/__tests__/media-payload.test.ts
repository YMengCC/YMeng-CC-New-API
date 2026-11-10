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
import { expect, test } from 'vitest'

import { DEFAULT_CONFIG } from '../../../constants'
import {
  buildImageGenerationPayload,
  buildVideoGenerationPayload,
} from '../payload-builder'

test('an image payload carries the bounded count and size but no chat messages', () => {
  const payload = buildImageGenerationPayload('  a cat  ', DEFAULT_CONFIG, {
    size: '1024x1536',
    n: 3,
  })

  expect(payload).toEqual({
    model: DEFAULT_CONFIG.model,
    group: DEFAULT_CONFIG.group,
    prompt: 'a cat',
    n: 3,
    size: '1024x1536',
    response_format: 'url',
  })
  expect('messages' in payload).toBe(false)
})

test('an image count above the backend billing bound is clamped', () => {
  const payload = buildImageGenerationPayload('a cat', DEFAULT_CONFIG, {
    size: 'auto',
    n: 100000,
  })
  expect(payload.n).toBe(128)
})

test('a zero or invalid image count falls back to one', () => {
  expect(
    buildImageGenerationPayload('a cat', DEFAULT_CONFIG, {
      size: 'auto',
      n: 0,
    }).n
  ).toBe(1)
  expect(
    buildImageGenerationPayload('a cat', DEFAULT_CONFIG, {
      size: 'auto',
      n: Number.NaN,
    }).n
  ).toBe(1)
})

test('a video payload maps a resolution to width and height', () => {
  const payload = buildVideoGenerationPayload('a wave', DEFAULT_CONFIG, {
    duration: 8,
    resolution: '1080p',
  })

  expect(payload).toMatchObject({
    model: DEFAULT_CONFIG.model,
    prompt: 'a wave',
    duration: 8,
    width: 1920,
    height: 1080,
    response_format: 'url',
  })
  expect('messages' in payload).toBe(false)
})

test('a video duration above the backend billing bound is clamped', () => {
  const payload = buildVideoGenerationPayload('a wave', DEFAULT_CONFIG, {
    duration: 999999,
    resolution: '720p',
  })
  expect(payload.duration).toBe(3600)
})

test('an empty first-frame image URL is omitted', () => {
  const payload = buildVideoGenerationPayload('a wave', DEFAULT_CONFIG, {
    duration: 5,
    resolution: '720p',
    image: '   ',
  })
  expect(payload.image).toBeUndefined()
})

test('a provided first-frame image URL is trimmed and included', () => {
  const payload = buildVideoGenerationPayload('a wave', DEFAULT_CONFIG, {
    duration: 5,
    resolution: '720p',
    image: '  https://example.com/frame.png  ',
  })
  expect(payload.image).toBe('https://example.com/frame.png')
})

test('a dropped reference image is included in an image generation payload', () => {
  const payload = buildImageGenerationPayload(
    'a cat',
    DEFAULT_CONFIG,
    { size: 'auto', n: 1 },
    'data:image/png;base64,AAAA'
  )
  expect(payload.image).toBe('data:image/png;base64,AAAA')
})

test('a blank reference image is omitted', () => {
  const payload = buildImageGenerationPayload(
    'a cat',
    DEFAULT_CONFIG,
    { size: 'auto', n: 1 },
    '   '
  )
  expect(payload.image).toBeUndefined()
})
