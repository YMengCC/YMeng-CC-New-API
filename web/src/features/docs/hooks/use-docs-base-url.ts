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
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import { useStatus } from '@/hooks/use-status'

import { resolveDocsBaseUrl } from '../lib/tokens'

/**
 * The public API base URL shown throughout the docs. Mirrors the API keys
 * page convention: first configured API address, then server_address, then
 * the current origin.
 */
export function useDocsBaseUrl(): string {
  const { status } = useStatus()
  const { items } = useApiInfo()
  const serverAddress =
    typeof status?.server_address === 'string' ? status.server_address : ''
  return resolveDocsBaseUrl(
    items[0]?.url,
    serverAddress,
    window.location.origin
  )
}
