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
import assert from 'node:assert/strict'

import type { TFunction } from 'i18next'
import { describe, test } from 'vitest'

import { getInvoiceFormSchema, getInvoiceRejectSchema } from './schema'

const t = ((key: string) => key) as TFunction

describe('invoice application form remark', () => {
  const base = { title: 'Example Company', taxId: '91350000TEST' }

  test('accepts an empty remark and trims surrounding whitespace', () => {
    const schema = getInvoiceFormSchema(t)

    const empty = schema.safeParse({ ...base, remark: '' })
    assert.equal(empty.success, true)

    const trimmed = schema.safeParse({ ...base, remark: '  增值税专用发票  ' })
    assert.equal(trimmed.success, true)
    if (trimmed.success) {
      assert.equal(trimmed.data.remark, '增值税专用发票')
    }
  })

  test('enforces the 500-character limit by code points', () => {
    const schema = getInvoiceFormSchema(t)

    assert.equal(
      schema.safeParse({ ...base, remark: '备'.repeat(500) }).success,
      true
    )
    assert.equal(
      schema.safeParse({ ...base, remark: '备'.repeat(501) }).success,
      false
    )
    assert.equal(
      schema.safeParse({ ...base, remark: '🙂'.repeat(500) }).success,
      true
    )
    assert.equal(
      schema.safeParse({ ...base, remark: '🙂'.repeat(501) }).success,
      false
    )
  })
})

describe('invoice rejection form', () => {
  test('requires a non-empty reason and enforces the length limit', () => {
    const schema = getInvoiceRejectSchema(t)

    assert.equal(schema.safeParse({ reason: '   ' }).success, false)
    assert.equal(schema.safeParse({ reason: 'a'.repeat(501) }).success, false)
    assert.equal(schema.safeParse({ reason: '🙂'.repeat(500) }).success, true)
    assert.equal(schema.safeParse({ reason: '🙂'.repeat(501) }).success, false)
    assert.equal(
      schema.safeParse({ reason: 'Incorrect tax identifier' }).success,
      true
    )
  })

  test('trims the reason before it is submitted', () => {
    const result = getInvoiceRejectSchema(t).safeParse({
      reason: '  Incorrect tax identifier  ',
    })

    assert.equal(result.success, true)
    if (result.success) {
      assert.equal(result.data.reason, 'Incorrect tax identifier')
    }
  })
})
