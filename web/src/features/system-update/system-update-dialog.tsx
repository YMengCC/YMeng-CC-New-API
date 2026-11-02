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
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { ManagedUpdateSection } from './managed-update-section'
import { ReleaseHistory } from './release-history'
import { getForkSystemReleaseUrl } from './releases'
import {
  getUpdateErrorMessage,
  type useSystemUpdate,
} from './use-system-update'

type SystemUpdateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  update: ReturnType<typeof useSystemUpdate>
}

export function SystemUpdateDialog(props: SystemUpdateDialogProps) {
  const { t } = useTranslation()
  const update = props.update
  const release = update.release
  const snapshot = update.snapshot
  const releaseUrl = release ? getForkSystemReleaseUrl(release) : null
  const canIgnore = release && (update.hasUpdate || update.comparison === null)
  let statusText = t('Updates have not been checked yet.')
  if (update.checking) {
    statusText = release ? t('Checking updates...') : ''
  } else if (release) {
    if (update.isIgnored) {
      statusText = t('This version is ignored')
    } else if (update.comparison === null) {
      statusText = ''
    } else if (update.hasUpdate) {
      statusText = t('New version available: {{version}}', {
        version: release.tag_name,
      })
    } else {
      statusText = t('No newer version available.')
    }
  } else if (snapshot?.lastCheckedAt) {
    statusText = ''
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      trigger={props.trigger}
      title={t('System updates')}
      description={t('Updates from YMeng-CC-New-API')}
      bodyClassName='flex flex-col gap-4'
      footerClassName='sm:flex-wrap'
      footer={
        <>
          {(canIgnore || update.isIgnored) && (
            <Button
              type='button'
              variant='ghost'
              className='sm:me-auto'
              onClick={() => update.setIgnored(!update.isIgnored)}
            >
              {update.isIgnored
                ? t('Restore notifications')
                : t('Ignore this version')}
            </Button>
          )}
          <Button
            type='button'
            variant='outline'
            disabled={update.checking || !update.online}
            onClick={() => void update.checkNow()}
          >
            {update.checking ? t('Checking updates...') : t('Check again')}
          </Button>
          {releaseUrl && (
            <Button
              nativeButton={false}
              role='link'
              render={
                <a
                  href={releaseUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              {t('Go to GitHub')}
            </Button>
          )}
        </>
      }
    >
      <dl className='grid min-w-0 gap-3 text-sm sm:grid-cols-2'>
        <div className='min-w-0'>
          <dt className='text-muted-foreground'>{t('Current version')}</dt>
          <dd className='font-medium break-all'>
            {update.currentVersion || t('Unknown version')}
          </dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-muted-foreground'>{t('Latest version')}</dt>
          <dd className='font-medium break-all'>
            {release?.tag_name || t('Unknown')}
          </dd>
        </div>
      </dl>
      {statusText && (
        <p role='status' aria-live='polite' className='text-sm'>
          {statusText}
        </p>
      )}
      {!update.online && (
        <Alert>
          <AlertDescription>
            {t('You are offline. Updates will be checked when you reconnect.')}
          </AlertDescription>
        </Alert>
      )}
      {snapshot?.error && release && (
        <Alert variant='destructive'>
          <AlertDescription>
            {getUpdateErrorMessage(snapshot.error, t)}
            <p>{t('Showing the last successfully checked releases.')}</p>
          </AlertDescription>
        </Alert>
      )}
      {!release && update.checking && (
        <LoadingState className='min-h-24' message={t('Checking updates...')} />
      )}
      {!release && !update.checking && snapshot?.error && (
        <ErrorState
          className='min-h-24'
          title={t('Failed to check for updates')}
          description={getUpdateErrorMessage(snapshot.error, t)}
        />
      )}
      {!release &&
        !update.checking &&
        !snapshot?.error &&
        !!snapshot?.lastCheckedAt && (
          <EmptyState className='min-h-24' title={t('No releases found.')} />
        )}
      {props.open && release && (
        <ReleaseHistory
          key={release.tag_name}
          releases={update.releases}
          currentVersion={update.currentVersion}
        />
      )}
      <ManagedUpdateSection enabled={props.open} />
    </Dialog>
  )
}
