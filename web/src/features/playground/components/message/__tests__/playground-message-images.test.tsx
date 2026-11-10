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
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, expect, test } from 'vitest'

import type { Message } from '../../../types'
import { PlaygroundMessageContent } from '../playground-message-content'

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    'Attached image': 'Attached image',
    'Raw response': 'Raw response',
    'Responding...': 'Responding...',
    'Show preview': 'Show preview',
    'Show source': 'Show source',
  })
})

function renderMessage(message: Message) {
  return render(
    <PlaygroundMessageContent
      actions={null}
      alignment='left'
      message={message}
      versionContent={message.versions[0].content}
    />
  )
}

test('a user message with dropped images renders image thumbnails', () => {
  renderMessage({
    key: 'u1',
    from: 'user',
    versions: [{ id: 'v1', content: 'what is this?' }],
    status: 'complete',
    images: ['data:image/png;base64,AAAA', 'data:image/jpeg;base64,BBBB'],
  })

  const thumbnails = screen.getAllByRole('img', { name: 'Attached image' })
  expect(thumbnails).toHaveLength(2)
  expect(thumbnails[0]).toHaveAttribute('src', 'data:image/png;base64,AAAA')
  expect(thumbnails[1]).toHaveAttribute('src', 'data:image/jpeg;base64,BBBB')
})

test('a message without images renders no thumbnails', () => {
  renderMessage({
    key: 'u2',
    from: 'user',
    versions: [{ id: 'v1', content: 'hello' }],
    status: 'complete',
  })

  expect(screen.queryByRole('img')).toBeNull()
})
