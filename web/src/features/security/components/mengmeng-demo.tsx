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
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

/** A fixed, fictional walkthrough; it is not the real detector. */
export function MengmengDemo() {
  const { t } = useTranslation()
  const email = 'alex@example.com'
  const placeholder = '[EMAIL_1]'
  const original = t('Please contact {{email}}.', { email })
  const replacement = original.replaceAll(email, placeholder)
  const mockResponse = t('Message prepared for {{email}}.', {
    email: placeholder,
  })
  const restored = mockResponse.replaceAll(placeholder, email)
  const steps = [
    { label: t('Original text'), text: original },
    { label: t('Replacement'), text: replacement },
    { label: t('Mock response'), text: mockResponse },
    { label: t('Restored output'), text: restored },
  ]

  return (
    <Collapsible className='mt-4 border-t pt-3'>
      <CollapsibleTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            className='group h-auto w-full justify-between gap-2 px-0 text-start whitespace-normal'
          />
        }
      >
        {t("How Mengmeng's Safe House works")}
        <ChevronDown
          aria-hidden='true'
          className='size-4 shrink-0 group-aria-expanded:rotate-180'
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'Illustrative sample only, not the detector or a live relay. No network requests.'
          )}
        </p>
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(
            'The detector covers email, Chinese mobile numbers, valid Chinese resident IDs, validated IPv4 addresses, common API secrets, and private-key blocks. It does not promise to detect names or addresses.'
          )}
        </p>
        <p className='mt-3 text-xs'>
          {t('Example mapping')}: <code>{email}</code> →{' '}
          <code>{placeholder}</code>
        </p>
        <ol className='mt-3 list-inside list-decimal space-y-3 text-xs'>
          {steps.map((step) => (
            <li key={step.label}>
              <span className='font-medium'>{step.label}</span>
              <p className='bg-muted/50 mt-1 rounded-md border p-2 break-words whitespace-pre-wrap'>
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}
