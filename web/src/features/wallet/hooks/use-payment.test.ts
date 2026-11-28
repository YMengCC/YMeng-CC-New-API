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
import { describe, expect, test } from 'vitest'

import { PAYMENT_TYPES } from '../constants'
import { requestPaymentAmount } from './use-payment'

describe('payment amount routing', () => {
  test('uses the dedicated Waffo amount calculator', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(120, PAYMENT_TYPES.WAFFO, {
      regular: async () => {
        calls.push('regular')
        return { success: true, data: '1' }
      },
      stripe: async () => {
        calls.push('stripe')
        return { success: true, data: '2' }
      },
      waffo: async (request) => {
        calls.push(`waffo:${request.amount}`)
        return { success: true, data: '18.75' }
      },
      waffoPancake: async () => {
        calls.push('pancake')
        return { success: true, data: '4' }
      },
    })

    expect(amount).toBe(18.75)
    expect(calls).toEqual(['waffo:120'])
  })

  test('uses the dedicated BEpusdt amount calculator with pay_method_index', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(
      10,
      PAYMENT_TYPES.BEPUSDT,
      {
        regular: async () => ({ success: true, data: '1' }),
        stripe: async () => ({ success: true, data: '2' }),
        waffo: async () => ({ success: true, data: '3' }),
        waffoPancake: async () => ({ success: true, data: '4' }),
        bepusdt: async (request) => {
          calls.push(`bepusdt:${request.amount}:${request.pay_method_index}`)
          return { success: true, data: '73.00' }
        },
      },
      2
    )

    expect(amount).toBe(73)
    expect(calls).toEqual(['bepusdt:10:2'])
  })

  test('routes prefixed bepusdt_* payment type to BEpusdt amount calculator with channel_id', async () => {
    const calls: string[] = []
    const amount = await requestPaymentAmount(
      20,
      'bepusdt_usdt.trc20',
      {
        regular: async () => {
          calls.push('regular')
          return { success: true, data: '1' }
        },
        stripe: async () => ({ success: true, data: '2' }),
        waffo: async () => ({ success: true, data: '3' }),
        waffoPancake: async () => ({ success: true, data: '4' }),
        bepusdt: async (request) => {
          calls.push(
            `bepusdt:${request.amount}:${request.payment_method}:${request.channel_id ?? ''}`
          )
          return { success: true, data: '146.00' }
        },
      },
      null,
      '0'
    )

    expect(amount).toBe(146)
    expect(calls).toEqual(['bepusdt:20:bepusdt_usdt.trc20:0'])
  })
})
