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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getMyWithdrawals, type Withdrawal } from '@/features/withdrawals/api'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestamp } from '@/lib/format'

const PAGE_SIZE = 10

interface WithdrawalRecordsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WithdrawalRecordsDialog(props: WithdrawalRecordsDialogProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [page, setPage] = useState(1)
  const records = useQuery({
    queryKey: ['my-withdrawals', page],
    queryFn: ({ signal }) => getMyWithdrawals(page, PAGE_SIZE, signal),
    enabled: props.open,
    placeholderData: (previous) => previous,
    meta: { errorToast: false },
  })
  const items = records.data?.items ?? []
  const total = records.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const statusLabel = (status: Withdrawal['status']) => {
    const labels = {
      pending: t('Awaiting withdrawal'),
      processing: t('Processing'),
      completed: t('Withdrawal completed'),
      rejected: t('Rejected'),
    }
    return labels[status]
  }
  const statusVariant = (status: Withdrawal['status']) => {
    if (status === 'completed') return 'success' as const
    if (status === 'rejected') return 'danger' as const
    if (status === 'processing') return 'info' as const
    return 'warning' as const
  }

  let body: React.ReactNode
  if (records.isLoading) {
    body = (
      <div className='space-y-2'>
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
        <Skeleton className='h-10 w-full' />
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <p className='text-muted-foreground py-10 text-center text-sm'>
        {t('No withdrawal records yet')}
      </p>
    )
  } else {
    body = null
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Withdrawal records')}
      contentClassName='flex max-h-(--dialog-available-height) flex-col max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-3'
    >
      <div className='min-h-0 space-y-3'>
        {body ?? (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Applied at')}</TableHead>
                  <TableHead className='text-right'>
                    {t('Withdrawal amount')}
                  </TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Rejection reason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className='text-xs whitespace-nowrap'>
                      {formatTimestamp(item.created_at)}
                    </TableCell>
                    <TableCell className='text-right text-xs font-medium tabular-nums'>
                      {formatQuotaWithCurrency(
                        item.quota,
                        {
                          abbreviate: false,
                          digitsLarge: 8,
                          digitsSmall: 12,
                          locale,
                        },
                        item.currency_snapshot
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        copyable={false}
                        variant={statusVariant(item.status)}
                        label={statusLabel(item.status)}
                      />
                    </TableCell>
                    <TableCell className='text-muted-foreground max-w-64 text-xs wrap-anywhere whitespace-pre-wrap'>
                      {item.status === 'rejected' && item.reject_reason
                        ? item.reject_reason
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {items.length > 0 ? (
          <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:justify-between'>
            <div className='text-muted-foreground text-xs sm:text-sm'>
              {t('Showing')} {(page - 1) * PAGE_SIZE + 1}-
              {Math.min(page * PAGE_SIZE, total)} {t('of')} {total}
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                className='h-8 w-8 p-0'
                aria-label={t('Previous page')}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                <span className='font-medium'>{page}</span>
                <span>/</span>
                <span>{totalPages}</span>
              </div>
              <Button
                variant='outline'
                size='sm'
                className='h-8 w-8 p-0'
                aria-label={t('Next page')}
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
