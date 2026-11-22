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
import { Search, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CurrencyAmount } from '@/components/currency-display'
import { DatePicker } from '@/components/date-picker'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import dayjs from '@/lib/dayjs'
import { formatNumber } from '@/lib/format'

import { useBillingHistory } from '../../hooks/use-billing-history'
import {
  getStatusConfig,
  getPaymentMethodName,
  formatTimestamp,
} from '../../lib/billing'
import type { BillingHistoryFilters, TopupStatus } from '../../types'
import { CatfkRedemptionDialog } from './catfk-redemption-dialog'

// These providers store the credited wallet quota rather than a USD amount.
const quotaAmountProviders = new Set(['catfk', 'redemption'])
const defaultBillingHistoryFilters: BillingHistoryFilters = {
  page: 1,
  pageSize: 10,
}
const noopFiltersChange = () => {}

interface BillingHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters?: BillingHistoryFilters
  onFiltersChange?: (filters: BillingHistoryFilters) => void
}

export function BillingHistoryDialog(props: BillingHistoryDialogProps) {
  const { t } = useTranslation()
  const filters = props.filters ?? defaultBillingHistoryFilters
  const onFiltersChange = props.onFiltersChange ?? noopFiltersChange
  const {
    records,
    total,
    page,
    pageSize,
    orderNo,
    loading,
    error,
    completing,
    isAdmin,
    handlePageChange,
    handlePageSizeChange,
    handleSearch,
    handleFilterChange,
    handleCompleteOrder,
    refresh,
  } = useBillingHistory({
    filters,
    enabled: props.open,
    onFiltersChange,
  })

  const [confirmTradeNo, setConfirmTradeNo] = useState<string | null>(null)
  const [redemptionTradeNo, setRedemptionTradeNo] = useState<string | null>(
    null
  )
  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const hasFilters = Boolean(
    filters.orderType ||
    filters.status ||
    filters.startDate ||
    filters.endDate ||
    filters.orderNo
  )
  const clearFilters = () =>
    onFiltersChange({ page: 1, pageSize: filters.pageSize })
  const handleDateChange = (key: 'startDate' | 'endDate', date?: Date) => {
    const value = date ? dayjs(date).format('YYYY-MM-DD') : undefined
    const next = { ...filters, [key]: value, page: 1 }
    if (
      next.startDate &&
      next.endDate &&
      dayjs(next.startDate).isAfter(dayjs(next.endDate), 'day')
    ) {
      toast.error(t('Start date must be before end date'))
      return
    }
    handleFilterChange(next)
  }

  const handleConfirmComplete = async () => {
    if (confirmTradeNo) {
      const success = await handleCompleteOrder(confirmTradeNo)
      if (success) {
        setConfirmTradeNo(null)
      }
    }
  }

  return (
    <>
      <Dialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        title={t('Billing History')}
        description={t(
          'View your topup transaction records and payment history'
        )}
        contentClassName='flex max-h-(--dialog-available-height) flex-col max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:p-4 sm:max-w-4xl'
        contentHeight='auto'
        bodyClassName='space-y-3'
      >
        <div className='min-h-0 space-y-3'>
          {/* Search and Filter Bar */}
          <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='relative sm:col-span-2'>
              <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
              <Input
                aria-label={t('Order number')}
                placeholder={t('Search by order number...')}
                value={orderNo}
                onChange={(e) => handleSearch(e.target.value)}
                className='h-9 pl-10'
              />
            </div>
            <Select
              items={[
                { value: 'all', label: t('All order types') },
                ...[
                  'alipay',
                  'wxpay',
                  'stripe',
                  'creem',
                  'waffo',
                  'waffo_pancake',
                  'catfk',
                  'catfk_alipay',
                  'catfk_wxpay',
                  'redemption',
                ].map((value) => ({
                  value,
                  label: getPaymentMethodName(value, t),
                })),
              ]}
              value={filters.orderType ?? 'all'}
              onValueChange={(value) =>
                handleFilterChange({
                  orderType: value === 'all' ? undefined : (value ?? undefined),
                })
              }
            >
              <SelectTrigger className='h-9'>
                <SelectValue placeholder={t('Payment Method')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='all'>{t('All order types')}</SelectItem>
                  {[
                    'alipay',
                    'wxpay',
                    'stripe',
                    'creem',
                    'waffo',
                    'waffo_pancake',
                    'catfk',
                    'catfk_alipay',
                    'catfk_wxpay',
                    'redemption',
                  ].map((value) => (
                    <SelectItem key={value} value={value}>
                      {getPaymentMethodName(value, t)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: 'all', label: t('All statuses') },
                { value: 'pending', label: t('Pending') },
                { value: 'success', label: t('Success') },
                { value: 'failed', label: t('Failed') },
                { value: 'expired', label: t('Expired') },
              ]}
              value={filters.status ?? 'all'}
              onValueChange={(value) =>
                handleFilterChange({
                  status: value === 'all' ? undefined : (value as TopupStatus),
                })
              }
            >
              <SelectTrigger className='h-9'>
                <SelectValue placeholder={t('Status')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='all'>{t('All statuses')}</SelectItem>
                  <SelectItem value='pending'>{t('Pending')}</SelectItem>
                  <SelectItem value='success'>{t('Success')}</SelectItem>
                  <SelectItem value='failed'>{t('Failed')}</SelectItem>
                  <SelectItem value='expired'>{t('Expired')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <DatePicker
              selected={
                filters.startDate
                  ? dayjs(filters.startDate).toDate()
                  : undefined
              }
              onSelect={(date) => handleDateChange('startDate', date)}
              placeholder={t('Start date')}
            />
            <DatePicker
              selected={
                filters.endDate ? dayjs(filters.endDate).toDate() : undefined
              }
              onSelect={(date) => handleDateChange('endDate', date)}
              placeholder={t('End date')}
            />
            {hasFilters && (
              <Button variant='outline' className='h-9' onClick={clearFilters}>
                {t('Reset')}
              </Button>
            )}
            <Select
              items={[
                { value: '10', label: t('10 / page') },
                { value: '20', label: t('20 / page') },
                { value: '50', label: t('50 / page') },
                { value: '100', label: t('100 / page') },
              ]}
              value={pageSize.toString()}
              onValueChange={(value) =>
                value !== null && handlePageSizeChange(Number.parseInt(value))
              }
            >
              <SelectTrigger className='h-9 w-[92px] sm:w-32'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  <SelectItem value='10'>{t('10 / page')}</SelectItem>
                  <SelectItem value='20'>{t('20 / page')}</SelectItem>
                  <SelectItem value='50'>{t('50 / page')}</SelectItem>
                  <SelectItem value='100'>{t('100 / page')}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {/* Records List */}
          <div className='max-h-[min(54vh,520px)] overflow-y-auto pr-1'>
            {loading && (
              <div className='space-y-3'>
                {['first', 'second', 'third', 'fourth', 'fifth'].map(
                  (placeholder) => (
                    <div
                      key={placeholder}
                      className='rounded-lg border p-3 sm:p-4'
                    >
                      <div className='flex items-start justify-between'>
                        <div className='flex-1 space-y-2'>
                          <Skeleton className='h-4 w-48' />
                          <Skeleton className='h-3 w-32' />
                        </div>
                        <Skeleton className='h-5 w-16' />
                      </div>
                      <div className='mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
                        <Skeleton className='h-3 w-full' />
                        <Skeleton className='h-3 w-full' />
                        <Skeleton className='h-3 w-full' />
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
            {!loading && error != null && (
              <ErrorState
                className='min-h-40'
                description={t('Failed to load billing history')}
                onRetry={() => void refresh()}
              />
            )}
            {!loading && !error && records.length === 0 && (
              <EmptyState
                className='min-h-40'
                title={t('No billing records found')}
                description={
                  hasFilters
                    ? t('Try adjusting your search')
                    : t('Your transaction history will appear here')
                }
                action={
                  hasFilters ? (
                    <Button variant='outline' onClick={clearFilters}>
                      {t('Clear filters')}
                    </Button>
                  ) : undefined
                }
              />
            )}
            {!loading && records.length > 0 && (
              <div className='space-y-3'>
                {records.map((record) => {
                  const statusConfig = getStatusConfig(record.status)
                  return (
                    <div
                      key={record.id}
                      className='rounded-lg border p-3 sm:p-4'
                    >
                      {/* Header Row */}
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex-1 space-y-1'>
                          <div className='flex min-w-0 items-center gap-2'>
                            <code className='text-foreground truncate font-mono text-sm'>
                              {record.trade_no}
                            </code>
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-5 w-5 p-0'
                              onClick={() => copyToClipboard(record.trade_no)}
                            >
                              {copiedText === record.trade_no ? (
                                <Check className='h-3 w-3' />
                              ) : (
                                <Copy className='h-3 w-3' />
                              )}
                            </Button>
                            {isAdmin && record.user_id != null && (
                              <StatusBadge
                                label={`${t('User ID')}: ${record.user_id}`}
                                variant='neutral'
                                size='sm'
                                copyText={String(record.user_id)}
                              />
                            )}
                          </div>
                          <div className='text-muted-foreground text-xs'>
                            {formatTimestamp(record.create_time)}
                          </div>
                        </div>
                        <StatusBadge
                          label={t(statusConfig.label)}
                          variant={statusConfig.variant}
                          showDot
                          copyable={false}
                        />
                      </div>

                      {/* Details Grid */}
                      <div className='mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4'>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Payment Method')}
                          </Label>
                          <div className='text-sm font-medium'>
                            {getPaymentMethodName(record.payment_method, t)}
                          </div>
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Amount')}
                          </Label>
                          <div className='text-sm font-semibold'>
                            <CurrencyAmount
                              amount={record.amount}
                              mode={
                                quotaAmountProviders.has(
                                  record.payment_provider ?? ''
                                )
                                  ? 'quota'
                                  : 'usd'
                              }
                              options={{
                                digitsLarge: 2,
                                digitsSmall: 2,
                                abbreviate: false,
                              }}
                            />
                          </div>
                        </div>
                        <div className='space-y-1'>
                          <Label className='text-muted-foreground text-xs'>
                            {t('Payment')}
                          </Label>
                          <div className='text-sm font-semibold text-red-600'>
                            {record.payment_provider === 'redemption'
                              ? '-'
                              : formatNumber(record.money)}
                          </div>
                        </div>
                      </div>

                      {record.payment_provider === 'catfk' && (
                        <div className='mt-3 flex justify-end'>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() =>
                              setRedemptionTradeNo(record.trade_no)
                            }
                          >
                            {t('View redemption code')}
                          </Button>
                        </div>
                      )}

                      {/* Admin Actions */}
                      {isAdmin &&
                        record.payment_provider !== 'catfk' &&
                        record.status === 'pending' && (
                          <div className='mt-4 flex justify-end'>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => setConfirmTradeNo(record.trade_no)}
                              disabled={completing}
                            >
                              {t('Complete Order')}
                            </Button>
                          </div>
                        )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {!loading && !error && records.length > 0 && (
            <div className='flex flex-col items-center gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='text-muted-foreground text-xs sm:text-sm'>
                {t('Showing')} {(page - 1) * pageSize + 1}-
                {Math.min(page * pageSize, total)} {t('of')} {total}
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className='h-8 w-8 p-0'
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
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className='h-8 w-8 p-0'
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {redemptionTradeNo && (
        <CatfkRedemptionDialog
          tradeNo={redemptionTradeNo}
          onOpenChange={(next) => {
            if (!next) setRedemptionTradeNo(null)
          }}
        />
      )}

      {/* Confirm Complete Order Dialog */}
      <AlertDialog
        open={!!confirmTradeNo}
        onOpenChange={(open) => !open && setConfirmTradeNo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Complete Order')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Are you sure you want to manually complete this order? The user will be credited with the corresponding quota.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmComplete}
              disabled={completing}
            >
              {completing ? t('Processing...') : t('Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
