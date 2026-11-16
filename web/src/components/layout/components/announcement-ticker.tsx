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
import { Megaphone01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib/text'
import { getAnnouncementColorClass } from '@/lib/colors'
import { formatDate } from '@/lib/time'
import { cn } from '@/lib/utils'

type AnnouncementTickerProps = {
  className?: string
}

type TickerEntry = {
  key: string
  text: string
  colorClass: string
  publishedAt?: string
  date: string
}

// Roughly one third of a second per character, clamped to keep the speed
// readable for both a single short notice and a long list of announcements.
const MIN_DURATION_SECONDS = 18
const MAX_DURATION_SECONDS = 240

/**
 * Announcement ticker for the console top bar.
 *
 * Reads the announcements configured under Console Content, renders the plain
 * text with its publish date, and scrolls them in a seamless loop. The same
 * list is shown in the notification popover.
 */
export function AnnouncementTicker(props: AnnouncementTickerProps) {
  const { t } = useTranslation()
  const { items } = useAnnouncements()

  const entries = useMemo<TickerEntry[]>(() => {
    return items
      .map((item, index) => {
        const text = getPreviewText(item.content || '', 600)
          .replaceAll(/\s+/g, ' ')
          .trim()
        const parsed = item.publishDate ? new Date(item.publishDate) : null
        const validDate =
          parsed !== null && !Number.isNaN(parsed.getTime()) ? parsed : null

        return {
          key: `${item.id ?? 'item'}:${index}`,
          text,
          colorClass: getAnnouncementColorClass(item.type),
          publishedAt: validDate ? (item.publishDate ?? undefined) : undefined,
          date: validDate ? formatDate(validDate.getTime() / 1000) : '',
        }
      })
      .filter((entry) => entry.text.length > 0)
  }, [items])

  if (entries.length === 0) return null

  const characters = entries.reduce(
    (total, entry) => total + entry.text.length,
    0
  )
  const durationSeconds = Math.min(
    MAX_DURATION_SECONDS,
    Math.max(MIN_DURATION_SECONDS, Math.round(characters * 0.3))
  )

  // One copy is rendered twice so the -50% translation loops without a seam.
  // The spacing lives on each item, not on the track, or the seam would shift.
  const entryNodes = entries.map((entry) => (
    <li
      key={entry.key}
      data-announcement-item
      className='flex shrink-0 items-center gap-1.5 pe-8 text-xs'
    >
      <span
        className={cn('size-1.5 shrink-0 rounded-full', entry.colorClass)}
        aria-hidden='true'
      />
      <span className='text-foreground/80'>{entry.text}</span>
      {entry.date ? (
        <time
          dateTime={entry.publishedAt}
          className='text-muted-foreground/80 shrink-0 tabular-nums'
        >
          {entry.date}
        </time>
      ) : null}
    </li>
  ))

  return (
    <div
      role='region'
      aria-label={t('Announcements')}
      tabIndex={0}
      className={cn(
        'announcement-ticker border-primary/15 bg-primary/5 hidden h-7 min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-full border ps-1 pe-3 shadow-xs md:flex md:max-w-md',
        'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
        props.className
      )}
    >
      <IconBadge tone='primary' size='xs' className='rounded-full'>
        <HugeiconsIcon icon={Megaphone01Icon} strokeWidth={2} />
      </IconBadge>
      <div className='announcement-ticker-mask relative min-w-0 flex-1 overflow-hidden'>
        <div
          className='announcement-ticker-track flex w-max whitespace-nowrap'
          style={{ animationDuration: `${durationSeconds}s` }}
        >
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
              data-announcement-copy={copy === 1 ? 'duplicate' : undefined}
              className='flex shrink-0 items-center'
            >
              {entryNodes}
            </ul>
          ))}
        </div>
      </div>
    </div>
  )
}
