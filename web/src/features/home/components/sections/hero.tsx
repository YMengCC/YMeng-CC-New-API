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
import { FaTelegram } from 'react-icons/fa'
import { RiQqLine } from 'react-icons/ri'

import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { HeroParticles } from '../hero-particles'
import { BaoCodePanel } from './baocode-panel'
import { CommunityCard } from './community-card'
import { CommunityChatPreview } from './community-chat-preview'
import { ConsolePanel } from './console-panel'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

// The first screen, split by a slanted seam (see .home-split in index.css):
// BaoCode's beginner entry on the paper side, the developer console entry on
// the other. Stacked below lg with the developer entry first (its column comes
// first in the DOM), and the paper side below it ending in a slanted edge.
export function Hero(props: HeroProps) {
  const { status } = useStatus()

  const qqLink = (
    (status?.community_qq_group_link as string | undefined) ?? ''
  ).trim()
  const telegramLink = (
    (status?.community_telegram_link as string | undefined) ?? ''
  ).trim()
  const hasCommunity = Boolean(qqLink || telegramLink)

  return (
    <section
      className={cn(
        'home-split relative isolate overflow-hidden',
        props.className
      )}
    >
      {/* Console side: layered aurora glow and architectural grid centered behind YMeng CC */}
      <div
        aria-hidden
        data-depth='-3'
        data-depth-breathe
        className='pointer-events-none absolute inset-0 -z-20 opacity-45 dark:opacity-30'
        style={{
          background: [
            'radial-gradient(ellipse 52% 54% at 54% 34%, oklch(0.72 0.19 252 / 65%) 0%, transparent 72%)',
            'radial-gradient(ellipse 38% 42% at 86% 14%, oklch(0.68 0.16 205 / 50%) 0%, transparent 70%)',
            'radial-gradient(ellipse 46% 42% at 58% 82%, oklch(0.68 0.16 288 / 42%) 0%, transparent 72%)',
          ].join(', '),
        }}
      />
      <div
        aria-hidden
        data-depth='-2'
        className='pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_58%_62%_at_55%_38%,black_24%,transparent_100%)] bg-[size:3.5rem_3.5rem] opacity-[0.16] dark:opacity-[0.1]'
      />

      {/* Community corner, cut off by a second seam when group links are configured */}
      {hasCommunity && (
        <>
          <div
            aria-hidden
            className='home-community-wedge pointer-events-none absolute inset-x-0 top-0 -z-[15] hidden h-[17.5rem] lg:block'
          />
          <div
            aria-hidden
            className='home-community-seam pointer-events-none absolute inset-x-0 top-0 -z-[15] hidden h-[17.5rem] lg:block'
          />
        </>
      )}

      {/* Paper side, seam and medallion badge from lg up */}
      <div
        aria-hidden
        className='home-paper home-paper-clip-lg pointer-events-none absolute inset-0 -z-10 hidden bg-[var(--paper)] lg:block'
      >
        <div className='home-paper-grid' />
        <div
          className='absolute inset-0 opacity-60 dark:opacity-35'
          style={{
            background:
              'radial-gradient(ellipse 55% 45% at 11% 24%, rgba(226, 179, 115, 0.22) 0%, transparent 70%)',
          }}
        />
      </div>
      <div
        aria-hidden
        className='home-seam-lg pointer-events-none absolute inset-0 -z-10 hidden lg:block'
      />

      {/* Lightweight ambient particle field behind both hero columns */}
      <HeroParticles />

      <div
        aria-hidden
        data-depth-tilt='14'
        data-depth-magnetic=''
        data-depth-breathe='fast'
        data-relief='plate'
        className='home-paper home-seam-badge absolute top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:flex'
      >
        ×
      </div>

      {/* Full-width fluid split: beginner rail pinned near the left viewport
          edge, community tucked into the upper-right wedge, and YMeng CC
          anchored across the visual center. */}
      <div className='home-hero-grid grid w-full grid-cols-1 lg:min-h-[100svh] lg:grid-cols-2 lg:gap-x-0'>
        {/* The gap between the community region and the developer entry sits
            on the region itself, so an empty region leaves no stray gap. */}
        <div
          className={cn(
            'relative flex flex-col items-start px-6 pt-24 pb-20 md:px-10 lg:col-start-2 lg:row-start-1 lg:min-w-0 lg:px-0 lg:pr-6 lg:pb-20 xl:pr-10 2xl:pr-14',
            hasCommunity ? 'lg:pt-[4.25rem]' : 'lg:justify-center lg:pt-20'
          )}
        >
          {/* The community region: the join card and the chat example share
              one row from lg up, both on top of the faint group emblems. */}
          <div
            className={cn(
              'home-community-slice relative w-full min-w-0 empty:mb-0',
              hasCommunity ? 'mb-10 lg:mb-6 xl:mb-7' : 'mb-0'
            )}
          >
            {hasCommunity && (
              // Above the transparent card text on lg, behind it below lg.
              <div
                aria-hidden
                data-community-emblem
                className='pointer-events-none absolute inset-0 z-10 overflow-hidden opacity-40 lg:-z-10 lg:opacity-100'
              >
                {qqLink && (
                  <RiQqLine
                    data-relief='float'
                    data-depth-float='3'
                    className='absolute top-2 right-[12rem] size-36 -rotate-12 text-sky-500/[0.07] dark:text-sky-300/[0.06]'
                  />
                )}
                {telegramLink && (
                  <FaTelegram
                    data-relief='float'
                    data-depth-float='1'
                    className={cn(
                      'absolute -top-4 -right-4 text-sky-500/[0.07] dark:text-sky-300/[0.06]',
                      qqLink ? 'size-20 rotate-12' : 'size-36 -rotate-12'
                    )}
                  />
                )}
              </div>
            )}
            <div className='home-community-content flex w-full min-w-0 flex-col items-center gap-5 empty:mb-0 lg:flex-row lg:items-start lg:justify-end lg:gap-4 lg:pl-10'>
              <CommunityCard className='max-w-md lg:max-w-sm lg:min-w-0 lg:flex-1' />
              <CommunityChatPreview className='max-w-md lg:w-60 lg:max-w-[15rem] lg:shrink-0' />
            </div>
          </div>
          <div className='home-console-stage w-full min-w-0'>
            <ConsolePanel isAuthenticated={props.isAuthenticated} />
          </div>
        </div>

        <div
          className={cn(
            'relative flex items-center px-6 pt-20 pb-24 md:px-10 lg:col-start-1 lg:row-start-1 lg:min-w-0 lg:pt-20 lg:pr-[calc(var(--seam-top)-var(--seam-middle)+1.75rem)] lg:pb-20 lg:pl-6 xl:pl-10 2xl:pl-12',
            hasCommunity ? 'lg:items-start' : 'lg:items-center'
          )}
        >
          {/* Paper side below lg: its own background with a slanted bottom */}
          <div
            aria-hidden
            className='home-paper home-paper-clip-sm pointer-events-none absolute inset-0 -z-10 bg-[var(--paper)] lg:hidden'
          >
            <div className='home-paper-grid' />
          </div>
          <div
            aria-hidden
            className='home-seam-sm pointer-events-none absolute inset-0 -z-10 lg:hidden'
          />
          <div
            aria-hidden
            data-depth-tilt='14'
            data-depth-breathe='fast'
            data-relief='plate'
            className='home-paper home-seam-badge absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 translate-y-1/2 lg:hidden'
          >
            ×
          </div>
          <BaoCodePanel />
        </div>
      </div>
    </section>
  )
}
