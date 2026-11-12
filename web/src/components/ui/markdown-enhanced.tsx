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
 * Opt-in documentation rendering for the shared Markdown component:
 * frontmatter stripping, `:::info/tip/warning/danger` callouts, heading
 * anchors, SPA-friendly internal links, and code blocks with a copy button
 * plus lazy shiki highlighting. The default Markdown path is untouched.
 */
import DOMPurify from 'dompurify'
import { Marked, Renderer, type MarkedExtension, type Tokens } from 'marked'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { HighlighterCore } from 'shiki/core'

import { CopyButton } from '@/components/copy-button'
import {
  CALLOUT_BLOCK_PATTERN,
  createHeadingIdAllocator,
  extractFrontmatter,
} from '@/lib/markdown-source'
import { cn } from '@/lib/utils'

import { markdownProseClassName } from './markdown-styles'

export interface EnhancedMarkdownProps {
  /** Resolve relative document links against their source, never the dashboard URL. */
  baseUrl?: string
  breaks?: boolean
  children: string
  className?: string
  /** Handle root-relative and anchor links with SPA navigation instead of a full page load. */
  onInternalLink?: (href: string) => void
}

const markdownOptions = {
  async: false,
  breaks: false,
  gfm: true,
} as const

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// Lucide icon paths (info, lightbulb, triangle-alert, octagon-alert), inlined
// because callouts are produced inside the HTML-string rendering pipeline.
const CALLOUT_ICONS: Record<string, string> = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  danger:
    '<path d="M7.86 2h8.44L22 7.86v8.44L16.14 22H7.86L2 16.14V7.86L7.86 2"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
}

function renderCalloutIcon(variant: string): string {
  const paths = CALLOUT_ICONS[variant] ?? CALLOUT_ICONS.info
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="markdown-callout-icon" aria-hidden="true">${paths}</svg>`
}

// Reset before every synchronous parse so heading ids are per-document.
let allocateHeadingId = createHeadingIdAllocator()

const enhancedRenderer = new Renderer()
enhancedRenderer.heading = function heading(token: Tokens.Heading): string {
  const id = allocateHeadingId(token.text)
  const inner = this.parser.parseInline(token.tokens)
  return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`
}

const enhancedParser = new Marked({
  ...markdownOptions,
  renderer: enhancedRenderer,
})

const calloutExtension: MarkedExtension = {
  extensions: [
    {
      level: 'block',
      name: 'callout',
      start(source: string) {
        return source.match(/^:::(?:info|tip|warning|danger)/m)?.index
      },
      tokenizer(source: string) {
        const match = CALLOUT_BLOCK_PATTERN.exec(source)
        if (!match) {
          return undefined
        }
        return {
          raw: match[0],
          text: match[3],
          title: match[2].trim(),
          type: 'callout',
          variant: match[1],
        }
      },
      renderer(token) {
        const variant = String(token.variant)
        const title = String(token.title ?? '')
        const body = enhancedParser.parse(String(token.text), {
          async: false,
        }) as string
        const headingText = title ? `<span>${escapeHtml(title)}</span>` : ''
        return `<div class="markdown-callout markdown-callout-${variant}" data-callout="${variant}"><p class="markdown-callout-heading">${renderCalloutIcon(variant)}${headingText}</p><div class="markdown-callout-body">${body}</div></div>\n`
      },
    },
  ],
}

enhancedParser.use(calloutExtension)

const sanitizeOptions = {
  ADD_ATTR: ['data-callout'],
}

function isInternalHref(href: string): boolean {
  return (
    href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))
  )
}

function processLinks(html: string, baseUrl?: string): string {
  if (typeof window === 'undefined') {
    return html
  }

  const template = document.createElement('template')
  template.innerHTML = html

  template.content.querySelectorAll('a[href]').forEach((link) => {
    let href = link.getAttribute('href') ?? ''
    if (baseUrl) {
      try {
        const url = new URL(href, baseUrl)
        if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
          href = url.href
          link.setAttribute('href', href)
        } else {
          link.removeAttribute('href')
          return
        }
      } catch {
        link.removeAttribute('href')
        return
      }
    }

    if (isInternalHref(href)) {
      link.removeAttribute('target')
      link.removeAttribute('rel')
    } else {
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener noreferrer')
    }
  })

  return template.innerHTML
}

function renderEnhancedMarkdown(
  markdown: string,
  breaks = false,
  baseUrl?: string
): string {
  const { body } = extractFrontmatter(markdown)
  allocateHeadingId = createHeadingIdAllocator()
  const parsedHtml = enhancedParser.parse(body, {
    ...markdownOptions,
    breaks,
  }) as string
  const html = DOMPurify.sanitize(parsedHtml, sanitizeOptions)
  return processLinks(html, baseUrl)
}

// ---------------------------------------------------------------------------
// Lazy shiki highlighting (kept in its own chunk; failures fall back to plain
// pre/code, so highlighting never blocks reading the docs).
// ---------------------------------------------------------------------------

const CODE_LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  python: 'python',
  py: 'python',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  http: 'http',
  powershell: 'powershell',
  ps1: 'powershell',
}

let highlighterPromise: Promise<HighlighterCore | null> | null = null

function loadDocsHighlighter(): Promise<HighlighterCore | null> {
  highlighterPromise ??= (async () => {
    try {
      const [{ createHighlighterCore }, { createOnigurumaEngine }] =
        await Promise.all([
          import('shiki/core'),
          import('shiki/engine/oniguruma'),
        ])
      return await createHighlighterCore({
        langs: [
          import('shiki/langs/bash.mjs'),
          import('shiki/langs/python.mjs'),
          import('shiki/langs/javascript.mjs'),
          import('shiki/langs/json.mjs'),
          import('shiki/langs/http.mjs'),
          import('shiki/langs/powershell.mjs'),
        ],
        themes: [
          import('shiki/themes/github-light.mjs'),
          import('shiki/themes/github-dark.mjs'),
        ],
        engine: createOnigurumaEngine(import('shiki/wasm')),
      })
    } catch {
      return null
    }
  })()
  return highlighterPromise
}

interface CodeCopyMount {
  id: string
  node: HTMLElement
  text: string
}

const enhancedClassName = [
  '[&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24',
  '[&_pre]:relative [&_pre]:pr-10',
  '[&_.md-code-copy]:absolute [&_.md-code-copy]:top-1.5 [&_.md-code-copy]:right-1.5',
  '[&_.markdown-callout]:my-4 [&_.markdown-callout]:rounded-lg [&_.markdown-callout]:border [&_.markdown-callout]:border-l-4 [&_.markdown-callout]:px-4 [&_.markdown-callout]:py-3',
  '[&_.markdown-callout-heading]:mb-1 [&_.markdown-callout-heading]:flex [&_.markdown-callout-heading]:items-center [&_.markdown-callout-heading]:gap-2 [&_.markdown-callout-heading]:font-semibold',
  '[&_.markdown-callout-icon]:size-4 [&_.markdown-callout-icon]:shrink-0',
  '[&_.markdown-callout-body>*:first-child]:mt-0 [&_.markdown-callout-body>*:last-child]:mb-0',
  '[&_.markdown-callout-info]:border-info/50 [&_.markdown-callout-info]:bg-info/10 [&_.markdown-callout-info_.markdown-callout-heading]:text-info',
  '[&_.markdown-callout-tip]:border-success/50 [&_.markdown-callout-tip]:bg-success/10 [&_.markdown-callout-tip_.markdown-callout-heading]:text-success',
  '[&_.markdown-callout-warning]:border-warning/60 [&_.markdown-callout-warning]:bg-warning/10 [&_.markdown-callout-warning_.markdown-callout-heading]:text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]',
  '[&_.markdown-callout-danger]:border-destructive/50 [&_.markdown-callout-danger]:bg-destructive/10 [&_.markdown-callout-danger_.markdown-callout-heading]:text-destructive',
  '[&_img]:border',
].join(' ')

export function EnhancedMarkdown(props: EnhancedMarkdownProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const onInternalLinkRef = useRef(props.onInternalLink)
  const [copyMounts, setCopyMounts] = useState<CodeCopyMount[]>([])

  useEffect(() => {
    onInternalLinkRef.current = props.onInternalLink
  }, [props.onInternalLink])

  const html = useMemo(
    () => renderEnhancedMarkdown(props.children, props.breaks, props.baseUrl),
    [props.children, props.breaks, props.baseUrl]
  )

  // Keep the prop object referentially stable: React re-applies innerHTML
  // when its identity changes, which would wipe the copy-button mounts and
  // highlighting that the effect below writes into the same DOM.
  const innerHtml = useMemo(() => ({ __html: html }), [html])

  // Delegate internal link clicks so markdown content navigates through the
  // router. Modifier clicks keep the browser's open-in-new-tab behavior.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    function onClick(event: MouseEvent): void {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const anchor = target.closest('a[href]')
      if (!anchor || !container?.contains(anchor)) {
        return
      }
      const href = anchor.getAttribute('href') ?? ''
      if (!isInternalHref(href) || !onInternalLinkRef.current) {
        return
      }
      event.preventDefault()
      onInternalLinkRef.current(href)
    }

    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  }, [])

  // Attach copy buttons and progressively highlight code blocks. The mount
  // nodes live inside `pre`, so replacing the `code` element for highlighting
  // keeps the copy portal intact.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    let cancelled = false
    const mounts: CodeCopyMount[] = []

    container.querySelectorAll('pre').forEach((pre, index) => {
      const code = pre.querySelector('code')
      if (!code) {
        return
      }
      const text = code.textContent ?? ''
      pre.classList.add('md-code-block', 'shiki')
      const node = document.createElement('span')
      node.className = 'md-code-copy'
      pre.appendChild(node)
      mounts.push({ id: `code-${index}`, node, text })

      const language = /language-([\w-]+)/
        .exec(code.className)?.[1]
        ?.toLowerCase()
      const resolved = language ? CODE_LANGUAGE_ALIASES[language] : undefined
      if (!resolved) {
        return
      }

      void loadDocsHighlighter().then((highlighter) => {
        if (cancelled || !highlighter || !code.isConnected) {
          return
        }
        try {
          const highlighted = highlighter.codeToHtml(text, {
            lang: resolved,
            themes: { light: 'github-light', dark: 'github-dark' },
            defaultColor: false,
          })
          const template = document.createElement('template')
          template.innerHTML = DOMPurify.sanitize(highlighted)
          const nextCode = template.content.querySelector('code')
          if (nextCode && code.isConnected) {
            pre.replaceChild(nextCode, code)
          }
        } catch {
          // Keep the plain code block when highlighting fails.
        }
      })
    })

    setCopyMounts(mounts)
    return () => {
      cancelled = true
      for (const mount of mounts) {
        mount.node.remove()
      }
    }
  }, [html])

  return (
    <div
      className={cn(markdownProseClassName, enhancedClassName, props.className)}
    >
      <div ref={containerRef} dangerouslySetInnerHTML={innerHtml} />
      {copyMounts.map((mount) =>
        createPortal(
          <CopyButton
            value={mount.text}
            size='icon'
            variant='ghost'
            className='size-7'
            tooltip={t('Copy code')}
            aria-label={t('Copy code')}
          />,
          mount.node,
          mount.id
        )
      )}
    </div>
  )
}
