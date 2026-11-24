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
import type { UseQueryResult } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  ChevronRight,
  History,
  Link2,
  ReceiptText,
  Share2,
  Users,
  Wallet,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { CurrencyAmount } from '@/components/currency-display'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import type { AffiliateSummary } from '@/features/affiliate/api'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { UserWalletData } from '../types'
import { AffiliateCommissionsDialog } from './dialogs/affiliate-commissions-dialog'
import { AffiliateInviteesDialog } from './dialogs/affiliate-invitees-dialog'
import { WithdrawalRecordsDialog } from './dialogs/withdrawal-records-dialog'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  summaryQuery: UseQueryResult<AffiliateSummary>
  availableQuota?: number
  linkQuery: UseQueryResult<string>
  onTransfer: () => void
  onWithdraw: () => void
  withdrawalAvailable: boolean
  complianceConfirmed: boolean
}

export function AffiliateRewardsCard(props: AffiliateRewardsCardProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const linkId = useId()
  const [commissionsDialogOpen, setCommissionsDialogOpen] = useState(false)
  const [inviteesDialogOpen, setInviteesDialogOpen] = useState(false)
  const [withdrawalRecordsOpen, setWithdrawalRecordsOpen] = useState(false)
  const summary = props.summaryQuery.data
  const totalEarned = summary?.total_quota ?? props.user?.aff_history_quota
  const inviteeCount = summary?.invitee_count ?? props.user?.aff_count
  const hasRewards = (props.availableQuota ?? 0) > 0
  const stats: {
    key: string
    label: string
    value: ReactNode
    emphasized?: boolean
  }[] = [
    {
      key: 'available',
      label: t('Available'),
      value: props.availableQuota != null && (
        <CurrencyAmount amount={props.availableQuota} />
      ),
      emphasized: true,
    },
    {
      key: 'total-earned',
      label: t('Total Earned'),
      value: totalEarned != null && <CurrencyAmount amount={totalEarned} />,
    },
    {
      key: 'invites',
      label: t('Invites'),
      value: inviteeCount != null && formatNumber(inviteeCount, locale),
    },
    {
      key: 'records',
      label: t('Records'),
      value: summary != null && formatNumber(summary.commission_count, locale),
    },
  ]
  const notices = [
    summary &&
      !summary.enabled &&
      t(
        'The affiliate program is currently disabled. Existing balances are kept, but no new commission is settled.'
      ),
    props.availableQuota === 0 &&
      !props.summaryQuery.isPending &&
      t('No referral rewards available to transfer or withdraw'),
    hasRewards &&
      !props.withdrawalAvailable &&
      t(
        'Withdrawal is unavailable until your referral rewards balance is loaded'
      ),
    !props.complianceConfirmed &&
      t(
        'Referral reward transfers and withdrawals are disabled until the administrator confirms compliance terms.'
      ),
  ].filter((notice): notice is string => typeof notice === 'string')
  const recordActions = [
    {
      key: 'commissions',
      label: t('Commission records'),
      icon: ReceiptText,
      open: setCommissionsDialogOpen,
    },
    {
      key: 'invitees',
      label: t('Invited users'),
      icon: Users,
      open: setInviteesDialogOpen,
    },
    {
      key: 'withdrawals',
      label: t('Withdrawal records'),
      icon: History,
      open: setWithdrawalRecordsOpen,
    },
  ]

  let headerAction: ReactNode = null
  if (summary) {
    headerAction = (
      <div className='flex sm:justify-end'>
        <Badge
          variant='secondary'
          className='h-6 max-w-full px-2.5 text-xs font-semibold tabular-nums sm:h-7 sm:px-3'
        >
          {t('Commission rate: {{rate}}%', {
            rate: summary.rate_percent,
          })}
        </Badge>
      </div>
    )
  } else if (props.summaryQuery.isPending) {
    headerAction = (
      <div role='status' className='flex items-center sm:justify-end'>
        <LoadingState inline size='sm' message={t('Loading...')} />
      </div>
    )
  }

  let linkContent: ReactNode
  if (props.linkQuery.isPending) {
    linkContent = (
      <div className='bg-muted/30 flex h-9 items-center rounded-lg border px-3'>
        <LoadingState inline size='sm' message={t('Loading...')} />
      </div>
    )
  } else if (props.linkQuery.isError) {
    linkContent = (
      <ErrorState
        className='min-h-0 rounded-lg border border-dashed p-3'
        title={t('Failed to load')}
        onRetry={() => void props.linkQuery.refetch()}
      />
    )
  } else if (props.linkQuery.data) {
    linkContent = (
      <div className='flex min-w-0 items-center gap-2'>
        <Input
          aria-labelledby={linkId}
          value={props.linkQuery.data}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          className='bg-muted/30 h-9 min-w-0 flex-1 font-mono text-xs sm:text-sm'
        />
        <CopyButton
          value={props.linkQuery.data}
          variant='outline'
          size='icon'
          className='size-9'
          tooltip={t('Copy referral link')}
        />
      </div>
    )
  } else {
    linkContent = (
      <div className='bg-muted/30 text-muted-foreground flex h-9 items-center rounded-lg border px-3 text-sm'>
        {t('No Data')}
      </div>
    )
  }

  return (
    <>
      <section className='min-w-0' aria-label={t('Referral Program')}>
        <TitledCard
          disableHoverEffect
          icon={<Share2 />}
          iconTone='info'
          iconClassName='mt-0.5 self-start'
          title={
            <div className='flex flex-wrap items-center gap-2'>
              <h3>{t('Referral Program')}</h3>
              {summary && (
                <StatusBadge
                  copyable={false}
                  showDot
                  variant={summary.enabled ? 'success' : 'neutral'}
                  className={cn(
                    'px-2 py-0.5 text-xs',
                    summary.enabled ? 'bg-success/10' : 'bg-muted'
                  )}
                  label={summary.enabled ? t('Enabled') : t('Disabled')}
                />
              )}
            </div>
          }
          description={t(
            'Earn commission when your invited users spend wallet balance. Transfer commission to your balance or request a withdrawal.'
          )}
          descriptionClassName='mt-0.5 leading-relaxed'
          action={headerAction}
          contentClassName='flex flex-col gap-4 sm:gap-5'
        >
          {props.summaryQuery.isError && (
            <ErrorState
              className='min-h-0 rounded-xl border border-dashed p-4'
              title={t('Failed to load')}
              onRetry={() => void props.summaryQuery.refetch()}
            />
          )}

          <dl
            aria-busy={props.summaryQuery.isPending}
            className='bg-muted/15 grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-4'
          >
            {stats.map((item, index) => (
              <div
                key={item.key}
                className={cn(
                  'border-border/60 row-span-2 grid min-w-0 grid-rows-subgrid gap-1.5 px-3.5 py-3 sm:px-4 sm:py-3.5',
                  item.emphasized && 'bg-accent/45',
                  index % 2 === 1 && 'border-s',
                  index >= 2 && 'border-t sm:border-t-0',
                  index === 2 && 'sm:border-s'
                )}
              >
                <dt
                  className={cn(
                    'text-[11px] leading-snug font-medium tracking-wider uppercase wrap-anywhere sm:text-xs',
                    item.emphasized
                      ? 'text-foreground/80'
                      : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </dt>
                <dd className='text-foreground font-mono text-lg leading-tight font-bold tracking-tight wrap-anywhere tabular-nums sm:text-2xl'>
                  {item.value ||
                    (props.summaryQuery.isPending ? (
                      <Skeleton className='h-6 w-14 max-w-full sm:h-7' />
                    ) : (
                      '—'
                    ))}
                </dd>
              </div>
            ))}
          </dl>

          <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4'>
            <div
              role='group'
              aria-labelledby={linkId}
              className='flex min-w-0 flex-1 flex-col gap-2'
            >
              <div className='flex items-center gap-2'>
                <IconBadge tone='info' size='xs'>
                  <Link2 />
                </IconBadge>
                <p
                  id={linkId}
                  className='text-muted-foreground text-xs font-medium tracking-wider uppercase'
                >
                  {t('Your referral link')}
                </p>
              </div>
              {linkContent}
            </div>

            <div
              role='group'
              aria-label={t('Referral reward actions')}
              className='flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:shrink-0'
            >
              <Button
                variant='default'
                size='lg'
                className='h-9 w-full px-4 sm:w-auto'
                onClick={props.onTransfer}
                disabled={!hasRewards || !props.complianceConfirmed}
              >
                <ArrowRightLeft data-icon='inline-start' aria-hidden='true' />
                {t('Transfer to Balance')}
              </Button>
              <Button
                variant='outline'
                size='lg'
                className='h-9 w-full px-4 sm:w-auto'
                onClick={props.onWithdraw}
                disabled={
                  !props.withdrawalAvailable || !props.complianceConfirmed
                }
              >
                <Wallet data-icon='inline-start' aria-hidden='true' />
                {t('Withdraw')}
              </Button>
            </div>
          </div>

          {notices.length > 0 && (
            <ul className='border-border/60 bg-muted/30 text-muted-foreground flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs leading-relaxed'>
              {notices.map((notice) => (
                <li key={notice} className='wrap-anywhere'>
                  {notice}
                </li>
              ))}
            </ul>
          )}

          <div className='grid grid-cols-1 gap-2 border-t pt-3.5 sm:flex sm:flex-wrap sm:items-center sm:pt-4'>
            {recordActions.map((item) => (
              <Button
                key={item.key}
                variant='outline'
                size='sm'
                className='h-9 w-full justify-between gap-2 px-3 text-start whitespace-normal sm:h-8 sm:w-auto sm:justify-start'
                onClick={() => item.open(true)}
              >
                <span className='inline-flex min-w-0 items-center gap-1.5'>
                  <item.icon
                    className='text-muted-foreground size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  <span>{item.label}</span>
                </span>
                <ChevronRight
                  className='text-muted-foreground size-3.5 shrink-0 sm:hidden'
                  aria-hidden='true'
                />
              </Button>
            ))}
          </div>
        </TitledCard>
      </section>
      <AffiliateCommissionsDialog
        open={commissionsDialogOpen}
        onOpenChange={setCommissionsDialogOpen}
      />
      <AffiliateInviteesDialog
        open={inviteesDialogOpen}
        onOpenChange={setInviteesDialogOpen}
      />
      <WithdrawalRecordsDialog
        open={withdrawalRecordsOpen}
        onOpenChange={setWithdrawalRecordsOpen}
      />
    </>
  )
}
