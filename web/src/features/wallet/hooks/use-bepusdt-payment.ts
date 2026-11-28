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
import i18next from 'i18next'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'

import { isApiSuccess, requestBEpusdtPayment } from '../api'
import { getPaymentErrorTranslation } from '../lib'

function getPaymentUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null
  }
  if ('payment_url' in data && typeof data.payment_url === 'string') {
    return data.payment_url
  }
  return null
}

function isSafeHttpCheckoutUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getErrorMessage(message: string | undefined, data: unknown): string {
  if (typeof data === 'string' && data.trim()) {
    return data
  }
  return (
    (message && message !== 'success' ? message : undefined) ||
    i18next.t('Payment request failed')
  )
}

export function useBEpusdtPayment() {
  const [processing, setProcessing] = useState(false)

  const processBEpusdtPayment = useCallback(
    async (
      topupAmount: number,
      payMethodIndex?: number | null,
      paymentMethod?: string,
      channelId?: string
    ) => {
      setProcessing(true)
      try {
        const response = await requestBEpusdtPayment({
          amount: Math.floor(topupAmount),
          pay_method_index:
            payMethodIndex !== undefined && payMethodIndex !== null
              ? payMethodIndex
              : undefined,
          payment_method: paymentMethod || undefined,
          channel_id: channelId || undefined,
        })

        if (isApiSuccess(response)) {
          const paymentUrl = getPaymentUrl(response.data)
          if (paymentUrl) {
            if (!isSafeHttpCheckoutUrl(paymentUrl)) {
              toast.error(i18next.t('Invalid payment redirect URL'))
              return false
            }
            const popup = window.open(
              paymentUrl,
              '_blank',
              'noopener,noreferrer'
            )
            if (!popup) {
              window.location.href = paymentUrl
            }
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        handleServerError(response, undefined, {
          title:
            getPaymentErrorTranslation(response) ??
            getErrorMessage(response.message, response.data),
        })
        return false
      } catch (error) {
        handleServerError(error, i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return { processing, processBEpusdtPayment }
}
