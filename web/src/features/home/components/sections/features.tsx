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
import {
  Zap,
  Shield,
  Globe,
  Code,
  Gauge,
  DollarSign,
  Users,
  HeartHandshake,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'

interface FeaturesProps {
  className?: string
}

export function Features(props: FeaturesProps) {
  const { t } = useTranslation()

  const features = [
    {
      id: 'fast',
      num: '01',
      title: t('Lightning Fast'),
      desc: t(
        'Optimized network architecture ensures millisecond response times'
      ),
      span: 'md:col-span-2',
      glow: 'from-blue-500/12 via-transparent to-transparent',
      icon: <Zap className='size-4 text-blue-500 dark:text-blue-400' />,
      visual: (
        <div
          data-depth-group
          data-depth-layer='3'
          className='mt-6 grid grid-cols-3 gap-2.5'
        >
          {['OpenAI', 'Claude', 'Gemini', 'DeepSeek', 'Qwen', 'Llama'].map(
            (name) => (
              <div
                key={name}
                data-relief='plate'
                data-depth-glare=''
                className='border-border/50 bg-background/70 text-foreground/80 hover:text-foreground relative flex items-center justify-center overflow-hidden rounded-xl border px-3 py-2.5 text-xs font-medium backdrop-blur-xs transition-colors duration-300 hover:border-blue-500/35 hover:bg-blue-500/8'
              >
                {name}
              </div>
            )
          )}
        </div>
      ),
    },
    {
      id: 'secure',
      num: '02',
      title: t('Secure & Reliable'),
      desc: t(
        'Enterprise-grade security with comprehensive permission management'
      ),
      span: 'md:col-span-1',
      glow: 'from-emerald-500/12 via-transparent to-transparent',
      icon: (
        <Shield className='size-4 text-emerald-500 dark:text-emerald-400' />
      ),
      visual: (
        <div className='mt-6 flex items-center justify-center'>
          <div className='relative' data-depth-float='2' data-depth-layer='3'>
            <div
              data-relief='plate'
              className='flex size-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 shadow-[0_12px_28px_-12px_rgba(16,185,129,0.45)]'
            >
              <Shield
                className='size-7 text-emerald-600 dark:text-emerald-400'
                strokeWidth={1.6}
              />
            </div>
            <div
              data-depth-layer='4'
              className='absolute -top-1 -right-1 flex size-4.5 items-center justify-center rounded-full bg-emerald-500 shadow-sm'
            >
              <svg
                className='size-2.5 text-white'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={3}
                aria-hidden='true'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='m4.5 12.75 6 6 9-13.5'
                />
              </svg>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'global',
      num: '03',
      title: t('Global Coverage'),
      desc: t('Multi-region deployment for stable global access'),
      span: 'md:col-span-1',
      glow: 'from-violet-500/12 via-transparent to-transparent',
      icon: <Globe className='size-4 text-violet-500 dark:text-violet-400' />,
      visual: (
        <div className='mt-6 space-y-2.5'>
          {[t('Load Balancing'), t('Rate Limiting'), t('Cost Tracking')].map(
            (step, i) => (
              <div
                key={step}
                data-depth-layer={String(3 - i)}
                className='flex items-center gap-2.5'
              >
                <div
                  data-relief='plate'
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-[10px] font-bold',
                    i === 1
                      ? 'border border-violet-500/35 bg-violet-500/15 text-violet-600 dark:text-violet-300'
                      : 'border-border/50 bg-muted/70 text-muted-foreground border'
                  )}
                >
                  {i + 1}
                </div>
                <div className='bg-border/50 h-px flex-1' />
                <span className='text-foreground/75 text-xs font-medium'>
                  {step}
                </span>
              </div>
            )
          )}
        </div>
      ),
    },
    {
      id: 'developer',
      num: '04',
      title: t('Developer Friendly'),
      desc: t('Compatible API routes for common AI application workflows'),
      span: 'md:col-span-2',
      glow: 'from-amber-500/12 via-transparent to-transparent',
      icon: <Code className='size-4 text-amber-500 dark:text-amber-400' />,
      visual: (
        <div className='mt-6 flex flex-wrap items-center gap-3.5'>
          <div data-depth-layer='3' className='flex -space-x-2'>
            {['API', 'SDK', 'CLI', 'Docs'].map((n, i) => (
              <div
                key={n}
                data-depth-float={String(i + 1)}
                data-relief='plate'
                className='border-background from-muted to-muted/60 text-foreground/80 flex size-9 items-center justify-center rounded-full border-2 bg-gradient-to-br text-[9.5px] font-bold'
              >
                {n}
              </div>
            ))}
          </div>
          <div
            data-depth-layer='2'
            data-relief='plate'
            className='border-border/50 bg-background/60 text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium'
          >
            <Code className='size-3.5 text-blue-500' />
            {t('Multi-protocol Compatible')}
          </div>
        </div>
      ),
    },
  ]

  const additionalFeatures = [
    {
      icon: <Gauge className='size-5' strokeWidth={1.6} />,
      title: t('High Performance'),
      desc: t('Support for high concurrency with automatic load balancing'),
    },
    {
      icon: <DollarSign className='size-5' strokeWidth={1.6} />,
      title: t('Transparent Billing'),
      desc: t('Pay-as-you-go with real-time usage monitoring'),
    },
    {
      icon: <Users className='size-5' strokeWidth={1.6} />,
      title: t('Team Collaboration'),
      desc: t('Multi-user management with flexible permission allocation'),
    },
    {
      icon: <HeartHandshake className='size-5' strokeWidth={1.6} />,
      title: t('Open Source'),
      desc: t('Community driven, self-hosted, and extensible'),
    },
  ]

  return (
    <section
      className={cn('relative z-10 px-6 py-14 md:py-20', props.className)}
    >
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mx-auto mb-12 max-w-2xl text-center md:mb-14'>
          <p
            data-depth='1'
            className='text-primary/80 mb-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase'
          >
            {t('Core Features')}
          </p>
          <h2
            data-depth='2'
            className='text-2xl leading-[1.15] font-extrabold tracking-tight md:text-4xl'
          >
            {t('Built for developers,')}
            <br />
            {t('designed for scale')}
          </h2>
        </AnimateInView>

        {/* 3D Bento grid */}
        <div className='grid gap-4 md:grid-cols-3 md:gap-5'>
          {features.map((f, i) => (
            <AnimateInView
              key={f.id}
              delay={i * 90}
              animation='scale-in'
              className={cn('h-full', f.span)}
            >
              <div
                data-relief='raised'
                data-depth-tilt='5'
                data-depth-glare=''
                className='border-border/60 bg-card/70 group hover:border-primary/30 hover:bg-card/90 relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border p-7 backdrop-blur-sm transition-colors duration-300 md:p-8'
              >
                <div
                  aria-hidden
                  className={cn(
                    'pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br opacity-80',
                    f.glow
                  )}
                />
                <div>
                  <div
                    data-depth-layer='2'
                    className='mb-3.5 flex items-center gap-3'
                  >
                    <span
                      data-relief='plate'
                      className='border-border/50 bg-background/80 text-muted-foreground flex size-7 items-center justify-center rounded-lg border font-mono text-[10px] font-semibold tabular-nums'
                    >
                      {f.num}
                    </span>
                    <span
                      data-relief='plate'
                      className='border-border/40 bg-background/60 flex size-7 items-center justify-center rounded-lg border'
                    >
                      {f.icon}
                    </span>
                    <h3 className='text-base font-semibold tracking-tight'>
                      {f.title}
                    </h3>
                  </div>
                  <p
                    data-depth-layer='1'
                    className='text-muted-foreground text-sm leading-relaxed'
                  >
                    {f.desc}
                  </p>
                </div>
                {f.visual}
              </div>
            </AnimateInView>
          ))}
        </div>

        {/* Additional features row */}
        <div className='mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-10 lg:grid-cols-4 lg:gap-5'>
          {additionalFeatures.map((f, i) => (
            <AnimateInView
              key={f.title}
              delay={i * 90}
              animation='fade-up'
              className='h-full'
            >
              <div
                data-relief='raised'
                data-depth-tilt='7'
                data-depth-glare=''
                className='border-border/50 bg-card/50 group hover:border-primary/25 hover:bg-card/80 relative flex h-full flex-col items-center overflow-hidden rounded-2xl border px-5 py-6 text-center backdrop-blur-xs transition-colors duration-300'
              >
                <div
                  data-depth-layer='3'
                  data-depth-float={String(i + 1)}
                  data-relief='plate'
                  className='text-muted-foreground border-border/60 bg-background/80 group-hover:border-primary/30 group-hover:text-primary mb-3.5 flex size-12 items-center justify-center rounded-xl border transition-colors duration-300'
                >
                  {f.icon}
                </div>
                <h3
                  data-depth-layer='2'
                  className='mb-1.5 text-sm font-semibold tracking-tight'
                >
                  {f.title}
                </h3>
                <p
                  data-depth-layer='1'
                  className='text-muted-foreground max-w-[220px] text-xs leading-relaxed'
                >
                  {f.desc}
                </p>
              </div>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
