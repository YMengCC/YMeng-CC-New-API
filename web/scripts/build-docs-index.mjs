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
// Authoring tool: generate the per-locale docs search index from the
// localized markdown in public/docs-content. Heading ids come from the same
// allocator the enhanced Markdown renderer uses, so anchors always match.
// Run from web/ (Node >= 23.6 strips the shared TS modules' types natively):
//   node scripts/build-docs-index.mjs
import fs from 'node:fs/promises'
import path from 'node:path'

import { DOCS_PAGES } from '../src/features/docs/lib/registry.ts'
import {
  collectDocHeadings,
  extractFrontmatter,
} from '../src/lib/markdown-source.ts'

const CONTENT_DIR = path.resolve('public/docs-content')
const LOCALES = ['en', 'zhCN', 'zhTW', 'fr', 'ja', 'ru', 'vi']

for (const locale of LOCALES) {
  const pages = []
  for (const page of DOCS_PAGES) {
    const source = await fs.readFile(
      path.join(CONTENT_DIR, locale, `${page.slug}.md`),
      'utf8'
    )
    const { body, description, title } = extractFrontmatter(source)
    pages.push({
      slug: page.slug,
      title: title ?? page.titleKey,
      description: description ?? '',
      headings: collectDocHeadings(body),
    })
  }

  const target = path.join(CONTENT_DIR, locale, 'search-index.json')
  await fs.writeFile(target, `${JSON.stringify({ pages }, null, 2)}\n`, 'utf8')
  const headingCount = pages.reduce(
    (total, page) => total + page.headings.length,
    0
  )
  console.log(`${locale}: ${pages.length} pages, ${headingCount} headings`)
}
