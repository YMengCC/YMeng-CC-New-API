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
import { AlertTriangleIcon, InfoIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toIntlLocale } from '@/i18n/languages'
import dayjs from '@/lib/dayjs'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  planPlaygroundImport,
  type PlaygroundBackupParsed,
  type PlaygroundImportMode,
  type PlaygroundImportOptions,
} from '../../lib'
import { MAX_STORED_CONVERSATIONS } from '../../lib/storage/storage-schema'
import type { PlaygroundHistory } from '../../types'

type PlaygroundImportDialogProps = {
  open: boolean
  fileName: string
  parsed: PlaygroundBackupParsed | null
  currentHistory: PlaygroundHistory
  onOpenChange: (open: boolean) => void
  onConfirm: (options: PlaygroundImportOptions) => void
}

export function PlaygroundImportDialog(props: PlaygroundImportDialogProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const fieldId = useId()
  const [mode, setMode] = useState<PlaygroundImportMode>('merge')
  const [restoreConfig, setRestoreConfig] = useState(true)

  useEffect(() => {
    if (!props.open || !props.parsed) return
    setMode('merge')
    setRestoreConfig(props.parsed.hasConfig)
  }, [props.open, props.parsed])

  const previewPlan = useMemo(() => {
    if (!props.parsed) return null
    return planPlaygroundImport(
      props.currentHistory,
      props.parsed.backup.history,
      mode
    )
  }, [props.currentHistory, props.parsed, mode])

  if (!props.parsed) {
    return null
  }

  const mergeId = `${fieldId}-merge`
  const replaceId = `${fieldId}-replace`
  const restoreConfigId = `${fieldId}-restore-config`

  const handleConfirm = () => {
    props.onConfirm({
      mode,
      restoreConfig: props.parsed?.hasConfig ? restoreConfig : false,
    })
  }

  return (
    <Dialog
      bodyClassName='space-y-4'
      contentClassName='sm:max-w-lg'
      description={t(
        'Review the backup file and choose how to apply it to the current account.'
      )}
      footer={
        <>
          <Button
            onClick={() => props.onOpenChange(false)}
            type='button'
            variant='outline'
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            type='button'
            variant={mode === 'replace' ? 'destructive' : 'default'}
          >
            {mode === 'replace' ? t('Replace and import') : t('Import')}
          </Button>
        </>
      }
      onOpenChange={props.onOpenChange}
      open={props.open}
      title={t('Import playground history')}
    >
      <dl className='border-border/80 bg-muted/30 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border p-3 text-sm'>
        <dt className='text-muted-foreground'>{t('Backup file')}</dt>
        <dd className='truncate text-right font-medium' title={props.fileName}>
          {props.fileName}
        </dd>

        {props.parsed.backup.exportedAt !== undefined && (
          <>
            <dt className='text-muted-foreground'>{t('Exported at')}</dt>
            <dd className='text-right tabular-nums'>
              {dayjs(props.parsed.backup.exportedAt).format(
                'YYYY-MM-DD HH:mm:ss'
              )}
            </dd>
          </>
        )}

        <dt className='text-muted-foreground'>{t('Conversations')}</dt>
        <dd className='text-right font-medium tabular-nums'>
          {formatNumber(props.parsed.conversationCount, locale)}
        </dd>

        <dt className='text-muted-foreground'>{t('Messages')}</dt>
        <dd className='text-right font-medium tabular-nums'>
          {formatNumber(props.parsed.messageCount, locale)}
        </dd>

        <dt className='text-muted-foreground'>{t('Settings')}</dt>
        <dd className='flex justify-end'>
          <Badge variant={props.parsed.hasConfig ? 'secondary' : 'outline'}>
            {props.parsed.hasConfig ? t('Included') : t('Not in backup')}
          </Badge>
        </dd>
      </dl>

      <div className='space-y-2'>
        <p className='text-sm font-medium'>{t('Import mode')}</p>
        <RadioGroup
          aria-label={t('Import mode')}
          onValueChange={(value) => {
            if (value === 'merge' || value === 'replace') {
              setMode(value)
            }
          }}
          value={mode}
        >
          <div
            className={cn(
              'border-border/80 flex items-start gap-2.5 rounded-lg border p-3 transition-colors',
              mode === 'merge' && 'border-primary/50 bg-primary/5'
            )}
          >
            <RadioGroupItem className='mt-0.5' id={mergeId} value='merge' />
            <div className='min-w-0 flex-1 space-y-0.5'>
              <Label className='cursor-pointer font-medium' htmlFor={mergeId}>
                {t('Merge with existing history')}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Keep existing conversations and add imported ones. Duplicate IDs keep the most recently updated version.'
                )}
              </p>
            </div>
          </div>

          <div
            className={cn(
              'border-border/80 flex items-start gap-2.5 rounded-lg border p-3 transition-colors',
              mode === 'replace' && 'border-destructive/50 bg-destructive/5'
            )}
          >
            <RadioGroupItem className='mt-0.5' id={replaceId} value='replace' />
            <div className='min-w-0 flex-1 space-y-0.5'>
              <Label className='cursor-pointer font-medium' htmlFor={replaceId}>
                {t('Replace all history')}
              </Label>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Replace all conversations for the current account with the backup file.'
                )}
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      {props.parsed.hasConfig && (
        <div className='border-border/80 flex items-start gap-2.5 rounded-lg border p-3'>
          <Checkbox
            checked={restoreConfig}
            className='mt-0.5'
            id={restoreConfigId}
            onCheckedChange={(checked) => setRestoreConfig(checked === true)}
          />
          <div className='min-w-0 flex-1 space-y-0.5'>
            <Label
              className='cursor-pointer font-medium'
              htmlFor={restoreConfigId}
            >
              {t('Also restore playground settings')}
            </Label>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Unavailable models or groups on this account will automatically fall back to available options.'
              )}
            </p>
          </div>
        </div>
      )}

      {mode === 'replace' && (
        <Alert variant='destructive'>
          <AlertTriangleIcon aria-hidden='true' />
          <AlertTitle>
            {t('Existing conversations will be replaced')}
          </AlertTitle>
          <AlertDescription>
            {t(
              'This will permanently replace all current conversations for this account in this browser.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {previewPlan && previewPlan.droppedCount > 0 && (
        <Alert>
          <InfoIcon aria-hidden='true' />
          <AlertTitle>
            {t('Some older conversations will be omitted')}
          </AlertTitle>
          <AlertDescription>
            {t(
              'Browser storage keeps up to {{maxConversations}} conversations (4 MiB). {{dropped}} older conversation(s) will be omitted.',
              {
                maxConversations: formatNumber(
                  MAX_STORED_CONVERSATIONS,
                  locale
                ),
                dropped: formatNumber(previewPlan.droppedCount, locale),
              }
            )}
          </AlertDescription>
        </Alert>
      )}
    </Dialog>
  )
}
