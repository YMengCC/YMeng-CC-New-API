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
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSecureVerification } from '@/features/auth/secure-verification'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import type { ManagedCleanup, UpdateStatus } from './managed-update-types'

type CleanupOperation = { cleanupId: string; submitted: boolean }

export function useManagedCleanup(
  enabled: boolean,
  status: UpdateStatus | undefined
) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const verification = useSecureVerification()
  const cancelVerification = verification.cancel
  const [confirmation, setConfirmation] = useState<ManagedCleanup | null>(null)
  const [pending, setPending] = useState(false)
  const operation = useRef<CleanupOperation | null>(null)
  const cleanupId = status?.cleanup?.cleanup_id
  const canClean = Boolean(
    enabled &&
    user?.role === 100 &&
    status?.supported &&
    status.cleanup_supported &&
    status.can_cleanup &&
    cleanupId &&
    !status.operation_id &&
    !status.draining &&
    status.state !== 'cleaning'
  )
  const current = useRef({ canClean, cleanupId })
  current.current = { canClean, cleanupId }
  const previousState = useRef(status?.state)

  useEffect(() => {
    if (previousState.current === 'cleaning' && status?.state !== 'cleaning') {
      void client.invalidateQueries({
        queryKey: ['managed-system-update', 'releases'],
      })
    }
    previousState.current = status?.state
  }, [client, status?.state])

  useEffect(
    () => () => {
      // An accepted POST belongs to the controller; only cancel unfinished verification.
      operation.current = null
      cancelVerification()
      setPending(false)
    },
    [enabled, cleanupId, user?.id, user?.role, sessionId, cancelVerification]
  )

  useEffect(
    () => () => setConfirmation(null),
    [enabled, user?.id, user?.role, sessionId]
  )

  const openConfirmation = () => {
    if (!canClean || operation.current || !status?.cleanup) return
    setConfirmation({ ...status.cleanup })
  }
  const confirmationExpired = Boolean(
    confirmation && (!canClean || confirmation.cleanup_id !== cleanupId)
  )
  const confirm = async () => {
    if (!confirmation || confirmationExpired || operation.current) return
    const cleanupId = confirmation.cleanup_id
    const owner = { userId: user?.id, sessionId }
    const active: CleanupOperation = { cleanupId, submitted: false }
    operation.current = active
    setConfirmation(null)
    setPending(true)
    try {
      const proof = await verification.requestVerification({
        scope: 'system.update.cleanup',
        context: { cleanup_id: cleanupId },
        title: t('Verify to clean up old instance'),
      })
      const latestStatus = client.getQueryData<UpdateStatus>([
        'managed-system-update',
        'status',
      ])
      const auth = useAuthStore.getState().auth
      if (
        !proof ||
        operation.current !== active ||
        !current.current.canClean ||
        latestStatus?.cleanup?.cleanup_id !== cleanupId ||
        !latestStatus.can_cleanup ||
        !latestStatus.supported ||
        !latestStatus.cleanup_supported ||
        latestStatus.draining ||
        latestStatus.operation_id ||
        latestStatus.state === 'cleaning' ||
        current.current.cleanupId !== cleanupId ||
        auth.user?.id !== owner.userId ||
        auth.user?.role !== 100 ||
        auth.session?.sid !== owner.sessionId
      ) {
        return
      }
      active.submitted = true
      // Keep one-time proofs outside mutation caches and never replay this POST.
      const response = await api.post(
        '/api/system-update/cleanup',
        { cleanup_id: cleanupId },
        {
          headers: {
            'X-Requested-With': 'YMeng-Update',
            'X-Security-Proof': proof.proof_token,
          },
          skipAuthRefresh: true,
        }
      )
      const next: UpdateStatus = requireServerSuccess(response.data).data
      if (operation.current === active) {
        client.setQueryData(['managed-system-update', 'status'], next)
      }
    } catch (error) {
      if (operation.current === active) handleServerError(error)
    } finally {
      if (active.submitted) {
        await client.invalidateQueries({ queryKey: ['managed-system-update'] })
      }
      if (operation.current === active) {
        operation.current = null
        setPending(false)
      }
    }
  }

  return {
    confirmation,
    confirmationExpired,
    pending,
    canClean,
    openConfirmation,
    closeConfirmation: () => setConfirmation(null),
    confirm,
    verification,
  }
}
