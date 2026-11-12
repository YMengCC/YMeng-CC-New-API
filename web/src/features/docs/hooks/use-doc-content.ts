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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { docContentQueryOptions, docsSearchIndexQueryOptions } from '../api'
import { docsLocaleForLanguage } from '../lib/locale'

/** Current docs locale derived from the interface language (reactive). */
export function useDocsLocale() {
  const { i18n } = useTranslation()
  return docsLocaleForLanguage(i18n.resolvedLanguage || i18n.language)
}

export function useDocContent(slug: string) {
  const locale = useDocsLocale()
  return useQuery(docContentQueryOptions(locale, slug))
}

export function useDocsSearchIndex() {
  const locale = useDocsLocale()
  return useQuery(docsSearchIndexQueryOptions(locale))
}
