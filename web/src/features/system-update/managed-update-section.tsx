import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { ManagedCleanupAction } from './managed-cleanup-action'
import { managedReleasesQueryOptions } from './managed-release-query'
import type { UpdateStatus } from './managed-update-types'
import { compareSystemVersions } from './releases'
import { useManagedCleanup } from './use-managed-cleanup'

type ManagedUpdateContent = {
  statusContent: ReactNode
  renderReleaseAction: (tag: string) => ReactNode
  refresh: () => Promise<void>
  refreshing: boolean
}

type ManagedUpdateSectionProps = {
  enabled: boolean
  children: (managed: ManagedUpdateContent) => ReactNode
}

export function ManagedUpdateSection(props: ManagedUpdateSectionProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isRoot = user?.role === 100
  const client = useQueryClient()
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const refreshRequest = useRef<Promise<void> | null>(null)
  const status = useQuery({
    queryKey: ['managed-system-update', 'status'],
    enabled: props.enabled && isRoot,
    queryFn: async (): Promise<UpdateStatus> => {
      const response = await api.get('/api/system-update/status')
      return requireServerSuccess(response.data).data
    },
    refetchInterval: (query) => {
      if (!props.enabled) return false
      return query.state.data?.operation_id ||
        query.state.data?.state === 'cleaning'
        ? 3000
        : false
    },
  })
  const releases = useQuery({
    ...managedReleasesQueryOptions,
    enabled:
      props.enabled &&
      isRoot &&
      !!status.data &&
      status.data.state !== 'unconfigured',
  })
  const update = useMutation({
    mutationFn: async (tag: string) => {
      const response = await api.post(
        '/api/system-update/update',
        { tag },
        {
          headers: { 'X-Requested-With': 'YMeng-Update' },
        }
      )
      return requireServerSuccess(response.data)
    },
    onSuccess: () => setSelectedTag(null),
    onError: (error) => {
      setSelectedTag(null)
      handleServerError(error)
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['managed-system-update'] }),
  })
  const cleanup = useManagedCleanup(
    props.enabled && isRoot && status.isSuccess && !update.isPending,
    status.data
  )
  const canInstall =
    props.enabled &&
    isRoot &&
    !refreshing &&
    status.isSuccess &&
    releases.isSuccess &&
    status.data.supported &&
    !status.data.operation_id &&
    !status.data.draining &&
    (status.data.can_update ??
      (status.data.state === 'ready' || status.data.state === 'failed')) &&
    status.data.state !== 'cleaning' &&
    !cleanup.pending &&
    !update.isPending
  const selected = releases.data?.find((release) => release.tag === selectedTag)
  const selectedIsCurrent =
    compareSystemVersions(selected?.tag, status.data?.current_version) === 0

  const refresh = (): Promise<void> => {
    if (!props.enabled || !isRoot) return Promise.resolve()
    if (refreshRequest.current) return refreshRequest.current
    setRefreshing(true)
    const request = (async () => {
      try {
        const next = await status.refetch({ cancelRefetch: false })
        if (!next.isError && next.data && next.data.state !== 'unconfigured') {
          await releases.refetch({ cancelRefetch: false })
        }
      } finally {
        refreshRequest.current = null
        setRefreshing(false)
      }
    })()
    refreshRequest.current = request
    return request
  }

  const statusContent = isRoot ? (
    <div className='flex min-w-0 flex-col gap-3'>
      {status.isPending && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Checking updates...')}
        </p>
      )}
      {(status.isError || releases.isError) && (
        <Alert variant='destructive'>
          <AlertDescription>
            {t('Unable to contact the update service.')}
          </AlertDescription>
        </Alert>
      )}
      {status.data && (
        <Alert>
          <AlertDescription>
            {status.data.reason
              ? t(status.data.reason)
              : t('Update state: {{state}}', { state: status.data.state })}
          </AlertDescription>
        </Alert>
      )}
      <ManagedCleanupAction status={status.data} cleanup={cleanup} />
    </div>
  ) : null

  const renderReleaseAction = (tag: string): ReactNode => {
    if (!isRoot) return null
    const release = releases.data?.find((item) => item.tag === tag)
    const isCurrent =
      compareSystemVersions(tag, status.data?.current_version) === 0
    return (
      <div className='flex flex-col items-start gap-2'>
        {release?.reason && (
          <p className='text-muted-foreground text-sm wrap-anywhere'>
            {t(release.reason)}
          </p>
        )}
        <Button
          type='button'
          disabled={!canInstall || !release?.compatible || isCurrent}
          onClick={() => setSelectedTag(tag)}
        >
          {isCurrent ? t('Current version') : t('Install update')}
        </Button>
      </div>
    )
  }

  return (
    <>
      {props.children({
        statusContent,
        renderReleaseAction,
        refresh,
        refreshing,
      })}
      {isRoot && (
        <ConfirmDialog
          open={selectedTag !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedTag(null)
          }}
          title={t('Install update')}
          desc={t(
            'Prepare the new version while existing requests finish on the current version.'
          )}
          isLoading={update.isPending}
          disabled={!canInstall || !selected?.compatible || selectedIsCurrent}
          handleConfirm={() => {
            if (canInstall && selected?.compatible && !selectedIsCurrent) {
              update.mutate(selected.tag)
            }
          }}
        />
      )}
    </>
  )
}
