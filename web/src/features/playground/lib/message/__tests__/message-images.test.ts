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

import { createUserMessage, formatMessageForAPI } from '../message-utils'

test('a user message without images formats as a plain string', () => {
  const message = createUserMessage('hello')
  expect(formatMessageForAPI(message)).toEqual({
    role: 'user',
    content: 'hello',
  })
})

test('a user message with images formats as OpenAI content parts', () => {
  const message = createUserMessage('what is this?', 1, [
    'data:image/png;base64,AAAA',
    'data:image/jpeg;base64,BBBB',
  ])

  expect(formatMessageForAPI(message)).toEqual({
    role: 'user',
    content: [
      { type: 'text', text: 'what is this?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,BBBB' } },
    ],
  })
})

test('an image-only message still carries an empty text part', () => {
  const message = createUserMessage('', 1, ['data:image/png;base64,AAAA'])
  const content = formatMessageForAPI(message).content

  expect(Array.isArray(content)).toBe(true)
  expect(content).toEqual([
    { type: 'text', text: '' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
  ])
})

test('createUserMessage omits the images field when empty', () => {
  expect(createUserMessage('hello', 1, [])).not.toHaveProperty('images')
})
