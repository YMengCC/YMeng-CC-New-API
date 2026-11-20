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
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { saveBlob } from '@/lib/dom-utils'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  downloadSafehouseArtifact,
  getSafehouseDownloads,
  type SafehouseArtifact,
  type SafehousePlatform,
} from '../api'

const ARTIFACT_LABELS: Record<string, string> = {
  'windows-amd64': 'Windows',
  'macos-arm64': 'macOS (Apple silicon)',
  'macos-amd64': 'macOS (Intel)',
  'linux-amd64': 'Linux (x86_64)',
  'linux-arm64': 'Linux (ARM64)',
}

function detectPlatform(): SafehousePlatform | null {
  const agent = navigator.userAgent
  if (/iPhone|iPad|Android/i.test(agent)) return null
  if (/Windows/i.test(agent)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(agent)) return 'macos'
  if (/Linux/i.test(agent)) return 'linux'
  return null
}

/** Embedded builds of the local program, the visitor's own platform first. */
export function MengmengLocalDownloads() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const downloads = useQuery({
    queryKey: ['security', 'safehouse-downloads'],
    queryFn: getSafehouseDownloads,
    staleTime: 5 * 60 * 1000,
  })
  const download = useMutation({
    mutationFn: async (artifact: SafehouseArtifact) => {
      saveBlob(
        await downloadSafehouseArtifact(artifact.file_name),
        artifact.file_name
      )
    },
    onError: (error) => handleServerError(error, t('Download failed')),
  })

  const platform = detectPlatform()
  const items = downloads.data?.items ?? []
  const ordered = [
    ...items.filter((item) => item.platform === platform),
    ...items.filter((item) => item.platform !== platform),
  ]

  return (
    <>
      {downloads.isLoading && (
        <LoadingState size='sm' inline className='mt-2' />
      )}
      {downloads.isSuccess && ordered.length === 0 && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t('The local program is not included in this build.')}
        </p>
      )}
      {downloads.isError && (
        <p className='text-muted-foreground mt-2 text-xs'>
          {t('Downloads could not be loaded.')}
        </p>
      )}
      {ordered.length > 0 && (
        <ul className='mt-2 space-y-2' aria-label={t('Safe House downloads')}>
          {ordered.map((item) => {
            const label =
              ARTIFACT_LABELS[`${item.platform}-${item.arch}`] ?? item.file_name
            const recommended = item.platform === platform
            return (
              <li
                key={item.file_name}
                className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-2'
              >
                <div className='min-w-0'>
                  <div className='text-sm font-medium'>{label}</div>
                  <div className='text-muted-foreground flex min-w-0 items-center gap-1 text-xs'>
                    <span>{`${formatNumber(item.size / 1048576, locale)} MB`}</span>
                    <span aria-hidden='true'>·</span>
                    <span className='truncate font-mono'>
                      SHA-256 {item.sha256.slice(0, 16)}…
                    </span>
                    <CopyButton
                      value={item.sha256}
                      size='icon'
                      className='size-6'
                      aria-label={t('Copy SHA-256 of {{name}}', {
                        name: label,
                      })}
                    />
                  </div>
                </div>
                <Button
                  type='button'
                  size='sm'
                  variant={recommended ? 'default' : 'outline'}
                  disabled={download.isPending}
                  onClick={() => download.mutate(item)}
                  aria-label={t('Download for {{name}}', { name: label })}
                >
                  <Download data-icon='inline-start' aria-hidden='true' />
                  {t('Download')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
