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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import type {
  GroupOption,
  ModelOption,
  ParameterEnabled,
  PlaygroundConfig,
} from '../../../types'
import { PlaygroundInput } from '../playground-input'

const models: ModelOption[] = [{ label: 'gpt-4o', value: 'gpt-4o' }]
const groups: GroupOption[] = [{ label: 'default', value: 'default', ratio: 1 }]

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
  // jsdom has no blob URL support. Returning a data URL keeps the whole
  // submit path synchronous and lets us assert the real payload.
  URL.createObjectURL = (file: Blob) =>
    `data:${file.type || 'application/octet-stream'};base64,AAAA`
  URL.revokeObjectURL = () => undefined
  i18next.addResourceBundle('en', 'translation', {
    'Ask anything': 'Ask anything',
    Send: 'Send',
    Stop: 'Stop',
    Attach: 'Attach',
    Search: 'Search',
    Parameters: 'Parameters',
    'Clear chat history': 'Clear chat history',
    'to send': 'to send',
    'for a new line': 'for a new line',
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

function renderInput(
  overrides: Partial<Parameters<typeof PlaygroundInput>[0]> = {}
) {
  const onSubmit = vi.fn()
  const onStop = vi.fn()
  const onClearMessages = vi.fn()

  const props = {
    config: DEFAULT_CONFIG as PlaygroundConfig,
    disabled: false,
    groups,
    groupValue: 'default',
    hasMessages: false,
    isGenerating: false,
    isModelLoading: false,
    modelValue: 'gpt-4o',
    models,
    onClearMessages,
    onConfigChange: vi.fn(),
    onGroupChange: vi.fn(),
    onModelChange: vi.fn(),
    onParameterEnabledChange: vi.fn(),
    onStop,
    onSubmit,
    parameterEnabled: DEFAULT_PARAMETER_ENABLED as ParameterEnabled,
    ...overrides,
  }

  const view = render(<PlaygroundInput {...props} />)
  return { ...view, onSubmit, onStop, onClearMessages }
}

test('the send button is disabled until text is entered and models are available', async () => {
  const user = userEvent.setup()
  renderInput()

  const send = screen.getByRole('button', { name: 'Send' })
  expect(send).toBeDisabled()

  await user.type(screen.getByPlaceholderText('Ask anything'), 'hello')
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
})

test('the send button stays disabled when no models are available', async () => {
  const user = userEvent.setup()
  renderInput({ models: [] })

  await user.type(screen.getByPlaceholderText('Ask anything'), 'hello')
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
})

test('Enter submits the typed text and clears the composer', async () => {
  const user = userEvent.setup()
  const { onSubmit } = renderInput()

  const textarea = screen.getByPlaceholderText('Ask anything')
  await user.type(textarea, 'hello{Enter}')

  expect(onSubmit).toHaveBeenCalledWith('hello', undefined)
  expect(textarea).toHaveValue('')
})

test('Shift+Enter keeps the newline and does not submit', async () => {
  const user = userEvent.setup()
  const { onSubmit } = renderInput()

  const textarea = screen.getByPlaceholderText('Ask anything')
  await user.type(textarea, 'first{Shift>}{Enter}{/Shift}second')

  expect(onSubmit).not.toHaveBeenCalled()
  expect(textarea).toHaveValue('first\nsecond')
})

test('a generating composer shows Stop instead of Send', () => {
  renderInput({ isGenerating: true })

  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
})

test('the submit control keeps a stable touch size across Send and Stop', () => {
  const { unmount } = renderInput()
  const send = screen.getByRole('button', { name: 'Send' })
  expect(send.className).toContain('size-10')
  expect(send.className).toContain('sm:min-w-20')
  unmount()

  renderInput({ isGenerating: true })
  const stop = screen.getByRole('button', { name: 'Stop' })
  expect(stop.className).toContain('size-10')
  expect(stop.className).toContain('sm:min-w-20')
})

test('all four tool buttons have accessible names and are focusable', () => {
  renderInput()

  for (const name of ['Attach', 'Search', 'Parameters', 'Clear chat history']) {
    expect(screen.getByRole('button', { name })).toBeInTheDocument()
  }
})

test('the clear button is disabled when the conversation has no messages', () => {
  renderInput({ hasMessages: false, onClearMessages: vi.fn() })

  expect(
    screen.getByRole('button', { name: 'Clear chat history' })
  ).toBeDisabled()
})

test('the clear button is enabled when the conversation has messages', () => {
  renderInput({ hasMessages: true })

  expect(
    screen.getByRole('button', { name: 'Clear chat history' })
  ).toBeEnabled()
})

test('the model selector trigger exposes its expanded state', () => {
  renderInput()

  expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
})

test('the keyboard hint is present for screen readers', () => {
  renderInput()

  expect(screen.getByText('to send')).toBeInTheDocument()
  expect(screen.getByText('for a new line')).toBeInTheDocument()
})

test('a disabled composer does not submit on Enter', async () => {
  const user = userEvent.setup()
  const { onSubmit } = renderInput({ disabled: true })

  await user.type(screen.getByPlaceholderText('Ask anything'), 'hello{Enter}')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('a disabled composer rejects a form submission carrying an image', async () => {
  const { container, onSubmit } = renderInput({ disabled: true })
  const form = container.querySelector('form')
  if (!form) throw new Error('composer form is missing')
  dropFiles(form, [imageFile()])
  await waitFor(() => expect(form.querySelector('img')).toBeInTheDocument())
  await act(async () => {
    fireEvent.submit(form)
  })
  expect(onSubmit).not.toHaveBeenCalled()
})

test('the mobile control bar stays on one row with a scrollable tool area', () => {
  const { container } = renderInput()
  const footer = container.querySelector('[data-slot="input-group-addon"]')
  if (!footer) throw new Error('footer is missing')
  const bar = footer.firstElementChild as HTMLElement

  expect(bar.className).toContain('flex-nowrap')
  expect(bar.querySelector('.overflow-x-auto')).toBeInTheDocument()
  // Tool buttons keep a 40px touch target on mobile, 32px on desktop.
  expect(screen.getByRole('button', { name: 'Attach' }).className).toContain(
    'min-h-10'
  )
})

test('the composer uses a compact height on mobile and a larger one on desktop', () => {
  const { container } = renderInput()
  const textarea = screen.getByPlaceholderText('Ask anything')

  expect(textarea.className).toContain('min-h-16')
  expect(textarea.className).toContain('md:min-h-24')
  expect(container.firstElementChild?.className).toContain(
    'safe-area-inset-bottom'
  )
})

function dropFiles(form: HTMLElement, files: File[]) {
  const dataTransfer = {
    types: ['Files'],
    files,
    items: files.map((file) => ({ kind: 'file', getAsFile: () => file })),
  }
  fireEvent.drop(form, { dataTransfer })
}

function imageFile(name = 'cat.png') {
  return new File(['image-bytes'], name, { type: 'image/png' })
}

test('dropping an image attaches it and passes a data URL on submit', async () => {
  const user = userEvent.setup()
  const { container, onSubmit } = renderInput()
  const form = container.querySelector('form')
  if (!form) throw new Error('composer form is missing')

  dropFiles(form, [imageFile()])

  await waitFor(() => expect(form.querySelector('img')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()

  await user.type(
    screen.getByPlaceholderText('Ask anything'),
    'what is this?{Enter}'
  )

  await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  const [text, imageUrls] = onSubmit.mock.calls[0]
  expect(text).toBe('what is this?')
  expect(imageUrls).toHaveLength(1)
  expect(imageUrls[0]).toMatch(/^data:image\/png;base64,/)
})

test('an image can be submitted without typing any text', async () => {
  const { container, onSubmit } = renderInput()
  const form = container.querySelector('form')
  if (!form) throw new Error('composer form is missing')

  dropFiles(form, [imageFile()])

  await waitFor(() => expect(form.querySelector('img')).toBeInTheDocument())
  fireEvent.submit(form)

  await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  expect(onSubmit.mock.calls[0][0]).toBe('')
  expect(onSubmit.mock.calls[0][1]).toHaveLength(1)
})

test('a non-image file is rejected', async () => {
  const { container } = renderInput()
  const form = container.querySelector('form')
  if (!form) throw new Error('composer form is missing')

  dropFiles(form, [new File(['text'], 'notes.txt', { type: 'text/plain' })])

  await waitFor(() => expect(form.querySelector('img')).toBeNull())
})
