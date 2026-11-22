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
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { Wallet } from '@/features/wallet'

const walletSearchSchema = z.object({
  show_history: z.boolean().optional(),
  p: z.number().int().positive().optional().catch(1),
  page_size: z.number().int().min(1).max(100).optional().catch(10),
  order_type: z.string().optional().catch(''),
  status: z
    .enum(['pending', 'success', 'failed', 'expired'])
    .optional()
    .catch(undefined),
  start_date: z.string().optional().catch(''),
  end_date: z.string().optional().catch(''),
  order_no: z.string().optional().catch(''),
})

export const Route = createFileRoute('/_authenticated/wallet/')({
  component: RouteComponent,
  validateSearch: walletSearchSchema,
})

function RouteComponent() {
  const search = Route.useSearch()
  return <Wallet search={search} />
}
