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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { CurrencyAmount } from '@/components/currency-display'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { getUpstreamCostStats } from '@/features/usage-logs/api'
import { StatBadge } from '@/features/usage-logs/components/stat-badge'
import { summarizeUpstreamCost } from '@/features/usage-logs/lib/upstream-cost'
import { formatPercent } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'

type OverviewUpstreamCostProps = {
  range: { start_timestamp: number; end_timestamp: number }
  visible: boolean
}

/** Mounted by the admin log panel. Visibility controls amount disclosure only. */
export function OverviewUpstreamCost({
  range,
  visible,
}: OverviewUpstreamCostProps) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', 'overview', 'upstream-cost', range],
    queryFn: async () =>
      requireServerSuccess(await getUpstreamCostStats(range)).data ?? null,
    staleTime: 15_000,
    meta: { errorToast: false, redirectOnServerError: false },
  })

  if (query.isPending) {
    return (
      <LoadingState
        inline
        size='sm'
        message={`${t('Upstream Cost')} · ${t('Loading...')}`}
      />
    )
  }
  if (query.isError) {
    return (
      <ErrorState
        title={t('Upstream Cost')}
        description={t('Unable to load usage insights')}
        onRetry={() => void query.refetch()}
        className='min-h-0 gap-2 py-3'
      />
    )
  }

  const stats = query.data
  if (!stats) return null

  // The panel has no total-usage denominator, so it does not report coverage.
  const summary = summarizeUpstreamCost(stats, 0)
  if (summary.recordCount === 0) return null
  const hasKnownCost = stats.matched + stats.estimated > 0
  const margin =
    summary.grossMargin === null
      ? '—'
      : formatPercent(summary.grossMargin * 100)
  const amounts = [
    { label: t('Revenue'), amount: stats.revenue, accent: 'bg-chart-2/70' },
    { label: t('Upstream Cost'), amount: stats.cost, accent: 'bg-warning/70' },
    {
      label: t('Affiliate Rebate'),
      amount: stats.affiliate_cost,
      accent: 'bg-muted-foreground/70',
    },
    { label: t('Profit'), amount: summary.profit, accent: 'bg-chart-4/70' },
  ]

  return (
    <section
      aria-label={t('Upstream Cost')}
      className='mt-3 space-y-2 border-t pt-3'
    >
      {hasKnownCost && (
        <>
          <div className='grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap'>
            {amounts.map(({ label, amount, accent }) => (
              <StatBadge key={label} label={label} accent={accent}>
                {visible ? (
                  <CurrencyAmount
                    amount={amount}
                    mode='quota'
                    options={{
                      digitsLarge: 4,
                      digitsSmall: 6,
                      abbreviate: false,
                    }}
                  />
                ) : (
                  t('Hidden')
                )}
              </StatBadge>
            ))}
            <StatBadge label={t('Gross Margin')} accent='bg-chart-4/70'>
              {visible ? margin : t('Hidden')}
            </StatBadge>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Profit deducts upstream cost and affiliate rebates for usage with a known upstream cost only'
            )}
          </p>
        </>
      )}
      <p className='text-muted-foreground text-xs'>
        {t('Unknown cost: {{count}}', { count: stats.unknown })}
      </p>
    </section>
  )
}
