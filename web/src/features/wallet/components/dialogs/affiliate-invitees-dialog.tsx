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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CurrencyAmount } from '@/components/currency-display'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAffiliateInvitees } from '@/features/affiliate/api'
import { formatTimestampToDate } from '@/lib/format'

import {
  WalletRecordsDialog,
  type WalletRecordsDialogControl,
} from './wallet-records-dialog'

const PAGE_SIZE = 20

export function AffiliateInviteesDialog(props: WalletRecordsDialogControl) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const records = useQuery({
    queryKey: ['affiliate', 'invitees', page],
    queryFn: () => getAffiliateInvitees(page, PAGE_SIZE),
    enabled: props.open,
    meta: { errorToast: false, redirectOnServerError: false },
  })

  return (
    <WalletRecordsDialog
      {...props}
      records={records}
      title={t('Invited users')}
      emptyTitle={t('No invited users yet')}
      page={page}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      tableClassName='min-w-160'
    >
      <TableHeader>
        <TableRow>
          <TableHead>{t('User')}</TableHead>
          <TableHead>{t('Registered at')}</TableHead>
          <TableHead className='text-right'>{t('Records')}</TableHead>
          <TableHead className='text-right'>{t('Commission')}</TableHead>
          <TableHead>{t('Last reward')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.data?.items?.map((item) => (
          <TableRow key={item.user_id}>
            <TableCell className='max-w-52 min-w-32 wrap-anywhere whitespace-normal'>
              {item.display_name || `#${item.user_id}`}
              <div
                data-table-text='secondary'
                className='text-muted-foreground font-mono'
              >
                {item.masked_email}
              </div>
            </TableCell>
            <TableCell>{formatTimestampToDate(item.registered_at)}</TableCell>
            <TableCell className='text-right'>
              {item.commission_count}
            </TableCell>
            <TableCell className='text-right'>
              <CurrencyAmount amount={item.credited_quota} mode='quota' />
            </TableCell>
            <TableCell>{formatTimestampToDate(item.last_reward_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </WalletRecordsDialog>
  )
}
