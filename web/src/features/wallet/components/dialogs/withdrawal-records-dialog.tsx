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
import { CircleCheck, CircleX, Clock, Loader } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CurrencyAmount } from '@/components/currency-display'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getMyWithdrawals, type Withdrawal } from '@/features/withdrawals/api'
import { useWithdrawalStatusLabels } from '@/features/withdrawals/components/admin-withdrawal-columns'
import { CollectionQrPreview } from '@/features/withdrawals/components/collection-qr-preview'
import { toIntlLocale } from '@/i18n/languages'
import { formatTimestamp } from '@/lib/format'

import {
  WalletRecordsDialog,
  type WalletRecordsDialogControl,
} from './wallet-records-dialog'

const PAGE_SIZE = 10
const statusIcons = {
  pending: Clock,
  processing: Loader,
  completed: CircleCheck,
  rejected: CircleX,
}

export function WithdrawalRecordsDialog(props: WalletRecordsDialogControl) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const statusLabel = useWithdrawalStatusLabels()
  const [page, setPage] = useState(1)
  const [proof, setProof] = useState<Withdrawal | null>(null)
  if (!props.open && proof) setProof(null)
  const records = useQuery({
    queryKey: ['my-withdrawals', page],
    queryFn: ({ signal }) => getMyWithdrawals(page, PAGE_SIZE, signal),
    enabled: props.open,
    placeholderData: (previous) => previous,
    meta: { errorToast: false, redirectOnServerError: false },
  })
  const items = records.data?.items ?? []
  const showRejectReason = items.some((item) => item.status === 'rejected')

  return (
    <WalletRecordsDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) setProof(null)
        props.onOpenChange(open)
      }}
      title={t('Withdrawal records')}
      emptyTitle={t('No withdrawal records yet')}
      records={records}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      contentClassName='sm:max-w-3xl'
      tableClassName='min-w-128'
      detail={
        props.open && proof ? (
          <Dialog
            open
            title={t('Withdrawal proof')}
            contentClassName='sm:max-w-lg'
            onOpenChange={(open) => {
              if (!open) setProof(null)
            }}
            footer={
              <Button variant='outline' onClick={() => setProof(null)}>
                {t('Close')}
              </Button>
            }
          >
            <CollectionQrPreview
              key={proof.id}
              path={`/api/withdrawal/self/${proof.id}/proof`}
              revision={proof.id}
              errorTitle='Failed to load withdrawal proof'
              imageAlt={t('Withdrawal proof')}
              loadingLabel={t('Loading...')}
            />
          </Dialog>
        ) : null
      }
    >
      <TableHeader>
        <TableRow>
          <TableHead>{t('Applied at')}</TableHead>
          <TableHead className='text-right'>{t('Withdrawal amount')}</TableHead>
          <TableHead>{t('Status')}</TableHead>
          {showRejectReason && <TableHead>{t('Rejection reason')}</TableHead>}
          <TableHead className='text-right'>{t('Actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{formatTimestamp(item.created_at)}</TableCell>
            <TableCell className='text-right'>
              <CurrencyAmount
                amount={item.quota}
                options={{
                  abbreviate: false,
                  digitsLarge: 8,
                  digitsSmall: 12,
                  locale,
                }}
                snapshot={item.currency_snapshot}
              />
            </TableCell>
            <TableCell>
              <StatusBadge
                copyable={false}
                className='bg-muted text-foreground'
                icon={statusIcons[item.status]}
                label={statusLabel(item.status)}
              />
            </TableCell>
            {showRejectReason && (
              <TableCell className='text-muted-foreground max-w-64 wrap-anywhere whitespace-pre-wrap'>
                {item.status === 'rejected' && item.reject_reason
                  ? item.reject_reason
                  : '-'}
              </TableCell>
            )}
            <TableCell className='text-right'>
              {item.status === 'completed' && (item.proof_size ?? 0) > 0 ? (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setProof(item)}
                >
                  {t('View proof')}
                </Button>
              ) : (
                '-'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </WalletRecordsDialog>
  )
}
