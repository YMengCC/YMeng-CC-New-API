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
import { Loader2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updatePrivacySettings } from '@/features/profile/api'
import { parseUserSettings } from '@/features/profile/lib/format'
import type { UserProfile } from '@/features/profile/types'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

type MengmengGatewayModeProps = {
  profile: UserProfile
  onUpdate: () => void | Promise<void>
}

/** Masking performed by this site's gateway: it does see the original text. */
export function MengmengGatewayMode(props: MengmengGatewayModeProps) {
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

  return (
    <div>
      <div className='flex items-center justify-between gap-4'>
        <Label htmlFor={`${id}-enabled`}>
          {t("Enable Mengmeng's Safe House text masking")}
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
    </div>
  )
}
