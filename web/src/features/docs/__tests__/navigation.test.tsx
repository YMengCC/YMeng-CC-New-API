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
import { act, renderHook } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { useTopNavLinks } from '@/hooks/use-top-nav-links'

function renderNavLinks(status: Record<string, unknown>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(['status'], status)
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  const result = renderHook(() => useTopNavLinks(), { wrapper })
  return { result, client }
}

afterEach(async () => {
  await act(async () => {
    await i18next.changeLanguage('en')
  })
})

describe('top navigation docs module', () => {
  it('shows the built-in docs module as API Guide pointing at /docs', () => {
    const { result, client } = renderNavLinks({})

    const docs = result.result.current.find((link) => link.href === '/docs')
    expect(docs).toBeDefined()
    expect(docs?.title).toBe('API Guide')
    expect(docs?.external).toBeFalsy()
    client.clear()
  })

  it('keeps the docs_link external override while renaming the label', () => {
    const { result, client } = renderNavLinks({
      docs_link: 'https://docs.example.com/guide',
    })

    const docs = result.result.current.find(
      (link) => link.href === 'https://docs.example.com/guide'
    )
    expect(docs).toBeDefined()
    expect(docs?.title).toBe('API Guide')
    expect(docs?.external).toBe(true)
    expect(result.result.current.some((link) => link.href === '/docs')).toBe(
      false
    )
    client.clear()
  })

  it('hides the docs module when the admin disables it', () => {
    const { result, client } = renderNavLinks({
      HeaderNavModules: { docs: false },
    })

    expect(result.result.current.some((link) => link.href === '/docs')).toBe(
      false
    )
    client.clear()
  })

  it('renders the Chinese label 「API指南」 when the interface is zhCN', async () => {
    i18next.addResourceBundle('zhCN', 'translation', {
      'API Guide': 'API指南',
    })
    await act(async () => {
      await i18next.changeLanguage('zhCN')
    })

    const { result, client } = renderNavLinks({})

    const docs = result.result.current.find((link) => link.href === '/docs')
    expect(docs?.title).toBe('API指南')
    client.clear()
  })
})
