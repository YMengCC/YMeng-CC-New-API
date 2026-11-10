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

import {
  CurrencyAmount,
  CurrencyFormattedText,
  CurrencySymbol,
} from '../currency-display'

const IMAGE_URL = 'https://cdn.example.com/currency.svg?theme=dark'
const SECOND_IMAGE_URL = 'https://cdn.example.com/currency-alt.svg?theme=light'

function setImageCurrency(imageUrl = IMAGE_URL) {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: imageUrl,
    },
  })
}

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
    expect(screen.getByText('¤')).toHaveClass('size-[1em]')
  })

  it('falls back to a fixed-size generic mark when only an override URL fails', () => {
    render(<CurrencySymbol imageUrlOverride={IMAGE_URL} />)

    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      IMAGE_URL
    )
    fireEvent.error(screen.getByRole('img', { name: '¤' }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('¤')).toHaveClass('size-[1em]')
  })

  it('reloads the image after its URL value changes', () => {
    const { rerender } = render(<CurrencySymbol value={IMAGE_URL} />)
    fireEvent.error(screen.getByRole('img', { name: '¤' }))
    expect(screen.getByText('¤')).toHaveClass('size-[1em]')

    rerender(<CurrencySymbol value={SECOND_IMAGE_URL} />)

    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      SECOND_IMAGE_URL
    )
  })

  it('keeps a short textual custom symbol unchanged', () => {
    render(<CurrencySymbol value='HK$' />)

    expect(screen.getByText('HK$')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('CurrencyFormattedText', () => {
  it.each([
    ['¤ 0.4', '0.4', 1],
    ['¤ 0.4 – ¤ 0.8', '0.4 – 0.8', 2],
    ['¤ / 1M tokens', '/ 1M tokens', 1],
  ])(
    'replaces each placeholder in %s with the configured image',
    (value, visibleText, expectedImageCount) => {
      setImageCurrency()
      const { container } = render(<CurrencyFormattedText value={value} />)

      const images = screen.getAllByRole('img', { name: '¤' })
      expect(images).toHaveLength(expectedImageCount)
      expect(images[0]).toHaveAttribute('src', IMAGE_URL)
      expect(container).toHaveTextContent(visibleText)
      expect(screen.queryAllByText(/¤/)).toHaveLength(0)
      expect(container.textContent).not.toContain(IMAGE_URL)
    }
  )

  it.each(['', '-', 'Free'])(
    'leaves %j unchanged when it has no currency placeholder',
    (value) => {
      setImageCurrency()
      const { container } = render(<CurrencyFormattedText value={value} />)

      expect(container.textContent).toBe(value)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    }
  )

  it('keeps a textual custom symbol and its formatted string unchanged', () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: 'HK$',
      },
    })

    const { container } = render(
      <CurrencyFormattedText value='HK$ 0.4 – HK$ 0.8' />
    )

    expect(container).toHaveTextContent('HK$ 0.4 – HK$ 0.8')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it.each([
    ['USD', '$0.4'],
    ['CNY', '¥2.8'],
    ['TOKENS', '500,000'],
  ] as const)(
    'leaves %s formatted text unchanged without inserting an image',
    (displayType, value) => {
      useSystemConfigStore.getState().setConfig({
        currency: {
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: displayType,
        },
      })
      const { container } = render(<CurrencyFormattedText value={value} />)

      expect(container.textContent).toBe(value)
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    }
  )

  it('falls back to a fixed-size generic mark when a formatted image fails', () => {
    setImageCurrency()
    const { container } = render(<CurrencyFormattedText value='¤ 0.4' />)

    fireEvent.error(screen.getByRole('img', { name: '¤' }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('¤')).toHaveClass('size-[1em]')
    expect(container).toHaveTextContent('¤ 0.4')
  })

  it('reloads formatted text when the configured image URL changes', () => {
    setImageCurrency()
    const { rerender } = render(<CurrencyFormattedText value='¤ 0.4' />)
    fireEvent.error(screen.getByRole('img', { name: '¤' }))
    expect(screen.getByText('¤')).toHaveClass('size-[1em]')

    act(() => setImageCurrency(SECOND_IMAGE_URL))
    rerender(<CurrencyFormattedText value='¤ 0.4' />)

    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      SECOND_IMAGE_URL
    )
  })

  it('uses an image from a historical snapshot even when the current symbol is text', () => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CUSTOM',
        customCurrencySymbol: '€',
      },
    })

    render(
      <CurrencyFormattedText
        value='¤ 0.4'
        snapshot={{
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CUSTOM',
          customCurrencySymbol: IMAGE_URL,
        }}
      />
    )

    expect(screen.getByRole('img', { name: '¤' })).toHaveAttribute(
      'src',
      IMAGE_URL
    )
  })

  it('leaves formatted text unchanged when a historical text snapshot overrides an image setting', () => {
    setImageCurrency()
    const { container } = render(
      <CurrencyFormattedText
        value='€ 0.4'
        snapshot={{
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CUSTOM',
          customCurrencySymbol: '€',
        }}
      />
    )

    expect(container).toHaveTextContent('€ 0.4')
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

  it.each([
    [0, {}, '0'],
    [-2, {}, '-2'],
    [0.125, {}, '0.125'],
    [1234, { compact: true, locale: 'en-US' }, '1.2K'],
  ])(
    'keeps the %s amount format while showing the configured image',
    (amount, options, expectedText) => {
      setImageCurrency()
      const { container } = render(
        <CurrencyAmount amount={amount} mode='usd' options={options} />
      )

      expect(screen.getByRole('img', { name: '¤' })).toBeInTheDocument()
      expect(container).toHaveTextContent(expectedText)
      expect(screen.queryAllByText(/¤/)).toHaveLength(0)
      expect(container.textContent).not.toContain(IMAGE_URL)
    }
  )
})
