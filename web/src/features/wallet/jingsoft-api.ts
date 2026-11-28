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
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

import type {
  ApiResponse,
  JingSoftOrder,
  JingSoftPayRequest,
  JingSoftQuote,
  JingSoftQuoteRequest,
  JingSoftRedemption,
} from './types'

export async function quoteJingSoft(
  request: JingSoftQuoteRequest
): Promise<JingSoftQuote> {
  const { data } = await api.post<ApiResponse<JingSoftQuote>>(
    '/api/user/jingsoft/quote',
    request
  )
  if (data.success !== true || !data.data) throw createServerError(data)
  return data.data
}

export class JingSoftPaymentRejectedError extends Error {
  readonly messageKey?: string

  constructor(response: unknown) {
    const source = createServerError(response)
    super(source.message, { cause: source })
    this.name = 'JingSoftPaymentRejectedError'
    if (
      typeof response === 'object' &&
      response !== null &&
      'message_key' in response
    ) {
      const key = (response as { message_key?: unknown }).message_key
      if (typeof key === 'string') {
        this.messageKey = key
      }
    }
  }
}

export async function payJingSoft(
  request: JingSoftPayRequest
): Promise<JingSoftOrder> {
  const { data } = await api.post<
    ApiResponse<JingSoftOrder> & { message_key?: string }
  >('/api/user/jingsoft/pay', request)
  // Only these failures guarantee that no order was submitted. Other errors may follow creation.
  const precreationRejections = [
    'Invalid JingSoft payment request',
    'Invalid JingSoft platform URL',
    'JingSoft protocol is not verified',
    'JingSoft payments are disabled',
    'JingSoft order encryption key is not configured',
    'JingSoft quote is invalid or expired',
    'JingSoft payment channel is busy, please try again shortly',
    'Too many JingSoft payment requests, please try again shortly',
    'JingSoft single payment cannot exceed ¥{{amount}}',
    'Custom amounts are temporarily unavailable, please select a preset amount',
    'Payment compliance confirmation is required',
  ]
  if (
    data.success === false &&
    data.message_key &&
    precreationRejections.includes(data.message_key)
  ) {
    throw new JingSoftPaymentRejectedError(data)
  }
  if (data.success !== true || !data.data) throw createServerError(data)
  return data.data
}

export async function getJingSoftOrder(
  tradeNo: string
): Promise<JingSoftOrder> {
  const { data } = await api.get<ApiResponse<JingSoftOrder>>(
    `/api/user/jingsoft/orders/${encodeURIComponent(tradeNo)}`
  )
  if (data.success !== true || !data.data) throw createServerError(data)
  return data.data
}

export async function getJingSoftRedemption(
  tradeNo: string
): Promise<JingSoftRedemption> {
  const { data } = await api.get<ApiResponse<JingSoftRedemption>>(
    `/api/user/jingsoft/orders/${encodeURIComponent(tradeNo)}/redemption`
  )
  if (data.success !== true || !data.data) throw createServerError(data)
  return data.data
}

export function safeJingSoftQrCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  if (/^weixin:\/\/wxpay\/bizpayurl\?pr=[A-Za-z0-9_-]+$/.test(value)) {
    return value
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export function isValidJingSoftQuote(
  quote: JingSoftQuote | null,
  amount?: number
): quote is JingSoftQuote {
  return (
    !!quote &&
    typeof quote.quote_id === 'string' &&
    quote.quote_id.length > 0 &&
    Number.isFinite(quote.amount) &&
    quote.amount > 0 &&
    /^[A-Z]{3}$/.test(quote.currency) &&
    Number.isFinite(quote.topup_amount) &&
    quote.topup_amount > 0 &&
    (amount === undefined || quote.topup_amount === amount)
  )
}

export function isValidJingSoftQQ(value: string): boolean {
  return value.length >= 5 && value.length <= 12 && !/[^0-9]/.test(value)
}
