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
import { expect, test } from 'vitest'

import { formatFileSize } from '../lib/office-file-size'

test('file sizes switch units and keep no decimals for whole bytes', () => {
  expect(formatFileSize(0)).toBe('0 B')
  expect(formatFileSize(512)).toBe('512 B')
  expect(formatFileSize(1536)).toBe('1.5 KB')
  expect(formatFileSize(20 * 1024 * 1024)).toBe('20.0 MB')
  expect(formatFileSize(3 * 1024 ** 3)).toBe('3.0 GB')
})
