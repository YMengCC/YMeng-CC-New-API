import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { useHomeDepth } from '../hooks/use-home-depth'

const originalMatchMedia = window.matchMedia

function setMatchMedia(value: typeof window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value })
}

function mockMedia(options: { reducedMotion: boolean; finePointer: boolean }) {
  setMatchMedia(
    (query: string) =>
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
      }) as MediaQueryList
  )
}

function DepthHarness(props: { enabled: boolean }) {
  useHomeDepth(props.enabled)
  return (
    <div data-testid='card' data-depth-tilt='6'>
      <span data-testid='layer' data-depth-layer='2'>
        Layer
      </span>
      <span data-testid='text' data-depth='1'>
        Text
      </span>
    </div>
  )
}

function renderCard(enabled = true) {
  const view = render(<DepthHarness enabled={enabled} />)
  const card = screen.getByTestId('card')
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 100)
  )
  return { ...view, card }
}

function pointer(type: string, target: Element, clientX = 0, clientY = 0) {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX, clientY })
  )
}

afterEach(() => {
  setMatchMedia(originalMatchMedia)
  vi.restoreAllMocks()
})

it('marks the page while the landing page is mounted and clears it on unmount', () => {
  mockMedia({ reducedMotion: false, finePointer: true })
  const { unmount } = renderCard()

  expect(document.documentElement).toHaveAttribute('data-home-depth')
  expect(document.documentElement).toHaveAttribute('data-home-motion')

  unmount()
  expect(document.documentElement).not.toHaveAttribute('data-home-depth')
  expect(document.documentElement).not.toHaveAttribute('data-home-motion')
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
  expect(card).not.toHaveAttribute('data-depth-active')
  expect(card.style.getPropertyValue('--depth-ry')).toBe('')
})

it('keeps entrances but skips pointer tilt on touch screens', async () => {
  mockMedia({ reducedMotion: false, finePointer: false })
  const { card } = renderCard()

  pointer('pointermove', card, 180, 20)
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(document.documentElement).toHaveAttribute('data-home-depth')
  expect(card).not.toHaveAttribute('data-depth-active')
})

it('tilts the hovered card toward the pointer and settles back when the pointer leaves', async () => {
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
      Number.parseFloat(layer.style.getPropertyValue('--depth-lx'))
    ).toBeGreaterThan(0)
    expect(text.style.getPropertyValue('--depth-x')).not.toBe('')
  })

  pointer('pointerout', card)

  await waitFor(() => {
    expect(card).not.toHaveAttribute('data-depth-active')
  })
  expect(card.style.getPropertyValue('--depth-ry')).toBe('')
  expect(layer.style.getPropertyValue('--depth-lx')).toBe('')
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
