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
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { IconType } from 'react-icons'
import { FaTelegram } from 'react-icons/fa'
import { RiQqFill } from 'react-icons/ri'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

interface CommunityCardProps {
  className?: string
}

interface CommunityEntry {
  href: string
  name: string
  label: string
  icon: IconType
  buttonClassName: string
  avatarClassName: string
}

// The site's group chat rendered inside the lightweight bottom hero strip.
// Both links come from admin settings and each entry is hidden while empty.
export function CommunityCard(props: CommunityCardProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { systemName } = useSystemConfig()

  const qqLink = (
    (status?.community_qq_group_link as string | undefined) ?? ''
  ).trim()
  const telegramLink = (
    (status?.community_telegram_link as string | undefined) ?? ''
  ).trim()

  const entries: CommunityEntry[] = []
  if (qqLink) {
    entries.push({
      href: qqLink,
      name: 'QQ',
      label: t('Join QQ group'),
      icon: RiQqFill,
      buttonClassName: 'bg-[#12b7f5] hover:bg-[#0aa3dc]',
      avatarClassName:
        'from-[#12b7f5] to-[#0a8fd6] shadow-[0_10px_24px_-10px_rgba(18,183,245,0.9)]',
    })
  }
  if (telegramLink) {
    entries.push({
      href: telegramLink,
      name: 'Telegram',
      label: t('Join Telegram group'),
      icon: FaTelegram,
      buttonClassName: 'bg-[#229ED9] hover:bg-[#1c8cc0]',
      avatarClassName:
        'from-[#229ED9] to-[#1a7fb3] shadow-[0_10px_24px_-10px_rgba(34,158,217,0.9)]',
    })
  }

  if (entries.length === 0) return null

  const primary = entries[0]
  const PrimaryIcon = primary.icon
  const secondary = entries[1]
  const topics = [t('Q&A'), t('Feedback'), t('New models')]

  return (
    <div
      data-community-card=''
      className={cn('w-full min-w-0', props.className)}
    >
      <div className='flex items-center gap-3.5'>
        <span
          data-depth-layer='3'
          className='relative flex size-11 shrink-0 sm:size-12'
        >
          <span
            aria-hidden
            className='home-qq-ring absolute inset-0 rounded-2xl border border-sky-400/40'
          />
          <span
            aria-hidden
            className='home-qq-ring absolute inset-0 rounded-2xl border border-sky-400/40 [animation-delay:1.2s]'
          />
          <span
            data-relief='plate'
            className={cn(
              'home-qq-float relative flex size-full items-center justify-center rounded-2xl bg-gradient-to-br text-white',
              primary.avatarClassName
            )}
          >
            <PrimaryIcon className='size-6 sm:size-7' aria-hidden />
            <span
              className='absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-[#0e1520]'
              aria-hidden
            />
          </span>
          {secondary && (
            <span
              data-relief='plate'
              className={cn(
                'absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-lg border-2 border-white bg-gradient-to-br text-white dark:border-[#0e1520]',
                secondary.avatarClassName
              )}
            >
              <secondary.icon className='size-3.5' aria-hidden />
            </span>
          )}
        </span>

        <div data-depth-layer='1' className='flex min-w-0 flex-col'>
          <span className='flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-semibold tracking-[0.2em] text-sky-600 uppercase dark:text-sky-400'>
            {entries.map((entry, index) => {
              const Icon = entry.icon
              return (
                <span key={entry.name} className='flex items-center gap-1'>
                  {index > 0 && <span aria-hidden>·</span>}
                  <Icon className='size-3' aria-hidden />
                  {entry.name}
                </span>
              )
            })}
          </span>
          <span className='text-foreground text-base font-semibold break-words sm:text-[17px]'>
            {t('Join the {{name}} community group', { name: systemName })}
          </span>
          <span className='text-muted-foreground mt-0.5 text-xs'>
            {t('Q&A, feedback and new model updates')}
          </span>
        </div>
      </div>

      <div data-depth-group className='mt-3 flex flex-wrap items-center gap-2'>
        {entries.map((entry) => {
          const Icon = entry.icon
          return (
            <Button
              key={entry.href}
              size='sm'
              data-relief='primary'
              className={cn(
                'home-qq-shine group relative h-8 overflow-hidden rounded-lg px-3.5 text-xs font-medium text-white',
                entry.buttonClassName
              )}
              render={
                <a
                  href={entry.href}
                  target='_blank'
                  rel='noopener noreferrer'
                />
              }
            >
              <Icon className='size-3.5' aria-hidden />
              {entry.label}
              <ArrowUpRight className='ml-0.5 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5' />
            </Button>
          )
        })}
        <span data-depth-group className='hidden items-center gap-1.5 sm:flex'>
          {topics.map((topic) => (
            <span
              key={topic}
              data-relief='plate'
              className='rounded-full border border-sky-500/15 bg-sky-500/5 px-2.5 py-0.5 text-[11px] text-sky-700 dark:border-sky-400/15 dark:bg-sky-400/5 dark:text-sky-300'
            >
              #{topic}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
