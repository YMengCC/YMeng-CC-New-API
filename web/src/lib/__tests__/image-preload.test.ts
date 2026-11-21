import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPreloadedImages,
  getPreloadedImageState,
  preloadImage,
} from '../image-preload'

class MockImage {
  static instances: MockImage[] = []

  private listeners = new Map<string, EventListener[]>()

  src = ''

  constructor() {
    MockImage.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  emit(type: 'load' | 'error'): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new Event(type))
    }
  }
}

beforeEach(() => {
  clearPreloadedImages()
  MockImage.instances = []
  vi.stubGlobal('Image', MockImage)
})

describe('preloadImage', () => {
  it('shares one request and its loaded result for the same URL', async () => {
    const first = preloadImage('https://cdn.example.com/logo.png')
    const second = preloadImage('https://cdn.example.com/logo.png')

    expect(first).toBe(second)
    expect(MockImage.instances).toHaveLength(1)

    MockImage.instances[0].emit('load')

    await expect(first).resolves.toBe(true)
    expect(getPreloadedImageState('https://cdn.example.com/logo.png')).toBe(
      'loaded'
    )
  })

  it('does not retry a URL after a failed preload', async () => {
    const first = preloadImage('https://cdn.example.com/missing.png')
    MockImage.instances[0].emit('error')

    await expect(first).resolves.toBe(false)
    const second = preloadImage('https://cdn.example.com/missing.png')

    expect(second).toBe(first)
    expect(MockImage.instances).toHaveLength(1)
    expect(getPreloadedImageState('https://cdn.example.com/missing.png')).toBe(
      'failed'
    )
  })

  it('skips network preloading for in-memory image sources', async () => {
    await expect(preloadImage('data:image/png;base64,AAAA')).resolves.toBe(true)
    await expect(preloadImage('blob:https://example.com/image')).resolves.toBe(
      true
    )

    expect(MockImage.instances).toHaveLength(0)
    expect(getPreloadedImageState('data:image/png;base64,AAAA')).toBe('loaded')
  })
})
