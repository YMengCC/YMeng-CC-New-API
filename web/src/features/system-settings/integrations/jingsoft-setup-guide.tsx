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

import { normalizeJingSoftBaseURL } from './jingsoft-schema'

export const JINGSOFT_PRO_GUIDE_STORAGE_KEY =
  'newapi.jingsoft_pro.setup_guide.dismissed.v1'

function isJingSoftProGuideDismissed(): boolean {
  try {
    return window.localStorage.getItem(JINGSOFT_PRO_GUIDE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markJingSoftProGuideDismissed(): void {
  try {
    window.localStorage.setItem(JINGSOFT_PRO_GUIDE_STORAGE_KEY, '1')
  } catch {
    // Ignore restricted storage environments.
  }
}

type JingSoftSetupGuideProps = {
  baseUrl?: string
  autoOpen?: boolean
}

export function JingSoftSetupGuide(props: JingSoftSetupGuideProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(
    () => Boolean(props.autoOpen) && !isJingSoftProGuideDismissed()
  )
  const resolvedOrigin = normalizeJingSoftBaseURL(props.baseUrl ?? '')
  const exampleOrigin = resolvedOrigin || 'https://wzyp.cn'
  const merchantConsoleUrl = resolvedOrigin ? `${resolvedOrigin}/merchant` : ''

  useEffect(() => {
    if (props.autoOpen && !isJingSoftProGuideDismissed()) {
      setOpen(true)
    }
  }, [props.autoOpen])

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      markJingSoftProGuideDismissed()
    }
    setOpen(nextOpen)
  }

  const settingGroups = [
    {
      title: t('Status & settlement mode'),
      items: `${t('Enable JingSoft')} · ${t('JingSoft settlement mode')}`,
      purpose: t(
        'Controls whether new orders can be created and selects Auto fallback, Direct top-up, or Redemption code top-up.'
      ),
      advice: t(
        'Recommended: choose Auto fallback or Direct top-up so buyers can pay preset or custom amounts without entering a QQ number.'
      ),
    },
    {
      title: t('Platform & store credentials'),
      items: `${t('JingSoft platform URL')} · ${t('JingSoft store token')}`,
      purpose: t(
        'Connects your HTTPS JingSoft Pro storefront and verifies store ownership, channels, and products.'
      ),
      advice: t(
        'Paste your full /shop/... link to auto-split both fields, then click Test compatibility to confirm connectivity.'
      ),
    },
    {
      title: t('Direct top-up & auto-restock'),
      items: `${t('JingSoft merchant token')} · ${t('Direct top-up slot goods keys')} · ${t('Auto-restock threshold')}`,
      purpose: t(
        'Enables server-side dynamic slot pricing and automatic placeholder stock replenishment.'
      ),
      advice: t(
        'Create 3–5 card products with Contact format set to Any and Storefront visibility set to Hidden, verify the merchant token, then click Auto-detect hidden slots.'
      ),
    },
    {
      title: t('JingSoft product mappings'),
      items: `${t('Auto-detect store products')} · ${t('Expected credited balance (USD)')}`,
      purpose: t(
        'Maps public card products to preset USD recharge tiers in General for Redemption code top-up or Auto fallback.'
      ),
      advice: t(
        'Set product Contact format to Any or QQ, click Auto-detect store products to infer USD tiers, then click Import matched.'
      ),
    },
    {
      title: t('Channels & risk limits'),
      items: `${t('JingSoft available channels')} · ${t('Max single payment (CNY)')} · ${t('Order rate limit (per minute)')}`,
      purpose: t(
        'Syncs upstream Alipay/WeChat channels when saving and bounds single-order amount and per-minute order creation.'
      ),
      advice: t(
        'Keep sensible limits (for example ¥5000 and 15 orders/min), save settings to sync channels, and bind them in General → Payment methods.'
      ),
    },
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t('JingSoft Pro setup guide')}
      description={t(
        'Review each setting group, its purpose, and the recommended setup steps. Closing this guide stops automatic pop-ups; click Setup guide anytime to reopen.'
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
          {merchantConsoleUrl && (
            <Button
              variant='outline'
              role='link'
              render={
                <a
                  href={merchantConsoleUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {t('Open JingSoft merchant console')}
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
              {t('Configure platform URL & test compatibility')}
            </h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Enter the HTTPS origin of any JingSoft Pro platform, then click Test compatibility to verify its API endpoints.'
              )}{' '}
              ({t('Example')}:{' '}
              <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
                {exampleOrigin}
              </code>
              )
            </span>
          </li>
          <li>
            <h3 className='inline font-medium'>{t('Get the store token')}</h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Copy the part of the store link after /shop/ and paste it into the store token field. You can also paste the full store link.'
              )}{' '}
              (
              <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
                {`${exampleOrigin}/shop/YourShop`}
              </code>{' '}
              →{' '}
              <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
                YourShop
              </code>
              )
            </span>
          </li>
          <li>
            <h3 className='inline font-medium'>{t('Add product mappings')}</h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Use Auto-detect hidden slots for Direct top-up or Auto-detect store products for Redemption code top-up, then click Save all settings to sync channels.'
              )}
            </span>
          </li>
          <li>
            <h3 className='inline font-medium'>
              {t('Configure JingSoft payment methods')}
            </h3>
            <span className='text-muted-foreground'>
              {' — '}
              {t(
                'Add the synced JingSoft Alipay / WeChat Pay entries under General → Payment methods and save again.'
              )}{' '}
              {t(
                'If JINGSOFT_ORDER_ENCRYPTION_KEY is not set on the server, site version updates configure a 32-byte Base64 key automatically.'
              )}
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
