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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { CurrencyAmount, CurrencySymbol } from '../currency-display'

const IMAGE_URL = 'https://cdn.example.com/currency.svg?theme=dark'

beforeEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

afterEach(() => {
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

describe('CurrencySymbol', () => {
  it('renders a configured HTTP URL as a decorative fallback-labelled image', () => {
    render(<CurrencySymbol value={IMAGE_URL} />)

    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      IMAGE_URL
    )
  })

  it('falls back to a fixed-size generic currency mark when the image fails', () => {
    render(<CurrencySymbol value={IMAGE_URL} />)

    fireEvent.error(screen.getByRole('img', { name: '¤' }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('¤')).toBeInTheDocument()
  })

  it('keeps a short textual custom symbol unchanged', () => {
    render(<CurrencySymbol value='HK$' />)

    expect(screen.getByText('HK$')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('CurrencyAmount', () => {
  it('uses the generic mark in plain string formatting but renders the image in the UI', () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: IMAGE_URL,
        customCurrencyExchangeRate: 2,
      },
    })

    render(<CurrencyAmount amount={500000} mode='quota' />)

    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      IMAGE_URL
    )
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('follows currency setting changes while mounted', () => {
    const { rerender } = render(<CurrencyAmount amount={500000} mode='quota' />)
    expect(screen.getByText('$1')).toBeInTheDocument()

    act(() => {
      useSystemConfigStore.getState().setConfig({
        currency: {
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CUSTOM',
          customCurrencySymbol: IMAGE_URL,
        },
      })
    })
    rerender(<CurrencyAmount amount={500000} mode='quota' />)

    expect(screen.getByRole('img', { name: '¤' })).toBeInTheDocument()
  })

  it('hides the image when the caller suppresses the currency symbol', () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: IMAGE_URL,
      },
    })

    render(
      <CurrencyAmount
        amount={500000}
        mode='quota'
        options={{ showSymbol: false }}
      />
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders a historical snapshot instead of the current image setting', () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: IMAGE_URL,
      },
    })

    render(
      <CurrencyAmount
        amount={500000}
        mode='quota'
        snapshot={{
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CUSTOM',
          customCurrencySymbol: '€',
        }}
      />
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('€ 1')).toBeInTheDocument()
  })
})
