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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { InternalAxiosRequestConfig } from 'axios'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { CollectionQrCard } from '../components/collection-qr-card'

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qr')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    (callback) => callback(pngFile(100, 100))
  )
  HTMLElement.prototype.setPointerCapture = () => undefined
  HTMLElement.prototype.releasePointerCapture = () => undefined
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 200,
    bottom: 200,
    width: 200,
    height: 200,
    toJSON: () => ({}),
  } as DOMRect)
})
afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function pngFile(width = 1, height = 1) {
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  const header = new DataView(bytes.buffer)
  header.setUint32(16, width)
  header.setUint32(20, height)
  return new File([bytes], 'alipay.png', { type: 'image/png' })
}
function configureImage(width: number, height: number) {
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
  )
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get: () => height,
  })
}

async function loadCropImage() {
  const image = await screen.findByRole('img', {
    name: 'Collection QR code preview',
  })
  fireEvent.load(image)
  return screen.findByRole('group', { name: 'QR code crop area' })
}

function renderCard(hasQr = false) {
  let saved = hasQr
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/withdrawal/profile/qr') {
      return { data: new Blob(['png'], { type: 'image/png' }) }
    }
    if (url === '/api/withdrawal/profile') {
      return {
        data: {
          success: true,
          data: { has_qr: saved, updated_at: saved ? 2 : 0 },
        },
      }
    }
    throw new Error(`Unexpected GET ${url}`)
  })
  const put = vi.spyOn(api, 'put').mockImplementation(async () => {
    saved = true
    return { data: { success: true, data: { has_qr: true, updated_at: 2 } } }
  })
  const view = render(
    <QueryClientProvider client={client}>
      <CollectionQrCard />
    </QueryClientProvider>
  )
  return { get, put, ...view }
}

it.each([
  [
    'a renamed JPEG',
    () => new File(['jpeg'], 'fake.png', { type: 'image/png' }),
    'Please select a valid PNG image',
  ],
  [
    'an oversized image',
    () =>
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
        type: 'image/png',
      }),
    'PNG image must not exceed 5 MiB',
  ],
  [
    'an excessive image dimension',
    () => pngFile(4097, 1),
    'PNG dimensions must not exceed 4096 × 4096 pixels',
  ],
])(
  'rejects %s before uploading and exposes an accessible error',
  async (_, makeFile, error) => {
    const { put } = renderCard()
    const input = screen.getByLabelText('PNG collection QR code')
    fireEvent.change(input, { target: { files: [makeFile()] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(error)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByRole('button', { name: 'Save collection QR code' })
    ).toBeDisabled()
    expect(put).not.toHaveBeenCalled()
  }
)

it('rejects an image with a PNG header when the browser cannot decode its contents', async () => {
  vi.stubGlobal(
    'Image',
    class {
      onerror: (() => void) | null = null
      set src(_: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
  )
  const { put } = renderCard()
  fireEvent.change(screen.getByLabelText('PNG collection QR code'), {
    target: { files: [pngFile()] },
  })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Please select a valid PNG image'
  )
  expect(put).not.toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr')
})

it('requires a square selection before saving and uploads the cropped PNG at source resolution', async () => {
  configureImage(800, 600)
  const { put, get, unmount } = renderCard()
  const file = pngFile()
  const input = screen.getByLabelText('PNG collection QR code')
  expect(input).toHaveAttribute('accept', 'image/png,.png')
  fireEvent.change(input, { target: { files: [file] } })
  const cropArea = await loadCropImage()
  expect(
    screen.getByRole('img', { name: 'Collection QR code preview' })
  ).toHaveAttribute('src', 'blob:qr')
  const save = screen.getByRole('button', { name: 'Save collection QR code' })
  expect(save).toBeDisabled()

  fireEvent.pointerDown(cropArea, { clientX: 0, clientY: 0, pointerId: 1 })
  fireEvent.pointerMove(cropArea, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(cropArea, { clientX: 100, clientY: 100, pointerId: 1 })
  await waitFor(() => expect(save).toBeEnabled())
  expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
    expect.any(Function),
    'image/png'
  )
  expect(
    (HTMLCanvasElement.prototype.getContext as ReturnType<typeof vi.fn>).mock
      .calls.length
  ).toBeGreaterThan(0)

  fireEvent.click(save)
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
  const form = put.mock.calls[0][1] as FormData
  const uploaded = form.get('qr') as File
  expect(uploaded).not.toBe(file)
  expect(uploaded.type).toBe('image/png')
  expect(put.mock.calls[0][2]).toMatchObject({
    headers: { 'Content-Type': null },
  })
  expect(
    await screen.findByRole('button', { name: 'Replace collection QR code' })
  ).toBeDisabled()
  await waitFor(() =>
    expect(
      get.mock.calls.some(([url]) => url === '/api/withdrawal/profile/qr')
    ).toBe(true)
  )
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr')
})

it('keeps the selection and cropped upload after an upload failure, then retries successfully', async () => {
  configureImage(800, 600)
  const { put } = renderCard()
  put.mockRejectedValueOnce(new Error('upload unavailable'))
  fireEvent.change(screen.getByLabelText('PNG collection QR code'), {
    target: { files: [pngFile()] },
  })
  const cropArea = await loadCropImage()
  fireEvent.pointerDown(cropArea, { clientX: 0, clientY: 0, pointerId: 1 })
  fireEvent.pointerMove(cropArea, { clientX: 80, clientY: 80, pointerId: 1 })
  fireEvent.pointerUp(cropArea, { clientX: 80, clientY: 80, pointerId: 1 })
  const save = screen.getByRole('button', { name: 'Save collection QR code' })
  await waitFor(() => expect(save).toBeEnabled())
  fireEvent.click(save)
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(save).toBeEnabled())
  expect(cropArea).toBeVisible()
  expect(screen.getByRole('img')).toBeVisible()
  fireEvent.click(save)
  await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
})

it('shows a prominent warning card until the QR area is selected', async () => {
  configureImage(400, 400)
  renderCard()
  fireEvent.change(screen.getByLabelText('PNG collection QR code'), {
    target: { files: [pngFile()] },
  })
  const cropArea = await loadCropImage()
  expect(screen.getByText('Select the QR code area first')).toBeVisible()
  const save = screen.getByRole('button', {
    name: 'Save collection QR code',
  })
  expect(save).toBeDisabled()
  expect(save).toHaveAttribute('aria-describedby', 'collection-qr-crop-alert')

  fireEvent.pointerDown(cropArea, { clientX: 0, clientY: 0, pointerId: 1 })
  fireEvent.pointerMove(cropArea, { clientX: 120, clientY: 120, pointerId: 1 })
  fireEvent.pointerUp(cropArea, { clientX: 120, clientY: 120, pointerId: 1 })
  await waitFor(() =>
    expect(
      screen.queryByText('Select the QR code area first')
    ).not.toBeInTheDocument()
  )
  expect(
    screen.queryByText(
      'Drag on the image above to draw a square around the QR code. Saving stays disabled until you select an area.'
    )
  ).not.toBeInTheDocument()
})

it('clamps a touch selection to the image and enforces the minimum square size', async () => {
  configureImage(200, 200)
  renderCard()
  fireEvent.change(screen.getByLabelText('PNG collection QR code'), {
    target: { files: [pngFile()] },
  })
  const cropArea = await loadCropImage()
  fireEvent.pointerDown(cropArea, {
    clientX: 190,
    clientY: 190,
    pointerId: 1,
    pointerType: 'touch',
  })
  fireEvent.pointerMove(cropArea, {
    clientX: 400,
    clientY: 400,
    pointerId: 1,
    pointerType: 'touch',
  })
  fireEvent.pointerUp(cropArea, {
    clientX: 400,
    clientY: 400,
    pointerId: 1,
    pointerType: 'touch',
  })
  const selection = document.querySelector('[data-slot="qr-crop-selection"]')
  expect(selection).not.toBeNull()
  const style = selection?.getAttribute('style') ?? ''
  const left = Number(style.match(/left:\s*([\d.]+)%/)?.[1])
  const width = Number(style.match(/width:\s*([\d.]+)%/)?.[1])
  expect(left + width).toBeLessThanOrEqual(100)
  expect(cropArea).toHaveClass('touch-none')
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save collection QR code' })
    ).toBeEnabled()
  )
})

it('moves and resizes the square selection with the keyboard', async () => {
  configureImage(400, 400)
  renderCard()
  fireEvent.change(screen.getByLabelText('PNG collection QR code'), {
    target: { files: [pngFile()] },
  })
  const cropArea = await loadCropImage()
  fireEvent.pointerDown(cropArea, { clientX: 0, clientY: 0, pointerId: 1 })
  fireEvent.pointerMove(cropArea, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(cropArea, { clientX: 100, clientY: 100, pointerId: 1 })
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save collection QR code' })
    ).toBeEnabled()
  )
  const selection = document.querySelector('[data-slot="qr-crop-selection"]')
  const initial = selection?.getAttribute('style')
  cropArea.focus()
  fireEvent.keyDown(cropArea, { key: 'ArrowRight' })
  await waitFor(() =>
    expect(selection?.getAttribute('style')).not.toBe(initial)
  )
  const moved = selection?.getAttribute('style')
  fireEvent.keyDown(cropArea, { key: 'ArrowRight', shiftKey: true })
  await waitFor(() => expect(selection?.getAttribute('style')).not.toBe(moved))
  expect(cropArea).toHaveAttribute(
    'aria-describedby',
    'collection-qr-crop-help'
  )
})

it('loads metadata and the saved PNG on the first StrictMode mount without a manual retry', async () => {
  const originalAdapter = api.defaults.adapter
  const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
    data:
      config.url === '/api/withdrawal/profile/qr'
        ? new Blob(['png'], { type: 'image/png' })
        : { success: true, data: { has_qr: true, updated_at: 1 } },
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
  }))
  api.defaults.adapter = adapter
  try {
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <CollectionQrCard />
        </QueryClientProvider>
      </StrictMode>
    )
    expect(
      await screen.findByRole('img', { name: 'Collection QR code preview' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument()
    expect(adapter.mock.calls.map(([config]) => config.url)).toContain(
      '/api/withdrawal/profile'
    )
    expect(adapter.mock.calls.map(([config]) => config.url)).toContain(
      '/api/withdrawal/profile/qr'
    )
  } finally {
    api.defaults.adapter = originalAdapter
  }
})

it('loads the saved QR through an authenticated blob request and releases its preview on unmount', async () => {
  const { get, unmount } = renderCard(true)
  expect(await screen.findByRole('img')).toHaveAccessibleName(
    'Collection QR code preview'
  )
  expect(get).toHaveBeenCalledWith(
    '/api/withdrawal/profile/qr',
    expect.objectContaining({
      responseType: 'blob',
      signal: expect.any(AbortSignal),
    })
  )
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr')
})
