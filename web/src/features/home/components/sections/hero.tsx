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
import { HeroTerminalDemo } from '../hero-terminal-demo'
import { CommunityCard } from './community-card'
import { CommunityChatPreview } from './community-chat-preview'
import { ConsolePanel } from './console-panel'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

// Seamless centered first screen: brand showcase, primary CTAs, supported apps,
// an optional lightweight community strip when QQ or Telegram links are
// configured, and the wide two-column API terminal demo underneath.
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
      className={cn('relative isolate overflow-hidden', props.className)}
    >
      {/* Symmetrical ambient aurora glow and architectural grid behind the hero */}
      <div
        aria-hidden
        data-depth='-3'
        data-depth-breathe
        className='pointer-events-none absolute inset-0 -z-20 opacity-45 dark:opacity-30'
        style={{
          background: [
            'radial-gradient(ellipse 56% 50% at 50% 24%, oklch(0.72 0.19 252 / 62%) 0%, transparent 72%)',
            'radial-gradient(ellipse 38% 42% at 22% 34%, oklch(0.68 0.16 205 / 44%) 0%, transparent 72%)',
            'radial-gradient(ellipse 40% 42% at 78% 36%, oklch(0.68 0.16 288 / 42%) 0%, transparent 72%)',
          ].join(', '),
        }}
      />
      <div
        aria-hidden
        data-depth='-2'
        className='pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_68%_58%_at_50%_28%,black_22%,transparent_100%)] bg-[size:3.5rem_3.5rem] opacity-[0.16] dark:opacity-[0.1]'
      />

      {/* Unified ambient particle field across the full hero canvas */}
      <HeroParticles />

      <div className='relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-28 pb-12 sm:pt-32 md:pt-36 md:pb-16'>
        <ConsolePanel isAuthenticated={props.isAuthenticated} />

        {hasCommunity && (
          <div
            data-community-strip=''
            data-relief='raised'
            data-depth-tilt='3'
            data-depth-glare=''
            className='landing-animate-fade-up bg-card/75 dark:bg-card/65 relative mt-8 w-full max-w-4xl overflow-hidden rounded-2xl border border-sky-500/20 px-5 py-4 text-left opacity-0 shadow-[0_20px_48px_-30px_rgba(18,183,245,0.45)] backdrop-blur-md lg:mt-9 lg:px-6 lg:py-5 dark:border-sky-400/20'
            style={{ animationDelay: '360ms' }}
          >
            <div
              aria-hidden
              data-community-emblem=''
              className='pointer-events-none absolute inset-0 z-0 overflow-hidden'
            >
              {qqLink && (
                <RiQqLine
                  data-relief='float'
                  data-depth-float='3'
                  className='absolute -bottom-6 left-1/3 size-32 -rotate-12 text-sky-500/[0.06] dark:text-sky-300/[0.05]'
                />
              )}
              {telegramLink && (
                <FaTelegram
                  data-relief='float'
                  data-depth-float='1'
                  className={cn(
                    'absolute -top-5 -right-5 text-sky-500/[0.06] dark:text-sky-300/[0.05]',
                    qqLink ? 'size-24 rotate-12' : 'size-32 -rotate-12'
                  )}
                />
              )}
            </div>

            <div className='home-community-content relative z-10 flex w-full min-w-0 flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6'>
              <CommunityCard className='min-w-0 flex-1' />
              <CommunityChatPreview className='w-full lg:w-72 lg:shrink-0 xl:w-80' />
            </div>
          </div>
        )}

        <div
          className={cn(
            'landing-animate-fade-up w-full max-w-4xl opacity-0',
            hasCommunity ? 'mt-6 lg:mt-7' : 'mt-9 lg:mt-11'
          )}
          style={{ animationDelay: hasCommunity ? '420ms' : '360ms' }}
        >
          <HeroTerminalDemo />
        </div>
      </div>
    </section>
  )
}
