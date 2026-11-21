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
import { Link } from '@tanstack/react-router'
import {
  Activity,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  FileText,
  Gauge,
  HandCoins,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CurrencyAmount } from '@/components/currency-display'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getAffiliateAnalyticsOverview } from '@/features/affiliate-admin/api'
import {
  ModelLink,
  VendorLink,
} from '@/features/rankings/components/entity-links'
import { useRankings } from '@/features/rankings/hooks/use-rankings'
import { formatShare, formatTokens } from '@/features/rankings/lib/format'
import { getUserLogStats, getLogStats } from '@/features/usage-logs/api'
import { CacheRateRing } from '@/features/usage-logs/components/cache-rate-ring'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { statusQueryOptions } from '@/lib/status-query'
import { dateToUnixTimestamp, getRollingDateRange } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

import { PanelWrapper } from '../ui/panel-wrapper'
import { StatCard } from '../ui/stat-card'
import { OverviewUpstreamCost } from './overview-upstream-cost'

type InsightPanelProps = {
  title: string
  description: string
  icon: LucideIcon
  tone: IconBadgeTone
  action: ReactNode
  loading: boolean
  error: boolean
  empty: boolean
  errorMessage: string
  emptyMessage: string
  onRetry: () => void
  children: ReactNode
  footer?: ReactNode
}

function InsightPanel(props: InsightPanelProps) {
  const titleId = useId()

  let content = props.children
  if (props.loading) {
    content = (
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
        {['one', 'two', 'three', 'four'].map((key) => (
          <Skeleton key={key} className='h-24 rounded-xl' />
        ))}
      </div>
    )
  } else if (props.error) {
    content = (
      <ErrorState
        title={props.errorMessage}
        onRetry={props.onRetry}
        className='min-h-0 p-3'
      />
    )
  } else if (props.empty) {
    content = <EmptyState title={props.emptyMessage} className='min-h-0 p-3' />
  }

  return (
    <section aria-labelledby={titleId} aria-busy={props.loading}>
      <PanelWrapper
        title={
          <h2 id={titleId} className='flex items-center gap-2'>
            <IconBadge tone={props.tone} size='sm'>
              <props.icon />
            </IconBadge>
            {props.title}
          </h2>
        }
        description={props.description}
        headerActions={props.action}
        contentClassName='p-3 sm:p-4'
      >
        {content}
        {props.footer}
      </PanelWrapper>
    </section>
  )
}

type InsightLink = '/pricing' | '/rankings' | '/affiliate-admin'

function PanelLink(props: { to: InsightLink; children: ReactNode }) {
  return (
    <Link
      to={props.to}
      className='text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-xs font-medium transition-colors'
    >
      {props.children}
      <ArrowRight aria-hidden='true' />
    </Link>
  )
}

type Metric = {
  key: string
  title: string
  value: ReactNode
  description: string
  icon: LucideIcon
  tone: 'accent-1' | 'accent-2' | 'accent-3'
}

function InsightMetrics(props: { cards: Metric[] }) {
  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
      {props.cards.map((card) => (
        <div
          key={card.key}
          className='bg-background/60 rounded-xl border p-2 sm:p-3'
        >
          <StatCard
            title={card.title}
            value={card.value}
            description={card.description}
            icon={card.icon}
            tone={card.tone}
            compactMobile
          />
        </div>
      ))}
    </div>
  )
}

function LogInsights(props: {
  locale: Intl.LocalesArgument
  visible: boolean
}) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)
  const [range] = useState(() => insightRange(1))
  const statsQuery = useQuery({
    queryKey: ['dashboard', 'overview', 'log-stats', user?.id, isAdmin, range],
    queryFn: async () => {
      const result = isAdmin
        ? await getLogStats(range)
        : await getUserLogStats(range)
      return requireServerSuccess(result).data ?? null
    },
    enabled: Boolean(user),
    staleTime: 15_000,
    meta: { errorToast: false, redirectOnServerError: false },
  })

  const stats = statsQuery.data
  const cards = [
    {
      key: 'usage',
      title: t('Usage'),
      value: props.visible ? (
        <CurrencyAmount amount={stats?.quota ?? 0} mode='quota' />
      ) : (
        '••••'
      ),
      description: t('Last 24h usage'),
      icon: Activity,
      tone: 'accent-1' as const,
    },
    {
      key: 'rpm',
      title: t('RPM'),
      value: formatNumber(stats?.rpm ?? 0, props.locale),
      description: t('Requests per minute'),
      icon: Gauge,
      tone: 'accent-2' as const,
    },
    {
      key: 'tpm',
      title: t('TPM'),
      value: formatNumber(stats?.tpm ?? 0, props.locale),
      description: t('Tokens per minute'),
      icon: BarChart3,
      tone: 'accent-3' as const,
    },
    {
      key: 'cache-rate',
      title: t('Cache Hit Rate'),
      value: (
        <CacheRateRing
          rate={stats?.cache_rate ?? 0}
          label={t('Cache Hit Rate')}
        />
      ),
      description: t('Cache Hit Rate'),
      icon: FileText,
      tone: 'accent-1' as const,
    },
  ]

  return (
    <InsightPanel
      title={t('Usage insights')}
      description={`${isAdmin ? t('All users') : t('Personal')} · ${t('Last 24h usage')}`}
      icon={Activity}
      tone='info'
      action={
        <Link
          className='text-sm underline underline-offset-4'
          to='/usage-logs/$section'
          params={{ section: 'common' }}
          search={{
            startTime: range.start_timestamp * 1000,
            endTime: range.end_timestamp * 1000,
          }}
        >
          {t('Open logs')}
        </Link>
      }
      loading={statsQuery.isLoading}
      error={statsQuery.isError}
      empty={!statsQuery.isLoading && !statsQuery.isError && !stats}
      errorMessage={t('Unable to load usage insights')}
      emptyMessage={t('No usage data yet')}
      onRetry={() => void statsQuery.refetch()}
      footer={
        isAdmin && (
          <OverviewUpstreamCost range={range} visible={props.visible} />
        )
      }
    >
      <InsightMetrics cards={cards} />
    </InsightPanel>
  )
}

function ModelRecommendations(props: { pricing: boolean }) {
  const { t } = useTranslation()
  const rankingsQuery = useRankings('week', { inlineErrors: true })
  const snapshot = rankingsQuery.data?.data
  const models = snapshot?.models?.slice(0, 3) ?? []
  const vendors = snapshot?.vendors?.slice(0, 3) ?? []
  const hasData = models.length > 0 || vendors.length > 0

  return (
    <InsightPanel
      title={t('Model recommendations')}
      description={t('Popular models and vendors from this week')}
      icon={BarChart3}
      tone='chart-4'
      action={<PanelLink to='/rankings'>{t('View rankings')}</PanelLink>}
      loading={rankingsQuery.isLoading}
      error={rankingsQuery.isError}
      empty={!rankingsQuery.isLoading && !rankingsQuery.isError && !hasData}
      errorMessage={t('Unable to load model recommendations')}
      emptyMessage={t('No model ranking data yet')}
      onRetry={() => void rankingsQuery.refetch()}
    >
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='min-w-0'>
          <h3 className='text-muted-foreground mb-2 text-xs font-medium uppercase'>
            {t('Top Models')}
          </h3>
          <ol className='flex flex-col gap-2'>
            {models.map((model) => (
              <li key={model.model_name} className='flex items-center gap-2'>
                <span className='text-muted-foreground w-4 shrink-0 text-right font-mono text-xs'>
                  {model.rank}.
                </span>
                {props.pricing ? (
                  <ModelLink
                    modelName={model.model_name}
                    className='min-w-0 flex-1 truncate text-xs font-medium'
                  />
                ) : (
                  <span className='min-w-0 flex-1 truncate'>
                    {model.model_name}
                  </span>
                )}
                <span className='text-muted-foreground shrink-0 font-mono text-xs tabular-nums'>
                  {formatTokens(model.total_tokens)}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className='min-w-0'>
          <h3 className='text-muted-foreground mb-2 text-xs font-medium uppercase'>
            {t('Top vendors')}
          </h3>
          <ol className='flex flex-col gap-2'>
            {vendors.map((vendor) => (
              <li key={vendor.vendor} className='flex items-center gap-2'>
                <span className='text-muted-foreground w-4 shrink-0 text-right font-mono text-xs'>
                  {vendor.rank}.
                </span>
                {props.pricing ? (
                  <VendorLink
                    vendor={vendor.vendor}
                    className='min-w-0 flex-1 truncate text-xs font-medium'
                  />
                ) : (
                  <span className='min-w-0 flex-1 truncate'>
                    {vendor.vendor}
                  </span>
                )}
                <span className='text-muted-foreground shrink-0 font-mono text-xs tabular-nums'>
                  {formatShare(vendor.share)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {snapshot?.top_movers?.[0] && (
        <p className='text-muted-foreground mt-3 flex items-center gap-1 text-xs'>
          <ArrowUpRight className='size-4 shrink-0' aria-hidden='true' />
          {t('Trending up')} ·{' '}
          <span className='truncate'>{snapshot.top_movers[0].model_name}</span>
        </p>
      )}
    </InsightPanel>
  )
}

function insightRange(days: number) {
  const { start, end } = getRollingDateRange(days)
  return {
    start_timestamp: dateToUnixTimestamp(start),
    end_timestamp: dateToUnixTimestamp(end),
  }
}

function AffiliateInsights(props: { visible: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [range] = useState(() => insightRange(30))
  const query = useQuery({
    queryKey: ['affiliate-admin', 'overview', range],
    queryFn: async ({ signal }) =>
      requireServerSuccess(await getAffiliateAnalyticsOverview(range, signal))
        .data,
    staleTime: 60_000,
    meta: { errorToast: false, redirectOnServerError: false },
  })
  const overview = query.data?.overview
  const cards = [
    {
      key: 'referrals',
      title: t('Referral registrations'),
      value: formatNumber(overview?.referral_count ?? 0, locale),
      description: t('Users registered with an inviter in this period'),
      icon: Users,
      tone: 'accent-1' as const,
    },
    {
      key: 'inviters',
      title: t('Active inviters'),
      value: formatNumber(overview?.active_inviter_count ?? 0, locale),
      description: t('Inviters with at least one registration in this period'),
      icon: Users,
      tone: 'accent-2' as const,
    },
    {
      key: 'commissions',
      title: t('Commission events'),
      value: formatNumber(overview?.commission_count ?? 0, locale),
      description: t('Completed commission settlements in this period'),
      icon: HandCoins,
      tone: 'accent-3' as const,
    },
    {
      key: 'credited',
      title: t('Credited quota'),
      value: props.visible ? (
        <CurrencyAmount amount={overview?.credited_quota ?? 0} mode='quota' />
      ) : (
        '••••'
      ),
      description: t('Commission quota credited to inviters in this period'),
      icon: HandCoins,
      tone: 'accent-1' as const,
    },
  ]

  return (
    <InsightPanel
      title={t('Referral Analytics')}
      description={t('30 Days')}
      icon={Users}
      tone='success'
      action={
        <PanelLink to='/affiliate-admin'>
          {t('Open referral analytics')}
        </PanelLink>
      }
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && !query.isError && !overview}
      errorMessage={t('Unable to load referral analytics')}
      emptyMessage={t('No referral activity yet')}
      onRetry={() => void query.refetch()}
    >
      <InsightMetrics cards={cards} />
    </InsightPanel>
  )
}

export function OverviewInsights() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const isAdmin = Boolean(user?.role && user.role >= ROLE.ADMIN)

  const { data: status } = useQuery(statusQueryOptions)
  const modules = parseHeaderNavModulesFromStatus(status ?? null)
  const logs = useIsSidebarModuleVisible('/usage-logs/common')
  const models = useIsSidebarModuleVisible('/dashboard/models')
  const [visible, setVisible] = useState(true)
  if (!user || !status) return null

  return (
    <div className='grid gap-3'>
      <div className='flex flex-wrap items-center justify-end gap-2'>
        {models && (
          <Link
            className='text-sm underline underline-offset-4'
            to='/dashboard/$section'
            params={{ section: 'models' }}
          >
            {t('Model Call Analytics')}
          </Link>
        )}
        {modules.pricing.enabled && (
          <PanelLink to='/pricing'>{t('Pricing')}</PanelLink>
        )}
        {(logs || isAdmin) && (
          <Button
            variant='ghost'
            size='icon'
            aria-label={
              visible
                ? t('Hide analytics amounts')
                : t('Show analytics amounts')
            }
            onClick={() => setVisible(!visible)}
          >
            {visible ? <Eye /> : <EyeOff />}
          </Button>
        )}
      </div>
      {logs && <LogInsights locale={locale} visible={visible} />}
      {modules.rankings.enabled && (
        <ModelRecommendations pricing={modules.pricing.enabled} />
      )}
      {isAdmin && <AffiliateInsights visible={visible} />}
    </div>
  )
}
