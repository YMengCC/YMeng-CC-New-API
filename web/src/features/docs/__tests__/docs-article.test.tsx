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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocsArticle } from '../components/docs-article'
import { useDocContent } from '../hooks/use-doc-content'

vi.mock('../hooks/use-doc-content', () => ({
  useDocContent: vi.fn(),
}))
vi.mock('../hooks/use-docs-base-url', () => ({
  useDocsBaseUrl: () => 'https://api.example.com',
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: '测试站点' }),
}))

const useDocContentMock = vi.mocked(useDocContent)

const ARTICLE_SOURCE = [
  '---',
  'title: 快速开始',
  'description: 五步完成接入。',
  '---',
  '',
  'OpenAI 地址：`{{BASE_URL}}/v1`，Gemini 地址：`{{BASE_URL}}/v1beta`。',
  '',
  '```bash',
  'curl {{BASE_URL}}/v1/chat/completions',
  '```',
  '',
  '欢迎来到 {{SYSTEM_NAME}}。',
  '',
  '## 第一步',
  '',
  '内容。',
].join('\n')

const TOKEN_HEADER_SOURCE = [
  '---',
  'title: "{{SYSTEM_NAME}} API 参考"',
  'description: 使用 {{BASE_URL}}/v1 接入 {{SYSTEM_NAME}}。',
  '---',
  '',
  '正文。',
].join('\n')

const clients: QueryClient[] = []

async function renderArticle(slug: string) {
  const root = createRootRoute()
  const docsRoute = createRoute({
    getParentRoute: () => root,
    path: '/docs/$',
    component: () => <DocsArticle slug={slug} />,
  })
  const router = createRouter({
    routeTree: root.addChildren([docsRoute]),
    history: createMemoryHistory({ initialEntries: [`/docs/${slug}`] }),
  })
  await router.load()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function mockContent(overrides: Partial<ReturnType<typeof useDocContent>>) {
  useDocContentMock.mockReturnValue({
    data: ARTICLE_SOURCE,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useDocContent>)
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.clearAllMocks()
})

describe('DocsArticle', () => {
  it('renders the frontmatter header and substitutes tokens in prose and code', async () => {
    mockContent({})

    await renderArticle('quick-start')

    expect(
      screen.getByRole('heading', { level: 1, name: '快速开始' })
    ).toBeInTheDocument()
    expect(screen.getByText('五步完成接入。')).toBeInTheDocument()
    const article = document.querySelector('article')
    expect(article?.textContent).toContain('https://api.example.com/v1')
    expect(article?.textContent).toContain('https://api.example.com/v1beta')
    expect(article?.textContent).toContain(
      'curl https://api.example.com/v1/chat/completions'
    )
    expect(article?.textContent).toContain('欢迎来到 测试站点。')
    expect(article?.textContent).not.toContain('{{BASE_URL}}')
    expect(article?.textContent).not.toContain('{{SYSTEM_NAME}}')
  })

  it('links to the next registry page through the pager', async () => {
    mockContent({})

    await renderArticle('quick-start')

    expect(screen.getByText('API Overview')).toBeInTheDocument()
    expect(screen.queryByText('Previous')).not.toBeInTheDocument()
  })

  it('substitutes tokens in the frontmatter title and description', async () => {
    mockContent({ data: TOKEN_HEADER_SOURCE })

    await renderArticle('quick-start')

    expect(
      screen.getByRole('heading', { level: 1, name: '测试站点 API 参考' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('使用 https://api.example.com/v1 接入 测试站点。')
    ).toBeInTheDocument()
    expect(document.querySelector('article')?.textContent).not.toContain(
      '{{SYSTEM_NAME}}'
    )
  })

  it('shows a retryable error state when content fails to load', async () => {
    mockContent({
      data: undefined,
      error: new Error('network down'),
    })

    await renderArticle('quick-start')

    expect(
      screen.getByText('Failed to load the documentation.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows a loading state while content is in flight', async () => {
    mockContent({ data: undefined, isLoading: true })

    await renderArticle('quick-start')

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
