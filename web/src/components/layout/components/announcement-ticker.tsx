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
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { IconBadge } from '@/components/ui/icon-badge'
import { AnnouncementDetailModal } from '@/features/dashboard/components/overview/announcement-detail-dialog'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib/text'
import type { AnnouncementItem } from '@/features/dashboard/types'
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
  source: AnnouncementItem
}

// The bar is a last-glance surface: a single entry is folded to this many
// characters and the full text is one click away in the detail dialog.
const PREVIEW_LENGTH = 120

// A faster scroll is unreadable and a slower one drags; ~40px per second keeps
// both a single short overflow and a long list moving at a similar pace.
const PIXELS_PER_SECOND = 40
const MIN_DURATION_SECONDS = 12
const MAX_DURATION_SECONDS = 60

/**
 * Announcement ticker for the console top bar.
 *
 * Reads the announcements configured under Console Content, folds each entry to
 * a short preview, and only scrolls when the previews are wider than the pill.
 * Clicking an entry opens the full announcement; the same list is also shown in
 * the notification popover.
 */
export function AnnouncementTicker(props: AnnouncementTickerProps) {
  const { t } = useTranslation()
  const { items } = useAnnouncements()
  const maskRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [marquee, setMarquee] = useState({
    overflowing: false,
    durationSeconds: 0,
  })
  const [selected, setSelected] = useState<AnnouncementItem | null>(null)

  const entries = useMemo<TickerEntry[]>(() => {
    return items
      .map((item, index) => {
        const text = getPreviewText(item.content || '', PREVIEW_LENGTH)
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
          source: item,
        }
      })
      .filter((entry) => entry.text.length > 0)
  }, [items])

  useLayoutEffect(() => {
    const mask = maskRef.current
    const list = listRef.current
    if (!mask || !list) return

    const measure = () => {
      const overflowing = list.offsetWidth > mask.offsetWidth + 1
      const durationSeconds = overflowing
        ? Math.min(
            MAX_DURATION_SECONDS,
            Math.max(
              MIN_DURATION_SECONDS,
              Math.round(list.offsetWidth / PIXELS_PER_SECOND)
            )
          )
        : 0

      setMarquee((previous) =>
        previous.overflowing === overflowing &&
        previous.durationSeconds === durationSeconds
          ? previous
          : { overflowing, durationSeconds }
      )
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(mask)
    return () => observer.disconnect()
  }, [entries])

  if (entries.length === 0) return null

  // Each copy repeats the same announcements; the second one only exists to
  // make the -50% translation loop without a seam. The spacing lives on each
  // item, not on the track, or the seam would shift.
  const renderCopy = (copy: number) => {
    const isDuplicate = copy === 1

    return (
      <ul
        key={copy}
        ref={isDuplicate ? undefined : listRef}
        aria-hidden={isDuplicate ? true : undefined}
        data-announcement-copy={isDuplicate ? 'duplicate' : undefined}
        className='flex shrink-0 items-center'
      >
        {entries.map((entry) => (
          <li
            key={entry.key}
            data-announcement-item
            className='flex shrink-0 items-center pe-6'
          >
            <button
              type='button'
              onClick={() => setSelected(entry.source)}
              tabIndex={isDuplicate ? -1 : undefined}
              className={cn(
                'flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full text-xs text-foreground/80 transition-colors',
                'hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none'
              )}
            >
              <span
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  entry.colorClass
                )}
                aria-hidden='true'
              />
              <span>{entry.text}</span>
              {entry.date ? (
                <time
                  dateTime={entry.publishedAt}
                  className='bg-background/70 text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-none tabular-nums'
                >
                  {entry.date}
                </time>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const copies = marquee.overflowing ? [0, 1] : [0]

  return (
    <div
      role='region'
      aria-label={t('Announcements')}
      className={cn(
        'announcement-ticker hidden h-7 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full border border-primary/20 bg-primary/[0.06] ps-1 pe-2.5 shadow-xs transition-colors md:flex md:max-w-md',
        'hover:border-primary/30 hover:bg-primary/10',
        props.className
      )}
    >
      <IconBadge
        tone='primary'
        size='xs'
        className='ring-primary/15 rounded-full ring-1'
      >
        <HugeiconsIcon icon={Megaphone01Icon} strokeWidth={2} />
      </IconBadge>
      <div
        ref={maskRef}
        className='announcement-ticker-mask relative min-w-0 flex-1 overflow-hidden'
      >
        <div
          className='announcement-ticker-track flex w-max whitespace-nowrap'
          data-scrolling={marquee.overflowing ? 'true' : undefined}
          style={
            marquee.overflowing
              ? { animationDuration: `${marquee.durationSeconds}s` }
              : undefined
          }
        >
          {copies.map(renderCopy)}
        </div>
      </div>

      <AnnouncementDetailModal
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        announcement={selected}
      />
    </div>
  )
}
