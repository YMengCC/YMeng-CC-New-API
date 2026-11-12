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
  DOCS_GROUPS,
  DOCS_PAGES,
  getAdjacentDocsPages,
  getDocsGroupPages,
  isDocsSlug,
} from '../lib/registry'

describe('docs registry', () => {
  it('registers exactly the 15 shipped pages', () => {
    expect(DOCS_PAGES).toHaveLength(15)
    expect(isDocsSlug('quick-start')).toBe(true)
    expect(isDocsSlug('clients/claude-code')).toBe(true)
    expect(isDocsSlug('faq/general')).toBe(true)
  })

  it('rejects slugs outside the shipped set', () => {
    expect(isDocsSlug('billing/overview')).toBe(false)
    expect(isDocsSlug('image-studio/guide')).toBe(false)
    expect(isDocsSlug('')).toBe(false)
    expect(isDocsSlug('../quick-start')).toBe(false)
  })

  it('gives every group at least one page in registry order', () => {
    for (const group of DOCS_GROUPS) {
      const pages = getDocsGroupPages(group)
      expect(pages.length).toBeGreaterThan(0)
      expect(pages.every((page) => page.group === group)).toBe(true)
    }
  })
})

describe('getAdjacentDocsPages', () => {
  it('has no previous page at the start and no next page at the end', () => {
    expect(getAdjacentDocsPages('quick-start').prev).toBeUndefined()
    expect(getAdjacentDocsPages('quick-start').next?.slug).toBe('api/overview')
    expect(getAdjacentDocsPages('faq/general').next).toBeUndefined()
    expect(getAdjacentDocsPages('faq/general').prev?.slug).toBe('faq/errors')
  })

  it('links middle pages to their registry neighbors', () => {
    const adjacent = getAdjacentDocsPages('api/claude')

    expect(adjacent.prev?.slug).toBe('api/openai')
    expect(adjacent.next?.slug).toBe('api/gemini')
  })

  it('returns nothing for an unknown slug', () => {
    expect(getAdjacentDocsPages('nope')).toEqual({})
  })
})
