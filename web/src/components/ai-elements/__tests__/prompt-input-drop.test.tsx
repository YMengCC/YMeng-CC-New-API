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
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputTextarea,
} from '../prompt-input'

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeAll(() => {
  URL.createObjectURL = (file: Blob) =>
    `data:${file.type || 'application/octet-stream'};base64,AAAA`
  URL.revokeObjectURL = () => undefined
})

afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL
  URL.revokeObjectURL = originalRevokeObjectURL
})

function renderComposer(onSubmit: ReturnType<typeof vi.fn<() => void>>) {
  return render(
    <PromptInput accept='image/*' maxFiles={4} onSubmit={onSubmit}>
      <PromptInputAttachments>
        {(file) => <PromptInputAttachment data={file} />}
      </PromptInputAttachments>
      <PromptInputTextarea placeholder='message' />
    </PromptInput>
  )
}

test('a file dropped on the composer form is attached', async () => {
  const onSubmit = vi.fn()
  const { container } = renderComposer(onSubmit)
  const form = container.querySelector('form')
  if (!form) throw new Error('form is missing')

  const file = new File(['pixels'], 'cat.png', { type: 'image/png' })
  fireEvent.drop(form, {
    dataTransfer: {
      types: ['Files'],
      files: [file],
      items: [{ kind: 'file', getAsFile: () => file }],
    },
  })

  await waitFor(() => expect(screen.getByText('cat.png')).toBeInTheDocument())
  expect(container.querySelector('img')).toHaveAttribute(
    'src',
    'data:image/png;base64,AAAA'
  )
})

test('submitting after a drop forwards the file to onSubmit', async () => {
  const onSubmit = vi.fn()
  const { container } = renderComposer(onSubmit)
  const form = container.querySelector('form')
  if (!form) throw new Error('form is missing')

  const file = new File(['pixels'], 'cat.png', { type: 'image/png' })
  fireEvent.drop(form, {
    dataTransfer: {
      types: ['Files'],
      files: [file],
      items: [{ kind: 'file', getAsFile: () => file }],
    },
  })
  await waitFor(() => expect(screen.getByText('cat.png')).toBeInTheDocument())

  fireEvent.submit(form)
  await waitFor(() => expect(onSubmit).toHaveBeenCalled())
  expect(onSubmit.mock.calls[0][0].files).toHaveLength(1)
  expect(onSubmit.mock.calls[0][0].files[0].url).toBe(
    'data:image/png;base64,AAAA'
  )
})
