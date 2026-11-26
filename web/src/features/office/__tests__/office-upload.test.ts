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

import { droppedFiles, splitBySizeLimit } from '../lib/office-upload'

type DropItem = {
  kind: string
  webkitGetAsEntry: () => { isDirectory: boolean } | null
}

/** A drop as the browser reports it: one drag item per file. */
function dropOf(
  ...entries: Array<{ name: string; size?: number; isDirectory?: boolean }>
) {
  const files = entries.map(
    (entry) => new File(['x'.repeat(entry.size ?? 1)], entry.name)
  )
  const items: DropItem[] = entries.map((entry) => ({
    kind: 'file',
    webkitGetAsEntry: () => ({ isDirectory: entry.isDirectory ?? false }),
  }))
  return { types: ['Files'], files, items } as unknown as DataTransfer
}

test('a dropped folder is left out and reported, its files are not readable', () => {
  const dropped = droppedFiles(
    dropOf(
      { name: 'notes.md' },
      { name: 'assets', isDirectory: true },
      { name: 'report.pdf' }
    )
  )

  expect(dropped.hasFolder).toBe(true)
  expect(dropped.files.map((file) => file.name)).toEqual([
    'notes.md',
    'report.pdf',
  ])
})

test('a drop without folders keeps every file', () => {
  const dropped = droppedFiles(dropOf({ name: 'a.txt' }, { name: 'b.txt' }))

  expect(dropped.hasFolder).toBe(false)
  expect(dropped.files).toHaveLength(2)
})

test('a drop without drag items keeps every file', () => {
  const files = [new File(['x'], 'a.txt')]
  const dropped = droppedFiles({ files } as unknown as DataTransfer)

  expect(dropped.files).toEqual(files)
})

test('files above the size limit are left out and reported', () => {
  const { accepted, hasOversized } = splitBySizeLimit([
    new File(['x'], 'small.txt'),
    new File(['x'.repeat(20 * 1024 * 1024 + 1)], 'large.bin'),
  ])

  expect(hasOversized).toBe(true)
  expect(accepted.map((file) => file.name)).toEqual(['small.txt'])
})

test('files at the size limit are accepted', () => {
  const { accepted, hasOversized } = splitBySizeLimit([
    new File(['x'.repeat(20 * 1024 * 1024)], 'limit.bin'),
  ])

  expect(hasOversized).toBe(false)
  expect(accepted).toHaveLength(1)
})
