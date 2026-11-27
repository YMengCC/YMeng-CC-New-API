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
import { BriefcaseBusinessIcon, MessagesSquareIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import type { PlaygroundMode } from '../index'

type PlaygroundHeaderProps = {
  isOffice: boolean
  isOfficeAvailable: boolean
  onModeChange: (mode: PlaygroundMode) => void
}

const MODE_ITEM_CLASS =
  'text-muted-foreground hover:bg-background/70 hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground h-9 min-w-0 gap-2 rounded-lg px-4 text-sm font-medium transition-all aria-pressed:shadow-sm md:min-w-34'

/**
 * Top bar of the Playground workspace. Centers the Chat / Office switcher so
 * mode switching stays prominent above the main conversation and task column.
 */
export function PlaygroundHeader(props: PlaygroundHeaderProps) {
  const { t } = useTranslation()

  return (
    <header className='border-border/80 bg-background/95 flex shrink-0 flex-col gap-2.5 border-b px-3 py-2.5 backdrop-blur-xs sm:px-4 md:grid md:min-h-14 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-4 md:py-2'>
      <div className='flex min-w-0 items-center gap-2.5'>
        <IconBadge
          className='ring-primary/15 ring-1'
          size='title'
          tone='primary'
        >
          {props.isOffice ? <BriefcaseBusinessIcon /> : <MessagesSquareIcon />}
        </IconBadge>
        <div className='min-w-0'>
          <h1 className='truncate text-sm font-semibold tracking-tight sm:text-base'>
            {t('Playground')}
          </h1>
          <p className='text-muted-foreground truncate text-xs'>
            {props.isOffice ? t('Work with Codex') : t('Chat with AI models')}
          </p>
        </div>
      </div>

      {props.isOfficeAvailable && (
        <ToggleGroup
          aria-label={t('Playground mode')}
          className='border-border/80 bg-muted/80 grid w-full grid-cols-2 gap-1 rounded-xl border p-1 shadow-xs md:w-auto md:justify-self-center'
          onValueChange={(value) => {
            // Pressing the selected mode again keeps it selected.
            if (value.length) props.onModeChange(value[0] as PlaygroundMode)
          }}
          spacing={1}
          value={[props.isOffice ? 'office' : 'chat']}
        >
          <ToggleGroupItem className={MODE_ITEM_CLASS} value='chat'>
            <MessagesSquareIcon aria-hidden='true' className='size-4' />
            <span>{t('Chat')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem className={MODE_ITEM_CLASS} value='office'>
            <BriefcaseBusinessIcon aria-hidden='true' className='size-4' />
            <span>{t('Office')}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      <div aria-hidden='true' className='hidden md:block' />
    </header>
  )
}
