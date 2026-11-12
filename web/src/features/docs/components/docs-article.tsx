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
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Markdown } from '@/components/ui/markdown'
import { useSystemConfig } from '@/hooks/use-system-config'
import { extractFrontmatter } from '@/lib/markdown-source'

import { useDocContent } from '../hooks/use-doc-content'
import { useDocsBaseUrl } from '../hooks/use-docs-base-url'
import {
  DOCS_GROUP_TITLE_KEYS,
  getAdjacentDocsPages,
  getDocsPage,
} from '../lib/registry'
import { applyDocsTokens } from '../lib/tokens'
import { DocsPager } from './docs-pager'
import { useDocsToc } from './docs-toc-context'

interface DocsArticleProps {
  slug: string
}

export function DocsArticle(props: DocsArticleProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { systemName } = useSystemConfig()
  const baseUrl = useDocsBaseUrl()
  const { setHeadings } = useDocsToc()
  const articleRef = useRef<HTMLDivElement>(null)
  const { data, isLoading, error, refetch } = useDocContent(props.slug)
  const page = getDocsPage(props.slug)

  const processed = useMemo(() => {
    if (!data) {
      return null
    }
    const frontmatter = extractFrontmatter(data)
    const tokens = { baseUrl, systemName }
    return {
      content: applyDocsTokens(frontmatter.body, tokens),
      description: frontmatter.description
        ? applyDocsTokens(frontmatter.description, tokens)
        : undefined,
      title: frontmatter.title
        ? applyDocsTokens(frontmatter.title, tokens)
        : undefined,
    }
  }, [data, baseUrl, systemName])

  // Publish h2/h3 anchors to the shell TOC once the article DOM exists.
  useEffect(() => {
    const container = articleRef.current
    if (!processed || !container) {
      setHeadings([])
      return
    }
    const nodes = container.querySelectorAll('h2[id], h3[id]')
    const headings = [...nodes].map((element) => ({
      id: element.id,
      level: element.tagName === 'H2' ? 2 : 3,
      text: element.textContent ?? '',
    }))
    setHeadings(headings)
  }, [processed, setHeadings])

  // Deep links from search or cross-page anchors scroll after content lands.
  useEffect(() => {
    if (!processed || !location.hash) {
      return
    }
    const id = location.hash.replace(/^#/, '')
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [processed, location.hash])

  if (isLoading) {
    return <LoadingState className='min-h-[40vh]' />
  }

  if (error || !processed || !page) {
    return (
      <ErrorState
        description={t('Failed to load the documentation.')}
        onRetry={() => void refetch()}
      />
    )
  }

  const adjacent = getAdjacentDocsPages(props.slug)

  return (
    <article className='mx-auto max-w-3xl'>
      <header className='mb-6 border-b pb-5'>
        <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>
          {t(DOCS_GROUP_TITLE_KEYS[page.group])}
        </p>
        <h1 className='text-3xl font-bold tracking-tight'>
          {processed.title ?? t(page.titleKey)}
        </h1>
        {processed.description ? (
          <p className='text-muted-foreground mt-2 text-base'>
            {processed.description}
          </p>
        ) : null}
      </header>

      <div ref={articleRef}>
        <Markdown enhanced onInternalLink={(href) => void navigate({ href })}>
          {processed.content}
        </Markdown>
      </div>

      <DocsPager prev={adjacent.prev} next={adjacent.next} />
    </article>
  )
}
