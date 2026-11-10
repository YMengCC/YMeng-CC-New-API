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
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, expect, test } from 'vitest'

import type { MessageSegment } from '../../../lib/message/message-segments'
import { PlaygroundSegmentCard } from '../playground-segment-card'

const markdownSegment: MessageSegment = {
  key: 'markdown-0',
  kind: 'markdown',
  content: '## Hello\n\nSome **text**',
  language: 'markdown',
  isOpen: false,
}

const htmlSegment: MessageSegment = {
  key: 'code-1',
  kind: 'code',
  content: '<!doctype html><html><body>Hi</body></html>',
  language: 'html',
  isOpen: false,
}

const jsonSegment: MessageSegment = {
  key: 'code-2',
  kind: 'code',
  content: '{"a": 1}',
  language: 'json',
  isOpen: false,
}

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    Markdown: 'Markdown',
    'HTML preview': 'HTML preview',
    'Show source': 'Show source',
    'Show preview': 'Show preview',
    'Copy code': 'Copy code',
    'Rendering preview when the response is complete':
      'Rendering preview when the response is complete',
  })
})

test('a markdown card has a source toggle that switches to source view', async () => {
  const user = userEvent.setup()
  render(
    <PlaygroundSegmentCard
      isFinal
      isSourceVisible={false}
      segment={markdownSegment}
    />
  )

  const toggle = screen.getByRole('button', { name: 'Show source' })
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument()

  await user.click(toggle)

  expect(screen.getByRole('button', { name: 'Show preview' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.queryByRole('heading', { name: 'Hello' })).toBeNull()
})

test('forceSourceVisible makes the card show source and keeps the toggle accessible', async () => {
  const user = userEvent.setup()
  render(
    <PlaygroundSegmentCard isFinal isSourceVisible segment={markdownSegment} />
  )

  const toggle = screen.getByRole('button', { name: 'Show preview' })
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('heading', { name: 'Hello' })).toBeNull()

  // A per-card toggle still works while the message-level source view is on.
  await user.click(toggle)
  expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument()
})

test('a completed HTML segment renders a sandboxed iframe without same-origin', () => {
  render(
    <PlaygroundSegmentCard
      isFinal
      isSourceVisible={false}
      segment={htmlSegment}
    />
  )

  const frame = screen.getByTitle('HTML preview')
  expect(frame.tagName).toBe('IFRAME')
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
  expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
  expect(frame.getAttribute('srcdoc')).toBe(htmlSegment.content)
})

test('a streaming HTML segment shows a placeholder instead of remounting the iframe', () => {
  render(
    <PlaygroundSegmentCard
      isFinal={false}
      isSourceVisible={false}
      segment={htmlSegment}
    />
  )

  expect(screen.queryByTitle('HTML preview')).toBeNull()
  expect(
    screen.getByText('Rendering preview when the response is complete')
  ).toBeInTheDocument()
})

test('an unclosed HTML fence never renders an iframe even when final', () => {
  render(
    <PlaygroundSegmentCard
      isFinal
      isSourceVisible={false}
      segment={{ ...htmlSegment, isOpen: true }}
    />
  )

  expect(screen.queryByTitle('HTML preview')).toBeNull()
})

test('non-HTML code segments default to source with an independent toggle', async () => {
  const user = userEvent.setup()
  render(
    <PlaygroundSegmentCard
      isFinal
      isSourceVisible={false}
      segment={jsonSegment}
    />
  )

  expect(
    screen.getByRole('button', { name: 'Show preview' })
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Show preview' }))
  expect(
    screen.getByRole('button', { name: 'Show source' })
  ).toBeInTheDocument()
})

test('each card owns its own source toggle', async () => {
  const user = userEvent.setup()
  render(
    <div>
      <PlaygroundSegmentCard
        isFinal
        isSourceVisible={false}
        segment={markdownSegment}
      />
      <PlaygroundSegmentCard
        isFinal
        isSourceVisible={false}
        segment={{ ...markdownSegment, key: 'markdown-9' }}
      />
    </div>
  )

  const toggles = screen.getAllByRole('button', { name: 'Show source' })
  expect(toggles).toHaveLength(2)
  await user.click(toggles[0])
  expect(screen.getAllByRole('button', { name: 'Show source' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Show preview' })).toHaveLength(
    1
  )
})
