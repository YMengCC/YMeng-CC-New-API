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
import type { OfficeEvent, OfficeItem, OfficeTurn } from '../types'

/**
 * Folds the recorded events of a session into turns: one turn per prompt,
 * holding the latest version of every step the agent took.
 */
export function buildOfficeTurns(events: OfficeEvent[]): OfficeTurn[] {
  const turns: OfficeTurn[] = []
  for (const event of events) {
    if (event.type === 'user_input') {
      turns.push({
        id: turns.length + 1,
        prompt: event.text,
        at: event.at,
        status: 'running',
        messages: [],
        steps: [],
        notices: [],
      })
      continue
    }
    const turn = turns.at(-1)
    // Events recorded before the first prompt have nothing to belong to.
    if (!turn) continue

    switch (event.type) {
      case 'item.completed':
        applyItem(turn, event.item)
        break
      case 'item.updated':
        if (event.item.type !== 'agent_message') applyItem(turn, event.item)
        break
      case 'item.started':
        break
      case 'error':
        turn.notices.push(event.message)
        break
      case 'turn.failed':
        turn.status = 'failed'
        turn.error = event.error.message
        break
      case 'turn.completed':
        turn.status = 'completed'
        break
      case 'turn.started':
      case 'thread.started':
        break
    }
  }
  return turns
}

function applyItem(turn: OfficeTurn, item: OfficeItem) {
  if (item.type === 'agent_message') {
    turn.messages.push({ id: item.id, text: item.text })
    return
  }
  const index = turn.steps.findIndex((step) => step.id === item.id)
  if (index === -1) {
    turn.steps.push(item)
    return
  }
  turn.steps[index] = item
}
