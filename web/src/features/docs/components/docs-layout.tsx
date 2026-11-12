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
import { Menu, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { DocHeading } from '@/lib/markdown-source'

import { DocsSearchDialog } from './docs-search-dialog'
import { DocsSidebar } from './docs-sidebar'
import { DocsToc } from './docs-toc'
import { DocsTocContext } from './docs-toc-context'

/** Three-column docs shell: grouped navigation, article, and on-this-page TOC. */
export function DocsLayout(props: { children: ReactNode }) {
  const { t } = useTranslation()
  const [headings, setHeadings] = useState<DocHeading[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const tocContext = useMemo(() => ({ headings, setHeadings }), [headings])

  return (
    <PublicLayout showMainContainer={false}>
      <DocsTocContext.Provider value={tocContext}>
        <div className='container px-4 pt-20 pb-16 md:px-6'>
          <div className='mx-auto flex w-full max-w-7xl items-start gap-8'>
            <aside className='sticky top-20 hidden max-h-[calc(100svh-6rem)] w-60 shrink-0 overflow-y-auto pb-8 lg:block'>
              <DocsSidebar onOpenSearch={() => setSearchOpen(true)} />
            </aside>

            <main className='min-w-0 flex-1'>
              <div className='mb-4 flex items-center gap-2 lg:hidden'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setMobileNavOpen(true)}
                >
                  <Menu data-icon='inline-start' aria-hidden='true' />
                  {t('Documentation menu')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setSearchOpen(true)}
                >
                  <Search data-icon='inline-start' aria-hidden='true' />
                  {t('Search docs')}
                </Button>
              </div>
              {props.children}
            </main>

            <aside className='sticky top-20 hidden max-h-[calc(100svh-6rem)] w-56 shrink-0 overflow-y-auto pb-8 xl:block'>
              <DocsToc />
            </aside>
          </div>
        </div>

        <DocsSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side='left' className='w-72 overflow-y-auto p-5'>
            <SheetHeader className='p-0'>
              <SheetTitle>{t('API Guide')}</SheetTitle>
            </SheetHeader>
            <DocsSidebar
              onNavigate={() => setMobileNavOpen(false)}
              onOpenSearch={() => {
                setMobileNavOpen(false)
                setSearchOpen(true)
              }}
            />
          </SheetContent>
        </Sheet>
      </DocsTocContext.Provider>
    </PublicLayout>
  )
}
