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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTablePage, useDataTable } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency } from '@/lib/currency'

import {
  getAdminWithdrawals,
  setWithdrawalStatus,
  type Withdrawal,
  type WithdrawalStatus,
} from './api'
import { useAdminWithdrawalColumns } from './components/admin-withdrawal-columns'
import { CollectionQrPreview } from './components/collection-qr-preview'

const route = getRouteApi('/_authenticated/admin-withdrawals/')

export function AdminWithdrawalPage() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const client = useQueryClient()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [preview, setPreview] = useState<Withdrawal | null>(null)
  const [confirmation, setConfirmation] = useState<{
    row: Withdrawal
    status: WithdrawalStatus
  } | null>(null)
  const {
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate,
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: false },
    columnFilters: [{ columnId: 'status', searchKey: 'status', type: 'array' }],
  })
  const filters = {
    p: pagination.pageIndex + 1,
    page_size: pagination.pageSize,
    keyword: search.keyword ?? '',
    status:
      (
        columnFilters.find((filter) => filter.id === 'status')?.value as
          | WithdrawalStatus[]
          | undefined
      )?.[0] ?? '',
  } as const
  const applications = useQuery({
    queryKey: ['admin-withdrawals', filters],
    queryFn: ({ signal }) => getAdminWithdrawals(filters, signal),
    placeholderData: (previous) => previous,
    meta: { errorToast: false },
  })
  const update = useMutation({
    mutationFn: (input: { row: Withdrawal; status: WithdrawalStatus }) =>
      setWithdrawalStatus(input.row.id, input.status),
    onSuccess: async () => {
      setConfirmation(null)
      toast.success(t('Withdrawal status updated'))
      await client.invalidateQueries({ queryKey: ['admin-withdrawals'] })
    },
  })
  const actions = useMemo(
    () => ({
      pending: update.isPending,
      onPreview: setPreview,
      onStatus: (row: Withdrawal, status: WithdrawalStatus) =>
        setConfirmation({ row, status }),
    }),
    [update.isPending]
  )
  const columns = useAdminWithdrawalColumns(actions)
  const { table } = useDataTable({
    data: applications.data?.items ?? [],
    columns,
    columnFilters,
    pagination,
    onColumnFiltersChange,
    onPaginationChange,
    ensurePageInRange,
    manualFiltering: true,
    manualPagination: true,
    totalCount: applications.data?.total ?? 0,
    getRowId: (row) => String(row.id),
  })
  const changeKeyword = (keyword: string) =>
    navigate({
      search: (previous) => ({
        ...previous,
        page: undefined,
        keyword: keyword.trim() || undefined,
      }),
    })

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Withdrawal management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          {applications.isError ? (
            <ErrorState
              title={t('Failed to load withdrawals')}
              onRetry={() => void applications.refetch()}
            />
          ) : (
            <DataTablePage
              table={table}
              columns={columns}
              isLoading={applications.isLoading}
              isFetching={applications.isFetching}
              emptyTitle={t('No withdrawal applications')}
              emptyDescription={t('No withdrawals match the current search.')}
              skeletonKeyPrefix='admin-withdrawals'
              toolbarProps={{
                customSearch: (
                  <form
                    key={search.keyword ?? ''}
                    className='flex gap-2'
                    onSubmit={(event) => {
                      event.preventDefault()
                      const value = new FormData(event.currentTarget).get(
                        'keyword'
                      )
                      void changeKeyword(typeof value === 'string' ? value : '')
                    }}
                  >
                    <Input
                      name='keyword'
                      aria-label={t('Search withdrawals by user')}
                      placeholder={t('Search withdrawals by user')}
                      defaultValue={search.keyword ?? ''}
                    />
                    <Button type='submit' variant='outline'>
                      {t('Search')}
                    </Button>
                  </form>
                ),
                filters: [
                  {
                    columnId: 'status',
                    title: t('Status'),
                    singleSelect: true,
                    options: [
                      { value: 'pending', label: t('Awaiting withdrawal') },
                      { value: 'completed', label: t('Withdrawal completed') },
                    ],
                  },
                ],
                hasAdditionalFilters: !!search.keyword,
                onReset: () => void changeKeyword(''),
                hideViewOptions: true,
              }}
            />
          )}
        </SectionPageLayout.Content>
      </SectionPageLayout>
      {preview ? (
        <Dialog
          open
          title={t('Collection QR code snapshot')}
          description={`${preview.username} · ${formatQuotaWithCurrency(preview.quota, { abbreviate: false, digitsLarge: 8, digitsSmall: 12, locale }, preview.currency_snapshot)}`}
          contentClassName='sm:max-w-md'
          onOpenChange={(open) => {
            if (!open) setPreview(null)
          }}
          footer={
            <Button variant='outline' onClick={() => setPreview(null)}>
              {t('Close')}
            </Button>
          }
        >
          <CollectionQrPreview
            path={`/api/withdrawal/admin/${preview.id}/qr`}
            revision={preview.id}
          />
        </Dialog>
      ) : null}
      {confirmation ? (
        <ConfirmDialog
          open
          title={t('Update withdrawal status')}
          desc={`${confirmation.row.username} · ${confirmation.status === 'completed' ? t('Withdrawal completed') : t('Awaiting withdrawal')}. ${t('This only changes the status. Pay manually before marking a withdrawal completed; changing status never moves money.')}`}
          confirmText={t('Save')}
          isLoading={update.isPending}
          onOpenChange={(open) => {
            if (!open && !update.isPending) setConfirmation(null)
          }}
          handleConfirm={() => {
            if (!update.isPending) update.mutate(confirmation)
          }}
        />
      ) : null}
    </>
  )
}
