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
import { GlobeIcon, PaperclipIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  PromptInputButton,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import type { ParameterEnabled, PlaygroundConfig } from '../../types'
import { PLAYGROUND_TOOL_BUTTON_CLASS } from './input-tool-styles'
import { PlaygroundParameterPanel } from './playground-parameter-panel'

type PlaygroundInputToolsProps = {
  config: PlaygroundConfig
  disabled?: boolean
  hasMessages?: boolean
  onClearMessages?: () => void
  onConfigChange: <K extends keyof PlaygroundConfig>(
    key: K,
    value: PlaygroundConfig[K]
  ) => void
  onParameterEnabledChange: (
    key: keyof ParameterEnabled,
    value: boolean
  ) => void
  parameterEnabled: ParameterEnabled
}

export function PlaygroundInputTools({
  config,
  disabled,
  hasMessages = false,
  onClearMessages,
  onConfigChange,
  onParameterEnabledChange,
  parameterEnabled,
}: PlaygroundInputToolsProps) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const handleClearMessages = () => {
    onClearMessages?.()
    setClearConfirmOpen(false)
    toast.success(t('Conversation cleared'))
  }

  return (
    <>
      <PromptInputTools className='border-border/60 bg-background rounded-xl border p-0.5 shadow-xs md:p-1'>
        <Tooltip>
          <TooltipTrigger
            render={
              <PromptInputButton
                aria-label={t('Attach files')}
                className={PLAYGROUND_TOOL_BUTTON_CLASS}
                disabled={disabled}
                onClick={attachments.openFileDialog}
                variant='ghost'
              >
                <PaperclipIcon aria-hidden='true' />
              </PromptInputButton>
            }
          />
          <TooltipContent>
            <p>{t('Attach PDF or image files')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                aria-label={t('Web search')}
                className={cn(
                  PLAYGROUND_TOOL_BUTTON_CLASS,
                  'aria-pressed:bg-primary/10 aria-pressed:text-primary'
                )}
                disabled={disabled}
                onPressedChange={(pressed) =>
                  onConfigChange('web_search', pressed)
                }
                pressed={config.web_search}
              >
                <GlobeIcon aria-hidden='true' />
              </Toggle>
            }
          />
          <TooltipContent className='max-w-64'>
            <p>
              {config.web_search
                ? t(
                    'Web search is on. The selected upstream may send your query to a search service and may charge tool fees.'
                  )
                : t('Web search')}
            </p>
          </TooltipContent>
        </Tooltip>

        <PlaygroundParameterPanel
          config={config}
          disabled={disabled}
          onConfigChange={onConfigChange}
          onParameterEnabledChange={onParameterEnabledChange}
          parameterEnabled={parameterEnabled}
        />

        <Separator className='mx-0.5 h-6' orientation='vertical' />

        <Tooltip>
          <TooltipTrigger
            render={
              <PromptInputButton
                aria-label={t('Clear chat history')}
                className={cn(
                  PLAYGROUND_TOOL_BUTTON_CLASS,
                  'hover:text-destructive hover:bg-destructive/10'
                )}
                disabled={disabled || !hasMessages || !onClearMessages}
                onClick={() => setClearConfirmOpen(true)}
                variant='ghost'
              >
                <Trash2Icon aria-hidden='true' />
              </PromptInputButton>
            }
          />
          <TooltipContent>
            <p>{t('Clear chat history')}</p>
          </TooltipContent>
        </Tooltip>
      </PromptInputTools>

      <ConfirmDialog
        destructive
        desc={t(
          'All messages in this conversation will be removed. This cannot be undone.'
        )}
        confirmText={t('Clear')}
        handleConfirm={handleClearMessages}
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t('Clear current conversation?')}
      />
    </>
  )
}
