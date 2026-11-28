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
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section
      className={cn(
        'relative z-10 overflow-hidden px-6 py-14 md:py-20',
        props.className
      )}
    >
      <AnimateInView className='mx-auto max-w-5xl' animation='scale-in'>
        <div
          data-relief='raised'
          data-depth-tilt='4'
          data-depth-glare=''
          className='border-border/65 bg-card/75 relative overflow-hidden rounded-3xl border px-6 py-14 text-center backdrop-blur-md sm:px-12 md:py-20'
        >
          {/* Specular top highlight */}
          <div
            aria-hidden
            className='via-primary/45 pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent to-transparent'
          />

          {/* Ambient aurora mesh inside card */}
          <div
            aria-hidden
            data-depth='-2'
            data-depth-breathe
            className='pointer-events-none absolute inset-0 -z-10 opacity-35 dark:opacity-25'
            style={{
              background: [
                'radial-gradient(ellipse 55% 60% at 25% 45%, oklch(0.72 0.18 250 / 60%) 0%, transparent 70%)',
                'radial-gradient(ellipse 48% 55% at 75% 55%, oklch(0.68 0.16 285 / 50%) 0%, transparent 70%)',
              ].join(', '),
            }}
          />

          <div className='mx-auto max-w-2xl'>
            <h2
              data-depth-layer='3'
              className='text-2xl leading-[1.14] font-extrabold tracking-tight md:text-4xl'
            >
              {t('Ready to simplify')}
              <br />
              <span className='bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600 bg-clip-text text-transparent dark:from-sky-300 dark:via-indigo-300 dark:to-purple-400'>
                {t('your AI integration?')}
              </span>
            </h2>
            <p
              data-depth-layer='1'
              className='text-muted-foreground mx-auto mt-5 max-w-md text-sm leading-relaxed md:text-base'
            >
              {t(
                'Deploy your own gateway and start routing requests through your configured upstream services.'
              )}
            </p>
            <div
              data-depth-group
              data-depth-layer='2'
              className='mt-8 flex flex-wrap items-center justify-center gap-3.5'
            >
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
                className='border-border/70 bg-background/70 hover:border-primary/35 hover:bg-background relative h-11 overflow-hidden rounded-xl px-5 text-sm font-medium backdrop-blur-sm'
                render={<Link to='/pricing' />}
              >
                {t('View Pricing')}
              </Button>
            </div>
          </div>
        </div>
      </AnimateInView>
    </section>
  )
}
