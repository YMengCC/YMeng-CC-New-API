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
import {
  dispatchSelectedPayment,
  isBEpusdtPayment,
  isStripePayment,
  isWaffoPayment,
  isWaffoPancakePayment,
} from './payment'

describe('payment type classification', () => {
  test('keeps Waffo, Waffo Pancake, and BEpusdt on their dedicated flows', () => {
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO)).toBe(true)
    expect(isWaffoPayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(false)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO_PANCAKE)).toBe(true)
    expect(isWaffoPancakePayment(PAYMENT_TYPES.WAFFO)).toBe(false)
    expect(isBEpusdtPayment(PAYMENT_TYPES.BEPUSDT)).toBe(true)
    expect(isBEpusdtPayment('bepusdt_usdt.trc20')).toBe(true)
    expect(isBEpusdtPayment('bepusdt_cashier')).toBe(true)
    expect(isBEpusdtPayment(PAYMENT_TYPES.WAFFO)).toBe(false)
    expect(isBEpusdtPayment('usdt.trc20')).toBe(false)
    expect(isStripePayment(PAYMENT_TYPES.STRIPE)).toBe(true)
  })
})

describe('payment dispatch', () => {
  test('keeps the selected Waffo method index through confirmation', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: 'Waffo Card', type: PAYMENT_TYPES.WAFFO },
      120,
      3,
      {
        regular: async () => {
          calls.push('regular')
          return false
        },
        waffo: async (amount, index) => {
          calls.push(`waffo:${amount}:${index}`)
          return true
        },
        waffoPancake: async () => {
          calls.push('pancake')
          return false
        },
      }
    )

    expect(success).toBe(true)
    expect(calls).toEqual(['waffo:120:3'])
  })

  test('does not create a Waffo order without a selected method index', async () => {
    let called = false
    const success = await dispatchSelectedPayment(
      { name: 'Waffo Card', type: PAYMENT_TYPES.WAFFO },
      120,
      null,
      {
        regular: async () => false,
        waffo: async () => {
          called = true
          return true
        },
        waffoPancake: async () => false,
      }
    )

    expect(success).toBe(false)
    expect(called).toBe(false)
  })

  test('dispatches BEpusdt payment with the selected method index', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      { name: 'USDT (TRC20)', type: PAYMENT_TYPES.BEPUSDT },
      50,
      null,
      {
        regular: async () => false,
        waffo: async () => false,
        waffoPancake: async () => false,
        bepusdt: async (amount, index) => {
          calls.push(`bepusdt:${amount}:${index}`)
          return true
        },
      },
      1
    )

    expect(success).toBe(true)
    expect(calls).toEqual(['bepusdt:50:1'])
  })

  test('does not create a BEpusdt order without a selected method index', async () => {
    let called = false
    const success = await dispatchSelectedPayment(
      { name: 'USDT (TRC20)', type: PAYMENT_TYPES.BEPUSDT },
      50,
      null,
      {
        regular: async () => false,
        waffo: async () => false,
        waffoPancake: async () => false,
        bepusdt: async () => {
          called = true
          return true
        },
      },
      null
    )

    expect(success).toBe(false)
    expect(called).toBe(false)
  })

  test('dispatches prefixed bepusdt_* General payment method to BEpusdt instead of Epay', async () => {
    const calls: string[] = []
    const success = await dispatchSelectedPayment(
      {
        name: 'USDT (TRC20)',
        type: 'bepusdt_usdt.trc20',
        channel_id: '0',
      },
      25,
      null,
      {
        regular: async () => {
          calls.push('epay')
          return false
        },
        waffo: async () => false,
        waffoPancake: async () => false,
        bepusdt: async (amount, index, paymentMethod, channelId) => {
          calls.push(
            `bepusdt:${amount}:${index}:${paymentMethod}:${channelId ?? ''}`
          )
          return true
        },
      },
      null
    )

    expect(success).toBe(true)
    expect(calls).toEqual(['bepusdt:25:null:bepusdt_usdt.trc20:0'])
  })
})
