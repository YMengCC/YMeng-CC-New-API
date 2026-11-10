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

import type { PricingModel } from '@/features/pricing/types'

import {
  applyModelCapabilities,
  buildCapabilityMap,
  getModelMode,
} from '../model-capabilities'

function pricingModel(
  modelName: string,
  supportedEndpointTypes?: string[]
): PricingModel {
  return {
    id: 1,
    model_name: modelName,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    supported_endpoint_types: supportedEndpointTypes,
  }
}

test('an image-generation endpoint classifies the model as image', () => {
  expect(getModelMode(['openai', 'image-generation'])).toBe('image')
})

test('an openai-video endpoint classifies the model as video', () => {
  expect(getModelMode(['openai', 'openai-video'])).toBe('video')
})

test('video takes precedence when both endpoints are listed', () => {
  expect(getModelMode(['image-generation', 'openai-video'])).toBe('video')
})

test('a missing or chat-only endpoint list classifies the model as chat', () => {
  expect(getModelMode(undefined)).toBe('chat')
  expect(getModelMode([])).toBe('chat')
  expect(getModelMode(['openai', 'anthropic'])).toBe('chat')
})

test('the capability map is keyed by model name', () => {
  const capabilities = buildCapabilityMap([
    pricingModel('flux-1', ['image-generation']),
    pricingModel('sora-2', ['openai-video']),
    pricingModel('gpt-4o', ['openai']),
  ])

  expect(capabilities.get('flux-1')).toBe('image')
  expect(capabilities.get('sora-2')).toBe('video')
  expect(capabilities.get('gpt-4o')).toBe('chat')
})

test('capabilities are merged into the user-visible model list', () => {
  const capabilities = buildCapabilityMap([
    pricingModel('flux-1', ['image-generation']),
    pricingModel('sora-2', ['openai-video']),
  ])

  expect(
    applyModelCapabilities(
      [
        { label: 'flux-1', value: 'flux-1' },
        { label: 'sora-2', value: 'sora-2' },
        { label: 'unknown', value: 'unknown' },
      ],
      capabilities
    )
  ).toEqual([
    { label: 'flux-1', value: 'flux-1', mode: 'image' },
    { label: 'sora-2', value: 'sora-2', mode: 'video' },
    { label: 'unknown', value: 'unknown', mode: 'chat' },
  ])
})

test('unavailable pricing degrades every model to chat instead of hiding them', () => {
  expect(
    applyModelCapabilities(
      [
        { label: 'flux-1', value: 'flux-1' },
        { label: 'gpt-4o', value: 'gpt-4o' },
      ],
      null
    )
  ).toEqual([
    { label: 'flux-1', value: 'flux-1', mode: 'chat' },
    { label: 'gpt-4o', value: 'gpt-4o', mode: 'chat' },
  ])
})
