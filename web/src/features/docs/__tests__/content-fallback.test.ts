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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchDocMarkdown, fetchDocsSearchIndex } from '../api'

function mockFetch(responses: Record<string, { ok: boolean; body: string }>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      const response = responses[url]
      return {
        ok: response?.ok ?? false,
        status: response?.ok ? 200 : 404,
        text: async () => response?.body ?? '',
      }
    })
  )
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDocMarkdown', () => {
  it('serves the requested locale when it exists', async () => {
    const calls = mockFetch({
      '/docs-content/zhCN/quick-start.md': { ok: true, body: '中文内容' },
    })

    const result = await fetchDocMarkdown('zhCN', 'quick-start')

    expect(result).toBe('中文内容')
    expect(calls).toEqual(['/docs-content/zhCN/quick-start.md'])
  })

  it('falls back to English when the locale file is missing', async () => {
    const calls = mockFetch({
      '/docs-content/en/quick-start.md': { ok: true, body: 'English content' },
    })

    const result = await fetchDocMarkdown('fr', 'quick-start')

    expect(result).toBe('English content')
    expect(calls).toEqual([
      '/docs-content/fr/quick-start.md',
      '/docs-content/en/quick-start.md',
    ])
  })

  it('rejects when even English is unavailable', async () => {
    mockFetch({})

    await expect(fetchDocMarkdown('en', 'quick-start')).rejects.toThrow()
  })
})

describe('fetchDocsSearchIndex', () => {
  it('parses the locale index', async () => {
    mockFetch({
      '/docs-content/ja/search-index.json': {
        ok: true,
        body: '{"pages":[{"slug":"quick-start","title":"クイックスタート","description":"","headings":[]}]}',
      },
    })

    const index = await fetchDocsSearchIndex('ja')

    expect(index.pages[0]?.title).toBe('クイックスタート')
  })

  it('falls back to the English index when the locale index is missing', async () => {
    const calls = mockFetch({
      '/docs-content/en/search-index.json': {
        ok: true,
        body: '{"pages":[]}',
      },
    })

    const index = await fetchDocsSearchIndex('vi')

    expect(index.pages).toEqual([])
    expect(calls).toEqual([
      '/docs-content/vi/search-index.json',
      '/docs-content/en/search-index.json',
    ])
  })
})
