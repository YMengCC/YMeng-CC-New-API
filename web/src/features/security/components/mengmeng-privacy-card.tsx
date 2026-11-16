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
import { useMutation } from '@tanstack/react-query'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { TitledCard } from '@/components/ui/titled-card'
import { updatePrivacySettings } from '@/features/profile/api'
import { parseUserSettings } from '@/features/profile/lib/format'
import type { UserProfile } from '@/features/profile/types'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

type MengmengPrivacyCardProps = {
  profile: UserProfile
  onUpdate: () => void | Promise<void>
}

export function MengmengPrivacyCard(props: MengmengPrivacyCardProps) {
  const { t } = useTranslation()
  const id = useId()
  const savedEnabled =
    parseUserSettings(props.profile.setting)?.text_masking_enabled === true
  const [enabled, setEnabled] = useState(savedEnabled)

  useEffect(() => {
    setEnabled(savedEnabled)
  }, [props.profile.id, savedEnabled])

  const save = useMutation({
    mutationFn: async (textMaskingEnabled: boolean) => {
      const response = await updatePrivacySettings({
        text_masking_enabled: textMaskingEnabled,
      })
      if (!response.success) {
        throw createServerError(response, t('Failed to update settings'))
      }
    },
    onSuccess: async () => {
      await props.onUpdate()
      toast.success(t('Settings updated successfully'))
    },
    onError: (error) => {
      setEnabled(savedEnabled)
      handleServerError(error, t('Failed to update settings'))
    },
  })

  // Fictional, fixed mapping: this is not the server's detection algorithm.
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
    <TitledCard
      title={t('Mengmeng')}
      description={t('Opt in to text masking for supported requests.')}
      disableHoverEffect
    >
      <div className='flex items-center justify-between gap-4'>
        <Label htmlFor={`${id}-enabled`}>
          {t('Enable Mengmeng text masking')}
        </Label>
        <Switch
          id={`${id}-enabled`}
          aria-describedby={`${id}-limitations`}
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={save.isPending}
        />
      </div>
      <p
        id={`${id}-limitations`}
        className='text-muted-foreground mt-2 text-xs'
      >
        {t(
          'Off by default. Masking may miss sensitive content and is not a confidentiality guarantee.'
        )}
      </p>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t(
          'No local script or plugin is needed. This gateway receives the original text and masks it before sending it upstream.'
        )}
      </p>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t(
          'Changes apply after saving. Turning this off restores original forwarding for new requests.'
        )}
      </p>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t(
          'Supports plain-text Chat/Completions, stateless Responses, Messages, and Gemini requests. Responses storage is disabled.'
        )}
      </p>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t(
          'Unsupported requests, including tools, media, and stateful calls, are rejected before reaching the upstream.'
        )}
      </p>
      <div className='mt-4 flex justify-end'>
        <Button
          type='button'
          onClick={() => save.mutate(enabled)}
          disabled={save.isPending || enabled === savedEnabled}
        >
          {save.isPending && (
            <Loader2 aria-hidden='true' className='size-4 animate-spin' />
          )}
          {save.isPending ? t('Saving...') : t('Save Settings')}
        </Button>
      </div>
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
          {t('How Mengmeng works')}
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
    </TitledCard>
  )
}
