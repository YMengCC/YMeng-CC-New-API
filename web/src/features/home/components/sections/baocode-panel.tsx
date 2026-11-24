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
import { ArrowUpRight, Download, LogIn, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ConfiguredImage } from '@/components/configured-image'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { isHttpUrl } from '@/lib/content-format'

import { BAOCODE_ICON_URL, DEFAULT_BAOCODE_URL } from '../../constants'
import { BaoCodeAdvantages } from './baocode-advantages'

// The beginner entry: BaoCode's channel page for this site, drawn in
// BaoCode's own paper look (colors and fonts from .home-paper).
export function BaoCodePanel() {
  const { t } = useTranslation()
  const { logo, systemName } = useSystemConfig()
  const { status } = useStatus()
  const configuredLink = status?.baocode_link
  const baocodeLink =
    typeof configuredLink === 'string' && isHttpUrl(configuredLink.trim())
      ? configuredLink.trim()
      : DEFAULT_BAOCODE_URL

  const steps = [
    { icon: Download, text: t('Download BaoCode for Mac, Windows or Linux') },
    {
      icon: LogIn,
      text: t('Sign in with your {{name}} account directly', {
        name: systemName,
      }),
    },
    {
      icon: Sparkles,
      text: t('Pick a model and start coding, no API setup needed'),
    },
  ]

  return (
    <div className='home-paper flex w-full min-w-0 flex-col items-start text-left text-[var(--paper-body)]'>
      <div
        className='landing-animate-fade-up mb-5 w-full opacity-0'
        style={{ animationDelay: '0ms' }}
      >
        <BaoCodeAdvantages />
      </div>

      <div
        className='landing-animate-fade-up mb-4 opacity-0'
        style={{ animationDelay: '40ms' }}
      >
        <div
          data-relief='plate'
          data-depth='1'
          data-depth-tilt='10'
          data-depth-glare=''
          className='relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-[var(--paper-pill-border)] bg-[var(--paper-pill-bg)] px-3.5 py-1 text-xs font-semibold tracking-wide text-[var(--paper-pill-ink)]'
        >
          <span
            aria-hidden
            className='size-1.5 rounded-full bg-amber-600/80 dark:bg-amber-300/80'
          />
          <span>{t('Beginner friendly')}</span>
          <span aria-hidden className='opacity-60'>
            ·
          </span>
          <span>{t('Partner channel')}</span>
        </div>
      </div>

      <h1
        data-depth='2'
        className='landing-animate-fade-up flex max-w-full flex-wrap items-center gap-x-[0.28em] gap-y-1.5 font-[family-name:var(--paper-serif)] text-[clamp(2.05rem,3.4vw,2.85rem)] leading-[1.12] font-semibold tracking-[-0.02em] text-[var(--paper-ink)] opacity-0'
        style={{ animationDelay: '60ms' }}
      >
        <span className='inline-flex max-w-full min-w-0 items-center gap-[0.28em]'>
          <ConfiguredImage
            src={logo}
            alt=''
            data-depth-float='1'
            data-relief='float'
            className='h-[0.8em] w-auto shrink-0 rounded-[0.2em]'
          />
          <span className='min-w-0 break-words'>{systemName}</span>
          <span
            aria-hidden
            className='shrink-0 font-normal text-[var(--paper-faint)]'
          >
            ×
          </span>
        </span>
        <span className='inline-flex shrink-0 items-center gap-[0.28em]'>
          <img
            src={BAOCODE_ICON_URL}
            alt=''
            data-depth-float='3'
            data-relief='float'
            className='h-[0.8em] w-auto rounded-[0.2em]'
          />
          BaoCode
        </span>
      </h1>

      <p
        data-depth='1'
        className='landing-animate-fade-up mt-3.5 font-[family-name:var(--paper-serif)] text-xl leading-snug font-medium text-[var(--paper-ink)]/85 opacity-0 md:text-[22px]'
        style={{ animationDelay: '120ms' }}
      >
        {t('One gateway, multiple models. Turn ideas into code.')}
      </p>

      <p
        data-depth='1'
        className='landing-animate-fade-up mt-4 max-w-md font-[family-name:var(--paper-serif)] text-[16.5px] leading-[1.72] break-words text-[var(--paper-muted)] opacity-0'
        style={{ animationDelay: '180ms' }}
      >
        {t(
          'Less setup, more creation. Access multiple AI models through {{name}}, choose your coding companion in BaoCode, and bring your next idea to life.',
          { name: systemName }
        )}
      </p>

      <ol
        data-depth-group
        className='landing-animate-fade-up mt-5 flex w-full max-w-md flex-col gap-2 opacity-0'
        style={{ animationDelay: '240ms' }}
      >
        {steps.map((step, index) => (
          <li
            key={step.text}
            data-relief='plate'
            data-depth-glare=''
            className='relative flex items-center gap-3 overflow-hidden rounded-xl border border-[var(--paper-rule)]/90 bg-[var(--paper)]/75 px-3.5 py-2 text-[14.5px] backdrop-blur-[2px] transition-colors duration-200 hover:border-[var(--paper-pill-border)] hover:bg-[var(--paper)]'
          >
            <span className='flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--paper-pill-border)]/70 bg-[var(--paper-pill-bg)] text-xs font-semibold text-[var(--paper-pill-ink)] tabular-nums'>
              {index + 1}
            </span>
            <step.icon
              data-depth-layer='3'
              className='size-4 shrink-0 text-[var(--paper-pill-ink)]'
              aria-hidden
            />
            <span className='min-w-0 font-medium break-words text-[var(--paper-ink)]/90'>
              {step.text}
            </span>
          </li>
        ))}
      </ol>

      <div
        className='landing-animate-fade-up mt-6 flex flex-wrap items-center gap-3.5 opacity-0'
        style={{ animationDelay: '300ms' }}
      >
        <Button
          data-relief='primary'
          data-depth-tilt='8'
          data-depth-magnetic=''
          data-depth-glare=''
          className='group relative h-11 overflow-hidden rounded-xl border border-[var(--paper-ink)] bg-[var(--paper-ink)] px-5.5 text-[15px] font-semibold text-[var(--paper)] hover:bg-[var(--paper-ink-hover)]'
          render={
            <a href={baocodeLink} target='_blank' rel='noopener noreferrer' />
          }
        >
          {t('Get BaoCode')}
          <ArrowUpRight className='ml-1 size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5' />
        </Button>
        <span className='rounded-full border border-[var(--paper-rule)] bg-[var(--paper-tint)]/70 px-3 py-1 text-[13px] font-medium text-[var(--paper-muted)]'>
          {t('Free and open source')}
        </span>
      </div>

      <p
        data-depth='1'
        className='landing-animate-fade-up mt-5 text-[13px] font-medium tracking-wide text-[var(--paper-muted)] opacity-0'
        style={{ animationDelay: '360ms' }}
      >
        {['macOS', 'Windows', 'Linux', t('No API key needed')].map(
          (item, index) => (
            <span key={item} className='inline-block'>
              {index > 0 && (
                <span className='mx-2 text-[var(--paper-faint)]' aria-hidden>
                  ·
                </span>
              )}
              {item}
            </span>
          )
        )}
      </p>
    </div>
  )
}
