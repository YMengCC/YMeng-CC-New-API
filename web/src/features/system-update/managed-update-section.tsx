import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { ManagedCleanupAction } from './managed-cleanup-action'
import type { UpdateStatus } from './managed-update-types'
import { compareSystemVersions } from './releases'
import { useManagedCleanup } from './use-managed-cleanup'

type ManagedRelease = {
  tag: string
  name: string
  compatible: boolean
  reason: string
  image: string
}

export function ManagedUpdateSection(props: { enabled: boolean }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const client = useQueryClient()
  const [selected, setSelected] = useState<ManagedRelease | null>(null)
  const status = useQuery({
    queryKey: ['managed-system-update', 'status'],
    enabled: props.enabled && user?.role === 100,
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
    queryKey: ['managed-system-update', 'releases'],
    enabled:
      props.enabled &&
      user?.role === 100 &&
      !!status.data &&
      status.data.state !== 'unconfigured',
    queryFn: async (): Promise<ManagedRelease[]> => {
      const response = await api.get('/api/system-update/releases')
      return requireServerSuccess(response.data).data.releases
    },
  })
  const update = useMutation({
    mutationFn: async (release: ManagedRelease) => {
      const response = await api.post(
        '/api/system-update/update',
        { tag: release.tag },
        {
          headers: { 'X-Requested-With': 'YMeng-Update' },
        }
      )
      return requireServerSuccess(response.data)
    },
    onSuccess: () => setSelected(null),
    onError: (error) => {
      setSelected(null)
      handleServerError(error)
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['managed-system-update'] }),
  })
  const cleanup = useManagedCleanup(
    props.enabled &&
      user?.role === 100 &&
      status.isSuccess &&
      !update.isPending,
    status.data
  )
  const canInstall =
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
  const selectedIsCurrent =
    selected &&
    compareSystemVersions(selected.tag, status.data?.current_version) === 0
  const sortedReleases = [...(releases.data ?? [])].sort(
    (left, right) => compareSystemVersions(right.tag, left.tag) ?? 0
  )
  if (user?.role !== 100) return null
  return (
    <section
      className='flex min-w-0 flex-col gap-3'
      aria-label={t('Site updates')}
    >
      <Separator />
      <h3 className='font-medium'>{t('Site updates')}</h3>
      <p className='text-muted-foreground text-sm'>
        {t('Updates from YMeng-CC-New-API')}
      </p>
      {status.isPending && <p role='status'>{t('Checking updates...')}</p>}
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
      {props.enabled && sortedReleases.length > 0 && (
        <Accordion
          key={sortedReleases[0].tag}
          multiple
          defaultValue={[sortedReleases[0].tag]}
        >
          {sortedReleases.map((release) => {
            const isCurrent =
              compareSystemVersions(
                release.tag,
                status.data?.current_version
              ) === 0
            return (
              <AccordionItem key={release.tag} value={release.tag}>
                <AccordionTrigger className='min-w-0 gap-3 hover:no-underline'>
                  <span className='min-w-0 wrap-anywhere'>
                    {release.name || release.tag}
                  </span>
                </AccordionTrigger>
                <AccordionContent className='flex flex-col items-start gap-2'>
                  {release.reason && (
                    <p className='text-muted-foreground text-sm wrap-anywhere'>
                      {t(release.reason)}
                    </p>
                  )}
                  <Button
                    type='button'
                    disabled={!canInstall || !release.compatible || isCurrent}
                    onClick={() => setSelected(release)}
                  >
                    {isCurrent ? t('Current version') : t('Install update')}
                  </Button>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
      <ConfirmDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        title={t('Install update')}
        desc={t(
          'Prepare the new version while existing requests finish on the current version.'
        )}
        isLoading={update.isPending}
        disabled={!canInstall || !selected?.compatible || !!selectedIsCurrent}
        handleConfirm={() => {
          if (canInstall && selected?.compatible && !selectedIsCurrent) {
            update.mutate(selected)
          }
        }}
      />
    </section>
  )
}
