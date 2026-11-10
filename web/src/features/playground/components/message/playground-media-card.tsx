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
import { DownloadIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CodeBlockFrame } from '@/components/ai-elements/code-block'
import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import type { GeneratedMedia } from '../../types'

type PlaygroundMediaCardProps = {
  media: GeneratedMedia
}

export function PlaygroundMediaCard({ media }: PlaygroundMediaCardProps) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  const isVideo = media.type === 'video'
  const title = isVideo ? t('Video') : t('Image')

  const actions = media.url ? (
    <>
      <CopyButton
        aria-label={t('Copy media URL')}
        className='size-8'
        value={media.url}
      />
      <Button
        aria-label={isVideo ? t('Download video') : t('Download image')}
        onClick={() => window.open(media.url, '_blank', 'noopener,noreferrer')}
        size='icon-sm'
        type='button'
        variant='ghost'
      >
        <DownloadIcon aria-hidden='true' data-icon='inline-start' />
      </Button>
    </>
  ) : null

  let body
  if (media.status === 'pending') {
    body = (
      <div className='text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 p-6'>
        <Spinner />
        <p className='text-sm'>
          {isVideo
            ? t('Video is being generated, please wait...')
            : t('Generating...')}
        </p>
      </div>
    )
  } else if (media.status === 'failed' || !media.url) {
    body = (
      <Alert className='m-3' variant='destructive'>
        <AlertTitle>{t('Generation failed')}</AlertTitle>
        <AlertDescription>
          {media.error ?? t('No media was returned')}
        </AlertDescription>
      </Alert>
    )
  } else if (failed) {
    body = (
      <Alert className='m-3' variant='destructive'>
        <AlertTitle>{t('Media preview failed. Please try again.')}</AlertTitle>
        <AlertDescription>
          <Button
            className='mt-2'
            onClick={() => setFailed(false)}
            size='sm'
            type='button'
            variant='outline'
          >
            <RefreshCwIcon data-icon='inline-start' />
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (isVideo) {
    body = (
      <video
        className='max-h-[60vh] w-full rounded-md bg-black'
        controls
        onError={() => setFailed(true)}
        preload='metadata'
        src={media.url}
      />
    )
  } else {
    body = (
      <img
        alt={media.prompt}
        className='max-h-[60vh] w-full rounded-md object-contain'
        loading='lazy'
        onError={() => setFailed(true)}
        src={media.url}
      />
    )
  }

  return (
    <CodeBlockFrame
      className='my-2 w-full max-w-full'
      endActions={actions}
      showToolbar
      title={title}
    >
      <div className='p-2'>{body}</div>
    </CodeBlockFrame>
  )
}
