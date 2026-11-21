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
import type { UseQueryResult } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import { getServerErrorMessage } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

export interface WalletRecordsDialogControl {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface WalletRecordsDialogProps extends WalletRecordsDialogControl {
  title: string
  emptyTitle: string
  records: Pick<
    UseQueryResult<{ items: unknown[]; total: number }>,
    'data' | 'isPending' | 'isError' | 'error' | 'refetch'
  >
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  contentClassName?: string
  tableClassName: string
  children: ReactNode
  detail?: ReactNode
}

export function WalletRecordsDialog(props: WalletRecordsDialogProps) {
  const { t } = useTranslation()
  const { records, page, pageSize } = props
  let body: ReactNode
  let footer: ReactNode
  if (records.isPending) {
    body = (
      <div role='status'>
        <LoadingState />
      </div>
    )
  } else if (records.isError) {
    body = (
      <div role='alert'>
        <ErrorState
          className='min-h-48'
          description={getServerErrorMessage(records.error)}
          onRetry={() => void records.refetch()}
        />
      </div>
    )
  } else if (!records.data?.items?.length) {
    body = <EmptyState className='min-h-48' title={props.emptyTitle} />
  } else {
    const total = records.data.total
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    body = (
      <StaticDataTable
        className='max-w-full overflow-x-auto'
        containerProps={{
          role: 'region',
          'aria-label': props.title,
          tabIndex: 0,
        }}
        tableClassName={props.tableClassName}
        tableProps={{ withContainer: false }}
      >
        {props.children}
      </StaticDataTable>
    )
    footer = (
      <Pagination
        aria-label={t('Page')}
        className='min-w-0 flex-wrap items-center justify-between gap-2'
      >
        <span className='text-muted-foreground text-sm tabular-nums'>
          {t('Showing')} {(page - 1) * pageSize + 1}-
          {Math.min(page * pageSize, total)} {t('of')} {total}
        </span>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('Previous page')}
            disabled={page <= 1}
            onClick={() => props.onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden='true' />
          </Button>
          <span
            className='text-muted-foreground text-sm tabular-nums'
            aria-live='polite'
          >
            {page} / {totalPages}
          </span>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('Next page')}
            disabled={page >= totalPages}
            onClick={() => props.onPageChange(page + 1)}
          >
            <ChevronRight aria-hidden='true' />
          </Button>
        </div>
      </Pagination>
    )
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.title}
      contentClassName={cn(
        'max-h-(--dialog-available-height) max-sm:w-screen max-sm:max-w-none max-sm:rounded-none sm:max-w-4xl',
        props.contentClassName
      )}
      footer={footer}
    >
      {body}
      {props.detail}
    </Dialog>
  )
}
