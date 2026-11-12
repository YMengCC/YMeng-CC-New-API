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
import { Link } from '@tanstack/react-router'
import {
  Braces,
  ChevronRight,
  CircleHelp,
  Plug,
  Rocket,
  type LucideIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'

import { useDocsToc } from './components/docs-toc-context'
import {
  DOCS_GROUP_DESCRIPTION_KEYS,
  DOCS_GROUP_TITLE_KEYS,
  DOCS_GROUPS,
  getDocsGroupPages,
  type DocsGroup,
} from './lib/registry'

const GROUP_ICONS: Record<DocsGroup, LucideIcon> = {
  'quick-start': Rocket,
  api: Braces,
  clients: Plug,
  faq: CircleHelp,
}

/** Docs center landing: site-branded title plus the four section entries. */
export function Docs() {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const { setHeadings } = useDocsToc()

  useEffect(() => {
    setHeadings([])
  }, [setHeadings])

  return (
    <div className='mx-auto max-w-3xl'>
      <header className='mb-8'>
        <h1 className='text-3xl font-bold tracking-tight'>
          {t('{{name}} API Guide', { name: systemName })}
        </h1>
        <p className='text-muted-foreground mt-2 text-base'>
          {t(
            'Everything you need to integrate: quick start, API reference, client setup, and answers to common questions.'
          )}
        </p>
      </header>

      <div className='grid gap-4 sm:grid-cols-2'>
        {DOCS_GROUPS.map((group) => {
          const pages = getDocsGroupPages(group)
          const first = pages[0]
          if (!first) {
            return null
          }
          const Icon = GROUP_ICONS[group]
          return (
            <Link
              key={group}
              to='/docs/$'
              params={{ _splat: first.slug }}
              className='group hover:border-primary/60 hover:bg-muted/40 flex flex-col rounded-lg border p-5 transition-colors'
            >
              <div className='flex items-center gap-2'>
                <Icon className='text-primary size-5' aria-hidden='true' />
                <h2 className='font-semibold'>
                  {t(DOCS_GROUP_TITLE_KEYS[group])}
                </h2>
                <ChevronRight
                  className='text-muted-foreground ml-auto size-4 transition-transform group-hover:translate-x-0.5'
                  aria-hidden='true'
                />
              </div>
              <p className='text-muted-foreground mt-2 text-sm'>
                {t(DOCS_GROUP_DESCRIPTION_KEYS[group])}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
