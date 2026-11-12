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
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocsSearchDialog } from '../components/docs-search-dialog'
import { useDocsSearchIndex } from '../hooks/use-doc-content'
import type { DocsSearchIndex } from '../lib/search'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../hooks/use-doc-content', () => ({
  useDocsSearchIndex: vi.fn(),
}))
vi.mock('../hooks/use-docs-base-url', () => ({
  useDocsBaseUrl: () => 'https://api.example.com',
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: '测试站点' }),
}))

const useDocsSearchIndexMock = vi.mocked(useDocsSearchIndex)

const INDEX: DocsSearchIndex = {
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
      slug: 'clients/cherry-studio',
      title: 'Cherry Studio',
      description: 'Connect to {{SYSTEM_NAME}}.',
      headings: [],
    },
  ],
}

function renderDialog(onOpenChange: (open: boolean) => void) {
  useDocsSearchIndexMock.mockReturnValue({
    data: INDEX,
  } as unknown as ReturnType<typeof useDocsSearchIndex>)
  render(<DocsSearchDialog open onOpenChange={onOpenChange} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('DocsSearchDialog', () => {
  it('filters to matching headings and navigates to the page anchor on select', async () => {
    const onOpenChange = vi.fn()
    renderDialog(onOpenChange)

    fireEvent.change(screen.getByPlaceholderText('Search docs...'), {
      target: { value: '充值' },
    })

    const heading = await screen.findByText('第 2 步：充值')
    const unmatched = screen.queryByText('Chat completions and embeddings.')
    if (unmatched) {
      expect(unmatched).not.toBeVisible()
    }

    fireEvent.click(heading)

    expect(navigateMock).toHaveBeenCalledWith({
      href: '/docs/quick-start#第-2-步充值',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('navigates to the page itself when a page-level result is selected', async () => {
    const onOpenChange = vi.fn()
    renderDialog(onOpenChange)

    fireEvent.change(screen.getByPlaceholderText('Search docs...'), {
      target: { value: 'openai' },
    })

    const page = await screen.findByText('OpenAI API')
    fireEvent.click(page)

    expect(navigateMock).toHaveBeenCalledWith({ href: '/docs/api/openai' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows the empty state when nothing matches', async () => {
    renderDialog(vi.fn())

    fireEvent.change(screen.getByPlaceholderText('Search docs...'), {
      target: { value: 'zzz-no-match-zzz' },
    })

    expect(await screen.findByText('No results found.')).toBeVisible()
  })

  it('replaces dynamic tokens in search result text', async () => {
    renderDialog(vi.fn())

    fireEvent.change(screen.getByPlaceholderText('Search docs...'), {
      target: { value: 'Cherry Studio' },
    })

    expect(await screen.findByText('Connect to 测试站点.')).toBeVisible()
  })
})
