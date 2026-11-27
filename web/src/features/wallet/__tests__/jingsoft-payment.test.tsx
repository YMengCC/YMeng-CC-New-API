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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useJingSoftPayment } from '../hooks/use-jingsoft-payment'
import { isValidJingSoftQQ, safeJingSoftQrCode } from '../jingsoft-api'

const channel = { id: 'wechat', name: 'WeChat' }
const product = { id: 'ten', name: 'Ten dollars', amount: 10 }
const info = {
  enabled: true,
  available: true,
  products: [product],
  channels: [channel],
}
const quote = { quote_id: 'q1', amount: 72, currency: 'CNY', topup_amount: 10 }
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'open').mockReturnValue(null)
})

function pendingOrder(trade: string) {
  return {
    data: {
      success: true,
      data: {
        trade_no: trade,
        status: 'pending',
        payment_method: 'jingsoft_wxpay',
        payment_qr_code: 'weixin://wxpay/bizpayurl?pr=testToken',
      },
    },
  }
}

function orderRead(trade: string, status: string) {
  return {
    data: {
      success: true,
      data: { trade_no: trade, status },
    },
  }
}

async function payOnce(
  result: { current: ReturnType<typeof useJingSoftPayment> },
  qq = '12345'
) {
  await act(() => result.current.selectProduct(product, channel))
  act(() => result.current.setQQ(qq))
  await act(() => result.current.confirm())
}

afterEach(() => vi.restoreAllMocks())

it('shows the QR code dialog without opening a window and refreshes the wallet once after completed settlement', async () => {
  vi.spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { success: true, data: quote } })
    .mockResolvedValueOnce(pendingOrder('JingSoft_trade1'))
  const read = vi
    .spyOn(api, 'get')
    .mockResolvedValue(orderRead('JingSoft_trade1', 'pending'))
  const completed = vi.fn().mockResolvedValue(undefined)
  const { result } = renderHook(() => useJingSoftPayment(info, 1, completed), {
    wrapper,
  })
  await payOnce(result)
  expect(window.open).not.toHaveBeenCalled()
  expect(result.current.open).toBe(false)
  expect(result.current.statusOrder).toEqual({
    tradeNo: 'JingSoft_trade1',
    amount: 10,
    status: 'pending',
    channelName: 'WeChat',
    paymentMethod: 'jingsoft_wxpay',
    paymentQrCode: 'weixin://wxpay/bizpayurl?pr=testToken',
    payment: { amount: 72, fee: undefined, fee_rate: undefined },
  })
  read.mockResolvedValue(orderRead('JingSoft_trade1', 'completed'))
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() =>
    expect(result.current.statusOrder?.status).toBe('completed')
  )
  expect(result.current.statusOrder?.paymentQrCode).toBeNull()
  await waitFor(() => expect(completed).toHaveBeenCalledOnce())
  const reads = read.mock.calls.length
  act(() => window.dispatchEvent(new Event('focus')))
  expect(read).toHaveBeenCalledTimes(reads)
  expect(localStorage.length).toBe(0)
})

it('ends the order for the user when the dialog closes and creates a new order for the next purchase', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { success: true, data: quote } })
    .mockResolvedValueOnce(pendingOrder('JingSoft_first'))
    .mockResolvedValueOnce({ data: { success: true, data: quote } })
    .mockResolvedValueOnce(pendingOrder('JingSoft_second'))
  const read = vi
    .spyOn(api, 'get')
    .mockResolvedValue(orderRead('JingSoft_first', 'pending'))
  const { result } = renderHook(() => useJingSoftPayment(info, 1), { wrapper })
  await payOnce(result)
  act(() => result.current.closeStatus())
  expect(result.current.statusOrder).toBeNull()
  const reads = read.mock.calls.length
  act(() => window.dispatchEvent(new Event('focus')))
  expect(read).toHaveBeenCalledTimes(reads)
  await payOnce(result)
  expect(result.current.statusOrder?.tradeNo).toBe('JingSoft_second')
  const firstKey = (post.mock.calls[1][1] as { idempotency_key: string })
    .idempotency_key
  const secondKey = (post.mock.calls[3][1] as { idempotency_key: string })
    .idempotency_key
  expect(secondKey).not.toBe(firstKey)
  expect(localStorage.length).toBe(0)
})

it('reuses the request key when confirming again after a lost response and never blocks a new purchase', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { success: true, data: quote } })
    .mockRejectedValueOnce(new Error('Network disconnected'))
    .mockResolvedValueOnce(pendingOrder('JingSoft_recovered'))
  vi.spyOn(api, 'get').mockResolvedValue(
    orderRead('JingSoft_recovered', 'pending')
  )
  const { result } = renderHook(() => useJingSoftPayment(info, 1), { wrapper })
  await payOnce(result, '001234')
  expect(result.current.statusOrder).toBeNull()
  expect(result.current.open).toBe(true)
  expect(result.current.qq).toBe('001234')
  await act(() => result.current.confirm())
  expect(post.mock.calls[2][1]).toEqual(post.mock.calls[1][1])
  expect(result.current.statusOrder?.tradeNo).toBe('JingSoft_recovered')
})

it('accepts only ASCII digit QQ strings and bounded HTTPS QR codes without credentials', () => {
  for (const value of ['12345', '0012345', '123456789012']) {
    expect(isValidJingSoftQQ(value)).toBe(true)
  }
  for (const value of [
    '',
    '1234',
    '1234567890123',
    '１２３４５',
    '12 345',
    '+12345',
    '12345\n',
  ]) {
    expect(isValidJingSoftQQ(value)).toBe(false)
  }
  expect(safeJingSoftQrCode('https://qr.alipay.com/upx-code')).toBe(
    'https://qr.alipay.com/upx-code'
  )
  for (const value of [
    'http://pay.example',
    'javascript:alert(1)',
    'https://user:pass@pay.example',
    `https://qr.alipay.com/${'a'.repeat(2048)}`,
  ]) {
    expect(safeJingSoftQrCode(value)).toBeNull()
  }
})
it('keeps the native WeChat QR payload unchanged', () => {
  const value = 'weixin://wxpay/bizpayurl?pr=testToken'
  expect(safeJingSoftQrCode(value)).toBe(value)
})

it.each([
  'weixin://wxpay/bizpayurl?pr=',
  'weixin://wxpay/bizpayurl?pr=token&pr=other',
  'weixin://wxpay/bizpayurl?pr=token&extra=1',
  'weixin://wxpay/bizpayurl?pr=token#fragment',
  'weixin://wxpay/bizpayurl?pr=token%26extra%3D1',
  'weixin://wxpay/bizpayurl?pr=token\n',
  'weixin://wxpay/bizpayurl?pr=to ken',
  'weixin://user@wxpay/bizpayurl?pr=token',
  'weixin://wxpay:443/bizpayurl?pr=token',
  'weixin://wxpay.example/bizpayurl?pr=token',
  'weixin://wxpay/other?pr=token',
  `weixin://wxpay/bizpayurl?pr=${'a'.repeat(2048)}`,
])('rejects malformed native WeChat QR data %j', (value) => {
  expect(safeJingSoftQrCode(value)).toBeNull()
})

it('ignores an old quote after switching channels', async () => {
  let resolve!: (value: unknown) => void
  vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const { result } = renderHook(() => useJingSoftPayment(info, 1), { wrapper })
  act(() => result.current.selectChannel(channel))
  let request!: Promise<void>
  act(() => {
    request = result.current.selectProduct(product)
  })
  await waitFor(() => expect(resolve).toBeDefined())
  act(() => result.current.selectChannel(null))
  await act(async () => {
    resolve({ data: { success: true, data: quote } })
    await request
  })
  expect(result.current.quote).toBeNull()
  expect(result.current.open).toBe(false)
})
it('clears the previous account quote, QQ and channel when the account changes', async () => {
  vi.spyOn(api, 'post').mockResolvedValue({
    data: { success: true, data: quote },
  })
  const { result, rerender } = renderHook(
    ({ id }) => useJingSoftPayment(info, id),
    { wrapper, initialProps: { id: 1 } }
  )
  act(() => result.current.selectChannel(channel))
  await act(() => result.current.selectProduct(product))
  act(() => result.current.setQQ('001234'))
  rerender({ id: 2 })
  expect(result.current.statusOrder).toBeNull()
  expect(result.current.qq).toBe('')
  expect(result.current.quote).toBeNull()
  expect(result.current.channel).toBeNull()
  expect(result.current.open).toBe(false)
})

it('quotes and confirms custom or preset amounts in direct mode without requiring a QQ number', async () => {
  const directQuote = {
    quote_id: 'q-direct',
    amount: 108,
    currency: 'CNY',
    topup_amount: 15,
  }
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { success: true, data: directQuote } })
    .mockResolvedValueOnce(pendingOrder('JingSoft_direct_trade'))
  vi.spyOn(api, 'get').mockResolvedValue(
    orderRead('JingSoft_direct_trade', 'pending')
  )

  const { result } = renderHook(
    () => useJingSoftPayment({ ...info, mode: 'direct' }, 1),
    { wrapper }
  )
  await act(() => result.current.selectDirectAmount(15, channel))
  expect(result.current.open).toBe(true)
  expect(result.current.qq).toBe('')
  await act(() => result.current.confirm())

  expect(post).toHaveBeenNthCalledWith(1, '/api/user/jingsoft/quote', {
    amount: 15,
    channel_id: 'wechat',
  })
  expect(post).toHaveBeenNthCalledWith(
    2,
    '/api/user/jingsoft/pay',
    expect.objectContaining({
      amount: 15,
      channel_id: 'wechat',
      quote_id: 'q-direct',
      qq: '',
    })
  )
  expect(result.current.statusOrder?.tradeNo).toBe('JingSoft_direct_trade')
  expect(result.current.statusOrder?.amount).toBe(15)
})

it('seamlessly falls back from direct quote to redemption confirmation when auto mode detects an expired merchant token', async () => {
  const fallbackQuote = {
    quote_id: 'q-fallback',
    amount: 72,
    currency: 'CNY',
    topup_amount: 10,
    mode: 'redemption' as const,
    product_id: 'ten',
  }
  const onModeFallback = vi.fn()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { success: true, data: fallbackQuote } })
    .mockResolvedValueOnce(pendingOrder('JingSoft_fallback_trade'))
  vi.spyOn(api, 'get').mockResolvedValue(
    orderRead('JingSoft_fallback_trade', 'pending')
  )

  const { result } = renderHook(
    () =>
      useJingSoftPayment(
        { ...info, mode: 'direct', configured_mode: 'auto' },
        1,
        undefined,
        onModeFallback
      ),
    { wrapper }
  )
  await act(() => result.current.selectDirectAmount(10, channel))
  expect(result.current.open).toBe(true)
  expect(onModeFallback).toHaveBeenCalledOnce()

  // QQ is required once the quote falls back to redemption mode.
  await act(() => result.current.confirm())
  expect(post).toHaveBeenCalledTimes(1)

  act(() => result.current.setQQ('123456'))
  await act(() => result.current.confirm())

  expect(post).toHaveBeenNthCalledWith(
    2,
    '/api/user/jingsoft/pay',
    expect.objectContaining({
      product_id: 'ten',
      channel_id: 'wechat',
      quote_id: 'q-fallback',
      qq: '123456',
    })
  )
  expect(result.current.statusOrder?.tradeNo).toBe('JingSoft_fallback_trade')
})

it('treats rate-limit and max-amount responses as pre-creation rejections and rotates the idempotency key on retry', async () => {
  const directQuote = {
    quote_id: 'q-limit',
    amount: 72,
    currency: 'CNY',
    topup_amount: 10,
  }
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({ data: { success: true, data: directQuote } })
    .mockResolvedValueOnce({
      data: {
        success: false,
        message: 'Too many JingSoft payment requests, please try again shortly',
        message_key:
          'Too many JingSoft payment requests, please try again shortly',
      },
    })
    .mockResolvedValueOnce(pendingOrder('JingSoft_after_rate_limit'))
  vi.spyOn(api, 'get').mockResolvedValue(
    orderRead('JingSoft_after_rate_limit', 'pending')
  )

  const { result } = renderHook(
    () => useJingSoftPayment({ ...info, mode: 'direct' }, 1),
    { wrapper }
  )
  await act(() => result.current.selectDirectAmount(10, channel))
  await act(() => result.current.confirm())
  expect(result.current.statusOrder).toBeNull()
  expect(result.current.open).toBe(true)

  await act(() => result.current.confirm())
  const firstKey = (post.mock.calls[1][1] as { idempotency_key: string })
    .idempotency_key
  const secondKey = (post.mock.calls[2][1] as { idempotency_key: string })
    .idempotency_key
  expect(secondKey).not.toBe(firstKey)
  expect(result.current.statusOrder?.tradeNo).toBe('JingSoft_after_rate_limit')
})
