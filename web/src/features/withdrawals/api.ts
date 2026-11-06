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
import { requireServerSuccess } from '@/lib/server-error-message'
import type { CurrencyConfig } from '@/stores/system-config-store'

export interface CollectionQrProfile {
  minimum_quota: number
  has_qr: boolean
  updated_at: number
  sha256?: string
}

export type WithdrawalStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'rejected'

export interface Withdrawal {
  id: number
  user_id: number
  username: string
  quota: number
  status: WithdrawalStatus
  created_at: number
  updated_at: number
  updated_by: number
  reject_reason?: string
  rejected_at?: number
  proof_name?: string
  proof_size?: number
  currency_snapshot: CurrencyConfig
}

export interface WithdrawalFilters {
  p: number
  page_size: number
  keyword: string
  status: WithdrawalStatus | ''
}

// React Query deduplicates these reads. The HTTP deduper can otherwise reuse
// an aborted request during StrictMode remounts or navigation.
export async function getCollectionQrProfile(
  signal?: AbortSignal
): Promise<CollectionQrProfile> {
  const response = requireServerSuccess(
    (
      await api.get('/api/withdrawal/profile', {
        signal,
        disableDuplicate: true,
      })
    ).data
  )
  return response.data
}

export async function saveCollectionQr(
  file: File
): Promise<CollectionQrProfile> {
  const form = new FormData()
  form.append('qr', file)
  const response = requireServerSuccess(
    (
      await api.put('/api/withdrawal/profile/qr', form, {
        headers: { 'Content-Type': null },
      })
    ).data
  )
  return response.data
}

export async function fetchCollectionQr(
  path: string,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await api.get<Blob>(path, {
    responseType: 'blob',
    signal,
    disableDuplicate: true,
  })
  if (response.data.type !== 'image/png') {
    throw new Error('Failed to load collection QR code')
  }
  return response.data
}

export async function createWithdrawal(input: {
  quota: number
  request_id: string
}): Promise<Withdrawal> {
  const response = requireServerSuccess(
    (await api.post('/api/withdrawal/', input)).data
  )
  return response.data
}

export async function getAdminWithdrawals(
  filters: WithdrawalFilters,
  signal?: AbortSignal
): Promise<{
  items: Withdrawal[]
  total: number
  p: number
  page_size: number
}> {
  const response = requireServerSuccess(
    (
      await api.get('/api/withdrawal/admin/', {
        params: filters,
        signal,
        disableDuplicate: true,
      })
    ).data
  )
  return response.data
}

export async function getMyWithdrawals(
  page: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<{
  items: Withdrawal[]
  total: number
  p: number
  page_size: number
}> {
  const response = requireServerSuccess(
    (
      await api.get('/api/withdrawal/self', {
        params: { p: page, page_size: pageSize },
        signal,
        disableDuplicate: true,
      })
    ).data
  )
  return response.data
}

export async function markWithdrawalProcessing(id: number): Promise<void> {
  requireServerSuccess(
    (await api.post(`/api/withdrawal/admin/${id}/processing`)).data
  )
}

export async function uploadWithdrawalProof(
  id: number,
  file: File
): Promise<void> {
  const form = new FormData()
  form.append('proof', file)
  requireServerSuccess(
    (
      await api.post(`/api/withdrawal/admin/${id}/proof`, form, {
        headers: { 'Content-Type': null },
      })
    ).data
  )
}

export async function rejectWithdrawal(
  id: number,
  reason: string
): Promise<void> {
  requireServerSuccess(
    (await api.post(`/api/withdrawal/admin/${id}/reject`, { reason })).data
  )
}
