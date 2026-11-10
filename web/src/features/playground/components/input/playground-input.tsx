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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import {
  IMAGE_ACCEPT,
  MAX_ATTACHED_IMAGE_BYTES,
  MAX_ATTACHED_IMAGES,
} from '../../constants'
import {
  canSubmitInput,
  getSubmittableImageUrls,
  getSubmittableInputText,
} from '../../lib'
import type {
  ModelOption,
  GroupOption,
  ParameterEnabled,
  PlaygroundConfig,
} from '../../types'
import { PlaygroundInputControls } from './playground-input-controls'
import { PlaygroundInputTools } from './playground-input-tools'

interface PlaygroundInputProps {
  config: PlaygroundConfig
  onSubmit: (text: string, imageUrls?: string[]) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  hasMessages?: boolean
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onClearMessages?: () => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInput({
  config,
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  hasMessages = false,
  onConfigChange,
  onClearMessages,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)

  const handleSubmit = (message: PromptInputMessage) => {
    if (disabled || isGenerating) return
    const imageUrls = getSubmittableImageUrls(message)
    if (!canSubmitInput(message, imageUrls.length > 0)) return

    const submittableText = getSubmittableInputText(message, disabled) ?? ''
    onSubmit(submittableText, imageUrls.length > 0 ? imageUrls : undefined)
    setText('')
  }

  const handleError = (error: { code: string; message: string }) => {
    if (error.code === 'accept') {
      toast.error(t('Only image files are supported'))
    } else if (error.code === 'max_file_size') {
      toast.error(t('Image must not exceed 10 MiB'))
    } else {
      toast.error(t('You can attach up to 4 images'))
    }
  }

  return (
    <div
      className='flex shrink-0 flex-col gap-1.5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:gap-2 md:px-4 md:pb-4'
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) setIsDragActive(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragActive(false)
        }
      }}
      onDrop={() => setIsDragActive(false)}
    >
      <PromptInput
        accept={IMAGE_ACCEPT}
        className='relative'
        groupClassName={cn(
          'bg-background border-border shadow-sm ring-1 ring-border/40 rounded-2xl overflow-hidden transition-[border-color,box-shadow] duration-200 focus-within:border-ring/60 focus-within:ring-ring/20 focus-within:shadow-md',
          isDragActive && 'border-primary bg-primary/5 ring-primary/30'
        )}
        maxFiles={MAX_ATTACHED_IMAGES}
        maxFileSize={MAX_ATTACHED_IMAGE_BYTES}
        onError={handleError}
        onSubmit={handleSubmit}
      >
        <PromptInputBody>
          <PromptInputAttachments>
            {(file) => <PromptInputAttachment data={file} />}
          </PromptInputAttachments>
        </PromptInputBody>
        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='placeholder:text-muted-foreground/70 max-h-[30vh] min-h-16 overflow-y-auto px-3 pt-3 pb-2 text-sm leading-6 md:max-h-[40vh] md:min-h-24 md:px-5 md:pt-4 md:pb-3 md:text-base md:leading-7'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('Ask anything')}
          value={text}
        />

        <PromptInputFooter className='border-border/60 bg-muted/30 border-t px-2 py-1.5 md:px-3 md:py-2.5'>
          <PlaygroundInputControls
            disabled={disabled}
            groups={groups}
            groupValue={groupValue}
            isGenerating={isGenerating}
            isModelLoading={isModelLoading}
            models={models}
            modelValue={modelValue}
            onGroupChange={onGroupChange}
            onModelChange={onModelChange}
            onStop={onStop}
            text={text}
            tools={
              <PlaygroundInputTools
                config={config}
                disabled={disabled}
                hasMessages={hasMessages}
                onConfigChange={onConfigChange}
                onClearMessages={onClearMessages}
                onParameterEnabledChange={onParameterEnabledChange}
                parameterEnabled={parameterEnabled}
              />
            }
          />
        </PromptInputFooter>
      </PromptInput>

      <p className='text-muted-foreground hidden items-center gap-1.5 px-1 text-xs md:flex'>
        <Kbd>Enter</Kbd>
        <span>{t('to send')}</span>
        <span aria-hidden='true'>·</span>
        <Kbd>Shift + Enter</Kbd>
        <span>{t('for a new line')}</span>
        <span aria-hidden='true'>·</span>
        <span>{t('Drop images here or paste')}</span>
      </p>
    </div>
  )
}
