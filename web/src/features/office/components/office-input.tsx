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
import { useTranslation } from 'react-i18next'

import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { ModelGroupSelector } from '@/components/model-group-selector'
import { Kbd } from '@/components/ui/kbd'
import type { GroupOption, ModelOption } from '@/features/playground/types'
import { cn } from '@/lib/utils'

import { useFileDropZone } from '../hooks/use-file-drop-zone'

type OfficeInputProps = {
  disabled?: boolean
  groupValue: string
  groups: GroupOption[]
  isModelLoading?: boolean
  isRunning?: boolean
  modelValue: string
  models: ModelOption[]
  onDropFiles: (files: File[]) => void
  onGroupChange: (value: string) => void
  onModelChange: (value: string) => void
  onSubmit: (text: string) => void
  onStop?: () => void
}

/**
 * Composer of the office mode: a task, the group and model to run it, a
 * stop. Files dropped on it are uploaded into the workspace instead of being
 * attached, because Codex reads its files from there.
 */
export function OfficeInput(props: OfficeInputProps) {
  const { t } = useTranslation()
  const isSelectorDisabled = props.disabled || props.isRunning
  const dropZone = useFileDropZone(props.onDropFiles)

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim() ?? ''
    // Throwing keeps the text in the composer as a retryable draft.
    if (!text || props.disabled || !props.modelValue) {
      throw new Error(t('The task cannot be submitted right now'))
    }
    props.onSubmit(text)
  }

  return (
    <div
      className='mx-auto flex w-full max-w-4xl shrink-0 flex-col gap-1.5 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:gap-2 md:pb-4'
      {...dropZone.handlers}
    >
      <PromptInput
        acceptDrop={false}
        className='relative'
        groupClassName={cn(
          'bg-background border-border ring-1 ring-border/40 rounded-xl overflow-hidden shadow-xs transition-[border-color,box-shadow] duration-200 focus-within:border-ring/60 focus-within:ring-ring/20 focus-within:shadow-sm',
          dropZone.isDragActive && 'border-primary bg-primary/5 ring-primary/30'
        )}
        onSubmit={handleSubmit}
      >
        {dropZone.isDragActive && (
          <div className='pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl'>
            <p className='bg-background/90 text-primary rounded-md px-3 py-1.5 text-sm font-medium'>
              {t('Drop files to upload them to the workspace')}
            </p>
          </div>
        )}
        <PromptInputBody>
          <PromptInputTextarea
            autoComplete='off'
            autoCorrect='off'
            autoCapitalize='off'
            spellCheck={false}
            className='placeholder:text-muted-foreground/70 max-h-[30vh] min-h-20 overflow-y-auto px-3 pt-3 pb-2 text-sm leading-6 md:max-h-[40vh] md:px-4 md:pt-4 md:pb-3'
            disabled={props.disabled}
            placeholder={t('Describe the task for Codex')}
          />
        </PromptInputBody>
        <PromptInputFooter className='border-border/60 bg-muted/20 flex items-center gap-1.5 border-t px-2 py-1.5 md:gap-2 md:px-3 md:py-2'>
          <div className='shrink-0 [&_button]:max-w-[7.5rem] [&_button]:px-2 md:[&_button]:max-w-[15rem] md:[&_button]:px-2.5'>
            <ModelGroupSelector
              disabled={isSelectorDisabled}
              groups={props.groups}
              onGroupChange={props.onGroupChange}
              onModelChange={props.onModelChange}
              selectedGroup={props.groupValue}
              selectedModel={props.modelValue}
              models={props.models}
            />
          </div>
          <p className='text-muted-foreground mx-1 hidden min-w-0 flex-1 truncate text-xs lg:block'>
            {t(
              'Codex works in an isolated workspace: it can only change files there and has no network.'
            )}
          </p>
          <div className='min-w-0 flex-1 lg:hidden' />
          {props.isRunning && props.onStop ? (
            <PromptInputButton
              aria-label={t('Stop')}
              className='size-10 justify-center p-0 font-medium sm:size-auto sm:min-w-20 sm:px-3'
              onClick={props.onStop}
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
              disabled={
                props.disabled || props.isModelLoading || !props.modelValue
              }
              type='submit'
              variant='default'
            >
              <SendIcon aria-hidden='true' data-icon='inline-start' />
              <span className='hidden sm:inline'>{t('Send')}</span>
            </PromptInputButton>
          )}
        </PromptInputFooter>
      </PromptInput>
      <p className='text-muted-foreground hidden items-center justify-end gap-1.5 px-1 text-[11px] md:flex'>
        <Kbd>Enter</Kbd>
        <span>{t('to send')}</span>
        <span aria-hidden='true'>·</span>
        <Kbd>Shift + Enter</Kbd>
        <span>{t('for a new line')}</span>
      </p>
    </div>
  )
}
