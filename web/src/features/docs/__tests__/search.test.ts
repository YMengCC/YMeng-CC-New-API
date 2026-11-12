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

import { getDocsPage } from '../lib/registry'
import {
  applyDocsSearchTokens,
  buildDocsSearchResults,
  docsSearchResultValue,
  matchesDocsSearch,
  type DocsSearchIndex,
} from '../lib/search'

const index: DocsSearchIndex = {
  pages: [
    {
      slug: 'quick-start',
      title: '快速开始',
      description: '五步完成接入。',
      headings: [{ id: '第-2-步充值', level: 2, text: '第 2 步：充值' }],
    },
    {
      slug: 'api/openai',
      title: 'OpenAI API',
      description: 'Chat completions and embeddings.',
      headings: [],
    },
    {
      slug: 'not/in-registry',
      title: 'Ghost page',
      description: 'Should be skipped.',
      headings: [],
    },
  ],
}

describe('matchesDocsSearch', () => {
  it('matches case-insensitive substrings', () => {
    expect(matchesDocsSearch('openai', 'OpenAI API')).toBe(true)
    expect(matchesDocsSearch('OPENAI', 'openai api')).toBe(true)
  })

  it('matches CJK substrings', () => {
    expect(matchesDocsSearch('充值', '第 2 步：充值')).toBe(true)
    expect(matchesDocsSearch('充值', '第 1 步：注册账号')).toBe(false)
  })

  it('requires every whitespace-separated term to match', () => {
    expect(
      matchesDocsSearch('chat completions', 'Chat completions and embeddings.')
    ).toBe(true)
    expect(
      matchesDocsSearch('chat images', 'Chat completions and embeddings.')
    ).toBe(false)
  })

  it('treats an empty query as a match and ignores surrounding whitespace', () => {
    expect(matchesDocsSearch('', 'anything')).toBe(true)
    expect(matchesDocsSearch('  充值  ', '第 2 步：充值')).toBe(true)
  })
})

describe('applyDocsSearchTokens', () => {
  const tokens = {
    baseUrl: 'https://api.example.com',
    systemName: '示例站点',
  }

  it('replaces tokens in titles, descriptions, and heading text', () => {
    const raw: DocsSearchIndex = {
      pages: [
        {
          slug: 'quick-start',
          title: '{{SYSTEM_NAME}} 快速开始',
          description: '使用 {{BASE_URL}}/v1',
          headings: [{ id: 'connect', level: 2, text: '连接 {{SYSTEM_NAME}}' }],
        },
      ],
    }

    expect(applyDocsSearchTokens(raw, tokens)).toEqual({
      pages: [
        {
          slug: 'quick-start',
          title: '示例站点 快速开始',
          description: '使用 https://api.example.com/v1',
          headings: [{ id: 'connect', level: 2, text: '连接 示例站点' }],
        },
      ],
    })
  })

  it('returns undefined when the index has not loaded', () => {
    expect(applyDocsSearchTokens(undefined, tokens)).toBeUndefined()
  })
})

describe('buildDocsSearchResults', () => {
  it('flattens pages and headings in order and skips unknown slugs', () => {
    const results = buildDocsSearchResults(
      index,
      (slug) => getDocsPage(slug)?.group
    )

    expect(
      results.map((result) => [result.slug, result.heading?.id ?? null])
    ).toEqual([
      ['quick-start', null],
      ['quick-start', '第-2-步充值'],
      ['api/openai', null],
    ])
    expect(results[0]?.group).toBe('quick-start')
    expect(results[1]?.group).toBe('quick-start')
    expect(results[2]?.group).toBe('api')
  })

  it('returns an empty list when the index has not loaded', () => {
    expect(buildDocsSearchResults(undefined, () => 'api')).toEqual([])
  })
})

describe('docsSearchResultValue', () => {
  it('searches page title, description, and slug for page results', () => {
    const results = buildDocsSearchResults(
      index,
      (slug) => getDocsPage(slug)?.group
    )
    const page = results.find(
      (result) => result.slug === 'api/openai' && !result.heading
    )

    expect(page).toBeDefined()
    expect(page && docsSearchResultValue(page)).toBe(
      'OpenAI API Chat completions and embeddings. api/openai'
    )
  })

  it('searches heading text plus the owning page title for heading results', () => {
    const results = buildDocsSearchResults(
      index,
      (slug) => getDocsPage(slug)?.group
    )
    const heading = results.find((result) => result.heading)

    expect(heading).toBeDefined()
    expect(heading && docsSearchResultValue(heading)).toBe(
      '第 2 步：充值 快速开始'
    )
  })
})
