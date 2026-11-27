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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { getServerErrorMessage } from '@/lib/server-error-message'

import { getJingSoftRedemption } from '../../jingsoft-api'

export function JingSoftRedemptionDialog(props: {
  tradeNo: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const redemption = useQuery({
    queryKey: ['wallet', 'jingsoft-redemption', props.tradeNo],
    queryFn: () => getJingSoftRedemption(props.tradeNo ?? ''),
    enabled: !!props.tradeNo,
    retry: false,
    staleTime: Infinity,
    meta: { errorToast: false },
  })
  return (
    <Dialog
      open={!!props.tradeNo}
      onOpenChange={props.onOpenChange}
      title={t('Redemption Code')}
      description={t('The code redeemed for this order')}
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'
      footer={
        <Button onClick={() => props.onOpenChange(false)}>{t('Close')}</Button>
      }
    >
      {redemption.isPending && <LoadingState size='sm' />}
      {redemption.isError && (
        <ErrorState
          title={t('Redemption code unavailable')}
          description={getServerErrorMessage(
            redemption.error,
            t('Something went wrong!')
          )}
        />
      )}
      {redemption.data && (
        <div className='flex items-center gap-2 rounded-lg border p-3'>
          <code className='flex-1 font-mono text-sm break-all'>
            {redemption.data.key}
          </code>
          <CopyButton
            value={redemption.data.key}
            aria-label={t('Copy redemption code')}
          />
        </div>
      )}
    </Dialog>
  )
}
