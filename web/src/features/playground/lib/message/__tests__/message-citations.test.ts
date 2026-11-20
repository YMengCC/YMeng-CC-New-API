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
import { describe, expect, test } from 'vitest'

import { parseStreamMessageUpdates } from '../../streaming/stream-utils'
import { extractUrlCitations } from '../message-citations'
import { applyChatCompletionResponse } from '../message-streaming-utils'
import { createLoadingAssistantMessage } from '../message-utils'

function citation(url: string, title?: string) {
  return {
    type: 'url_citation',
    url_citation: { url, start_index: 0, end_index: 4, title },
  }
}

function completion(annotations?: unknown) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant' as const,
          content: 'Answer',
          annotations,
        },
        finish_reason: 'stop',
      },
    ],
  }
}

describe('url citations', () => {
  test('streaming delta annotations become a sources update', () => {
    const updates = parseStreamMessageUpdates(
      JSON.stringify({
        choices: [
          {
            delta: {
              content: 'Answer',
              annotations: [citation('https://example.com/a', 'Example A')],
            },
          },
        ],
      })
    )

    expect(updates).toEqual([
      { type: 'content', chunk: 'Answer' },
      {
        type: 'sources',
        sources: [{ href: 'https://example.com/a', title: 'Example A' }],
      },
    ])
  })

  test('non-streaming message annotations are stored as message sources', () => {
    const message = applyChatCompletionResponse(
      createLoadingAssistantMessage(0),
      completion([
        citation('https://example.com/a', 'Example A'),
        citation('https://example.com/b'),
      ])
    )

    expect(message?.sources).toEqual([
      { href: 'https://example.com/a', title: 'Example A' },
      { href: 'https://example.com/b', title: 'https://example.com/b' },
    ])
  })

  test('a response without annotations gets no sources', () => {
    const message = applyChatCompletionResponse(
      createLoadingAssistantMessage(0),
      completion()
    )

    expect(message?.sources).toBeUndefined()
  })

  test('a stream chunk without annotations emits no sources update', () => {
    const updates = parseStreamMessageUpdates(
      JSON.stringify({ choices: [{ delta: { content: 'Answer' } }] })
    )

    expect(updates.some((update) => update.type === 'sources')).toBe(false)
  })

  test('citations are deduplicated by URL keeping the first title', () => {
    expect(
      extractUrlCitations([
        citation('https://example.com/a', 'First'),
        citation('https://example.com/a', 'Second'),
      ])
    ).toEqual([{ href: 'https://example.com/a', title: 'First' }])
  })

  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/relative/path',
    'example.com/no-scheme',
    'ftp://example.com/file',
  ])('rejects the non-http(s) citation URL %s', (url) => {
    expect(extractUrlCitations([citation(url, 'bad')])).toEqual([])
  })

  test('ignores annotations that are not URL citations', () => {
    expect(
      extractUrlCitations([
        { type: 'file_citation', url_citation: { url: 'https://x.test' } },
        null,
        'text',
      ])
    ).toEqual([])
  })
})
