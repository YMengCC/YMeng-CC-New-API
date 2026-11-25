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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import {
  createOfficeSession,
  deleteOfficeSession,
  listOfficeSessions,
} from '../api'

const ACTIVE_SESSION_STORAGE_KEY = 'office:active-session'
const sessionsQueryKey = ['office', 'sessions'] as const

function readActiveSessionId(): string {
  return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) ?? ''
}

/** Office sessions of the signed-in admin and the one that is open. */
export function useOfficeSessions() {
  const queryClient = useQueryClient()
  const [activeId, setActiveIdState] = useState(readActiveSessionId)

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id)
    if (id) {
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
    }
  }, [])

  const sessionsQuery = useQuery({
    queryKey: sessionsQueryKey,
    queryFn: listOfficeSessions,
  })

  const createSession = useMutation({
    mutationFn: createOfficeSession,
    onSuccess: (session) => {
      setActiveId(session.id)
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
    },
  })
  const deleteSession = useMutation({
    mutationFn: deleteOfficeSession,
    onSuccess: (_, id) => {
      if (id === activeId) setActiveId('')
      void queryClient.invalidateQueries({ queryKey: sessionsQueryKey })
    },
  })

  return {
    sessions: sessionsQuery.data ?? [],
    isLoading: sessionsQuery.isLoading,
    isError: sessionsQuery.isError,
    activeId,
    setActiveId,
    createSession,
    deleteSession,
  }
}
