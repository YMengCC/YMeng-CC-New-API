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
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  getHeroDeleteDelayMs,
  getHeroTypeDelayMs,
  HERO_HOLD_STEP_MS,
  HERO_NEXT_PHRASE_DELAY_MS,
} from '../lib/hero-typewriter-timing'

interface BrandGlyph {
  id: string
  char: string
  className: string
}

export interface HeroBrandShowcaseProps {
  className?: string
}

const BRAND_GLYPHS: readonly BrandGlyph[] = [
  { id: 'Y', char: 'Y', className: 'home-brand-lt-y' },
  { id: 'M', char: 'M', className: 'home-brand-lt-m' },
  { id: 'e', char: 'e', className: 'home-brand-lt-e' },
  { id: 'n', char: 'n', className: 'home-brand-lt-n' },
  { id: 'g', char: 'g', className: 'home-brand-lt-g' },
  { id: 'space', char: '\u00A0', className: 'home-brand-lt-space' },
  {
    id: 'C1',
    char: 'C',
    className: 'home-brand-lt-c1 home-brand-lt-accent',
  },
  {
    id: 'C2',
    char: 'C',
    className: 'home-brand-lt-c2 home-brand-lt-accent',
  },
]

export function HeroBrandShowcase(props: HeroBrandShowcaseProps): ReactElement {
  const { t } = useTranslation()
  const phrases = useMemo(
    () => [
      'Hello YMeng~~',
      t('Unified access to all AI models'),
      t('Intelligent load balancing'),
      t('Pay as you go, stop anytime'),
    ],
    [t]
  )

  const [typedText, setTypedText] = useState('')
  const [activePhraseIndex, setActivePhraseIndex] = useState(0)
  const [isTyping, setIsTyping] = useState(true)

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined
    let phraseIndex = 0
    let charIndex = 0
    let deletedCount = 0
    let isDeleting = false

    const step = (): void => {
      const currentChars = [...(phrases[phraseIndex] ?? '')]
      if (currentChars.length === 0) return

      if (isDeleting) {
        const nextCharIndex = Math.max(0, charIndex - 1)
        const currentStepIndex = deletedCount
        charIndex = nextCharIndex
        deletedCount += 1
        setTypedText(currentChars.slice(0, nextCharIndex).join(''))
        if (nextCharIndex === 0) {
          isDeleting = false
          deletedCount = 0
          phraseIndex = (phraseIndex + 1) % phrases.length
          setActivePhraseIndex(phraseIndex)
          timerId = setTimeout(step, HERO_NEXT_PHRASE_DELAY_MS)
          return
        }
        timerId = setTimeout(step, getHeroDeleteDelayMs(currentStepIndex))
        return
      }

      const nextCharIndex = Math.min(currentChars.length, charIndex + 1)
      const typedChar = currentChars[nextCharIndex - 1] ?? ''
      charIndex = nextCharIndex
      setActivePhraseIndex(phraseIndex)
      setIsTyping(true)
      setTypedText(currentChars.slice(0, nextCharIndex).join(''))
      if (nextCharIndex === currentChars.length) {
        setIsTyping(false)
        isDeleting = true
        deletedCount = 0
        timerId = setTimeout(step, HERO_HOLD_STEP_MS)
        return
      }
      timerId = setTimeout(step, getHeroTypeDelayMs(typedChar))
    }

    step()

    return () => {
      if (timerId !== undefined) {
        clearTimeout(timerId)
      }
    }
  }, [phrases])

  const renderedChars = [...typedText]
  const hasEnteringChar = isTyping && renderedChars.length > 0
  const settledText = hasEnteringChar
    ? renderedChars.slice(0, -1).join('')
    : typedText
  const enteringChar = hasEnteringChar ? (renderedChars.at(-1) ?? '') : ''

  return (
    <div
      className={cn('relative w-full min-w-0 py-2 lg:py-4', props.className)}
    >
      <div
        aria-hidden='true'
        data-home-brand-glow=''
        className='pointer-events-none absolute -top-8 -left-10 -z-10 h-44 w-[min(100%+4rem,46rem)] rounded-full opacity-75 blur-3xl dark:opacity-60'
        style={{
          background:
            'radial-gradient(ellipse 62% 58% at 38% 48%, color-mix(in oklch, var(--primary) 22%, transparent) 0%, transparent 74%)',
        }}
      />
      <h2
        aria-label='YMeng CC'
        data-depth='2'
        className='home-brand-title landing-animate-fade-up text-foreground cursor-default pb-1.5 text-[clamp(2.85rem,10.5vw,4.5rem)] leading-[1.04] tracking-[-0.026em] whitespace-nowrap opacity-0 transition-colors duration-350 select-none lg:text-[clamp(4.4rem,6.8vw,7.5rem)]'
        style={{ animationDelay: '180ms' }}
      >
        <span aria-hidden='true'>
          {BRAND_GLYPHS.map((glyph) => (
            <span
              key={glyph.id}
              data-home-brand-glyph={glyph.id}
              className={cn('home-brand-lt', glyph.className)}
            >
              {glyph.char}
            </span>
          ))}
        </span>
      </h2>
      <p
        data-depth='1'
        data-home-typewriter=''
        className='home-brand-subtitle landing-animate-fade-up text-foreground/75 dark:text-foreground/82 mt-4 flex min-h-[3.25em] max-w-2xl items-center text-[clamp(1.2rem,2.15vw,1.62rem)] leading-[1.62] font-medium tracking-[0.015em] opacity-0 transition-colors duration-350 sm:min-h-[2.25em] lg:mt-5'
        style={{ animationDelay: '240ms' }}
      >
        <span className='inline'>
          <span data-home-typed-text=''>
            {settledText}
            {hasEnteringChar && (
              <span
                key={`${activePhraseIndex}-${renderedChars.length}`}
                data-home-typed-entering=''
                className='home-type-char-enter'
              >
                {enteringChar}
              </span>
            )}
          </span>
          <span
            aria-hidden='true'
            data-home-type-cursor=''
            className={cn(
              'home-type-cursor ml-1 inline-block h-[1.12em] w-[2.5px] rounded-full align-[-0.17em]',
              !isTyping && 'home-type-cursor-blink'
            )}
          />
        </span>
      </p>
    </div>
  )
}
