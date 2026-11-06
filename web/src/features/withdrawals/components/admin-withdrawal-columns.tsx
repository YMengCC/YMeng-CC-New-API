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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { TruncatedCell } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { formatTimestamp } from '@/lib/format'

import type { Withdrawal, WithdrawalStatus } from '../api'

interface WithdrawalActions {
  pending: boolean
  onPreview: (row: Withdrawal) => void
  onStatus: (row: Withdrawal, status: WithdrawalStatus) => void
}

export function useAdminWithdrawalColumns(
  actions: WithdrawalActions
): ColumnDef<Withdrawal>[] {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
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
          <StatusBadge
            copyable={false}
            variant={
              row.original.status === 'completed' ? 'success' : 'warning'
            }
            label={
              row.original.status === 'completed'
                ? t('Withdrawal completed')
                : t('Awaiting withdrawal')
            }
          />
        ),
      },
      {
        id: 'actions',
        header: t('Actions'),
        cell: ({ row }) => (
          <div className='flex flex-wrap justify-end gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => actions.onPreview(row.original)}
            >
              {t('View collection QR code')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={actions.pending || row.original.status === 'pending'}
              onClick={() => actions.onStatus(row.original, 'pending')}
            >
              {t('Mark as awaiting withdrawal')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={actions.pending || row.original.status === 'completed'}
              onClick={() => actions.onStatus(row.original, 'completed')}
            >
              {t('Mark withdrawal completed')}
            </Button>
          </div>
        ),
      },
    ],
    [actions, locale, t]
  )
}
