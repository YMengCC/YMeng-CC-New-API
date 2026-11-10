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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import { DEFAULT_CONFIG } from '../../../constants'
import { PlaygroundGenerationForm } from '../playground-generation-form'

const groups = [{ label: 'default', value: 'default', ratio: 1 }]
const models = [{ label: 'flux-1', value: 'flux-1', mode: 'image' as const }]

const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  URL.createObjectURL = (file: Blob) =>
    `data:${file.type || 'application/octet-stream'};base64,AAAA`
  URL.revokeObjectURL = () => undefined
  i18next.addResourceBundle('en', 'translation', {
    'Image generation': 'Image generation',
    'Video generation': 'Video generation',
    'Describe what you want to generate': 'Describe what you want to generate',
    'Image size': 'Image size',
    'Number of images': 'Number of images',
    'Duration (seconds)': 'Duration (seconds)',
    Resolution: 'Resolution',
    'First frame image URL (optional)': 'First frame image URL (optional)',
    'Images are generated from your prompt.':
      'Images are generated from your prompt.',
    'Video generation may take a few minutes.':
      'Video generation may take a few minutes.',
    Generate: 'Generate',
    Stop: 'Stop',
    Model: 'Model',
    Group: 'Group',
  })
})

afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
})

function renderForm(
  overrides: Partial<Parameters<typeof PlaygroundGenerationForm>[0]> = {}
) {
  const onSubmitImage = vi.fn()
  const onSubmitVideo = vi.fn()
  const onStop = vi.fn()
  const props = {
    config: DEFAULT_CONFIG,
    groups,
    isGenerating: false,
    isModelLoading: false,
    mode: 'image' as const,
    models,
    onGroupChange: vi.fn(),
    onModelChange: vi.fn(),
    onStop,
    onSubmitImage,
    onSubmitVideo,
    ...overrides,
  }
  const view = render(<PlaygroundGenerationForm {...props} />)
  return { ...view, onSubmitImage, onSubmitVideo, onStop }
}

test('image mode shows image options and submits an image request', async () => {
  const user = userEvent.setup()
  const { onSubmitImage, onSubmitVideo } = renderForm()

  expect(screen.getByText('Image size')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()

  await user.type(
    screen.getByPlaceholderText('Describe what you want to generate'),
    'a cat{Enter}'
  )

  expect(onSubmitImage).toHaveBeenCalledWith(
    'a cat',
    { size: '1024x1024', n: 1 },
    undefined
  )
  expect(onSubmitVideo).not.toHaveBeenCalled()
})

test('video mode shows video options and submits a video request', async () => {
  const user = userEvent.setup()
  const { onSubmitImage, onSubmitVideo } = renderForm({ mode: 'video' })

  expect(screen.getByText('Duration (seconds)')).toBeInTheDocument()
  expect(screen.getByText('Resolution')).toBeInTheDocument()

  await user.type(
    screen.getByPlaceholderText('Describe what you want to generate'),
    'a wave{Enter}'
  )

  expect(onSubmitVideo).toHaveBeenCalledWith(
    'a wave',
    { duration: 5, resolution: '720p' },
    undefined
  )
  expect(onSubmitImage).not.toHaveBeenCalled()
})

test('the image count input is bounded to the backend limit', () => {
  renderForm()

  const input = screen.getByLabelText('Number of images')
  expect(input).toHaveAttribute('min', '1')
  expect(input).toHaveAttribute('max', '128')
})

test('the video duration input is bounded to the backend limit', () => {
  renderForm({ mode: 'video' })

  const input = screen.getByLabelText('Duration (seconds)')
  expect(input).toHaveAttribute('min', '1')
  expect(input).toHaveAttribute('max', '3600')
})

test('generating state replaces the submit button with a stop button', async () => {
  const user = userEvent.setup()
  const { onStop, onSubmitImage } = renderForm({ isGenerating: true })

  const stop = screen.getByRole('button', { name: 'Stop' })
  await user.click(stop)

  expect(onStop).toHaveBeenCalled()
  expect(onSubmitImage).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()
})

test('a disabled form cannot submit', () => {
  renderForm({ disabled: true })

  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
})

function dropImage(form: HTMLElement, name = 'reference.png') {
  const file = new File(['pixels'], name, { type: 'image/png' })
  fireEvent.drop(form, {
    dataTransfer: {
      types: ['Files'],
      files: [file],
      items: [{ kind: 'file', getAsFile: () => file }],
    },
  })
}

test('a dropped image is forwarded as a reference for image generation', async () => {
  const user = userEvent.setup()
  const { container, onSubmitImage } = renderForm()
  const form = container.querySelector('form')
  if (!form) throw new Error('form is missing')

  dropImage(form)
  await waitFor(() =>
    expect(screen.getByText('reference.png')).toBeInTheDocument()
  )

  await user.type(
    screen.getByPlaceholderText('Describe what you want to generate'),
    'a cat{Enter}'
  )
  await waitFor(() => expect(onSubmitImage).toHaveBeenCalled())

  expect(onSubmitImage.mock.calls[0][2]).toBe('data:image/png;base64,AAAA')
})

test('a dropped image is forwarded as a first-frame reference for video', async () => {
  const user = userEvent.setup()
  const { container, onSubmitVideo } = renderForm({ mode: 'video' })
  const form = container.querySelector('form')
  if (!form) throw new Error('form is missing')

  dropImage(form)
  await waitFor(() =>
    expect(screen.getByText('reference.png')).toBeInTheDocument()
  )

  await user.type(
    screen.getByPlaceholderText('Describe what you want to generate'),
    'a wave{Enter}'
  )
  await waitFor(() => expect(onSubmitVideo).toHaveBeenCalled())

  expect(onSubmitVideo.mock.calls[0][1].image).toBe(
    'data:image/png;base64,AAAA'
  )
  expect(onSubmitVideo.mock.calls[0][2]).toBe('data:image/png;base64,AAAA')
})
