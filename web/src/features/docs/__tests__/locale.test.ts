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
import { describe, expect, it } from 'vitest'

import { docsLocaleForLanguage } from '../lib/locale'

describe('docsLocaleForLanguage', () => {
  it.each([
    ['zhCN', 'zhCN'],
    ['zh', 'zhCN'],
    ['zh-CN', 'zhCN'],
    ['zh-Hans', 'zhCN'],
    ['zhTW', 'zhTW'],
    ['zh-TW', 'zhTW'],
    ['zh-HK', 'zhTW'],
    ['zh-Hant', 'zhTW'],
    ['en', 'en'],
    ['fr', 'fr'],
    ['ja', 'ja'],
    ['ru', 'ru'],
    ['vi', 'vi'],
  ])('maps interface language %s to docs locale %s', (language, expected) => {
    expect(docsLocaleForLanguage(language)).toBe(expected)
  })

  it('accepts regional tags for the shared locales', () => {
    expect(docsLocaleForLanguage('fr-FR')).toBe('fr')
    expect(docsLocaleForLanguage('ja-JP')).toBe('ja')
  })

  it('falls back to English for missing or unsupported languages', () => {
    expect(docsLocaleForLanguage(undefined)).toBe('en')
    expect(docsLocaleForLanguage(null)).toBe('en')
    expect(docsLocaleForLanguage('')).toBe('en')
    expect(docsLocaleForLanguage('de')).toBe('en')
  })
})
