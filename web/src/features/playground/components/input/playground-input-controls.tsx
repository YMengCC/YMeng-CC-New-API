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
import { SendIcon, SquareIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PromptInputButton,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { ModelGroupSelector } from '@/components/model-group-selector'

import { getInputControlState } from '../../lib'
import type { GroupOption, ModelOption } from '../../types'

type PlaygroundInputControlsProps = {
  disabled?: boolean
  groups: GroupOption[]
  groupValue: string
  isGenerating?: boolean
  isModelLoading?: boolean
  models: ModelOption[]
  modelValue: string
  onGroupChange: (value: string) => void
  onModelChange: (value: string) => void
  onStop?: () => void
  text: string
  tools: ReactNode
}

export function PlaygroundInputControls({
  disabled,
  groups,
  groupValue,
  isGenerating,
  isModelLoading = false,
  models,
  modelValue,
  onGroupChange,
  onModelChange,
  onStop,
  text,
  tools,
}: PlaygroundInputControlsProps) {
  const { t } = useTranslation()
  const { files } = usePromptInputAttachments()
  const { canSubmit, isSelectorDisabled, shouldShowStop } =
    getInputControlState({
      disabled,
      groups,
      hasAttachments: files.length > 0,
      hasStopHandler: Boolean(onStop),
      isGenerating,
      isModelLoading,
      models,
      text,
    })

  const renderSelector = () => (
    <ModelGroupSelector
      selectedModel={modelValue}
      models={models}
      onModelChange={onModelChange}
      selectedGroup={groupValue}
      groups={groups}
      onGroupChange={onGroupChange}
      disabled={isSelectorDisabled}
    />
  )

  const renderSubmitButton = () =>
    shouldShowStop ? (
      <PromptInputButton
        aria-label={t('Stop')}
        className='size-10 justify-center p-0 font-medium sm:size-auto sm:min-w-20 sm:px-3'
        onClick={onStop}
        variant='destructive'
      >
        <SquareIcon
          aria-hidden='true'
          className='fill-current'
          data-icon='inline-start'
        />
        <span className='hidden sm:inline'>{t('Stop')}</span>
      </PromptInputButton>
    ) : (
      <PromptInputButton
        aria-label={t('Send')}
        className='size-10 justify-center p-0 font-medium disabled:opacity-50 sm:size-auto sm:min-w-20 sm:px-3'
        disabled={!canSubmit}
        type='submit'
        variant='default'
      >
        <SendIcon aria-hidden='true' data-icon='inline-start' />
        <span className='hidden sm:inline'>{t('Send')}</span>
      </PromptInputButton>
    )

  return (
    <div className='flex w-full flex-nowrap items-center gap-1.5 md:gap-2'>
      <div className='flex min-w-0 flex-1 items-center'>
        <div className='max-w-full min-w-0 overflow-x-auto md:overflow-visible'>
          {tools}
        </div>
      </div>

      <div className='shrink-0 [&_button]:max-w-[6.5rem] [&_button]:px-2 md:[&_button]:max-w-[15rem] md:[&_button]:px-2.5'>
        {renderSelector()}
      </div>

      <div className='flex shrink-0 items-center'>{renderSubmitButton()}</div>
    </div>
  )
}
