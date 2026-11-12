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
/**
 * Single source of truth for the docs center: slug → content path, group,
 * i18n title key, and prev/next order. The authoring scripts import this module
 * directly, so keep it free of React and browser-only imports.
 */

export const DOCS_GROUPS = ['quick-start', 'api', 'clients', 'faq'] as const
export type DocsGroup = (typeof DOCS_GROUPS)[number]

export interface DocsPage {
  group: DocsGroup
  slug: string
  titleKey: string
}

export const DOCS_PAGES: readonly DocsPage[] = [
  { slug: 'quick-start', group: 'quick-start', titleKey: 'Quick Start' },
  { slug: 'api/overview', group: 'api', titleKey: 'API Overview' },
  { slug: 'api/openai', group: 'api', titleKey: 'OpenAI API' },
  { slug: 'api/claude', group: 'api', titleKey: 'Claude API' },
  { slug: 'api/gemini', group: 'api', titleKey: 'Gemini API' },
  { slug: 'api/images', group: 'api', titleKey: 'Image Generation' },
  {
    slug: 'api/models-and-pricing',
    group: 'api',
    titleKey: 'Models and Pricing',
  },
  { slug: 'api/usage-and-limits', group: 'api', titleKey: 'Usage and Limits' },
  {
    slug: 'clients/cherry-studio',
    group: 'clients',
    titleKey: 'Cherry Studio',
  },
  { slug: 'clients/chatbox', group: 'clients', titleKey: 'Chatbox' },
  { slug: 'clients/cursor', group: 'clients', titleKey: 'Cursor' },
  { slug: 'clients/codex', group: 'clients', titleKey: 'Codex' },
  { slug: 'clients/claude-code', group: 'clients', titleKey: 'Claude Code' },
  { slug: 'faq/errors', group: 'faq', titleKey: 'Common Errors' },
  { slug: 'faq/general', group: 'faq', titleKey: 'General FAQ' },
]

export const DOCS_GROUP_TITLE_KEYS: Record<DocsGroup, string> = {
  'quick-start': 'Quick Start',
  api: 'API Reference',
  clients: 'Client Integrations',
  faq: 'FAQ',
}

export const DOCS_GROUP_DESCRIPTION_KEYS: Record<DocsGroup, string> = {
  'quick-start': 'Register, top up, and make your first call in five steps.',
  api: 'Endpoints, parameters, and examples for every supported protocol.',
  clients: 'Step-by-step setup guides for popular AI clients.',
  faq: 'Troubleshooting errors and answers about accounts, keys, and billing.',
}

const pageBySlug = new Map(DOCS_PAGES.map((page) => [page.slug, page]))

export function getDocsPage(slug: string): DocsPage | undefined {
  return pageBySlug.get(slug)
}

export function isDocsSlug(slug: string): boolean {
  return pageBySlug.has(slug)
}

export function getDocsGroupPages(group: DocsGroup): DocsPage[] {
  return DOCS_PAGES.filter((page) => page.group === group)
}

export function getAdjacentDocsPages(slug: string): {
  next?: DocsPage
  prev?: DocsPage
} {
  const index = DOCS_PAGES.findIndex((page) => page.slug === slug)
  if (index === -1) {
    return {}
  }
  return {
    prev: index > 0 ? DOCS_PAGES[index - 1] : undefined,
    next: index < DOCS_PAGES.length - 1 ? DOCS_PAGES[index + 1] : undefined,
  }
}
