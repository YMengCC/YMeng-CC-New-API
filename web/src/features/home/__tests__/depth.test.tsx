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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { useHomeDepth } from '../hooks/use-home-depth'

const originalMatchMedia = window.matchMedia

function setMatchMedia(value: typeof window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value })
}

interface MediaController {
  setFinePointer: (fine: boolean) => void
  setReducedMotion: (reduced: boolean) => void
}

function mockMedia(options: {
  reducedMotion: boolean
  finePointer: boolean
}): MediaController {
  let reducedMotion = options.reducedMotion
  let finePointer = options.finePointer
  const listeners = new Set<() => void>()

  setMatchMedia(
    (query: string) =>
      ({
        get matches() {
          return query.includes('prefers-reduced-motion')
            ? reducedMotion
            : finePointer
        },
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: (_event: string, cb: () => void) => {
          listeners.add(cb)
        },
        removeEventListener: (_event: string, cb: () => void) => {
          listeners.delete(cb)
        },
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  )

  return {
    setFinePointer: (fine: boolean) => {
      finePointer = fine
      for (const cb of listeners) cb()
    },
    setReducedMotion: (reduced: boolean) => {
      reducedMotion = reduced
      for (const cb of listeners) cb()
    },
  }
}

function DepthHarness(props: { enabled: boolean }) {
  useHomeDepth(props.enabled)
  return (
    <div data-testid='scene' data-home-scene=''>
      <div data-testid='card' data-depth-tilt='6' data-depth-magnetic=''>
        <span data-testid='layer' data-depth-layer='2'>
          Layer
        </span>
        <span data-testid='text' data-depth='1'>
          Text
        </span>
      </div>
    </div>
  )
}

function renderCard(enabled = true) {
  const view = render(<DepthHarness enabled={enabled} />)
  const scene = screen.getByTestId('scene')
  const card = screen.getByTestId('card')
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 100)
  )
  return { ...view, scene, card }
}

function pointer(type: string, target: Element, clientX = 0, clientY = 0) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX, clientY })
  )
}

afterEach(() => {
  cleanup()
  setMatchMedia(originalMatchMedia)
  vi.restoreAllMocks()
})

it('marks the page while the landing page is mounted and clears it on unmount', () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  const { unmount } = renderCard()

  expect(document.documentElement).toHaveAttribute('data-home-depth')
  expect(document.documentElement).toHaveAttribute('data-home-motion')
  expect(document.documentElement).toHaveAttribute('data-home-pointer')

  unmount()
  expect(document.documentElement).not.toHaveAttribute('data-home-depth')
  expect(document.documentElement).not.toHaveAttribute('data-home-motion')
  expect(document.documentElement).not.toHaveAttribute('data-home-pointer')
})

it('stays flat when disabled for custom home content', () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  renderCard(false)

  expect(document.documentElement).not.toHaveAttribute('data-home-depth')
})

it('keeps the static relief but drops the motion under reduced motion', async () => {
  mockMedia({ reducedMotion: true, finePointer: true })
  const { card } = renderCard()

  pointer('pointermove', card, 180, 20)
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(document.documentElement).toHaveAttribute('data-home-depth')
  expect(document.documentElement).not.toHaveAttribute('data-home-motion')
  expect(document.documentElement).not.toHaveAttribute('data-home-pointer')
  expect(card).not.toHaveAttribute('data-depth-active')
  expect(card.style.getPropertyValue('--depth-ry')).toBe('')
})

it('keeps entrances but skips pointer tilt and spotlight on touch or mobile screens', async () => {
  mockMedia({ reducedMotion: false, finePointer: false })
  const { card, scene } = renderCard()

  pointer('pointermove', card, 180, 20)
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(document.documentElement).toHaveAttribute('data-home-depth')
  expect(document.documentElement).not.toHaveAttribute('data-home-pointer')
  expect(card).not.toHaveAttribute('data-depth-active')
  expect(scene.style.getPropertyValue('--home-spot-opacity')).toBe('')
})

it('tilts the hovered card with 3D lift, shadow offset and magnetic pull, then settles back when the pointer leaves', async () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  const { card } = renderCard()
  const layer = screen.getByTestId('layer')
  const text = screen.getByTestId('text')

  // Top-right corner: tilts right (positive Y) and back (positive X).
  pointer('pointermove', card, 180, 20)

  expect(card).toHaveAttribute('data-depth-active')
  await waitFor(() => {
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-ry'))
    ).toBeGreaterThan(0)
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-rx'))
    ).toBeGreaterThan(0)
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-lift'))
    ).toBeGreaterThan(0)
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-sx'))
    ).toBeLessThan(0)
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-mx'))
    ).toBeGreaterThan(0)
    expect(
      Number.parseFloat(layer.style.getPropertyValue('--depth-lx'))
    ).toBeGreaterThan(0)
    expect(text.style.getPropertyValue('--depth-x')).not.toBe('')
  })

  pointer('pointerout', card)

  await waitFor(() => {
    expect(card).not.toHaveAttribute('data-depth-active')
  })
  expect(card.style.getPropertyValue('--depth-ry')).toBe('')
  expect(card.style.getPropertyValue('--depth-lift')).toBe('')
  expect(card.style.getPropertyValue('--depth-mx')).toBe('')
  expect(layer.style.getPropertyValue('--depth-lx')).toBe('')
})

it('updates the scene cursor spotlight on desktop pointer move and fades it when leaving the window', async () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  const { card, scene } = renderCard()

  pointer('pointermove', card, 240, 160)

  await waitFor(() => {
    expect(scene.style.getPropertyValue('--home-spot-x')).toBe('240.0px')
    expect(
      Number.parseFloat(scene.style.getPropertyValue('--home-spot-opacity'))
    ).toBeGreaterThan(0)
  })

  pointer('pointerout', card)

  await waitFor(() => {
    expect(
      Number.parseFloat(scene.style.getPropertyValue('--home-spot-opacity'))
    ).toBe(0)
  })
})

it('automatically degrades active pointer effects when viewport switches to mobile', async () => {
  const media = mockMedia({ reducedMotion: false, finePointer: true })
  const { card, scene } = renderCard()

  pointer('pointermove', card, 180, 20)
  await waitFor(() => {
    expect(card).toHaveAttribute('data-depth-active')
  })

  media.setFinePointer(false)

  expect(document.documentElement).not.toHaveAttribute('data-home-pointer')
  expect(card).not.toHaveAttribute('data-depth-active')
  expect(scene.style.getPropertyValue('--home-spot-opacity')).toBe('')
})

it('presses the hovered card in on pointer down and releases it on pointer up', async () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  const { card } = renderCard()

  pointer('pointermove', card, 100, 50)
  pointer('pointerdown', card, 100, 50)

  await waitFor(() => {
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-scale'))
    ).toBeLessThan(0.98)
  })
  expect(card).toHaveAttribute('data-depth-pressed')

  pointer('pointerup', card, 100, 50)

  await waitFor(() => {
    expect(
      Number.parseFloat(card.style.getPropertyValue('--depth-scale'))
    ).toBe(1)
  })
})
