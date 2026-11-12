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
import { Link, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

import {
  DOCS_GROUP_TITLE_KEYS,
  DOCS_GROUPS,
  getDocsGroupPages,
} from '../lib/registry'

interface DocsSidebarProps {
  onNavigate?: () => void
  onOpenSearch: () => void
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /mac|iphone|ipad/i.test(navigator.userAgent)
}

export function DocsSidebar(props: DocsSidebarProps) {
  const { t } = useTranslation()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isMac = useMemo(isMacPlatform, [])

  return (
    <div className='flex flex-col gap-5'>
      <Button
        variant='outline'
        className='text-muted-foreground w-full justify-between gap-2'
        onClick={props.onOpenSearch}
      >
        <span className='flex items-center gap-2'>
          <Search data-icon='inline-start' aria-hidden='true' />
          {t('Search docs')}
        </span>
        <KbdGroup>
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>

      <nav aria-label={t('API Guide')} className='flex flex-col gap-5'>
        {DOCS_GROUPS.map((group) => (
          <div key={group}>
            <p className='text-muted-foreground mb-1.5 px-2 text-xs font-semibold tracking-wide uppercase'>
              {t(DOCS_GROUP_TITLE_KEYS[group])}
            </p>
            <ul className='flex flex-col gap-0.5'>
              {getDocsGroupPages(group).map((page) => {
                const isActive = pathname === `/docs/${page.slug}`
                return (
                  <li key={page.slug}>
                    <Link
                      to='/docs/$'
                      params={{ _splat: page.slug }}
                      onClick={props.onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'block rounded-md px-2 py-1.5 text-sm transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {t(page.titleKey)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  )
}
