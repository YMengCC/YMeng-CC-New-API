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
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { DocsPage } from '../lib/registry'

interface DocsPagerProps {
  next?: DocsPage
  prev?: DocsPage
}

export function DocsPager(props: DocsPagerProps) {
  const { t } = useTranslation()

  if (!props.prev && !props.next) {
    return null
  }

  return (
    <nav
      aria-label={t('API Guide')}
      className='mt-10 grid gap-3 border-t pt-6 sm:grid-cols-2'
    >
      {props.prev ? (
        <Link
          to='/docs/$'
          params={{ _splat: props.prev.slug }}
          className='hover:border-primary/60 hover:bg-muted/40 flex flex-col gap-1 rounded-lg border p-4 transition-colors'
        >
          <span className='text-muted-foreground flex items-center gap-1 text-xs'>
            <ArrowLeft className='size-3.5' aria-hidden='true' />
            {t('Previous')}
          </span>
          <span className='font-medium'>{t(props.prev.titleKey)}</span>
        </Link>
      ) : (
        <span aria-hidden='true' />
      )}
      {props.next ? (
        <Link
          to='/docs/$'
          params={{ _splat: props.next.slug }}
          className='hover:border-primary/60 hover:bg-muted/40 flex flex-col gap-1 rounded-lg border p-4 text-right transition-colors sm:col-start-2'
        >
          <span className='text-muted-foreground flex items-center justify-end gap-1 text-xs'>
            {t('Next')}
            <ArrowRight className='size-3.5' aria-hidden='true' />
          </span>
          <span className='font-medium'>{t(props.next.titleKey)}</span>
        </Link>
      ) : null}
    </nav>
  )
}
