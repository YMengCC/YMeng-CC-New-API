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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { useDocsToc } from './docs-toc-context'

// Keep in sync with the fixed public header height plus breathing room.
const SCROLL_SPY_OFFSET = 96

export function DocsToc() {
  const { t } = useTranslation()
  const { headings } = useDocsToc()
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (headings.length === 0) {
      setActiveId(null)
      return
    }

    function onScroll(): void {
      let current: string | null = null
      for (const heading of headings) {
        const element = document.getElementById(heading.id)
        if (
          element &&
          element.getBoundingClientRect().top <= SCROLL_SPY_OFFSET
        ) {
          current = heading.id
        }
      }
      setActiveId(current ?? headings[0]?.id ?? null)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [headings])

  if (headings.length === 0) {
    return null
  }

  return (
    <nav aria-label={t('On this page')}>
      <p className='mb-2 text-sm font-semibold'>{t('On this page')}</p>
      <ul className='flex flex-col'>
        {headings.map((heading) => {
          const isActive = activeId === heading.id
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  const element = document.getElementById(heading.id)
                  element?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  })
                  window.history.replaceState(null, '', `#${heading.id}`)
                }}
                className={cn(
                  'block border-l-2 py-1 pr-2 text-sm transition-colors',
                  heading.level === 3 ? 'pl-6' : 'pl-3',
                  isActive
                    ? 'border-primary text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground border-transparent'
                )}
              >
                {heading.text}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
