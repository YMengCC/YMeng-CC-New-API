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
import { useCallback, useState } from 'react'

import { usePlaygroundOptions } from '@/features/playground/hooks/use-playground-options'
import type {
  GroupOption,
  ModelOption,
  PlaygroundConfig,
} from '@/features/playground/types'

const GROUP_STORAGE_KEY = 'office:group'
const MODEL_STORAGE_KEY = 'office:model'

function readStored(key: string): string {
  return localStorage.getItem(key) ?? ''
}

function store(key: 'group' | 'model', value: string) {
  localStorage.setItem(
    key === 'group' ? GROUP_STORAGE_KEY : MODEL_STORAGE_KEY,
    value
  )
}

/**
 * The groups and models a turn can run with. They are loaded and kept valid
 * by the chat mode rules (models of the chosen group, a group the user may
 * use), so the turn is routed in a group its model is available in.
 */
export function useOfficeOptions() {
  const [group, setGroup] = useState(() => readStored(GROUP_STORAGE_KEY))
  const [model, setModel] = useState(() => readStored(MODEL_STORAGE_KEY))
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [models, setModels] = useState<ModelOption[]>([])

  const updateConfig = useCallback(
    <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]) => {
      if (typeof value !== 'string') return
      if (key === 'group') {
        setGroup(value)
        store('group', value)
      }
      if (key === 'model') {
        setModel(value)
        store('model', value)
      }
    },
    []
  )
  const chooseGroup = useCallback(
    (value: string) => updateConfig('group', value),
    [updateConfig]
  )
  const chooseModel = useCallback(
    (value: string) => updateConfig('model', value),
    [updateConfig]
  )

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: group,
    currentModel: model,
    setGroups,
    setModels,
    updateConfig,
  })

  return {
    group,
    groups,
    isLoadingModels,
    model,
    models,
    onGroupChange: chooseGroup,
    onModelChange: chooseModel,
  }
}
