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
  isHtmlContent,
  normalizeSegmentLanguage,
  splitMessageSegments,
  type MessageSegment,
} from '../message-segments'

function summarize(segments: MessageSegment[]) {
  return segments.map(({ kind, content, language, isOpen }) => ({
    kind,
    content,
    language,
    isOpen,
  }))
}

test('plain markdown without fences stays a single prose segment', () => {
  expect(summarize(splitMessageSegments('# Title\n\nHello **world**'))).toEqual(
    [
      {
        kind: 'markdown',
        content: '# Title\n\nHello **world**',
        language: 'markdown',
        isOpen: false,
      },
    ]
  )
})

test('empty content yields no segments', () => {
  expect(splitMessageSegments('   \n\n')).toEqual([])
})

test('fenced code blocks are split into their own segments between prose', () => {
  const content = [
    'Intro text',
    '```python',
    'print(1)',
    '```',
    'Middle text',
    '```json',
    '{"a": 1}',
    '```',
    'Outro',
  ].join('\n')

  expect(summarize(splitMessageSegments(content))).toEqual([
    {
      kind: 'markdown',
      content: 'Intro text',
      language: 'markdown',
      isOpen: false,
    },
    { kind: 'code', content: 'print(1)', language: 'python', isOpen: false },
    {
      kind: 'markdown',
      content: 'Middle text',
      language: 'markdown',
      isOpen: false,
    },
    { kind: 'code', content: '{"a": 1}', language: 'json', isOpen: false },
    { kind: 'markdown', content: 'Outro', language: 'markdown', isOpen: false },
  ])
})

test('an unclosed trailing fence is emitted as an open code segment', () => {
  expect(summarize(splitMessageSegments('Intro\n```html\n<h1>Hi'))).toEqual([
    { kind: 'markdown', content: 'Intro', language: 'markdown', isOpen: false },
    { kind: 'code', content: '<h1>Hi', language: 'html', isOpen: true },
  ])
})

test('tilde fences and longer backtick fences are supported', () => {
  const tilde = summarize(splitMessageSegments('A\n~~~js\nconst a = 1\n~~~\nB'))
  expect(tilde[1]).toEqual({
    kind: 'code',
    content: 'const a = 1',
    language: 'javascript',
    isOpen: false,
  })

  const long = summarize(
    splitMessageSegments('````md\n```js\ninner\n```\n````')
  )
  expect(long).toEqual([
    {
      kind: 'code',
      content: '```js\ninner\n```',
      language: 'markdown',
      isOpen: false,
    },
  ])
})

test('a shorter closing fence does not close a longer opening fence', () => {
  const segments = splitMessageSegments('````js\n```\nstill code\n````')
  expect(segments).toHaveLength(1)
  expect(segments[0].content).toBe('```\nstill code')
  expect(segments[0].isOpen).toBe(false)
})

test('language aliases and case are normalized', () => {
  expect(normalizeSegmentLanguage('TS')).toBe('typescript')
  expect(normalizeSegmentLanguage('golang')).toBe('go')
  expect(normalizeSegmentLanguage('JS extra')).toBe('javascript')
  expect(normalizeSegmentLanguage('')).toBe('')
})

test('HTML segments are recognized by language and by document content', () => {
  expect(isHtmlContent('<div>hi</div>', 'html')).toBe(true)
  expect(isHtmlContent('<!DOCTYPE html><html></html>', 'plaintext')).toBe(true)
  expect(isHtmlContent('const a = 1', 'js')).toBe(false)
})

test('indented fences are recognized and prose trailing newlines are trimmed', () => {
  expect(
    summarize(splitMessageSegments('  ```css\n  a {}\n  ```\n\n'))
  ).toEqual([
    { kind: 'code', content: '  a {}', language: 'css', isOpen: false },
  ])
})
