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

describe('top navigation docs modules', () => {
  it('shows both Docs and API Guide entries by default', () => {
    const { result, client } = renderNavLinks({})

    const docs = result.result.current.find((link) => link.title === 'Docs')
    const guide = result.result.current.find(
      (link) => link.title === 'API Guide'
    )

    expect(docs?.href).toBe('/docs')
    expect(docs?.external).toBeFalsy()
    expect(guide?.href).toBe('/docs')
    expect(guide?.external).toBeFalsy()
    client.clear()
  })

  it('orders Docs before API Guide in the default navigation order', () => {
    const { result, client } = renderNavLinks({})
    const titles = result.result.current.map((link) => link.title)

    expect(titles.indexOf('Docs')).toBeGreaterThanOrEqual(0)
    expect(titles.indexOf('Docs')).toBeLessThan(titles.indexOf('API Guide'))
    client.clear()
  })

  it('keeps the external docs_link override only on the Docs entry', () => {
    const { result, client } = renderNavLinks({
      docs_link: 'https://docs.example.com/guide',
    })

    const docs = result.result.current.find((link) => link.title === 'Docs')
    const guide = result.result.current.find(
      (link) => link.title === 'API Guide'
    )

    expect(docs?.href).toBe('https://docs.example.com/guide')
    expect(docs?.external).toBe(true)
    expect(guide?.href).toBe('/docs')
    expect(guide?.external).toBeFalsy()
    client.clear()
  })

  it('keeps API Guide when only the docs module is disabled', () => {
    const { result, client } = renderNavLinks({
      HeaderNavModules: { docs: false },
    })

    expect(result.result.current.some((link) => link.title === 'Docs')).toBe(
      false
    )
    expect(
      result.result.current.find((link) => link.title === 'API Guide')?.href
    ).toBe('/docs')
    client.clear()
  })

  it('keeps Docs when only the apiGuide module is disabled', () => {
    const { result, client } = renderNavLinks({
      HeaderNavModules: { apiGuide: false },
    })

    expect(
      result.result.current.some((link) => link.title === 'API Guide')
    ).toBe(false)
    expect(
      result.result.current.find((link) => link.title === 'Docs')?.href
    ).toBe('/docs')
    client.clear()
  })

  it('renders the zhCN labels for both entries', async () => {
    i18next.addResourceBundle('zhCN', 'translation', {
      Docs: '文档',
      'API Guide': 'API指南',
    })
    await act(async () => {
      await i18next.changeLanguage('zhCN')
    })

    const { result, client } = renderNavLinks({})

    const docs = result.result.current.find((link) => link.title === '文档')
    const guide = result.result.current.find((link) => link.title === 'API指南')

    expect(docs?.href).toBe('/docs')
    expect(guide?.href).toBe('/docs')
    client.clear()
  })

  it('honours a custom order that places API Guide before Docs', () => {
    const { result, client } = renderNavLinks({
      HeaderNavModules: { order: ['apiGuide', 'docs'] },
    })
    const titles = result.result.current.map((link) => link.title)

    expect(titles.indexOf('API Guide')).toBeLessThan(titles.indexOf('Docs'))
    client.clear()
  })
})
