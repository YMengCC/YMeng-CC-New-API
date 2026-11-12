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
import { describe, expect, it } from 'vitest'

import {
  collectDocHeadings,
  createHeadingIdAllocator,
  extractFrontmatter,
  inlineMarkdownToText,
  slugifyHeading,
} from '../markdown-source'

describe('extractFrontmatter', () => {
  it('splits title and description from the body', () => {
    const source =
      '---\ntitle: 快速开始\ndescription: 五步完成接入。\n---\n\n正文内容'

    const result = extractFrontmatter(source)

    expect(result.title).toBe('快速开始')
    expect(result.description).toBe('五步完成接入。')
    expect(result.body).toBe('\n正文内容')
  })

  it('returns the source unchanged when no frontmatter is present', () => {
    const source: string = '## Heading\n\nBody'

    const result = extractFrontmatter(source)

    expect(result.title).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(result.body).toBe(source)
  })

  it('handles CRLF frontmatter delimiters', () => {
    const source = '---\r\ntitle: Quick Start\r\n---\r\nBody'

    const result = extractFrontmatter(source)

    expect(result.title).toBe('Quick Start')
    expect(result.body).toBe('Body')
  })

  it('ignores non-string title and description values', () => {
    const source = '---\ntitle: 42\ndescription:\n  - a\n---\nBody'

    const result = extractFrontmatter(source)

    expect(result.title).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(result.body).toBe('Body')
  })

  it('strips the block but keeps the body when YAML is invalid', () => {
    const source = '---\ntitle: [unclosed\n---\nBody'

    const result = extractFrontmatter(source)

    expect(result.title).toBeUndefined()
    expect(result.body).toBe('Body')
  })
})

describe('slugifyHeading', () => {
  it('lowercases Latin text and turns spaces into hyphens', () => {
    expect(slugifyHeading('Models and Pricing')).toBe('models-and-pricing')
  })

  it('keeps CJK characters while dropping punctuation', () => {
    expect(slugifyHeading('第 1 步：注册账号')).toBe('第-1-步注册账号')
    expect(slugifyHeading('429：请求过于频繁？')).toBe('429请求过于频繁')
  })

  it('falls back to a stable id for punctuation-only headings', () => {
    expect(slugifyHeading('???')).toBe('section')
  })
})

describe('createHeadingIdAllocator', () => {
  it('suffixes repeated slugs in document order', () => {
    const allocate = createHeadingIdAllocator()

    expect(allocate('Setup')).toBe('setup')
    expect(allocate('Usage')).toBe('usage')
    expect(allocate('Setup')).toBe('setup-1')
    expect(allocate('setup')).toBe('setup-2')
  })
})

describe('inlineMarkdownToText', () => {
  it('reduces emphasis, code, and links to display text', () => {
    expect(inlineMarkdownToText('`POST` **bold** and [link](/docs/x)')).toBe(
      'POST bold and link'
    )
  })
})

describe('collectDocHeadings', () => {
  it('collects only h2/h3 with renderer-compatible ids', () => {
    const markdown = [
      '# Title',
      '## First Section',
      '### Nested Detail',
      '#### Too Deep',
      '## Second Section',
    ].join('\n')

    const headings = collectDocHeadings(markdown)

    expect(headings).toEqual([
      { id: 'first-section', level: 2, text: 'First Section' },
      { id: 'nested-detail', level: 3, text: 'Nested Detail' },
      { id: 'second-section', level: 2, text: 'Second Section' },
    ])
  })

  it('includes headings inside callouts in document order', () => {
    const markdown = [
      '## Before',
      ':::tip 提示',
      '## Inside Callout',
      ':::',
      '## After',
    ].join('\n')

    const headings = collectDocHeadings(markdown)

    expect(headings.map((heading) => heading.id)).toEqual([
      'before',
      'inside-callout',
      'after',
    ])
  })

  it('allocates duplicate suffixes across heading depths', () => {
    const markdown = '## Setup\n\n### Setup\n\n## Setup'

    const headings = collectDocHeadings(markdown)

    expect(headings.map((heading) => heading.id)).toEqual([
      'setup',
      'setup-1',
      'setup-2',
    ])
  })

  it('collects headings nested in lists', () => {
    const markdown = '- item\n  ## List Heading\n- other'

    const headings = collectDocHeadings(markdown)

    expect(headings).toEqual([
      { id: 'list-heading', level: 2, text: 'List Heading' },
    ])
  })
})
