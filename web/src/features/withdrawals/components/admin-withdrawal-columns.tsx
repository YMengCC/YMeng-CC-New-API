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
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, ImageUp, XCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { TruncatedCell } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestamp } from '@/lib/format'

import type { Withdrawal, WithdrawalStatus } from '../api'

interface WithdrawalActions {
  pendingId?: number
  pendingAction?: 'processing' | 'proof'
  onPreview: (row: Withdrawal) => void
  onProof: (row: Withdrawal) => void
  onProcessing: (row: Withdrawal) => void
  onUpload: (row: Withdrawal, file?: File) => void
  onReject: (row: Withdrawal) => void
}

export function withdrawalStatusVariant(status: WithdrawalStatus) {
  if (status === 'completed') return 'success' as const
  if (status === 'rejected') return 'danger' as const
  if (status === 'processing') return 'info' as const
  return 'warning' as const
}

export function useWithdrawalStatusLabels() {
  const { t } = useTranslation()
  return (status: WithdrawalStatus) => {
    const labels: Record<WithdrawalStatus, string> = {
      pending: t('Awaiting withdrawal'),
      processing: t('Processing'),
      completed: t('Withdrawal completed'),
      rejected: t('Rejected'),
    }
    return labels[status]
  }
}

export function useAdminWithdrawalColumns(
  actions: WithdrawalActions
): ColumnDef<Withdrawal>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const label = useWithdrawalStatusLabels()
  return useMemo(
    () => [
      {
        id: 'user',
        header: t('User'),
        meta: { mobileTitle: true },
        cell: ({ row }) => (
          <div>
            <TruncatedCell className='max-w-48 font-medium' tabIndex={0}>
              {row.original.username || '-'}
            </TruncatedCell>
            <p className='text-muted-foreground text-xs'>
              ID: {row.original.user_id}
            </p>
          </div>
        ),
      },
      {
        id: 'quota',
        header: t('Withdrawal amount'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatQuotaWithCurrency(
              row.original.quota,
              { abbreviate: false, digitsLarge: 8, digitsSmall: 12, locale },
              row.original.currency_snapshot
            )}
          </span>
        ),
      },
      {
        id: 'created_at',
        header: t('Applied at'),
        cell: ({ row }) => formatTimestamp(row.original.created_at),
      },
      {
        id: 'updated_at',
        header: t('Updated at'),
        cell: ({ row }) => (
          <div>
            <p>{formatTimestamp(row.original.updated_at)}</p>
            <p className='text-muted-foreground text-xs'>
              {t('Updated by')}: {row.original.updated_by || '-'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        id: 'status',
        header: t('Status'),
        meta: { mobileBadge: true },
        cell: ({ row }) => (
          <div className='space-y-1'>
            <StatusBadge
              copyable={false}
              variant={withdrawalStatusVariant(row.original.status)}
              label={label(row.original.status)}
            />
            {row.original.status === 'rejected' &&
            row.original.reject_reason ? (
              <p className='text-muted-foreground max-w-64 text-xs wrap-anywhere whitespace-pre-wrap'>
                {row.original.reject_reason}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => {
          const application = row.original
          const pendingProcessing =
            actions.pendingId === application.id &&
            actions.pendingAction === 'processing'
          const pendingProof =
            actions.pendingId === application.id &&
            actions.pendingAction === 'proof'
          return (
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                size='sm'
                variant='outline'
                onClick={() => actions.onPreview(application)}
              >
                <Eye data-icon='inline-start' aria-hidden='true' />
                {t('Current collection QR code')}
              </Button>
              {application.status === 'pending' ? (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={pendingProcessing}
                  onClick={() => actions.onProcessing(application)}
                >
                  {t('Start processing')}
                </Button>
              ) : null}
              {application.status === 'processing' ? (
                <label className='inline-flex'>
                  <Input
                    type='file'
                    accept='image/jpeg,image/png,image/webp'
                    className='sr-only'
                    disabled={pendingProof}
                    onChange={(event) => {
                      actions.onUpload(application, event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                  <Button
                    size='sm'
                    variant='outline'
                    render={<span />}
                    nativeButton={false}
                    disabled={pendingProof}
                  >
                    <ImageUp data-icon='inline-start' aria-hidden='true' />
                    {pendingProof ? t('Uploading...') : t('Upload proof')}
                  </Button>
                </label>
              ) : null}
              {application.status === 'completed' && application.proof_size ? (
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => actions.onProof(application)}
                >
                  <Eye data-icon='inline-start' aria-hidden='true' />
                  {t('View proof')}
                </Button>
              ) : null}
              {application.status === 'pending' ||
              application.status === 'processing' ? (
                <Button
                  size='sm'
                  variant='destructive'
                  onClick={() => actions.onReject(application)}
                >
                  <XCircle data-icon='inline-start' aria-hidden='true' />
                  {t('Reject')}
                </Button>
              ) : null}
            </div>
          )
        },
      },
    ],
    [actions, label, locale, t]
  )
}
