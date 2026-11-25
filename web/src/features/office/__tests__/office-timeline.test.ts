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

import { buildOfficeTurns } from '../lib/office-timeline'
import type { OfficeEvent } from '../types'

const PROMPT: OfficeEvent = {
  type: 'user_input',
  text: 'Summarise the inbox',
  at: 1_700_000_000_000,
}

test('each prompt starts a turn that owns the events recorded after it', () => {
  const events: OfficeEvent[] = [
    PROMPT,
    { type: 'turn.started' },
    { type: 'turn.completed', usage: null },
    { type: 'user_input', text: 'Now draft a reply', at: 1_700_000_060_000 },
    { type: 'turn.started' },
  ]

  const turns = buildOfficeTurns(events)

  expect(turns).toHaveLength(2)
  expect(turns[0]).toMatchObject({
    id: 1,
    prompt: 'Summarise the inbox',
    at: 1_700_000_000_000,
    status: 'completed',
  })
  expect(turns[1]).toMatchObject({
    id: 2,
    prompt: 'Now draft a reply',
    status: 'running',
  })
})

test('a step is shown once in its latest version and answers keep their order', () => {
  const events: OfficeEvent[] = [
    PROMPT,
    {
      type: 'item.started',
      item: {
        id: 'item_0',
        type: 'command_execution',
        command: 'ls',
        aggregated_output: '',
        status: 'in_progress',
      },
    },
    {
      type: 'item.updated',
      item: {
        id: 'item_0',
        type: 'command_execution',
        command: 'ls',
        aggregated_output: 'a.txt',
        status: 'completed',
        exit_code: 0,
      },
    },
    {
      type: 'item.completed',
      item: { id: 'item_1', type: 'agent_message', text: 'Found one file' },
    },
    {
      type: 'item.completed',
      item: {
        id: 'item_2',
        type: 'file_change',
        changes: [{ path: 'notes.md', kind: 'add' }],
        status: 'completed',
      },
    },
    {
      type: 'item.completed',
      item: { id: 'item_3', type: 'agent_message', text: 'Notes added' },
    },
    { type: 'turn.completed', usage: null },
  ]

  const [turn] = buildOfficeTurns(events)

  expect(turn.steps.map((step) => [step.id, step.type])).toEqual([
    ['item_0', 'command_execution'],
    ['item_2', 'file_change'],
  ])
  expect(turn.steps[0]).toMatchObject({
    aggregated_output: 'a.txt',
    exit_code: 0,
  })
  expect(turn.messages).toEqual([
    { id: 'item_1', text: 'Found one file' },
    { id: 'item_3', text: 'Notes added' },
  ])
})

test('a failed turn reports the failure and keeps the steps that led to it', () => {
  const events: OfficeEvent[] = [
    PROMPT,
    { type: 'error', message: 'Reconnecting... 2/5' },
    { type: 'error', message: 'Reconnecting... 3/5' },
    {
      type: 'item.completed',
      item: { id: 'item_0', type: 'error', message: 'quota exceeded' },
    },
    {
      type: 'turn.failed',
      error: { message: 'unexpected status 429 Too Many Requests' },
    },
  ]

  const [turn] = buildOfficeTurns(events)

  expect(turn.status).toBe('failed')
  expect(turn.error).toBe('unexpected status 429 Too Many Requests')
  expect(turn.notices).toEqual(['Reconnecting... 2/5', 'Reconnecting... 3/5'])
  expect(turn.steps).toEqual([
    { id: 'item_0', type: 'error', message: 'quota exceeded' },
  ])
})

test('events recorded before any prompt are ignored', () => {
  const events: OfficeEvent[] = [
    { type: 'thread.started', thread_id: 'thread-1' },
    { type: 'turn.started' },
  ]

  expect(buildOfficeTurns(events)).toEqual([])
})
