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
import z from 'zod'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

export function parseWithdrawalQuota(
  amount: number,
  minimumQuota: number
): number {
  const quota = parseQuotaFromDollars(amount)
  return amount >= 10 ? Math.max(quota, minimumQuota) : quota
}

/** Withdrawals are whole display units: no decimals are accepted. */
export function withdrawalAmountSchema(
  availableQuota: number,
  minimumQuota = 1
) {
  return z.object({
    amount: z
      .string()
      .refine(
        (value) =>
          value.trim() !== '' &&
          Number.isInteger(Number(value)) &&
          Number(value) > 0,
        'Withdrawal amount must be an integer'
      )
      .refine((value) => {
        const amount = Number(value)
        const quota = parseWithdrawalQuota(amount, minimumQuota)
        return (
          Number.isFinite(amount) &&
          amount >= 10 &&
          Number.isSafeInteger(quota) &&
          quota > 0 &&
          quota <= availableQuota &&
          amount <= quotaUnitsToDollars(availableQuota)
        )
      }, 'Enter an amount of at least 10 and no more than your available rewards'),
  })
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 4096

export function isSupportedPayoutImage(file: File): boolean {
  return IMAGE_MIME_TYPES.has(file.type)
}

export async function validateCollectionQr(file: File): Promise<void> {
  if (!isSupportedPayoutImage(file)) {
    throw new Error('Please choose a JPEG, PNG, or WebP image')
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    throw new Error('Image must not exceed 5 MiB')
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image()
      candidate.onload = () => resolve(candidate)
      candidate.onerror = () =>
        reject(new Error('Please choose a JPEG, PNG, or WebP image'))
      candidate.src = url
    })
    if (
      image.naturalWidth <= 0 ||
      image.naturalHeight <= 0 ||
      image.naturalWidth > MAX_IMAGE_DIMENSION ||
      image.naturalHeight > MAX_IMAGE_DIMENSION
    ) {
      throw new Error('Image dimensions must not exceed 4096 × 4096 pixels')
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
