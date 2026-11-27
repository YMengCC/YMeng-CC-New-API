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
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'

export function JingSoftOrderStatus(props: { status: string | null }) {
  const { t } = useTranslation()
  if (!props.status) return null
  const labels: Record<string, string> = {
    new: t('Order created'),
    submitting: t('Submitting order'),
    creation_unknown: t(
      'Order creation is uncertain. Contact support before creating another order.'
    ),
    pending: t('Payment is pending'),
    paid: t('Payment received. Wallet credit is pending.'),
    needs_attention: t('Order needs attention. Contact support.'),
    completed: t('Wallet credit completed'),
    expired: t('Order expired'),
  }
  return (
    <Alert>
      <AlertDescription role='status'>
        {labels[props.status] || t('Order status is unavailable')}
      </AlertDescription>
    </Alert>
  )
}
