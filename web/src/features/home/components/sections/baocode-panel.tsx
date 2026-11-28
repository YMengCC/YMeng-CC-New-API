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

import { AnimateInView } from '@/components/animate-in-view'
import { ConfiguredImage } from '@/components/configured-image'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { isHttpUrl } from '@/lib/content-format'
import { cn } from '@/lib/utils'

import { BAOCODE_ICON_URL, DEFAULT_BAOCODE_URL } from '../../constants'
import { BaoCodeAdvantages } from './baocode-advantages'

interface BaoCodeSectionProps {
  className?: string
}

// Standalone mid-page partner showcase: BaoCode's tactile warm-paper aesthetic
// framed as a cohesive rounded card that integrates cleanly with light & dark
// site themes without splitting the hero viewport.
export function BaoCodeSection(props: BaoCodeSectionProps) {
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
    <section
      className={cn('relative z-10 px-6 py-10 md:py-14', props.className)}
    >
      <AnimateInView className='mx-auto max-w-6xl' animation='scale-in'>
        <div
          data-baocode-card=''
          data-relief='raised'
          data-depth-tilt='3'
          data-depth-glare=''
          className='home-paper home-paper-card relative overflow-hidden rounded-3xl border border-[var(--paper-rule)] bg-[var(--paper)] p-7 text-left text-[var(--paper-body)] sm:p-10 lg:p-12'
        >
          {/* Subtle warm paper grid & glow clipped cleanly inside the card */}
          <div
            aria-hidden
            className='pointer-events-none absolute inset-0 z-0 overflow-hidden'
          >
            <div className='home-paper-grid' />
            <div
              className='absolute inset-0 opacity-65 dark:opacity-35'
              style={{
                background: [
                  'radial-gradient(ellipse 56% 48% at 16% 20%, rgba(226, 179, 115, 0.24) 0%, transparent 72%)',
                  'radial-gradient(ellipse 46% 44% at 86% 84%, rgba(226, 179, 115, 0.16) 0%, transparent 72%)',
                ].join(', '),
              }}
            />
          </div>
          <div
            aria-hidden
            className='pointer-events-none absolute inset-x-12 top-0 z-10 h-px bg-gradient-to-r from-transparent via-[var(--paper-sand)]/70 to-transparent'
          />

          <div className='relative z-10 grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10'>
            {/* Left column: brand partnership narrative, CTA, and supported platforms */}
            <div className='flex min-w-0 flex-col items-start lg:col-span-6'>
              <div
                data-relief='plate'
                data-depth='1'
                data-depth-tilt='10'
                data-depth-glare=''
                className='relative mb-4 inline-flex items-center gap-2 overflow-hidden rounded-full border border-[var(--paper-pill-border)] bg-[var(--paper-pill-bg)] px-3.5 py-1 text-xs font-semibold tracking-wide text-[var(--paper-pill-ink)]'
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

              <h2
                data-depth='2'
                className='flex max-w-full flex-wrap items-center gap-x-[0.28em] gap-y-1.5 font-[family-name:var(--paper-serif)] text-[clamp(1.9rem,3.1vw,2.65rem)] leading-[1.14] font-semibold tracking-[-0.02em] text-[var(--paper-ink)]'
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
              </h2>

              <p
                data-depth='1'
                className='mt-3.5 font-[family-name:var(--paper-serif)] text-lg leading-snug font-medium text-[var(--paper-ink)]/85 sm:text-xl'
              >
                {t('One gateway, multiple models. Turn ideas into code.')}
              </p>

              <p
                data-depth='1'
                className='mt-3 max-w-lg font-[family-name:var(--paper-serif)] text-[15.5px] leading-[1.7] break-words text-[var(--paper-muted)]'
              >
                {t(
                  'Less setup, more creation. Access multiple AI models through {{name}}, choose your coding companion in BaoCode, and bring your next idea to life.',
                  { name: systemName }
                )}
              </p>

              <div className='mt-6 flex flex-wrap items-center gap-3.5'>
                <Button
                  data-relief='primary'
                  data-depth-tilt='8'
                  data-depth-magnetic=''
                  data-depth-glare=''
                  className='group relative h-11 overflow-hidden rounded-xl border border-[var(--paper-ink)] bg-[var(--paper-ink)] px-5.5 text-[15px] font-semibold text-[var(--paper)] hover:bg-[var(--paper-ink-hover)]'
                  render={
                    <a
                      href={baocodeLink}
                      target='_blank'
                      rel='noopener noreferrer'
                    />
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
                className='mt-5 text-[13px] font-medium tracking-wide text-[var(--paper-muted)]'
              >
                {['macOS', 'Windows', 'Linux', t('No API key needed')].map(
                  (item, index) => (
                    <span key={item} className='inline-block'>
                      {index > 0 && (
                        <span
                          className='mx-2 text-[var(--paper-faint)]'
                          aria-hidden
                        >
                          ·
                        </span>
                      )}
                      {item}
                    </span>
                  )
                )}
              </p>
            </div>

            {/* Right column: benchmarks + quick-start steps */}
            <div className='flex min-w-0 flex-col gap-4 lg:col-span-6'>
              <BaoCodeAdvantages />

              <ol data-depth-group className='flex w-full flex-col gap-2'>
                {steps.map((step, index) => (
                  <li
                    key={step.text}
                    data-relief='plate'
                    data-depth-glare=''
                    className='relative flex items-center gap-3 overflow-hidden rounded-xl border border-[var(--paper-rule)]/90 bg-[var(--paper)]/80 px-3.5 py-2.5 text-[14px] backdrop-blur-[2px] transition-colors duration-200 hover:border-[var(--paper-pill-border)] hover:bg-[var(--paper)]'
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
            </div>
          </div>
        </div>
      </AnimateInView>
    </section>
  )
}
