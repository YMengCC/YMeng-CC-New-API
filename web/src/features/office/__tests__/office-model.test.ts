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

import { pickOfficeModel } from '../lib/office-model'

const models = [
  { label: 'gpt-4.1', value: 'gpt-4.1' },
  { label: 'gpt-5.1-codex', value: 'gpt-5.1-codex' },
  { label: 'gpt-5.1-codex-max', value: 'gpt-5.1-codex-max' },
]

test('the model used before is kept while it is still available', () => {
  expect(pickOfficeModel(models, 'gpt-4.1')).toBe('gpt-4.1')
})

test('a Codex model is chosen when the previous one is unknown or unset', () => {
  expect(pickOfficeModel(models, 'gpt-4o-mini')).toBe('gpt-5.1-codex')
  expect(pickOfficeModel(models, '')).toBe('gpt-5.1-codex')
})

test('the first model is used when no Codex model is available', () => {
  const other = [
    { label: 'claude-sonnet', value: 'claude-sonnet' },
    { label: 'gpt-4.1', value: 'gpt-4.1' },
  ]

  expect(pickOfficeModel(other, 'gpt-5.1-codex')).toBe('claude-sonnet')
  expect(pickOfficeModel([], '')).toBe('')
})
