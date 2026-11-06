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
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'

import type { UpdateStatus } from './managed-update-types'
import type { useManagedCleanup } from './use-managed-cleanup'

type ManagedCleanupActionProps = {
  status: UpdateStatus | undefined
  cleanup: ReturnType<typeof useManagedCleanup>
}

export function ManagedCleanupAction(props: ManagedCleanupActionProps) {
  const { t } = useTranslation()
  const cleanup = props.cleanup
  const status = props.status
  if (!status?.cleanup_supported || !status.cleanup) return null
  const cleaning = status.state === 'cleaning'
  const manualCleanup =
    status.state === 'cleanup_failed' || status.state === 'completed'
  const retrying =
    status.state === 'cleanup_failed' &&
    !!status.reason_code &&
    [
      'cleanup_active_unavailable',
      'cleanup_engine_unavailable',
      'cleanup_not_drained',
      'cleanup_persistence_failed',
      'cleanup_stop_pending',
      'cleanup_remove_failed',
    ].includes(status.reason_code)

  return (
    <div className='flex min-w-0 flex-col items-start gap-2'>
      {manualCleanup && (
        <p className='text-sm font-medium'>
          {t('Old instance awaiting cleanup')}
        </p>
      )}
      <p className='text-muted-foreground text-sm wrap-anywhere'>
        {status.cleanup.target_name}
      </p>
      {cleaning && <p role='status'>{t('Cleaning up old instance...')}</p>}
      {retrying && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Automatic cleanup will retry in 30 seconds.')}
        </p>
      )}
      {manualCleanup && (
        <Button
          type='button'
          variant='outline'
          disabled={!cleanup.canClean || cleanup.pending}
          onClick={cleanup.openConfirmation}
        >
          {t('Clean up old instance')}
        </Button>
      )}
      <ConfirmDialog
        open={cleanup.confirmation !== null}
        onOpenChange={(open) => {
          if (!open) cleanup.closeConfirmation()
        }}
        destructive
        title={t('Clean up old instance')}
        desc={t(
          'Stop and remove the drained old instance. The current service, shared data volumes and images will be kept.'
        )}
        disabled={cleanup.confirmationExpired || cleanup.pending}
        handleConfirm={() => void cleanup.confirm()}
      >
        <p className='text-sm wrap-anywhere'>
          {cleanup.confirmation?.target_name}
        </p>
        {cleanup.confirmationExpired && (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'The cleanup target or its availability changed. Close this dialog and confirm again.'
            )}
          </p>
        )}
      </ConfirmDialog>
      <SecureVerificationDialog {...cleanup.verification.dialogProps} />
    </div>
  )
}
