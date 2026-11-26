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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SSE } from 'sse.js'

import { getFreshAuthHeaders } from '@/lib/api'
import { getServerErrorMessage } from '@/lib/server-error-message'

import {
  getOfficeSessionEvents,
  officeTurnStreamUrl,
  stopOfficeTurn,
} from '../api'
import type { OfficeEvent } from '../types'

const SSE_CLOSED_READY_STATE = 2

/** The part of an sse.js event the hook reads; `data` is the frame payload. */
type OfficeStreamEvent = { data?: string }

/**
 * Recorded events of a session plus the turn that is running right now.
 * A turn lives as long as its stream: closing the page or switching sessions
 * stops it on the server.
 */
export function useOfficeTurn(sessionId: string) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [liveEvents, setLiveEvents] = useState<OfficeEvent[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const sourceRef = useRef<SSE | null>(null)
  const runningSessionRef = useRef<string | null>(null)

  const eventsQuery = useQuery({
    queryKey: ['office', 'events', sessionId],
    queryFn: () => getOfficeSessionEvents(sessionId),
    enabled: sessionId !== '',
    // Running events are appended locally; a background refetch would
    // repeat them, so the replay is only loaded when a session is opened.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    setLiveEvents([])
    runningSessionRef.current = null
    const source = sourceRef.current
    sourceRef.current = null
    source?.close()
    setIsRunning(false)
  }, [sessionId])

  const refreshSession = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['office', 'sessions'] })
    void queryClient.invalidateQueries({
      queryKey: ['office', 'files', sessionId],
    })
  }, [queryClient, sessionId])

  const stop = useCallback(() => {
    const source = sourceRef.current
    sourceRef.current = null
    source?.close()
    setIsRunning(false)
    if (runningSessionRef.current === null) return
    runningSessionRef.current = null
    setLiveEvents((previous) => [
      ...previous,
      { type: 'turn.failed', error: { message: t('The turn was stopped') } },
    ])
    refreshSession()
    void stopOfficeTurn(sessionId).catch(() => undefined)
  }, [refreshSession, sessionId, t])

  const send = useCallback(
    async (prompt: string, model: string, group: string) => {
      if (!sessionId || runningSessionRef.current !== null) return
      runningSessionRef.current = sessionId
      setIsRunning(true)

      const finish = () => {
        if (runningSessionRef.current !== sessionId) return
        runningSessionRef.current = null
        sourceRef.current = null
        setIsRunning(false)
        refreshSession()
      }
      const failWith = (message: string) =>
        setLiveEvents((previous) => [
          ...previous,
          { type: 'turn.failed', error: { message } },
        ])

      let headers: Record<string, string>
      try {
        headers = await getFreshAuthHeaders()
      } catch (error) {
        runningSessionRef.current = null
        setIsRunning(false)
        toast.error(
          getServerErrorMessage(
            error,
            t('The office task could not be started')
          )
        )
        return
      }
      // The session was switched or stopped while the headers were loading.
      if (runningSessionRef.current !== sessionId) return

      let terminal = false
      let closed = false
      let startFailure = ''
      const source = new SSE(officeTurnStreamUrl(sessionId), {
        method: 'POST',
        headers,
        payload: JSON.stringify({ prompt, model, group }),
      })
      source.addEventListener('message', (event: OfficeStreamEvent) => {
        const data = event.data ?? ''
        // Comment frames only keep the connection alive.
        if (!data || data.startsWith(':')) return
        let parsed: OfficeEvent
        try {
          parsed = JSON.parse(data) as OfficeEvent
        } catch {
          return
        }
        if (parsed.type === 'turn.completed' || parsed.type === 'turn.failed') {
          terminal = true
        }
        setLiveEvents((previous) => [...previous, parsed])
      })
      source.addEventListener('error', (event: OfficeStreamEvent) => {
        if (terminal || source.readyState === SSE_CLOSED_READY_STATE) return
        startFailure = getServerStartFailure(event.data, t)
      })
      // The stream ends after the terminal event, on a rejected start and
      // when the connection drops; whichever event reports the closed state
      // first finalises the turn.
      const onClosed = () => {
        if (closed) return
        closed = true
        if (!terminal) {
          failWith(startFailure || t('Connection to the office task was lost'))
        }
        finish()
      }
      source.addEventListener('readystatechange', () => {
        if (source.readyState === SSE_CLOSED_READY_STATE) onClosed()
      })
      source.addEventListener('abort', onClosed)
      source.addEventListener('end', onClosed)
      sourceRef.current = source
      source.stream()
    },
    [refreshSession, sessionId, t]
  )

  return {
    events: [...(eventsQuery.data ?? []), ...liveEvents],
    isLoadingEvents: eventsQuery.isPending && sessionId !== '',
    eventsError: eventsQuery.error,
    retryEvents: eventsQuery.refetch,
    isRunning,
    send,
    stop,
  }
}

/** A rejected turn start arrives as the JSON error body of the stream. */
function getServerStartFailure(
  data: string | undefined,
  t: (key: string) => string
): string {
  if (!data) return ''
  try {
    return getServerErrorMessage(JSON.parse(data), '')
  } catch {
    return t('The office task could not be started')
  }
}
