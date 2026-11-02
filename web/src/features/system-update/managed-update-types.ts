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
export type ManagedCleanup = {
  cleanup_id: string
  target_name: string
  phase: string
  last_error_code?: string
}

export type UpdateStatus = {
  supported: boolean
  reason: string
  reason_code?: string
  state: string
  current_version: string
  target_version: string
  operation_id: string
  draining: boolean
  cleanup_supported?: boolean
  can_update?: boolean
  can_cleanup?: boolean
  cleanup?: ManagedCleanup | null
}
