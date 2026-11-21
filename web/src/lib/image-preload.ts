type ImageLoadState = 'loading' | 'loaded' | 'failed'

type ImageLoadEntry = {
  state: ImageLoadState
  promise: Promise<boolean>
}

const imageLoadEntries = new Map<string, ImageLoadEntry>()

function normalizeImageSource(source: string | null | undefined): string {
  return typeof source === 'string' ? source.trim() : ''
}

function isImmediateImageSource(source: string): boolean {
  return source.startsWith('data:') || source.startsWith('blob:')
}

/** Preload one remote image and reuse its result for the current page session. */
export function preloadImage(
  source: string | null | undefined
): Promise<boolean> {
  const normalizedSource = normalizeImageSource(source)
  if (!normalizedSource || isImmediateImageSource(normalizedSource)) {
    return Promise.resolve(Boolean(normalizedSource))
  }

  const existing = imageLoadEntries.get(normalizedSource)
  if (existing) return existing.promise

  const promise = new Promise<boolean>((resolve) => {
    const image = new Image()
    const handleLoad = () => {
      imageLoadEntries.set(normalizedSource, { state: 'loaded', promise })
      resolve(true)
    }
    const handleError = () => {
      imageLoadEntries.set(normalizedSource, { state: 'failed', promise })
      resolve(false)
    }
    image.addEventListener('load', handleLoad, { once: true })
    image.addEventListener('error', handleError, { once: true })
    image.src = normalizedSource
  })

  imageLoadEntries.set(normalizedSource, { state: 'loading', promise })
  return promise
}

export function getPreloadedImageState(
  source: string | null | undefined
): ImageLoadState | null {
  const normalizedSource = normalizeImageSource(source)
  if (!normalizedSource) return null
  if (isImmediateImageSource(normalizedSource)) return 'loaded'
  return imageLoadEntries.get(normalizedSource)?.state ?? null
}

export function markImageLoadFailed(source: string | null | undefined): void {
  const normalizedSource = normalizeImageSource(source)
  if (!normalizedSource || isImmediateImageSource(normalizedSource)) return

  const existing = imageLoadEntries.get(normalizedSource)
  if (existing) {
    imageLoadEntries.set(normalizedSource, {
      state: 'failed',
      promise: existing.promise,
    })
    return
  }

  imageLoadEntries.set(normalizedSource, {
    state: 'failed',
    promise: Promise.resolve(false),
  })
}

export function clearPreloadedImages(): void {
  imageLoadEntries.clear()
}
