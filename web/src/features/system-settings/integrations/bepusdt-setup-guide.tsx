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
import { ExternalLink, HelpCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const BEPUSDT_PROJECT_URL = 'https://github.com/v03413/BEpusdt'
export const BEPUSDT_GUIDE_STORAGE_KEY =
  'newapi.bepusdt.setup_guide.dismissed.v1'

function isBEpusdtGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(BEPUSDT_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markBEpusdtGuideDismissed(): void {
  try {
    window.localStorage.setItem(BEPUSDT_GUIDE_STORAGE_KEY, '1')
  } catch {
    // Ignore restricted storage environments.
  }
}

function normalizeBEpusdtConsoleOrigin(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
    if (parsed.username || parsed.password || !parsed.host) {
      return ''
    }
    return trimmed.replace(/\/+$/, '')
  } catch {
    return ''
  }
}

export interface BEpusdtSetupGuideProps {
  apiUrl?: string
  autoOpen?: boolean
}

export function BEpusdtSetupGuide(props: BEpusdtSetupGuideProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(
    () => Boolean(props.autoOpen) && !isBEpusdtGuideDismissed()
  )
  const resolvedOrigin = normalizeBEpusdtConsoleOrigin(props.apiUrl ?? '')
  const exampleOrigin = resolvedOrigin || 'https://bepusdt.example.com'

  useEffect(() => {
    if (props.autoOpen && !isBEpusdtGuideDismissed()) {
      setOpen(true)
    }
  }, [props.autoOpen])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      markBEpusdtGuideDismissed()
    }
    setOpen(nextOpen)
  }

  const settingGroups = [
    {
      title: t('Gateway status & API credentials'),
      items: `${t('Enable BEpusdt')} · ${t('BEpusdt API URL')} · ${t('BEpusdt API Token')}`,
      purpose: t(
        'Controls whether BEpusdt orders and webhooks are active, and authenticates requests and callbacks with BEpusdt MD5 signatures.'
      ),
      advice: t(
        'Use HTTPS in production, click Test connection after changing credentials, and leave API Token blank on later edits unless rotating it.'
      ),
    },
    {
      title: t('Fiat, pricing & timeout'),
      items: `${t('Fiat currency')} · ${t('Unit price (0 = follow General)')} · ${t('Minimum top-up (USD)')} · ${t('Order timeout (seconds)')} · ${t('Default exchange rate (optional)')}`,
      purpose: t(
        'Sets the settlement fiat currency (CNY/USD/EUR/GBP/JPY), calculates payable fiat amounts, and controls order expiration (0 or >= 180 seconds).'
      ),
      advice: t(
        'Keep Unit price at 0 to follow General pricing, timeout at 1200 seconds (20 minutes), and leave global rate blank to use BEpusdt automatic rates.'
      ),
    },
    {
      title: t('Callback & return URLs'),
      items: `${t('Callback notification URL')} · ${t('Payment return URL')}`,
      purpose: t(
        'Overrides where BEpusdt sends payment status webhooks (/api/bepusdt/webhook) and where buyers return after checkout.'
      ),
      advice: t(
        'Leave both blank unless using a dedicated callback or frontend domain; default URLs are derived automatically from General settings.'
      ),
    },
    {
      title: t('Channels & General binding'),
      items: `${t('BEpusdt Payment Methods')} · ${t('General → Payment methods (bepusdt_*)')}`,
      purpose: t(
        'Defines chain-specific (create-transaction) or unified cashier (create-order) channels and exposes selected bepusdt_* methods in the wallet without fee markup.'
      ),
      advice: t(
        'Use create-transaction when assigning fixed addresses per chain in new-api, or create-order (bepusdt_cashier) when managing multi-chain wallets in BEpusdt admin; always add matching bepusdt_* entries in General → Payment methods.'
      ),
    },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('BEpusdt setup guide')}
      description={t(
        'Review the deployment steps, dual order modes, and setting groups. Closing this guide stops automatic pop-ups; click Setup guide anytime to reopen.'
      )}
      contentClassName='sm:max-w-2xl'
      headerClassName='pr-5'
      bodyClassName='space-y-5 text-sm break-words'
      trigger={
        <Button type='button' variant='outline' size='sm' className='shrink-0'>
          <HelpCircle className='mr-1.5 size-4' aria-hidden='true' />
          {t('Setup guide')}
        </Button>
      }
      footer={
        <>
          <Button
            variant='outline'
            role='link'
            render={
              <a
                href={BEPUSDT_PROJECT_URL}
                target='_blank'
                rel='noopener noreferrer'
              />
            }
          >
            {t('BEpusdt GitHub')}
            <ExternalLink className='ml-1.5 size-3.5' aria-hidden='true' />
          </Button>
          {resolvedOrigin && (
            <Button
              variant='outline'
              role='link'
              render={
                <a
                  href={resolvedOrigin}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {t('Open BEpusdt console')}
              <ExternalLink className='ml-1.5 size-3.5' aria-hidden='true' />
            </Button>
          )}
          <Button type='button' onClick={() => handleOpenChange(false)}>
            {t('Got it')}
          </Button>
        </>
      }
    >
      <div className='bg-muted/30 space-y-3 rounded-xl border p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-sm font-semibold'>
            {t('Recommended setup workflow')}
          </p>
          <Badge variant='secondary'>{t('4 steps')}</Badge>
        </div>
        <ol className='list-decimal space-y-2.5 pl-5 text-xs leading-relaxed sm:text-sm'>
          <li>
            <h3 className='inline font-medium'>
              {t('Deploy BEpusdt & get the API token')}
            </h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Deploy the open-source BEpusdt gateway (Docker or binary), configure your admin login and receiving wallets, and copy the API Token (auth_token).'
              )}{' '}
              (
              <a
                href={BEPUSDT_PROJECT_URL}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary inline-flex items-center gap-1 font-medium underline underline-offset-4'
              >
                v03413/BEpusdt
                <ExternalLink className='size-3' aria-hidden='true' />
              </a>
              )
            </span>
          </li>
          <li>
            <h3 className='inline font-medium'>
              {t('Configure API URL & test connection')}
            </h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Enter your BEpusdt gateway URL and API Token, ensure your callback URL is reachable from BEpusdt, then click Test connection to verify signature and connectivity.'
              )}{' '}
              ({t('Example')}:{' '}
              <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
                {exampleOrigin}
              </code>
              )
            </span>
          </li>
          <li>
            <h3 className='inline font-medium'>
              {t('Add BEpusdt channels (dual order modes)')}
            </h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Under BEpusdt Payment Methods, add Specific trade type (create-transaction) channels with optional fixed addresses, or Unified cashier (create-order) when wallets are configured in BEpusdt admin, then save settings.'
              )}
            </span>
          </li>
          <li>
            <h3 className='inline font-medium'>
              {t('Bind bepusdt_* identifiers in General')}
            </h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Open General → Payment methods (or click Configure in General), add the matching bepusdt_* payment identifiers, and save again to display them in the wallet and subscription checkout.'
              )}{' '}
              (
              <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
                bepusdt_usdt.trc20
              </code>
              {' / '}
              <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
                bepusdt_cashier
              </code>
              )
            </span>
          </li>
        </ol>
      </div>

      <div className='space-y-2.5'>
        <p className='text-sm font-semibold'>
          {t('Settings reference & recommended actions')}
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          {settingGroups.map((group) => (
            <div
              key={group.title}
              className='bg-card flex min-w-0 flex-col gap-1.5 rounded-xl border p-3.5'
            >
              <div className='font-medium break-words'>{group.title}</div>
              <p className='text-muted-foreground text-xs break-words'>
                <span className='text-foreground font-medium'>
                  {t('Included fields')}:
                </span>{' '}
                {group.items}
              </p>
              <p className='text-muted-foreground text-xs leading-relaxed break-words'>
                <span className='text-foreground font-medium'>
                  {t('Purpose')}:
                </span>{' '}
                {group.purpose}
              </p>
              <p className='text-muted-foreground text-xs leading-relaxed break-words'>
                <span className='text-foreground font-medium'>
                  {t('Recommended')}:
                </span>{' '}
                {group.advice}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
