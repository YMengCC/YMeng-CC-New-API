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
import { lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestampToDate } from '@/lib/format'

import {
  compareSystemVersions,
  getForkSystemReleaseUrl,
  parseSystemVersion,
  type SystemRelease,
} from './releases'

const ReleaseMarkdown = lazy(() =>
  import('@/components/ui/markdown').then((module) => ({
    default: module.Markdown,
  }))
)

type ReleaseHistoryProps = {
  releases: SystemRelease[]
  currentVersion: string | undefined
  renderReleaseAction?: (tag: string) => ReactNode
}

export function ReleaseHistory(props: ReleaseHistoryProps) {
  const { t } = useTranslation()
  const latestTag = props.releases[0]?.tag_name

  return (
    <section className='min-w-0' aria-label={t('Release history')}>
      <h3 className='mb-2 text-sm font-medium'>{t('Release history')}</h3>
      <Accordion multiple defaultValue={latestTag ? [latestTag] : []}>
        {props.releases.map((release) => {
          const releaseUrl = getForkSystemReleaseUrl(release)
          const isPrerelease =
            release.prerelease ||
            (parseSystemVersion(release.tag_name)?.stage ?? 3) < 3
          return (
            <AccordionItem key={release.tag_name} value={release.tag_name}>
              <AccordionTrigger className='min-w-0 gap-3 hover:no-underline'>
                <span className='flex min-w-0 flex-1 flex-col gap-1.5'>
                  <span className='flex min-w-0 flex-wrap items-center gap-2'>
                    <span className='min-w-0 break-all'>
                      {release.tag_name}
                    </span>
                    {release.tag_name === latestTag && (
                      <Badge>{t('Latest release')}</Badge>
                    )}
                    {compareSystemVersions(
                      props.currentVersion,
                      release.tag_name
                    ) === 0 && (
                      <Badge variant='outline'>{t('Current version')}</Badge>
                    )}
                    {isPrerelease && (
                      <Badge variant='warning'>{t('Pre-release')}</Badge>
                    )}
                  </span>
                  {release.name && release.name !== release.tag_name && (
                    <span className='text-muted-foreground text-sm font-normal wrap-anywhere'>
                      {release.name}
                    </span>
                  )}
                  {release.published_at && (
                    <span className='text-muted-foreground flex flex-wrap gap-x-1 text-xs font-normal'>
                      <span>{t('Published at')}</span>
                      <time dateTime={release.published_at}>
                        {formatTimestampToDate(
                          Date.parse(release.published_at),
                          'milliseconds'
                        )}
                      </time>
                    </span>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent className='flex min-w-0 flex-col gap-3 pb-4'>
                {release.body?.trim() ? (
                  <Suspense fallback={<Skeleton className='h-24 w-full' />}>
                    <ReleaseMarkdown baseUrl={releaseUrl}>
                      {release.body}
                    </ReleaseMarkdown>
                  </Suspense>
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    {t('No release notes provided.')}
                  </p>
                )}
                {props.renderReleaseAction?.(release.tag_name)}
                <Button
                  variant='outline'
                  size='sm'
                  className='self-start'
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
                  {t('View release')}
                </Button>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </section>
  )
}
