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
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { HeroParticles } from '../components/hero-particles'
import { getHeroSeamX } from '../lib/hero-seam'

const originalMatchMedia = window.matchMedia
const originalGetContext = HTMLCanvasElement.prototype.getContext

function mockMedia(options: { reducedMotion: boolean; finePointer: boolean }) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion')
          ? options.reducedMotion
          : options.finePointer,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  })
}

function createMockContext2D(): CanvasRenderingContext2D {
  return {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D
}

afterEach(() => {
  cleanup()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
  HTMLCanvasElement.prototype.getContext = originalGetContext
  vi.restoreAllMocks()
})

it('renders a decorative non-interactive particle canvas that never intercepts pointer events', () => {
  mockMedia({ reducedMotion: true, finePointer: true })
  const { container } = render(<HeroParticles />)

  const canvas = container.querySelector('canvas[data-home-particles]')
  expect(canvas).not.toBeNull()
  expect(canvas).toHaveAttribute('aria-hidden', 'true')
  expect(canvas).toHaveClass('pointer-events-none')
})

it('skips canvas animation scheduling when prefers-reduced-motion is enabled', () => {
  mockMedia({ reducedMotion: true, finePointer: true })
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame')

  render(<HeroParticles />)

  expect(rafSpy).not.toHaveBeenCalled()
})

it('draws ambient particles when motion is allowed and cancels animation frame on unmount', () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  const ctx = createMockContext2D()
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue(ctx) as unknown as typeof originalGetContext

  let scheduledCallback: FrameRequestCallback | null = null
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    scheduledCallback = cb
    return 42
  })
  const cancelSpy = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(() => undefined)

  const { container, unmount } = render(<HeroParticles />)
  const canvas = container.querySelector(
    'canvas[data-home-particles]'
  ) as HTMLCanvasElement
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1280, 800)
  )

  expect(scheduledCallback).not.toBeNull()
  if (scheduledCallback) {
    ;(scheduledCallback as FrameRequestCallback)(16)
  }
  expect(ctx.clearRect).toHaveBeenCalled()
  expect(ctx.arc).toHaveBeenCalled()

  unmount()
  expect(cancelSpy).toHaveBeenCalled()
})

it('degrades gracefully without errors when Canvas 2D context is unavailable', () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  HTMLCanvasElement.prototype.getContext = vi
    .fn()
    .mockReturnValue(null) as unknown as typeof originalGetContext
  const rafSpy = vi.spyOn(window, 'requestAnimationFrame')

  expect(() => render(<HeroParticles />)).not.toThrow()
  expect(rafSpy).not.toHaveBeenCalled()
})

it.each([
  [1024, 900, 408, 328],
  [1440, 900, 472, 360],
  [1920, 1080, 512, 392],
])(
  'aligns the desktop particle seam with the shifted CSS rail at %ipx width',
  (viewportWidth, viewportHeight, expectedTopPx, expectedBottomPx) => {
    expect(getHeroSeamX(0, viewportWidth, viewportHeight)).toBe(expectedTopPx)
    expect(
      getHeroSeamX(viewportHeight / 2, viewportWidth, viewportHeight)
    ).toBe((expectedTopPx + expectedBottomPx) / 2)
    expect(getHeroSeamX(viewportHeight, viewportWidth, viewportHeight)).toBe(
      expectedBottomPx
    )
    // Viewport center (50%) must always stay in the console side on desktop
    expect(getHeroSeamX(0, viewportWidth, viewportHeight)).toBeLessThan(
      viewportWidth * 0.5
    )
  }
)
