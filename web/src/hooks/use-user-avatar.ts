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
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

// Cache authenticated blobs across consumers. Object URLs belong to individual
// mounts so unmounting one avatar cannot revoke an image another still uses.
export function useUserAvatar(
  userId: number | undefined,
  version: number | undefined
): string | null {
  const viewerId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const enabled = Boolean(viewerId && userId && version && version > 0)
  const query = useQuery({
    queryKey: ['user-avatar', viewerId, sessionId, userId, version],
    enabled,
    queryFn: async ({ signal }): Promise<Blob | null> => {
      try {
        const response = await api.get<Blob>(`/api/user/avatar/${userId}`, {
          params: { v: version },
          responseType: 'blob',
          skipErrorHandler: true,
          headers: { 'Cache-Control': null },
          disableDuplicate: true,
          signal,
        })
        return ['image/jpeg', 'image/png', 'image/webp'].includes(
          response.data.type
        )
          ? response.data
          : null
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return null
        }
        throw error
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
    meta: { errorToast: false },
  })
  const blob = enabled ? query.data : null
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    setImage({ blob, url })
    return () => URL.revokeObjectURL(url)
  }, [blob])
  return blob && image?.blob === blob ? image.url : null
}
