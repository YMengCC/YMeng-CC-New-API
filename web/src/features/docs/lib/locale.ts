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
/** Interface language → docs content directory (zh → zhCN, zh-TW → zhTW). */
export const DOCS_LOCALES = [
  'en',
  'zhCN',
  'zhTW',
  'fr',
  'ja',
  'ru',
  'vi',
] as const
export type DocsLocale = (typeof DOCS_LOCALES)[number]

export function docsLocaleForLanguage(language?: string | null): DocsLocale {
  if (!language) {
    return 'en'
  }
  const normalized = language.trim().replaceAll('_', '-').toLowerCase()
  if (normalized.startsWith('zh')) {
    if (
      normalized === 'zh-tw' ||
      normalized === 'zh-hk' ||
      normalized === 'zh-mo' ||
      normalized === 'zhtw' ||
      normalized.startsWith('zh-hant')
    ) {
      return 'zhTW'
    }
    return 'zhCN'
  }
  const primary = normalized.split('-')[0]
  if ((DOCS_LOCALES as readonly string[]).includes(primary)) {
    return primary as DocsLocale
  }
  return 'en'
}
