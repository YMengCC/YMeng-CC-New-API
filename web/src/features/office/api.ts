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

import type { OfficeEvent, OfficeFile, OfficeSession } from './types'

const BASE_URL = '/api/office'

interface OfficeEnvelope<T> {
  success: boolean
  message: string
  data: T
}

/** Whether the office mode is configured on this deployment. */
export async function getOfficeStatus(): Promise<boolean> {
  const res = await api.get(`${BASE_URL}/status`)
  const { data } = res
  requireServerSuccess(data)
  return (data as OfficeEnvelope<{ enabled: boolean }>).data.enabled
}

export async function listOfficeSessions(): Promise<OfficeSession[]> {
  const res = await api.get(`${BASE_URL}/sessions`)
  const { data } = res
  requireServerSuccess(data)
  return (data as OfficeEnvelope<{ sessions: OfficeSession[] }>).data.sessions
}

export async function createOfficeSession(): Promise<OfficeSession> {
  const res = await api.post(`${BASE_URL}/sessions`)
  const { data } = res
  requireServerSuccess(data)
  return (data as OfficeEnvelope<OfficeSession>).data
}

export async function deleteOfficeSession(id: string): Promise<void> {
  const res = await api.delete(`${BASE_URL}/sessions/${id}`)
  requireServerSuccess(res.data)
}

/** Replays everything recorded for a session so far. */
export async function getOfficeSessionEvents(
  id: string
): Promise<OfficeEvent[]> {
  const res = await api.get(`${BASE_URL}/sessions/${id}/events`)
  const { data } = res
  requireServerSuccess(data)
  return (data as OfficeEnvelope<{ events: OfficeEvent[] }>).data.events
}

export async function listOfficeFiles(id: string): Promise<OfficeFile[]> {
  const res = await api.get(`${BASE_URL}/files/${id}`)
  const { data } = res
  requireServerSuccess(data)
  return (data as OfficeEnvelope<{ files: OfficeFile[] }>).data.files
}

/** Uploads one file into the workspace; `path` defaults to the file name. */
export async function uploadOfficeFile(
  id: string,
  file: File,
  path?: string
): Promise<void> {
  const form = new FormData()
  form.append('file', file)
  if (path) form.append('path', path)
  const res = await api.post(`${BASE_URL}/files/${id}`, form)
  requireServerSuccess(res.data)
}

export async function downloadOfficeFile(
  id: string,
  path: string
): Promise<Blob> {
  const res = await api.get(`${BASE_URL}/files/${id}/content`, {
    params: { path },
    responseType: 'blob',
  } as Record<string, unknown>)
  return res.data as Blob
}

/** Removes a file or folder from the workspace of a session. */
export async function deleteOfficeFile(
  id: string,
  path: string
): Promise<void> {
  const res = await api.delete(`${BASE_URL}/files/${id}`, { params: { path } })
  requireServerSuccess(res.data)
}

/** Tells the server to stop the turn running in a session. */
export async function stopOfficeTurn(id: string): Promise<void> {
  const res = await api.post(`${BASE_URL}/turns/${id}/stop`)
  requireServerSuccess(res.data)
}

export function officeTurnStreamUrl(id: string): string {
  return `${BASE_URL}/turns/${id}`
}
