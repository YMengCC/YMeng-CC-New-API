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
import { ChevronRight } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { CurrencyAmount } from '@/components/currency-display'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import type { AffiliateSummary } from '@/features/affiliate/api'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

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
  const stats = [
    {
      label: t('Available'),
      value: props.availableQuota != null && (
        <CurrencyAmount amount={props.availableQuota} />
      ),
    },
    {
      label: t('Total Earned'),
      value: totalEarned != null && <CurrencyAmount amount={totalEarned} />,
    },
    {
      label: t('Invites'),
      value: inviteeCount != null && formatNumber(inviteeCount, locale),
    },
    {
      label: t('Records'),
      value: summary != null && formatNumber(summary.commission_count, locale),
    },
  ]
  const rules = [
    t(
      'Earn commission when your invited users spend wallet balance. Transfer commission to your balance or request a withdrawal.'
    ),
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
  ].filter((rule): rule is string => typeof rule === 'string')

  let linkContent: ReactNode
  if (props.linkQuery.isPending) {
    linkContent = <LoadingState inline size='sm' message={t('Loading...')} />
  } else if (props.linkQuery.isError) {
    linkContent = (
      <ErrorState
        className='min-h-0 p-3'
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
          className='min-w-0 flex-1 font-mono text-xs'
        />
        <CopyButton
          value={props.linkQuery.data}
          variant='outline'
          tooltip={t('Copy referral link')}
        />
      </div>
    )
  } else {
    linkContent = (
      <p className='text-muted-foreground text-sm'>{t('No Data')}</p>
    )
  }

  return (
    <>
      <section className='min-w-0' aria-label={t('Referral Program')}>
        <TitledCard
          disableHoverEffect
          title={
            <div className='flex flex-wrap items-center gap-2'>
              <h3>{t('Referral Program')}</h3>
              {summary && (
                <StatusBadge
                  copyable={false}
                  showDot={summary.enabled}
                  className='bg-muted text-foreground'
                  label={summary.enabled ? t('Enabled') : t('Disabled')}
                  variant={summary.enabled ? 'success' : 'neutral'}
                />
              )}
            </div>
          }
          action={
            summary && (
              <p className='text-base font-semibold tabular-nums'>
                {t('Commission rate: {{rate}}%', {
                  rate: summary.rate_percent,
                })}
              </p>
            )
          }
          contentClassName='space-y-4'
        >
          {props.summaryQuery.isPending && (
            <div role='status'>
              <LoadingState inline size='sm' message={t('Loading...')} />
            </div>
          )}
          {props.summaryQuery.isError && (
            <ErrorState
              className='min-h-0 p-3'
              title={t('Failed to load')}
              onRetry={() => void props.summaryQuery.refetch()}
            />
          )}
          <dl
            aria-busy={props.summaryQuery.isPending}
            className='grid grid-cols-2 gap-2 sm:grid-cols-4'
          >
            {stats.map((item) => (
              <div
                key={item.label}
                className='bg-muted/40 row-span-2 grid min-w-0 grid-rows-subgrid gap-1 rounded-lg border p-3 sm:p-4'
              >
                <dt className='text-muted-foreground text-xs font-medium wrap-anywhere'>
                  {item.label}
                </dt>
                <dd className='text-lg leading-tight font-semibold tracking-tight wrap-anywhere tabular-nums sm:text-2xl'>
                  {item.value ||
                    (props.summaryQuery.isPending ? (
                      <Skeleton className='h-6 w-12 max-w-full' />
                    ) : (
                      '—'
                    ))}
                </dd>
              </div>
            ))}
          </dl>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
            <div
              role='group'
              aria-labelledby={linkId}
              className='min-w-0 flex-1 space-y-1.5'
            >
              <p id={linkId} className='text-sm font-medium'>
                {t('Your referral link')}
              </p>
              {linkContent}
            </div>
            <div
              role='group'
              aria-label={t('Referral reward actions')}
              className='flex flex-col gap-2 sm:flex-row sm:flex-wrap'
            >
              <Button
                variant='secondary'
                onClick={props.onTransfer}
                disabled={!hasRewards || !props.complianceConfirmed}
              >
                {t('Transfer to Balance')}
              </Button>
              <Button
                variant='outline'
                onClick={props.onWithdraw}
                disabled={
                  !props.withdrawalAvailable || !props.complianceConfirmed
                }
              >
                {t('Withdraw')}
              </Button>
            </div>
          </div>
          <div className='grid gap-4 border-t pt-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
            <div className='min-w-0'>
              <h4 className='text-sm font-semibold'>{t('Rules')}</h4>
              <ul className='divide-y'>
                {rules.map((rule) => (
                  <li
                    key={rule}
                    className='text-muted-foreground hover:bg-muted/50 px-2 py-2 text-sm leading-relaxed wrap-anywhere'
                  >
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
            <div className='min-w-0'>
              <h4 className='text-sm font-semibold'>{t('Records')}</h4>
              <div className='divide-y'>
                {[
                  {
                    label: t('Commission records'),
                    open: setCommissionsDialogOpen,
                  },
                  { label: t('Invited users'), open: setInviteesDialogOpen },
                  {
                    label: t('Withdrawal records'),
                    open: setWithdrawalRecordsOpen,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <Button
                      variant='ghost'
                      className='h-auto w-full justify-between gap-2 px-2 py-2 text-start whitespace-normal'
                      onClick={() => item.open(true)}
                    >
                      {item.label}
                      <ChevronRight aria-hidden='true' />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
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
