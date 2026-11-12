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
 * Pure markdown-source helpers shared by the enhanced Markdown renderer, the
 * docs feature, and the authoring scripts. Keep this module free of React,
 * DOM, and CSS imports so Node can load it directly (type stripping) when
 * generating the docs search index.
 */
import { lexer, type Token, type Tokens } from 'marked'
import { parse as parseYaml } from 'yaml'

export interface MarkdownFrontmatter {
  body: string
  description?: string
  title?: string
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Split a leading YAML frontmatter block from the markdown body. */
export function extractFrontmatter(source: string): MarkdownFrontmatter {
  const match = FRONTMATTER_PATTERN.exec(source)
  if (!match) {
    return { body: source }
  }

  const body = source.slice(match[0].length)
  let data: unknown
  try {
    data = parseYaml(match[1])
  } catch {
    return { body }
  }
  if (!data || typeof data !== 'object') {
    return { body }
  }

  const record = data as Record<string, unknown>
  return {
    body,
    description:
      typeof record.description === 'string' ? record.description : undefined,
    title: typeof record.title === 'string' ? record.title : undefined,
  }
}

export const CALLOUT_VARIANTS = ['info', 'tip', 'warning', 'danger'] as const
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]

/**
 * Matches one `:::variant [title] … :::` container. The body is non-greedy,
 * so nested callouts are intentionally unsupported (the docs corpus never
 * nests them).
 */
export const CALLOUT_BLOCK_PATTERN =
  /^:::(info|tip|warning|danger)([^\n]*)\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/

/** GitHub-style heading slug: lowercase, strip punctuation, spaces become hyphens. */
export function slugifyHeading(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replaceAll(/[`*_~[\]()#>!]/g, '')
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replaceAll(/\s+/g, '-')
  return slug || 'section'
}

/** Allocate unique heading ids in document order, suffixing repeats with -1, -2, … */
export function createHeadingIdAllocator(): (text: string) => string {
  const used = new Map<string, number>()
  return (text: string): string => {
    const base = slugifyHeading(text)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

/** Reduce inline markdown (emphasis, code, links) to display text. */
export function inlineMarkdownToText(text: string): string {
  return text
    .replaceAll(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replaceAll(/[`*_~]/g, '')
    .trim()
}

export interface DocHeading {
  id: string
  level: number
  text: string
}

/**
 * Collect h2/h3 headings with the same ids the enhanced renderer assigns.
 * Callout fences are stripped before lexing so headings inside callouts keep
 * their document order, and every heading depth consumes an id allocation so
 * duplicate suffixes stay identical to the runtime renderer.
 */
export function collectDocHeadings(markdown: string): DocHeading[] {
  const allocate = createHeadingIdAllocator()
  const headings: DocHeading[] = []
  const withoutFences = markdown
    .replaceAll(/^:::(?:info|tip|warning|danger)[^\n]*\n/gm, '')
    .replaceAll(/^:::[ \t]*$/gm, '')

  function walk(tokens: Token[]): void {
    for (const token of tokens) {
      if (token.type === 'heading') {
        const heading = token as Tokens.Heading
        const id = allocate(heading.text)
        if (heading.depth === 2 || heading.depth === 3) {
          headings.push({
            id,
            level: heading.depth,
            text: inlineMarkdownToText(heading.text),
          })
        }
        continue
      }
      if (token.type === 'list') {
        for (const item of (token as Tokens.List).items) {
          walk(item.tokens)
        }
        continue
      }
      if ('tokens' in token && token.tokens) {
        walk(token.tokens)
      }
    }
  }

  walk(lexer(withoutFences))
  return headings
}
