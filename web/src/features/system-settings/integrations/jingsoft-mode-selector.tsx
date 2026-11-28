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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

import {
  isJingSoftMode,
  JINGSOFT_MODE_META,
  JINGSOFT_MODES,
  type JingSoftMode,
} from './jingsoft-schema'

type JingSoftModeSelectorProps = {
  value: JingSoftMode
  modes?: readonly JingSoftMode[]
  onChange: (mode: JingSoftMode) => void
  disabled?: boolean
}

export function JingSoftModeSelector(props: JingSoftModeSelectorProps) {
  const { t } = useTranslation()
  const orderedModes = props.modes?.length ? props.modes : JINGSOFT_MODES

  return (
    <div className='@container/jingsoft-modes min-w-0 space-y-2.5'>
      <div className='min-w-0 space-y-0.5'>
        <span
          id='jingsoft-mode-label'
          className='text-sm leading-none font-medium'
        >
          {t('JingSoft settlement mode')}
        </span>
        <p className='text-muted-foreground text-xs leading-relaxed'>
          {t(
            'Choose how paid orders credit user balances. Existing in-flight orders stay on their original mode.'
          )}
        </p>
      </div>
      <RadioGroup
        aria-labelledby='jingsoft-mode-label'
        value={props.value}
        disabled={props.disabled}
        onValueChange={(nextValue) => {
          if (isJingSoftMode(nextValue)) {
            props.onChange(nextValue)
          }
        }}
        className='grid grid-cols-1 gap-3 @2xl/jingsoft-modes:grid-cols-3'
      >
        {orderedModes.map((modeKey) => {
          const meta = JINGSOFT_MODE_META[modeKey]
          const selected = props.value === modeKey
          const itemId = `jingsoft-mode-${modeKey}`
          const labelId = `${itemId}-label`
          const descriptionId = `${itemId}-description`

          return (
            <div key={modeKey} className='min-w-0'>
              <Label
                htmlFor={itemId}
                className={cn(
                  'flex h-full min-w-0 cursor-pointer flex-col items-stretch gap-2 rounded-xl border p-3.5 font-normal transition-colors select-none',
                  selected
                    ? 'border-primary bg-primary/[0.04] ring-primary/25 dark:bg-primary/10 ring-1'
                    : 'border-border bg-card hover:bg-muted/30',
                  props.disabled && 'cursor-not-allowed opacity-60'
                )}
              >
                <div className='flex min-w-0 items-start gap-2.5'>
                  <RadioGroupItem
                    id={itemId}
                    value={modeKey}
                    aria-labelledby={labelId}
                    aria-describedby={descriptionId}
                    className='mt-0.5 shrink-0'
                  />
                  <div className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1'>
                    <span
                      id={labelId}
                      className='text-foreground text-sm leading-snug font-medium break-words whitespace-normal'
                    >
                      {t(meta.labelKey)}
                    </span>
                    {meta.recommended ? (
                      <Badge variant='secondary' className='shrink-0'>
                        {t('Recommended mode')}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p
                  id={descriptionId}
                  className='text-muted-foreground pl-6.5 text-xs leading-relaxed break-words whitespace-normal'
                >
                  {t(meta.descriptionKey)}
                </p>
              </Label>
            </div>
          )
        })}
      </RadioGroup>
    </div>
  )
}
