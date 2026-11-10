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
import { expect, test } from 'vitest'

import {
  canSubmitInput,
  getSubmittableImageUrls,
  getSubmittableInputText,
} from '../input-control-utils'

test('text is still submittable on its own', () => {
  expect(getSubmittableInputText({ text: 'hello' })).toBe('hello')
  expect(canSubmitInput({ text: 'hello' }, false)).toBe(true)
})

test('an empty text returns null when there is nothing else', () => {
  expect(getSubmittableInputText({ text: '   ' })).toBeNull()
  expect(canSubmitInput({ text: '   ' }, false)).toBe(false)
})

test('a disabled input never yields submittable text', () => {
  expect(getSubmittableInputText({ text: 'hello' }, true)).toBeNull()
})

test('only image data URLs are extracted from dropped files', () => {
  const message = {
    text: '',
    files: [
      { url: 'data:image/png;base64,AAAA', mediaType: 'image/png' },
      { url: 'data:application/pdf;base64,BBBB', mediaType: 'application/pdf' },
      { url: 'https://example.com/photo.jpg', mediaType: 'image/jpeg' },
    ],
  }

  expect(getSubmittableImageUrls(message)).toEqual([
    'data:image/png;base64,AAAA',
    'https://example.com/photo.jpg',
  ])
})

test('a message with only attached images is submittable', () => {
  expect(canSubmitInput({ text: '' }, true)).toBe(true)
  expect(canSubmitInput({ text: '   ', files: [] }, false)).toBe(false)
})

test('a message with no files yields no image urls', () => {
  expect(getSubmittableImageUrls({ text: 'hello' })).toEqual([])
})
