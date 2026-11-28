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
import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { handleServerError } from '@/lib/handle-server-error'

import {
  JingSoftPaymentRejectedError,
  getJingSoftOrder,
  isValidJingSoftQQ,
  isValidJingSoftQuote,
  payJingSoft,
  quoteJingSoft,
  safeJingSoftQrCode,
} from '../jingsoft-api'
import type {
  JingSoftChannel,
  JingSoftInfo,
  JingSoftPaymentStatusOrder,
  JingSoftProduct,
  JingSoftQuote,
} from '../types'

const finalStatuses = new Set(['completed', 'expired', 'needs_attention'])
const QUOTE_CACHE_TTL_MS = 30_000

type CachedJingSoftQuote = {
  promise: Promise<JingSoftQuote>
  quote?: JingSoftQuote
  expiresAt: number
}

function buildQuoteCacheKey(request: {
  product_id?: string
  amount?: number
  channel_id: string
}): string {
  if (request.product_id) {
    return `p:${request.product_id}:${request.channel_id}`
  }
  return `d:${request.amount ?? 0}:${request.channel_id}`
}

// For the user an order lasts only while its payment dialog is open. Closing
// the dialog ends it; the server keeps settling or expiring the real order,
// and a later purchase always creates a new one. An unpaid order costs
// nothing, so no local record guards against creating another.
export function useJingSoftPayment(
  info: JingSoftInfo | undefined,
  userId?: number,
  onCompleted?: () => Promise<void>,
  onModeFallback?: () => Promise<void> | void,
  pricingSignature?: string
) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<JingSoftChannel | null>(null)
  const [product, setProduct] = useState<JingSoftProduct | null>(null)
  const [directAmount, setDirectAmount] = useState<number | null>(null)
  const [quote, setQuote] = useState<JingSoftQuote | null>(null)
  const [qq, setQQ] = useState('')
  const [open, setOpen] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [statusOrder, setStatusOrder] =
    useState<JingSoftPaymentStatusOrder | null>(null)
  const generation = useRef(0)
  const identity = useRef(userId)
  identity.current = userId
  const inFlight = useRef(false)
  // One key per confirmation, so retrying a lost response reuses its order.
  const requestKey = useRef<string | null>(null)
  const creditedTrade = useRef<string | null>(null)
  const quoteCache = useRef(new Map<string, CachedJingSoftQuote>())
  const payMutation = useMutation({
    mutationFn: payJingSoft,
    meta: { errorToast: false },
    retry: false,
  })

  useEffect(() => {
    generation.current++
    inFlight.current = false
    requestKey.current = null
    quoteCache.current.clear()
    setChannel(null)
    setProduct(null)
    setDirectAmount(null)
    setQuote(null)
    setQQ('')
    setOpen(false)
    setCalculating(false)
    setStatusOrder(null)
  }, [userId])

  useEffect(() => {
    quoteCache.current.clear()
  }, [info?.mode, info?.configured_mode, pricingSignature])

  const loadCachedOrFetchQuote = useCallback(
    (
      payload: { product_id?: string; amount?: number; channel_id: string },
      expectedAmount?: number
    ): { immediate?: JingSoftQuote; promise: Promise<JingSoftQuote> } => {
      const cacheKey = buildQuoteCacheKey(payload)
      const now = Date.now()
      const existing = quoteCache.current.get(cacheKey)
      if (existing && now < existing.expiresAt) {
        if (
          existing.quote &&
          isValidJingSoftQuote(existing.quote, expectedAmount)
        ) {
          return { immediate: existing.quote, promise: existing.promise }
        }
        return { promise: existing.promise }
      }
      const accountSnapshot = identity.current
      const promise = quoteJingSoft(payload)
        .then((result) => {
          if (!isValidJingSoftQuote(result, expectedAmount)) {
            quoteCache.current.delete(cacheKey)
            throw new Error(t('Invalid payment quote'))
          }
          const current = quoteCache.current.get(cacheKey)
          if (
            current?.promise === promise &&
            identity.current === accountSnapshot
          ) {
            current.quote = result
            current.expiresAt = Date.now() + QUOTE_CACHE_TTL_MS
          }
          return result
        })
        .catch((error: unknown) => {
          const current = quoteCache.current.get(cacheKey)
          if (current?.promise === promise) {
            quoteCache.current.delete(cacheKey)
          }
          throw error
        })
      quoteCache.current.set(cacheKey, {
        promise,
        expiresAt: now + QUOTE_CACHE_TTL_MS,
      })
      return { promise }
    },
    [t]
  )

  const prefetchQuote = useCallback(
    (
      target: { product?: JingSoftProduct; directAmount?: number },
      targetChannel: JingSoftChannel
    ) => {
      if (
        !userId ||
        !targetChannel?.id ||
        !info?.enabled ||
        !info.available
      ) {
        return
      }
      if (
        target.directAmount !== undefined &&
        Number.isFinite(target.directAmount) &&
        target.directAmount > 0
      ) {
        void loadCachedOrFetchQuote({
          amount: target.directAmount,
          channel_id: targetChannel.id,
        }).promise.catch(() => undefined)
        return
      }
      if (target.product) {
        void loadCachedOrFetchQuote(
          {
            product_id: target.product.id,
            channel_id: targetChannel.id,
          },
          target.product.amount
        ).promise.catch(() => undefined)
      }
    },
    [userId, info?.enabled, info?.available, loadCachedOrFetchQuote]
  )

  function reset() {
    if (inFlight.current) return
    generation.current++
    setOpen(false)
    setQQ('')
    setQuote(null)
    setCalculating(false)
    requestKey.current = null
  }

  function selectChannel(next: JingSoftChannel | null) {
    if (inFlight.current) return
    reset()
    setChannel(next)
    setProduct(null)
    setDirectAmount(null)
  }

  async function selectProduct(
    next: JingSoftProduct,
    selectedChannel = channel
  ) {
    if (inFlight.current) return
    reset()
    setStatusOrder(null)
    setChannel(selectedChannel)
    setProduct(next)
    setDirectAmount(null)
    if (!userId || !selectedChannel || !info?.enabled || !info.available) return
    const cached = loadCachedOrFetchQuote(
      {
        product_id: next.id,
        channel_id: selectedChannel.id,
      },
      next.amount
    )
    if (cached.immediate) {
      setQuote(cached.immediate)
      setCalculating(false)
      setOpen(true)
      return
    }
    const version = generation.current
    setOpen(true)
    setCalculating(true)
    try {
      const result = await cached.promise
      if (version !== generation.current || identity.current !== userId) return
      setQuote(result)
    } catch (error) {
      if (version === generation.current && identity.current === userId) {
        handleServerError(error, t('Payment request failed'))
      }
    } finally {
      if (version === generation.current && identity.current === userId) {
        setCalculating(false)
      }
    }
  }

  async function selectDirectAmount(
    amount: number,
    selectedChannel = channel
  ) {
    if (inFlight.current || !Number.isFinite(amount) || amount <= 0) return
    reset()
    setStatusOrder(null)
    setChannel(selectedChannel)
    setProduct(null)
    setDirectAmount(amount)
    if (!userId || !selectedChannel || !info?.enabled || !info.available) return
    const cached = loadCachedOrFetchQuote({
      amount,
      channel_id: selectedChannel.id,
    })
    if (cached.immediate) {
      if (cached.immediate.mode === 'redemption' && cached.immediate.product_id) {
        setProduct({
          id: cached.immediate.product_id,
          name: cached.immediate.product_id,
          amount: cached.immediate.topup_amount,
        })
        void onModeFallback?.()
      }
      setQuote(cached.immediate)
      setCalculating(false)
      setOpen(true)
      return
    }
    const version = generation.current
    setOpen(true)
    setCalculating(true)
    try {
      const result = await cached.promise
      if (version !== generation.current || identity.current !== userId) return
      if (result.mode === 'redemption' && result.product_id) {
        setProduct({
          id: result.product_id,
          name: result.product_id,
          amount: result.topup_amount,
        })
        void onModeFallback?.()
      }
      setQuote(result)
    } catch (error) {
      if (version === generation.current && identity.current === userId) {
        setOpen(false)
        void onModeFallback?.()
        handleServerError(error, t('Payment request failed'))
      }
    } finally {
      if (version === generation.current && identity.current === userId) {
        setCalculating(false)
      }
    }
  }

  async function confirm() {
    if (
      inFlight.current ||
      !userId ||
      !open ||
      !info?.enabled ||
      !info.available ||
      !channel
    ) {
      return
    }
    const confirmDirect = (quote?.mode ?? info.mode) === 'direct'
    const fallbackProductId = quote?.product_id || product?.id
    const expectedRedemptionAmount = product?.amount ?? quote?.topup_amount
    if (confirmDirect) {
      if (
        directAmount === null ||
        directAmount <= 0 ||
        !isValidJingSoftQuote(quote)
      ) {
        return
      }
    } else if (
      !fallbackProductId ||
      !isValidJingSoftQQ(qq) ||
      !isValidJingSoftQuote(quote, expectedRedemptionAmount)
    ) {
      return
    }
    const version = generation.current
    requestKey.current ??= crypto.randomUUID()
    inFlight.current = true
    quoteCache.current.delete(
      buildQuoteCacheKey(
        confirmDirect
          ? { amount: directAmount ?? 0, channel_id: channel.id }
          : { product_id: fallbackProductId, channel_id: channel.id }
      )
    )
    try {
      const order = await payMutation.mutateAsync(
        confirmDirect
          ? {
              amount: directAmount ?? undefined,
              channel_id: channel.id,
              quote_id: quote.quote_id,
              qq: '',
              idempotency_key: requestKey.current,
            }
          : {
              product_id: fallbackProductId,
              channel_id: channel.id,
              quote_id: quote.quote_id,
              qq,
              idempotency_key: requestKey.current,
            }
      )
      if (version !== generation.current || identity.current !== userId) return
      if (
        typeof order.trade_no !== 'string' ||
        !order.trade_no ||
        typeof order.status !== 'string'
      ) {
        throw new Error(t('Invalid payment response'))
      }
      setStatusOrder({
        tradeNo: order.trade_no,
        amount: quote.topup_amount,
        status: order.status,
        channelName: channel.name,
        paymentMethod: order.payment_method,
        paymentQrCode:
          order.status === 'pending'
            ? safeJingSoftQrCode(order.payment_qr_code)
            : null,
        payment: {
          amount: quote.amount,
          fee: quote.fee,
          fee_rate: quote.fee_rate,
        },
      })
      inFlight.current = false
      reset()
    } catch (error) {
      if (error instanceof JingSoftPaymentRejectedError) {
        requestKey.current = null
      }
      if (version === generation.current && identity.current === userId) {
        handleServerError(error, t('Payment request failed'))
        if (
          error instanceof JingSoftPaymentRejectedError &&
          error.messageKey === 'JingSoft quote is invalid or expired'
        ) {
          inFlight.current = false
          setQuote(null)
          setCalculating(true)
          const refreshed = confirmDirect
            ? loadCachedOrFetchQuote({
                amount: directAmount ?? 0,
                channel_id: channel.id,
              })
            : loadCachedOrFetchQuote(
                {
                  product_id: fallbackProductId,
                  channel_id: channel.id,
                },
                expectedRedemptionAmount
              )
          try {
            const nextQuote = await refreshed.promise
            if (version !== generation.current || identity.current !== userId) {
              return
            }
            if (
              confirmDirect &&
              nextQuote.mode === 'redemption' &&
              nextQuote.product_id
            ) {
              setProduct({
                id: nextQuote.product_id,
                name: nextQuote.product_id,
                amount: nextQuote.topup_amount,
              })
              void onModeFallback?.()
            }
            setQuote(nextQuote)
          } catch {
            if (
              version === generation.current &&
              identity.current === userId &&
              confirmDirect
            ) {
              setOpen(false)
              void onModeFallback?.()
            }
          } finally {
            if (version === generation.current && identity.current === userId) {
              setCalculating(false)
            }
          }
        }
      }
    } finally {
      if (version === generation.current && identity.current === userId) {
        inFlight.current = false
      }
    }
  }

  const closeStatus = useCallback(() => setStatusOrder(null), [])

  const trade = statusOrder?.tradeNo ?? null
  const trackedOrder = useQuery({
    queryKey: ['wallet', 'store-order', userId, trade],
    queryFn: () => getJingSoftOrder(trade ?? ''),
    enabled:
      !!trade && !!userId && !finalStatuses.has(statusOrder?.status ?? ''),
    // Each read also checks JingSoft, throttled by the server per order.
    refetchInterval: 3000,
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: true,
    retry: false,
    meta: { errorToast: false },
  })
  const refetchOrder = trackedOrder.refetch
  // Returning from the Alipay tab or app checks the order at once.
  useEffect(() => {
    if (!trade || finalStatuses.has(statusOrder?.status ?? '')) return
    const check = () => void refetchOrder({ cancelRefetch: false })
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [trade, statusOrder?.status, refetchOrder])
  useEffect(() => {
    const order = trackedOrder.data
    if (
      !order ||
      order.trade_no !== trade ||
      typeof order.status !== 'string'
    ) {
      return
    }
    setStatusOrder((current) =>
      current?.tradeNo === order.trade_no
        ? {
            ...current,
            status: order.status,
            paymentMethod: order.payment_method ?? current.paymentMethod,
            paymentQrCode:
              order.status === 'pending'
                ? (safeJingSoftQrCode(order.payment_qr_code) ??
                  current.paymentQrCode)
                : null,
          }
        : current
    )
    if (order.status !== 'completed' || creditedTrade.current === trade) return
    creditedTrade.current = trade
    void onCompleted?.().catch((error: unknown) => {
      handleServerError(error, t('Failed to refresh user information'))
    })
  }, [trackedOrder.data, trackedOrder.dataUpdatedAt, trade, onCompleted, t])

  return {
    statusOrder,
    closeStatus,
    statusQueryFailed: trackedOrder.isError,
    channel,
    product,
    directAmount,
    quote,
    qq,
    setQQ,
    open,
    calculating,
    processing: payMutation.isPending,
    selectChannel,
    selectProduct,
    selectDirectAmount,
    prefetchQuote,
    confirm,
    reset,
  }
}
