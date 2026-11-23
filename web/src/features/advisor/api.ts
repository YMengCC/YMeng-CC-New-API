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
import { api } from '@/lib/http-client'

export interface AdvisorBinding {
  qq: string
  user_id: number
  username: string
  bound_at: number
}

export interface AdvisorCode {
  code: string
  expires_in: number
  username: string
}

export interface AdvisorEnvelope<T> {
  success: boolean
  message?: string
  data?: T
}

/** Bindings for the current YMeng CC user, verified by the plugin via the JWT. */
export async function getAdvisorBindings(): Promise<
  AdvisorEnvelope<{ qqs: AdvisorBinding[] }>
> {
  const res = await api.get('/advisor/api/binding', {
    skipErrorHandler: true,
  })
  return res.data
}

/** Ask the plugin to issue a one-time QQ binding code. */
export async function createAdvisorCode(): Promise<
  AdvisorEnvelope<AdvisorCode>
> {
  const res = await api.post(
    '/advisor/api/code',
    {},
    { skipErrorHandler: true }
  )
  return res.data
}

/** Remove every QQ binding for the current YMeng CC user. */
export async function unbindAdvisor(): Promise<
  AdvisorEnvelope<{ removed: number }>
> {
  const res = await api.post(
    '/advisor/api/unbind',
    {},
    { skipErrorHandler: true }
  )
  return res.data
}
