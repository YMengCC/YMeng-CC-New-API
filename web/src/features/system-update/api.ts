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
import axios from 'axios'
import { z } from 'zod'

import { api } from '@/lib/api'
import {
  getServerErrorStatus,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  compareSystemVersions,
  parseSystemVersion,
  SYSTEM_RELEASE_REPOSITORY,
  systemReleaseSchema,
} from './releases'

export const updateCheckErrorSchema = z.enum([
  'network',
  'rate-limit',
  'timeout',
  'payload',
])
export type UpdateCheckErrorCode = z.infer<typeof updateCheckErrorSchema>

export class UpdateCheckError extends Error {
  constructor(public readonly code: UpdateCheckErrorCode) {
    super(code)
    this.name = 'UpdateCheckError'
  }
}

const releaseFeedSchema = z
  .object({
    source: z.literal(SYSTEM_RELEASE_REPOSITORY),
    releases: z.array(systemReleaseSchema),
    last_checked_at: z.number().finite().nonnegative(),
    last_attempt_at: z.number().finite().nonnegative(),
    error: updateCheckErrorSchema.nullable(),
  })
  .refine((feed) => feed.last_checked_at <= feed.last_attempt_at)

export type SystemReleaseFeed = z.infer<typeof releaseFeedSchema>

export async function fetchSystemReleaseFeed(
  signal: AbortSignal
): Promise<SystemReleaseFeed> {
  let payload: unknown
  try {
    const response = await api.get('/api/system-update/release-feed', {
      signal,
    })
    payload = requireServerSuccess(response.data).data
  } catch (error) {
    if (signal.aborted) throw error
    const status = getServerErrorStatus(error)
    // Authentication failures keep their original contract and are never cached
    // as a GitHub error or used to display a previous administrator's data.
    if (status === 401 || status === 403) throw error
    if (axios.isAxiosError(error)) {
      const failed = releaseFeedSchema.safeParse(error.response?.data?.data)
      if (failed.success && failed.data.error) return failed.data
      if (error.code === 'ECONNABORTED') throw new UpdateCheckError('timeout')
    } else if (error && typeof error === 'object' && 'response' in error) {
      const response = error.response as { data?: { data?: unknown } }
      const failed = releaseFeedSchema.safeParse(response.data?.data)
      if (failed.success && failed.data.error) return failed.data
    }
    throw new UpdateCheckError('network')
  }
  const parsed = releaseFeedSchema.safeParse(payload)
  if (!parsed.success) throw new UpdateCheckError('payload')
  const releases = new Map(
    parsed.data.releases
      .filter((release) => parseSystemVersion(release.tag_name))
      .map((release) => [release.tag_name, release])
  )
  return {
    ...parsed.data,
    releases: [...releases.values()].sort(
      (left, right) => compareSystemVersions(right.tag_name, left.tag_name) ?? 0
    ),
  }
}
