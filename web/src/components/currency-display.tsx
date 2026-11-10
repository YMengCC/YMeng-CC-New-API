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
import { Fragment, useEffect, useState, type ReactNode } from 'react'

import {
  formatBillingCurrencyFromUSD,
  formatCurrencyFromUSD,
  formatLocalCurrencyAmount,
  formatQuotaWithCurrency,
  getCurrencyDisplay,
  getCurrencyImageUrl,
  isCurrencyImageUrl,
  type CurrencyFormatOptions,
} from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  useSystemConfigStore,
  type CurrencyConfig,
} from '@/stores/system-config-store'

export type CurrencySymbolProps = {
  /** Explicit symbol or image URL, useful for settings previews. */
  value?: string
  /** Explicit image URL when the symbol text is already normalized to `¤`. */
  imageUrlOverride?: string | null
  snapshot?: CurrencyConfig
  className?: string
  imageClassName?: string
}

export function CurrencySymbol(props: CurrencySymbolProps) {
  const currentCurrency = useSystemConfigStore((state) => state.config.currency)
  const snapshot = props.snapshot ?? currentCurrency
  const display = getCurrencyDisplay(snapshot)
  let defaultSymbol = ''
  if (display.config.quotaDisplayType === 'CUSTOM') {
    defaultSymbol = display.config.customCurrencySymbol
  } else if (display.meta.kind !== 'tokens') {
    defaultSymbol = display.meta.symbol
  }
  const configuredValue = props.value ?? defaultSymbol
  const value = configuredValue.trim()
  const directImageUrl = isCurrencyImageUrl(value) ? value : ''
  const overrideImageUrl = isCurrencyImageUrl(props.imageUrlOverride)
    ? props.imageUrlOverride.trim()
    : ''
  const imageUrl = directImageUrl || overrideImageUrl
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [imageUrl])

  if (imageUrl && !imageFailed) {
    return (
      <span
        className={cn(
          'inline-flex size-[1em] shrink-0 items-center justify-center align-[-0.125em]',
          props.className
        )}
      >
        <img
          src={imageUrl}
          alt='¤'
          className={cn('size-full object-contain', props.imageClassName)}
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  const configuredAsImage = Boolean(imageUrl)
  let fallback = display.meta.kind === 'tokens' ? '' : display.meta.symbol
  if (props.value !== undefined) {
    fallback = isCurrencyImageUrl(value) ? '¤' : value || '¤'
  }
  if (configuredAsImage && !directImageUrl) {
    fallback = '¤'
  }

  if (configuredAsImage && fallback) {
    return (
      <span
        className={cn(
          'inline-flex size-[1em] shrink-0 items-center justify-center align-[-0.125em]',
          props.className
        )}
      >
        {fallback}
      </span>
    )
  }

  return fallback ? (
    <span className={cn('shrink-0', props.className)}>{fallback}</span>
  ) : null
}

export type CurrencyFormattedTextProps = {
  /** Preformatted amount, range, label, or caption containing `¤` placeholders. */
  value: string
  snapshot?: CurrencyConfig
  className?: string
  symbolClassName?: string
}

export function CurrencyFormattedText(
  props: CurrencyFormattedTextProps
): ReactNode {
  const currentCurrency = useSystemConfigStore((state) => state.config.currency)
  const snapshot = props.snapshot ?? currentCurrency
  const imageUrl = getCurrencyImageUrl(snapshot)
  if (!imageUrl || !props.value.includes('¤')) return props.value

  const parts = props.value.split('¤')
  const partOccurrences = new Map<string, number>()
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full flex-wrap items-baseline',
        props.className
      )}
    >
      {parts.map((part, index) => {
        const occurrence = partOccurrences.get(part) ?? 0
        partOccurrences.set(part, occurrence + 1)
        return (
          <Fragment key={`${part}:${occurrence}`}>
            {index > 0 && (
              <CurrencySymbol
                value={imageUrl}
                snapshot={snapshot}
                className={props.symbolClassName}
              />
            )}
            {part && <span className='whitespace-pre-wrap'>{part}</span>}
          </Fragment>
        )
      })}
    </span>
  )
}

type CurrencyAmountMode = 'quota' | 'usd' | 'billing' | 'local'

export type CurrencyAmountProps = {
  amount: number | null | undefined
  mode?: CurrencyAmountMode
  options?: CurrencyFormatOptions
  snapshot?: CurrencyConfig
  className?: string
  symbolClassName?: string
}

export function CurrencyAmount(props: CurrencyAmountProps) {
  const currentCurrency = useSystemConfigStore((state) => state.config.currency)
  const snapshot = props.snapshot ?? currentCurrency
  const mode = props.mode ?? 'quota'
  const imageUrl = getCurrencyImageUrl(snapshot)
  const showSymbol = props.options?.showSymbol !== false
  const useImageSymbol = Boolean(imageUrl) && showSymbol
  const options = useImageSymbol
    ? { ...props.options, showSymbol: false }
    : props.options
  let formatted: string
  if (mode === 'billing') {
    formatted = formatBillingCurrencyFromUSD(props.amount, options, snapshot)
  } else if (mode === 'local') {
    formatted = formatLocalCurrencyAmount(props.amount, options, snapshot)
  } else if (mode === 'usd') {
    formatted = formatCurrencyFromUSD(props.amount, options, snapshot)
  } else {
    formatted = formatQuotaWithCurrency(props.amount, options, snapshot)
  }
  if (!useImageSymbol) {
    return <span className={props.className}>{formatted}</span>
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-0.5',
        props.className
      )}
    >
      <CurrencySymbol snapshot={snapshot} className={props.symbolClassName} />
      <span className='min-w-0 break-all'>{formatted}</span>
    </span>
  )
}
