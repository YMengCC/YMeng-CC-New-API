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
import { HelpCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import { normalizeJingSoftBaseURL } from './jingsoft-schema'

export function JingSoftSetupGuide(props: { baseUrl?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const resolvedOrigin = normalizeJingSoftBaseURL(props.baseUrl ?? '')
  const exampleOrigin = resolvedOrigin || 'https://wzyp.cn'
  const merchantConsoleUrl = resolvedOrigin ? `${resolvedOrigin}/merchant` : ''

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('JingSoft payment setup guide')}
      description={t(
        'Follow these steps to configure the platform URL, store token, and product settings in your JingSoft merchant account.'
      )}
      contentClassName='sm:max-w-xl'
      bodyClassName='text-sm break-words'
      showCloseButton={false}
      trigger={
        <Button type='button' variant='outline' size='sm'>
          <HelpCircle className='mr-1 h-4 w-4' aria-hidden='true' />
          {t('Setup guide')}
        </Button>
      }
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => setOpen(false)}
          >
            {t('Close')}
          </Button>
          {merchantConsoleUrl && (
            <Button
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
            </Button>
          )}
        </>
      }
    >
      <ol className='list-decimal space-y-5 pl-5'>
        <li className='space-y-1.5'>
          <h3 className='font-medium'>
            {t('Configure platform URL & test compatibility')}
          </h3>
          <p className='text-muted-foreground'>
            {t(
              'Enter the HTTPS origin of any JingSoft PRO storefront platform, then click Test compatibility to verify its API endpoints.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t('Example')}:{' '}
            <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
              {exampleOrigin}
            </code>
          </p>
        </li>
        <li className='space-y-1.5'>
          <h3 className='font-medium'>{t('Get the store token')}</h3>
          <p className='text-muted-foreground'>
            {t(
              'Sign in to the JingSoft merchant console and open your store page.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t(
              'Copy the part of the store link after /shop/ and paste it into the store token field. You can also paste the full store link.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t('Example')}:{' '}
            <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
              {`${exampleOrigin}/shop/YourShop`}
            </code>{' '}
            →{' '}
            <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
              YourShop
            </code>
          </p>
        </li>
        <li className='space-y-1.5'>
          <h3 className='font-medium'>{t('Prepare the products')}</h3>
          <p className='text-muted-foreground'>
            {t(
              'Create one card-code product for each top-up tier. Keep it on sale and in stock.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t('Set the contact format to Any or QQ.')}
          </p>
        </li>
        <li className='space-y-1.5'>
          <h3 className='font-medium'>{t('Add product mappings')}</h3>
          <p className='text-muted-foreground'>
            {t(
              'Click Auto-detect store products to import on-sale card products automatically, or paste a product key or full /item/... link.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t('Example')}:{' '}
            <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
              {`${exampleOrigin}/item/jbf7yz`}
            </code>{' '}
            →{' '}
            <code className='bg-muted text-foreground rounded px-1.5 py-0.5 text-xs'>
              jbf7yz
            </code>
          </p>
          <p className='text-muted-foreground'>
            {t(
              'Set the expected credited balance (USD) to a top-up amount option in General, not the CNY selling price.'
            )}
          </p>
        </li>
        <li className='space-y-1.5'>
          <h3 className='font-medium'>
            {t('Direct-credit mode (optional)')}
          </h3>
          <p className='text-muted-foreground'>
            {t(
              'To skip manual code exports and enable custom recharge amounts, create 1–20 dedicated card products with Contact format set to Any and Storefront visibility set to Hidden, then enter your merchant token and slot goods keys.'
            )}
          </p>
        </li>
        <li className='space-y-1.5'>
          <h3 className='font-medium'>
            {t('Configure JingSoft payment methods')}
          </h3>
          <p className='text-muted-foreground'>
            {t(
              'Save settings to automatically read the available channels, then add the matching JingSoft payment methods in General and save again.'
            )}
          </p>
          <p className='text-muted-foreground'>
            {t(
              'The server must also set JINGSOFT_ORDER_ENCRYPTION_KEY to a Base64 value that decodes to 32 bytes.'
            )}
          </p>
        </li>
      </ol>
    </Dialog>
  )
}
