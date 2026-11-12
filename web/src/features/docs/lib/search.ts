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
import type { DocsGroup } from './registry'
import { applyDocsTokens, type DocsTokens } from './tokens'

export interface DocsSearchHeading {
  id: string
  level: number
  text: string
}

export interface DocsSearchPage {
  description: string
  headings: DocsSearchHeading[]
  slug: string
  title: string
}

export interface DocsSearchIndex {
  pages: DocsSearchPage[]
}

export interface DocsSearchResult {
  description: string
  group: DocsGroup
  heading?: DocsSearchHeading
  slug: string
  title: string
}

/** Resolve authoring tokens in index text before it is displayed or searched. */
export function applyDocsSearchTokens(
  index: DocsSearchIndex | undefined,
  tokens: DocsTokens
): DocsSearchIndex | undefined {
  if (!index) {
    return undefined
  }
  return {
    pages: index.pages.map((page) => ({
      ...page,
      title: applyDocsTokens(page.title, tokens),
      description: applyDocsTokens(page.description, tokens),
      headings: page.headings.map((heading) => ({
        ...heading,
        text: applyDocsTokens(heading.text, tokens),
      })),
    })),
  }
}

/**
 * Case-insensitive substring match; every whitespace-separated term must hit.
 * Substring (not fuzzy subsequence) matching keeps CJK queries predictable.
 */
export function matchesDocsSearch(search: string, value: string): boolean {
  const query = search.trim().toLowerCase()
  if (!query) {
    return true
  }
  const haystack = value.toLowerCase()
  return query.split(/\s+/).every((term) => haystack.includes(term))
}

/** Flatten the index into page-level and heading-level results in page order. */
export function buildDocsSearchResults(
  index: DocsSearchIndex | undefined,
  groupForSlug: (slug: string) => DocsGroup | undefined
): DocsSearchResult[] {
  if (!index) {
    return []
  }
  const results: DocsSearchResult[] = []
  for (const page of index.pages) {
    const group = groupForSlug(page.slug)
    if (!group) {
      continue
    }
    results.push({
      description: page.description,
      group,
      slug: page.slug,
      title: page.title,
    })
    for (const heading of page.headings) {
      results.push({
        description: page.description,
        group,
        heading,
        slug: page.slug,
        title: page.title,
      })
    }
  }
  return results
}

/** Text cmdk filters against for one result. */
export function docsSearchResultValue(result: DocsSearchResult): string {
  if (result.heading) {
    return `${result.heading.text} ${result.title}`
  }
  return `${result.title} ${result.description} ${result.slug}`
}
