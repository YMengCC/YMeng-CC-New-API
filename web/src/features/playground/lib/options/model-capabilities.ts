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
import type { PricingModel } from '@/features/pricing/types'

import type { ModelOption, PlaygroundModelMode } from '../../types'

export const IMAGE_ENDPOINT_TYPE = 'image-generation'
export const VIDEO_ENDPOINT_TYPE = 'openai-video'

export function getModelMode(
  supportedEndpointTypes?: string[]
): PlaygroundModelMode {
  if (!supportedEndpointTypes) return 'chat'
  if (supportedEndpointTypes.includes(VIDEO_ENDPOINT_TYPE)) return 'video'
  if (supportedEndpointTypes.includes(IMAGE_ENDPOINT_TYPE)) return 'image'
  return 'chat'
}

export function buildCapabilityMap(
  pricingModels: PricingModel[]
): Map<string, PlaygroundModelMode> {
  const capabilities = new Map<string, PlaygroundModelMode>()
  for (const model of pricingModels) {
    capabilities.set(
      model.model_name,
      getModelMode(model.supported_endpoint_types)
    )
  }
  return capabilities
}

// When /api/pricing is unavailable (module disabled, 403, network error),
// every model stays in chat mode so the playground remains usable.
export function applyModelCapabilities(
  models: ModelOption[],
  capabilities: Map<string, PlaygroundModelMode> | null
): ModelOption[] {
  if (!capabilities) {
    return models.map((model) => ({ ...model, mode: 'chat' as const }))
  }

  return models.map((model) => ({
    ...model,
    mode: capabilities.get(model.value) ?? ('chat' as const),
  }))
}
