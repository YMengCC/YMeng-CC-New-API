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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import type { Message } from '../../../types'
import { PlaygroundMessageContent } from '../playground-message-content'

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

test('a user message lists its sent attachments by name', () => {
  renderMessage({
    key: 'u1',
    from: 'user',
    versions: [{ id: 'v1', content: 'summarize' }],
    status: 'complete',
    attachments: [
      { name: 'report.pdf', mimeType: 'application/pdf', size: 2048 },
      { name: 'chart.png', mimeType: 'image/png', size: 1024 },
    ],
  })

  const list = screen.getByRole('list', { name: 'Attachments' })
  const items = within(list).getAllByRole('listitem')
  expect(items.map((item) => item.textContent)).toEqual([
    'report.pdf',
    'chart.png',
  ])
})

test('an assistant message with citations shows the sources card with links', async () => {
  const user = userEvent.setup()
  renderMessage({
    key: 'a1',
    from: 'assistant',
    versions: [{ id: 'v1', content: 'Answer' }],
    status: 'complete',
    sources: [{ href: 'https://example.com/a', title: 'Example A' }],
  })

  await user.click(screen.getByRole('button', { name: /sources/ }))

  expect(screen.getByRole('link', { name: 'Example A' })).toHaveAttribute(
    'href',
    'https://example.com/a'
  )
})

test('an assistant message without citations shows no sources card', () => {
  renderMessage({
    key: 'a2',
    from: 'assistant',
    versions: [{ id: 'v1', content: 'Answer' }],
    status: 'complete',
  })

  expect(screen.queryByText(/sources/)).toBeNull()
})
