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
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'

import { MengmengLocalDownloads } from './mengmeng-local-downloads'

// Fixed by the local program; see safehouse/main.go.
const SAFEHOUSE_ORIGIN = 'http://127.0.0.1:17860'

/** The local program masks on the user's computer: this site never sees the original. */
export function MengmengLocalMode() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const configured = (status as { server_address?: unknown } | null)
    ?.server_address
  const siteAddress =
    typeof configured === 'string' && configured
      ? configured
      : window.location.origin
  let siteOrigin = window.location.origin
  try {
    siteOrigin = new URL(siteAddress).origin
  } catch {
    // Keep the console origin when the configured address is malformed.
  }
  const localBaseURL = `${SAFEHOUSE_ORIGIN}/v1`

  return (
    <div className='space-y-4'>
      <Alert>
        <ShieldCheck aria-hidden='true' />
        <AlertTitle>
          {t('Detected sensitive text is masked on your computer')}
        </AlertTitle>
        <AlertDescription>
          {t(
            'Run the Safe House on your computer. It masks sensitive text before a request leaves your computer and restores the reply locally.'
          )}
        </AlertDescription>
      </Alert>

      <ol className='list-inside list-decimal space-y-4 text-sm'>
        <li>
          <span className='font-medium'>
            {t('Download and open the Safe House')}
          </span>
          <MengmengLocalDownloads />
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'The program is not code-signed. On Windows, choose More info and then Run anyway if SmartScreen appears. On macOS, unzip it, right-click the program and choose Open, or allow it in System Settings → Privacy & Security.'
            )}
          </p>
        </li>
        <li>
          <span className='font-medium'>{t('Connect this site')}</span>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() =>
                window.open(
                  `${SAFEHOUSE_ORIGIN}/#connect=${encodeURIComponent(siteOrigin)}`,
                  '_blank',
                  'noopener,noreferrer'
                )
              }
            >
              <ExternalLink data-icon='inline-start' aria-hidden='true' />
              {t('Connect this site')}
            </Button>
            <code className='text-muted-foreground text-xs break-all'>
              {siteOrigin}
            </code>
          </div>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'The Safe House panel asks you to confirm this address. If nothing opens, start the program first.'
            )}
          </p>
        </li>
        <li>
          <span className='font-medium'>
            {t('Point your client at the local address')}
          </span>
          <div className='bg-muted/50 mt-2 flex items-center gap-2 rounded-md border px-2 py-1'>
            <code className='flex-1 truncate text-xs'>{localBaseURL}</code>
            <CopyButton
              value={localBaseURL}
              aria-label={t('Copy local address')}
            />
          </div>
          <p className='text-muted-foreground mt-2 text-xs'>
            {t(
              'Use it as the OpenAI-compatible base URL. Claude and Gemini clients use {{origin}}. Keep your API key unchanged.',
              { origin: SAFEHOUSE_ORIGIN }
            )}
          </p>
        </li>
      </ol>

      <ul className='text-muted-foreground list-disc space-y-1 ps-4 text-xs'>
        <li>
          {t(
            'Supports the same plain-text requests as site masking. Requests with tools, images, audio, or server-side state are blocked on your computer, so most coding agents cannot use it.'
          )}
        </li>
        <li>
          {t(
            'The playground on this site does not go through the local program.'
          )}
        </li>
      </ul>
    </div>
  )
}
