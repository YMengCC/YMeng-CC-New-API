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
export interface OfficeSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface OfficeFile {
  path: string
  size: number
  isDir: boolean
}

export interface OfficeFileChange {
  path: string
  kind: 'add' | 'delete' | 'update'
}

export type OfficeCommandStatus = 'in_progress' | 'completed' | 'failed'

/** One thing the agent did while working on a turn. */
export type OfficeItem =
  | { id: string; type: 'agent_message'; text: string }
  | { id: string; type: 'reasoning'; text: string }
  | {
      id: string
      type: 'command_execution'
      command: string
      aggregated_output: string
      exit_code?: number
      status: OfficeCommandStatus
    }
  | {
      id: string
      type: 'file_change'
      changes: OfficeFileChange[]
      status: 'completed' | 'failed'
    }
  | { id: string; type: 'error'; message: string }
  // Tools the office mode has no dedicated view for are shown by their name.
  | { id: string; type: 'todo_list' | 'web_search' | 'mcp_tool_call' }

/** Events of a turn as recorded by the office worker. */
export type OfficeEvent =
  | { type: 'user_input'; text: string; at: number }
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'turn.completed'; usage: OfficeUsage | null }
  | { type: 'turn.failed'; error: { message: string } }
  | { type: 'error'; message: string }
  | {
      type: 'item.started' | 'item.updated' | 'item.completed'
      item: OfficeItem
    }

export interface OfficeUsage {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
}

export type OfficeTurnStatus = 'running' | 'completed' | 'failed'

/** A prompt and everything the agent did in answer to it. */
export interface OfficeTurn {
  id: number
  prompt: string
  at: number
  status: OfficeTurnStatus
  /** Final answers of the agent, keyed by their item id. */
  messages: { id: string; text: string }[]
  steps: OfficeItem[]
  notices: string[]
  error?: string
}
