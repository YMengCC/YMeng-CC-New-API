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
import { Settings2Icon, ShieldCheckIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import { OfficeFiles, type OfficeFilesProps } from './office-files'

type OfficeContextPanelProps = Omit<OfficeFilesProps, 'variant'> & {
  isRunning: boolean
  model: string
}

/** The model, execution state and workspace alongside the task timeline. */
export function OfficeContextPanel(props: OfficeContextPanelProps) {
  const { t } = useTranslation()

  return (
    <aside
      aria-label={t('Context')}
      className='bg-muted/30 hidden w-72 shrink-0 flex-col border-l xl:flex 2xl:w-80'
    >
      <div className='flex min-h-16 items-center gap-2 border-b px-4 py-3'>
        <Settings2Icon
          aria-hidden='true'
          className='text-muted-foreground size-4'
        />
        <div>
          <h2 className='text-sm font-semibold'>{t('Context')}</h2>
          <p className='text-muted-foreground mt-0.5 text-xs'>Codex</p>
        </div>
      </div>
      <div className='border-b p-3'>
        <dl className='bg-background space-y-3 rounded-lg border p-3 text-xs shadow-xs'>
          <div className='flex items-start justify-between gap-3'>
            <dt className='text-muted-foreground shrink-0'>{t('Model')}</dt>
            <dd
              className='min-w-0 truncate font-mono font-medium'
              title={props.model}
            >
              {props.model || '—'}
            </dd>
          </div>
          <div className='flex items-center justify-between gap-3'>
            <dt className='text-muted-foreground'>{t('Status')}</dt>
            <dd>
              <Badge variant={props.isRunning ? 'secondary' : 'outline'}>
                <span
                  aria-hidden='true'
                  className={
                    props.isRunning
                      ? 'bg-primary size-1.5 animate-pulse rounded-full'
                      : 'bg-success size-1.5 rounded-full'
                  }
                />
                {props.isRunning ? t('Working on it…') : t('Ready')}
              </Badge>
            </dd>
          </div>
        </dl>
        <p className='text-muted-foreground mt-3 flex items-start gap-2 px-1 text-xs leading-5'>
          <ShieldCheckIcon
            aria-hidden='true'
            className='mt-0.5 size-3.5 shrink-0'
          />
          <span>
            {t(
              'Codex works in an isolated workspace: it can only change files there and has no network.'
            )}
          </span>
        </p>
      </div>
      <OfficeFiles
        files={props.files}
        isDeleteDisabled={props.isDeleteDisabled}
        isDeleting={props.isDeleting}
        isLoading={props.isLoading}
        isUploading={props.isUploading}
        onDownload={props.onDownload}
        onRemove={props.onRemove}
        onUpload={props.onUpload}
        variant='panel'
      />
    </aside>
  )
}
