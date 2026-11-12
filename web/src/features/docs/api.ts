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
import type { DocsLocale } from './lib/locale'
import type { DocsSearchIndex } from './lib/search'

const DOCS_CONTENT_ROOT = '/docs-content'

async function fetchDocsFile(
  locale: DocsLocale,
  file: string
): Promise<string> {
  const response = await fetch(`${DOCS_CONTENT_ROOT}/${locale}/${file}`)
  if (!response.ok) {
    throw new Error(`Docs content request failed: ${response.status} ${file}`)
  }
  return response.text()
}

/** Fetch one page's markdown, falling back to English when the locale is missing. */
export async function fetchDocMarkdown(
  locale: DocsLocale,
  slug: string
): Promise<string> {
  try {
    return await fetchDocsFile(locale, `${slug}.md`)
  } catch (error) {
    if (locale === 'en') {
      throw error
    }
    return fetchDocsFile('en', `${slug}.md`)
  }
}

export async function fetchDocsSearchIndex(
  locale: DocsLocale
): Promise<DocsSearchIndex> {
  let text: string
  try {
    text = await fetchDocsFile(locale, 'search-index.json')
  } catch (error) {
    if (locale === 'en') {
      throw error
    }
    text = await fetchDocsFile('en', 'search-index.json')
  }
  return JSON.parse(text) as DocsSearchIndex
}

// Static authoring-time assets: cache for the whole session.
const DOCS_QUERY_CACHE = {
  gcTime: 30 * 60 * 1000,
  retry: 1,
  staleTime: Number.POSITIVE_INFINITY,
} as const

export function docContentQueryOptions(locale: DocsLocale, slug: string) {
  return {
    ...DOCS_QUERY_CACHE,
    queryKey: ['docs-content', locale, slug],
    queryFn: () => fetchDocMarkdown(locale, slug),
  }
}

export function docsSearchIndexQueryOptions(locale: DocsLocale) {
  return {
    ...DOCS_QUERY_CACHE,
    queryKey: ['docs-search-index', locale],
    queryFn: () => fetchDocsSearchIndex(locale),
  }
}
