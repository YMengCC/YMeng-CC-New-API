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
import { act, cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { HeroBrandShowcase } from '../components/hero-brand-showcase'
import {
  getHeroDeleteDelayMs,
  getHeroTypeDelayMs,
  HERO_HOLD_STEP_MS,
  HERO_NEXT_PHRASE_DELAY_MS,
} from '../lib/hero-typewriter-timing'

async function createTestI18n(lng = 'zh') {
  const instance = createInstance()
  await instance.init({
    lng,
    resources: {
      en: {
        translation: {
          'Unified access to all AI models': 'Unified access to all AI models',
          'Intelligent load balancing': 'Intelligent load balancing',
          'Pay as you go, stop anytime': 'Pay as you go, stop anytime',
        },
      },
      zh: {
        translation: {
          'Unified access to all AI models': '统一接入所有 AI 模型',
          'Intelligent load balancing': '智能负载均衡',
          'Pay as you go, stop anytime': '按量付费，随用随停',
        },
      },
    },
    initAsync: false,
  })
  return instance
}

function advanceTicks(count: number) {
  for (let step = 0; step < count; step++) {
    act(() => {
      vi.runOnlyPendingTimers()
    })
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('renders YMeng CC with display font styling, optical word space, and gradient CC glyphs', async () => {
  const i18n = await createTestI18n('zh')

  render(
    <I18nextProvider i18n={i18n}>
      <HeroBrandShowcase />
    </I18nextProvider>
  )

  const heading = screen.getByRole('heading', { level: 2, name: 'YMeng CC' })
  expect(heading).toHaveClass(
    'home-brand-title',
    'whitespace-nowrap',
    'lg:text-[clamp(4.4rem,6.8vw,7.5rem)]'
  )
  expect(heading.parentElement).toHaveClass('py-2', 'lg:py-4')
  const brandGlow = document.querySelector('[data-home-brand-glow]')
  expect(brandGlow).not.toBeNull()
  expect(brandGlow).toHaveAttribute('aria-hidden', 'true')
  expect(brandGlow).toHaveClass('pointer-events-none')
  expect(heading.textContent?.replaceAll('\u00A0', ' ')).toBe('YMeng CC')

  const glyphs = [...heading.querySelectorAll('[data-home-brand-glyph]')]
  expect(glyphs.map((el) => el.textContent)).toEqual([
    'Y',
    'M',
    'e',
    'n',
    'g',
    '\u00A0',
    'C',
    'C',
  ])
  expect(glyphs[0]).toHaveClass('home-brand-lt-y')
  expect(glyphs[1]).toHaveClass('home-brand-lt-m')
  expect(glyphs[2]).toHaveClass('home-brand-lt-e')
  expect(glyphs[3]).toHaveClass('home-brand-lt-n')
  expect(glyphs[4]).toHaveClass('home-brand-lt-g')
  expect(glyphs[5]).toHaveClass('home-brand-lt-space')
  expect(glyphs[6]).toHaveClass('home-brand-lt-c1', 'home-brand-lt-accent')
  expect(glyphs[7]).toHaveClass('home-brand-lt-c2', 'home-brand-lt-accent')
})

it('types with per-character reveal, holds with a blinking caret, deletes back to empty, and cycles all phrases', async () => {
  const i18n = await createTestI18n('zh')

  render(
    <I18nextProvider i18n={i18n}>
      <HeroBrandShowcase />
    </I18nextProvider>
  )

  const typedNode = document.querySelector('[data-home-typed-text]')
  const cursorNode = document.querySelector('[data-home-type-cursor]')
  if (!typedNode || !cursorNode) throw new Error('Expected typewriter elements')

  const expectedPhrases = [
    'Hello YMeng~~',
    '统一接入所有 AI 模型',
    '智能负载均衡',
    '按量付费，随用随停',
  ]

  for (let index = 0; index < expectedPhrases.length; index++) {
    const phrase = expectedPhrases[index]
    const chars = [...phrase]

    expect(typedNode.textContent).toBe(chars[0])
    expect(
      typedNode.querySelector('[data-home-typed-entering]')?.textContent
    ).toBe(chars[0])
    expect(cursorNode).not.toHaveClass('home-type-cursor-blink')

    advanceTicks(chars.length - 1)
    expect(typedNode.textContent).toBe(phrase)
    expect(typedNode.querySelector('[data-home-typed-entering]')).toBeNull()
    expect(cursorNode).toHaveClass('home-type-cursor-blink')

    act(() => {
      vi.advanceTimersByTime(HERO_HOLD_STEP_MS - 1)
    })
    expect(typedNode.textContent).toBe(phrase)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(typedNode.textContent).toBe(chars.slice(0, -1).join(''))
    expect(typedNode.querySelector('[data-home-typed-entering]')).toBeNull()

    advanceTicks(chars.length - 1)
    expect(typedNode.textContent).toBe('')

    act(() => {
      vi.advanceTimersByTime(HERO_NEXT_PHRASE_DELAY_MS)
    })
  }

  expect(typedNode.textContent).toBe('H')
})

it('pauses longer at CJK punctuation and accelerates during continuous backspace deletion', () => {
  expect(getHeroTypeDelayMs('，')).toBeGreaterThan(getHeroTypeDelayMs('随'))
  expect(getHeroTypeDelayMs('随')).toBeGreaterThan(getHeroTypeDelayMs('a'))
  expect(getHeroTypeDelayMs('a')).toBeGreaterThan(getHeroTypeDelayMs(' '))

  expect(getHeroDeleteDelayMs(0)).toBeGreaterThan(getHeroDeleteDelayMs(3))
  expect(getHeroDeleteDelayMs(3)).toBeGreaterThan(getHeroDeleteDelayMs(6))
})

it('updates rotating phrases when the active interface language switches', async () => {
  const i18n = await createTestI18n('zh')

  render(
    <I18nextProvider i18n={i18n}>
      <HeroBrandShowcase />
    </I18nextProvider>
  )

  const typedNode = document.querySelector('[data-home-typed-text]')
  if (!typedNode) throw new Error('Expected typed text element')

  await act(async () => {
    await i18n.changeLanguage('en')
  })

  const greetingChars = [...'Hello YMeng~~']
  // Complete typing remaining chars + 1 hold tick + remaining delete ticks + 1 next-phrase pause tick
  advanceTicks(greetingChars.length - 1 + 1 + (greetingChars.length - 1) + 1)

  const englishPhrase = 'Unified access to all AI models'
  advanceTicks([...englishPhrase].length - 1)
  expect(typedNode.textContent).toBe(englishPhrase)
})

it('clears scheduled timers cleanly on unmount without throwing', async () => {
  const i18n = await createTestI18n('zh')
  const { unmount } = render(
    <I18nextProvider i18n={i18n}>
      <HeroBrandShowcase />
    </I18nextProvider>
  )

  unmount()

  expect(() => {
    act(() => {
      vi.advanceTimersByTime(HERO_HOLD_STEP_MS * 3)
    })
  }).not.toThrow()
})
