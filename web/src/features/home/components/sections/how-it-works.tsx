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
import { Settings, Zap, BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      num: '1',
      title: t('Configure'),
      desc: t(
        'Add your API keys, set up channels and configure access permissions'
      ),
      icon: <Settings className='size-6' strokeWidth={1.6} />,
    },
    {
      num: '2',
      title: t('Connect'),
      desc: t(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      ),
      icon: <Zap className='size-6' strokeWidth={1.6} />,
    },
    {
      num: '3',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: <BarChart3 className='size-6' strokeWidth={1.6} />,
    },
  ]

  return (
    <section className='relative z-10 px-6 py-14 md:py-20'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-16 text-center md:mb-20'>
          <p
            data-depth='1'
            className='text-primary/80 mb-3 font-mono text-xs font-semibold tracking-[0.2em] uppercase'
          >
            {t('How It Works')}
          </p>
          <h2
            data-depth='2'
            className='text-2xl font-extrabold tracking-tight md:text-4xl'
          >
            {t('Three steps to get started')}
          </h2>
        </AnimateInView>

        <div className='relative grid gap-6 md:grid-cols-3 md:gap-8'>
          {/* Decorative connecting light beam on desktop */}
          <div
            aria-hidden
            className='via-primary/30 pointer-events-none absolute top-16 right-[16%] left-[16%] -z-10 hidden h-px bg-gradient-to-r from-transparent to-transparent md:block'
          />

          {steps.map((step, i) => (
            <AnimateInView
              key={step.num}
              delay={i * 140}
              animation='fade-up'
              className='h-full'
            >
              <div
                data-relief='raised'
                data-depth-tilt='7'
                data-depth-glare=''
                className='border-border/55 bg-card/60 group hover:border-primary/30 hover:bg-card/85 relative flex h-full flex-col items-center overflow-hidden rounded-2xl border px-6 py-8 text-center backdrop-blur-sm transition-colors duration-300'
              >
                <div
                  data-depth-layer='3'
                  data-depth-float={String(i + 1)}
                  className='relative mb-6'
                >
                  <div
                    data-relief='plate'
                    className='text-muted-foreground border-border/60 bg-background/85 group-hover:border-primary/35 group-hover:text-primary flex size-16 items-center justify-center rounded-2xl border transition-colors duration-300'
                  >
                    {step.icon}
                  </div>
                  <div
                    data-depth-layer='5'
                    data-relief='primary'
                    className='bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold'
                  >
                    {step.num}
                  </div>
                </div>
                <h3
                  data-depth-layer='2'
                  className='mb-2 text-base font-semibold tracking-tight md:text-lg'
                >
                  {step.title}
                </h3>
                <p
                  data-depth-layer='1'
                  className='text-muted-foreground max-w-[250px] text-sm leading-relaxed'
                >
                  {step.desc}
                </p>
              </div>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
