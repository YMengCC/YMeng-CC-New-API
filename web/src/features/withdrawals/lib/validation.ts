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

export async function validateCollectionQr(file: File): Promise<void> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('PNG image must not exceed 5 MiB')
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Please select a valid PNG image'))
    reader.readAsArrayBuffer(file.slice(0, 24))
  })
  const bytes = new Uint8Array(buffer)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (
    bytes.length < 24 ||
    !signature.every((byte, index) => bytes[index] === byte) ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
  ) {
    throw new Error('Please select a valid PNG image')
  }
  const header = new DataView(bytes.buffer)
  const width = header.getUint32(16)
  const height = header.getUint32(20)
  if (!width || !height || width > 4096 || height > 4096) {
    throw new Error('PNG dimensions must not exceed 4096 × 4096 pixels')
  }
  const url = URL.createObjectURL(file)
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Please select a valid PNG image'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
