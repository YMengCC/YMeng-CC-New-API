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
*/
import i18next from 'i18next'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { useIsAdmin } from '@/hooks/use-admin'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getUserBillingHistory,
  getAllBillingHistory,
  completeOrder,
  isApiSuccess,
} from '../api'
import type { BillingHistoryFilters, TopupRecord } from '../types'

interface UseBillingHistoryOptions {
  filters: BillingHistoryFilters
  enabled: boolean
  onFiltersChange: (filters: BillingHistoryFilters) => void
}

export function useBillingHistory(options: UseBillingHistoryOptions) {
  const isAdmin = useIsAdmin()
  const [records, setRecords] = useState<TopupRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [completing, setCompleting] = useState(false)
  const requestIdRef = useRef(0)

  const fetchBillingHistory = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const response = isAdmin
        ? await getAllBillingHistory(options.filters)
        : await getUserBillingHistory(options.filters)
      if (requestId !== requestIdRef.current) return
      if (isApiSuccess(response) && response.data) {
        setRecords(response.data.items || [])
        setTotal(response.data.total || 0)
      } else {
        const failure = new Error(i18next.t('Failed to load billing history'))
        setError(failure)
        setRecords([])
        setTotal(0)
        handleServerError(response, failure.message)
      }
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return
      setError(requestError)
      setRecords([])
      setTotal(0)
      handleServerError(
        requestError,
        i18next.t('Failed to load billing history')
      )
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [isAdmin, options.filters])

  const handleCompleteOrder = useCallback(
    async (tradeNo: string) => {
      if (!isAdmin) {
        toast.error(i18next.t('Admin access required'))
        return false
      }
      setCompleting(true)
      try {
        const response = await completeOrder({ trade_no: tradeNo })
        if (isApiSuccess(response)) {
          toast.success(i18next.t('Order completed successfully'))
          await fetchBillingHistory()
          return true
        }
        handleServerError(response, i18next.t('Failed to complete order'))
        return false
      } catch (requestError) {
        handleServerError(requestError, i18next.t('Failed to complete order'))
        return false
      } finally {
        setCompleting(false)
      }
    },
    [fetchBillingHistory, isAdmin]
  )

  const updateFilters = useCallback(
    (changes: Partial<BillingHistoryFilters>) => {
      options.onFiltersChange({
        ...options.filters,
        ...changes,
        page: changes.page ?? 1,
      })
    },
    [options]
  )

  useEffect(() => {
    if (options.enabled) void fetchBillingHistory()
  }, [fetchBillingHistory, options.enabled])

  return {
    records,
    total,
    page: options.filters.page ?? 1,
    pageSize: options.filters.pageSize ?? 10,
    orderNo: options.filters.orderNo ?? '',
    loading,
    error,
    completing,
    isAdmin,
    handlePageChange: (page: number) => updateFilters({ page }),
    handlePageSizeChange: (pageSize: number) => updateFilters({ pageSize }),
    handleSearch: (orderNo: string) =>
      updateFilters({ orderNo: orderNo || undefined }),
    handleFilterChange: updateFilters,
    handleCompleteOrder,
    refresh: fetchBillingHistory,
  }
}
