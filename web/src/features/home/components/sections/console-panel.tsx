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
import { CherryStudio } from '@lobehub/icons'
import { Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { isHttpUrl } from '@/lib/content-format'

import { BAOCODE_ICON_URL, DEFAULT_BAOCODE_URL } from '../../constants'
import { HeroBrandShowcase } from '../hero-brand-showcase'
import { HeroTerminalDemo } from '../hero-terminal-demo'

interface ConsolePanelProps {
  isAuthenticated?: boolean
}

const APP_PILL_CLASSES =
  'group relative border-border/60 bg-card/70 text-foreground/85 hover:border-primary/35 hover:bg-card/95 hover:text-foreground flex items-center gap-2.5 overflow-hidden rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-md transition-colors duration-300'

const OUTLINE_BUTTON_CLASSES =
  'group relative border-border/70 bg-card/65 hover:border-primary/35 hover:bg-card/90 inline-flex h-11 items-center gap-2 overflow-hidden rounded-xl px-5 text-sm font-medium backdrop-blur-md'

export function ConsolePanel(props: ConsolePanelProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const configuredLink = status?.baocode_link
  const baocodeLink =
    typeof configuredLink === 'string' && isHttpUrl(configuredLink.trim())
      ? configuredLink.trim()
      : DEFAULT_BAOCODE_URL
  const docsIcon = (
    <BookOpen className='text-muted-foreground group-hover:text-foreground size-4 transition-colors duration-200' />
  )
  const docsButton = (
    <Button
      variant='outline'
      data-relief='plate'
      data-depth-glare=''
      className={OUTLINE_BUTTON_CLASSES}
      render={<Link to='/docs' />}
    >
      {docsIcon}
      <span>{t('API Guide')}</span>
    </Button>
  )

  return (
    <div className='flex w-full min-w-0 flex-col items-start text-left'>
      <div
        data-depth='1'
        className='landing-animate-fade-up mb-5 flex flex-wrap items-center gap-3 opacity-0'
        style={{ animationDelay: '120ms' }}
      >
        <span className='text-muted-foreground/80 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
          {t('For developers')}
        </span>
        <span className='bg-border/80 h-px w-8' aria-hidden />
        <span
          data-relief='plate'
          data-depth-tilt='10'
          data-depth-glare=''
          className='relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-blue-500/25 bg-blue-500/8 px-3.5 py-1 text-[11.5px] font-medium text-blue-700 backdrop-blur-xs dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300'
        >
          <span className='relative flex size-1.5'>
            <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75' />
            <span className='relative inline-flex size-1.5 rounded-full bg-blue-600 dark:bg-sky-400' />
          </span>
          {t('AI Application Infrastructure Foundation')}
        </span>
      </div>

      <HeroBrandShowcase />

      <div
        data-depth-group
        className='landing-animate-fade-up mt-6 flex flex-wrap items-center gap-3 opacity-0'
        style={{ animationDelay: '300ms' }}
      >
        {props.isAuthenticated ? (
          <Button
            data-relief='primary'
            data-depth-magnetic=''
            data-depth-glare=''
            className='group relative h-11 overflow-hidden rounded-xl px-7 text-base font-semibold'
            render={<Link to='/dashboard' />}
          >
            {t('Sign in')}
            <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
          </Button>
        ) : (
          <>
            <Button
              data-relief='primary'
              data-depth-magnetic=''
              data-depth-glare=''
              className='group relative h-11 overflow-hidden rounded-xl px-6 text-sm font-semibold'
              render={<Link to='/sign-up' />}
            >
              {t('Get Started')}
              <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
            </Button>
            <Button
              variant='outline'
              data-relief='plate'
              data-depth-glare=''
              className={OUTLINE_BUTTON_CLASSES}
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
          </>
        )}
        {docsButton}
      </div>

      <div
        className='landing-animate-fade-up mt-7 w-full max-w-xl opacity-0'
        style={{ animationDelay: '360ms' }}
      >
        <div data-depth='1' className='mb-3 flex items-center gap-3'>
          <span className='text-muted-foreground/75 text-[10.5px] font-bold tracking-[0.16em] uppercase'>
            {t('Supported Applications')}
          </span>
          <span
            className='via-border from-border/80 h-px flex-1 bg-gradient-to-r to-transparent'
            aria-hidden
          />
        </div>
        <div data-depth-group className='flex flex-wrap items-center gap-2.5'>
          <a
            href={baocodeLink}
            target='_blank'
            rel='noopener noreferrer'
            data-relief='plate'
            data-depth-glare=''
            className={APP_PILL_CLASSES}
          >
            <img
              src={BAOCODE_ICON_URL}
              alt=''
              className='size-5 shrink-0 rounded-[5px]'
            />
            <span>BaoCode</span>
          </a>
          <a
            href='https://cherry-ai.com'
            target='_blank'
            rel='noopener noreferrer'
            data-relief='plate'
            data-depth-glare=''
            className={APP_PILL_CLASSES}
          >
            <CherryStudio.Color size={20} className='shrink-0' />
            <span>Cherry Studio</span>
          </a>
          <a
            href='https://ccswitch.io'
            target='_blank'
            rel='noopener noreferrer'
            data-relief='plate'
            data-depth-glare=''
            className={APP_PILL_CLASSES}
          >
            <img
              src='/ccswitch-favicon.png'
              alt=''
              className='size-5 shrink-0 rounded-md object-contain'
              onError={(event) => {
                // Fall back to a text avatar if the local asset is unavailable
                event.currentTarget.style.display = 'none'
                const fallback = event.currentTarget.nextElementSibling
                if (fallback instanceof HTMLElement) {
                  fallback.style.display = 'flex'
                }
              }}
            />
            <span
              style={{ display: 'none' }}
              className='size-5 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-[9px] font-bold text-blue-600 dark:bg-blue-400/10 dark:text-blue-400'
            >
              CC
            </span>
            <span>CC Switch</span>
          </a>
          <span className='text-muted-foreground/70 px-2 text-sm font-medium'>
            {t('More Apps')}
          </span>
        </div>
      </div>

      <div
        className='landing-animate-fade-up mt-8 w-full opacity-0'
        style={{ animationDelay: '420ms' }}
      >
        <HeroTerminalDemo className='max-w-xl lg:mx-0' />
      </div>
    </div>
  )
}
