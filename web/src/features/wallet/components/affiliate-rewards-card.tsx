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
import { ArrowRight, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { CurrencyAmount } from '@/components/currency-display'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { AffiliateSummary } from '@/features/affiliate/api'

import type { UserWalletData } from '../types'
import { AffiliateCommissionsDialog } from './dialogs/affiliate-commissions-dialog'
import { AffiliateInviteesDialog } from './dialogs/affiliate-invitees-dialog'
import { WithdrawalRecordsDialog } from './dialogs/withdrawal-records-dialog'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  summary?: AffiliateSummary
  availableQuota: number
  affiliateLink: string
  onTransfer: () => void
  onWithdraw: () => void
  withdrawalAvailable?: boolean
  complianceConfirmed?: boolean
  loading?: boolean
}

export function AffiliateRewardsCard({
  user,
  summary,
  availableQuota,
  affiliateLink,
  onTransfer,
  onWithdraw,
  withdrawalAvailable = false,
  complianceConfirmed = true,
  loading,
}: AffiliateRewardsCardProps) {
  const { t } = useTranslation()
  const [commissionsDialogOpen, setCommissionsDialogOpen] = useState(false)
  const [inviteesDialogOpen, setInviteesDialogOpen] = useState(false)
  const [withdrawalRecordsOpen, setWithdrawalRecordsOpen] = useState(false)

  if (loading) {
    return (
      <Card data-card-hover='false' className='bg-muted/20 py-0'>
        <CardContent className='grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,0.72fr)_minmax(320px,1.15fr)] lg:items-center'>
          <div>
            <Skeleton className='h-5 w-32' />
            <Skeleton className='mt-2 h-4 w-48' />
          </div>
          <Skeleton className='h-14 rounded-lg' />
          <Skeleton className='h-10 rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  const totalEarned = summary?.total_quota ?? user?.aff_history_quota ?? 0
  const inviteeCount = summary?.invitee_count ?? user?.aff_count ?? 0
  const commissionCount = summary?.commission_count ?? 0
  const hasRewards = availableQuota > 0

  return (
    <>
      <Card data-card-hover='false' className='bg-muted/20 py-0'>
        <CardContent className='grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(200px,1fr)_minmax(180px,0.65fr)_minmax(280px,1fr)] lg:items-center'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <IconBadge tone='chart-3'>
              <Share2 />
            </IconBadge>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <h3 className='truncate text-sm font-semibold'>
                  {t('Referral Program')}
                </h3>
                {summary ? (
                  <Badge variant='secondary' className='text-[11px]'>
                    {t('Commission rate: {{rate}}%', {
                      rate: summary.rate_percent,
                    })}
                  </Badge>
                ) : null}
              </div>
              <p className='text-muted-foreground line-clamp-1 text-xs'>
                {t(
                  'Earn commission when your invited users spend wallet balance. Transfer commission to your balance or request a withdrawal.'
                )}
              </p>
            </div>
          </div>

          <div className='grid grid-cols-4 gap-1.5 text-center'>
            {[
              {
                key: 'available',
                label: t('Available'),
                value: <CurrencyAmount amount={availableQuota} mode='quota' />,
              },
              {
                key: 'total-earned',
                label: t('Total Earned'),
                value: <CurrencyAmount amount={totalEarned} mode='quota' />,
              },
              {
                key: 'invites',
                label: t('Invites'),
                value: String(inviteeCount),
              },
              {
                key: 'records',
                label: t('Records'),
                value: String(commissionCount),
              },
            ].map((item) => (
              <div key={item.key}>
                <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
                  {item.label}
                </div>
                <div className='mt-0.5 truncate text-sm font-semibold tabular-nums'>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div className='flex items-center gap-2'>
            <Input
              value={affiliateLink}
              readOnly
              className='border-muted bg-background/70 h-9 min-w-0 flex-1 font-mono text-xs'
            />
            <CopyButton
              value={affiliateLink}
              variant='outline'
              className='bg-background size-9 shrink-0'
              iconClassName='size-4'
              tooltip={t('Copy referral link')}
              aria-label={t('Copy referral link')}
            />
            <div
              role='group'
              aria-label={t('Referral reward actions')}
              className='flex shrink-0 flex-col gap-2'
            >
              <Button
                onClick={onTransfer}
                disabled={!hasRewards || !complianceConfirmed}
                className='h-9 px-3'
                size='sm'
              >
                {t('Transfer to Balance')}
              </Button>
              <Button
                onClick={onWithdraw}
                disabled={!withdrawalAvailable || !complianceConfirmed}
                className='h-9 px-3'
                size='sm'
              >
                {t('Withdraw')}
              </Button>
            </div>
          </div>

          <div className='flex flex-wrap items-center gap-x-3 gap-y-1 lg:col-span-3'>
            {!hasRewards ? (
              <p className='text-muted-foreground text-xs'>
                {t('No referral rewards available to transfer or withdraw')}
              </p>
            ) : null}
            {hasRewards && !withdrawalAvailable ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Withdrawal is unavailable until your referral rewards balance is loaded'
                )}
              </p>
            ) : null}
            <Button
              variant='link'
              size='sm'
              className='h-auto p-0 text-xs'
              onClick={() => setCommissionsDialogOpen(true)}
            >
              {t('Commission records')}
              <ArrowRight className='size-3' />
            </Button>
            <Button
              variant='link'
              size='sm'
              className='h-auto p-0 text-xs'
              onClick={() => setInviteesDialogOpen(true)}
            >
              {t('Invited users')}
              <ArrowRight className='size-3' />
            </Button>
            <Button
              variant='link'
              size='sm'
              className='h-auto p-0 text-xs'
              onClick={() => setWithdrawalRecordsOpen(true)}
            >
              {t('Withdrawal records')}
              <ArrowRight className='size-3' />
            </Button>
            {summary && !summary.enabled ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'The affiliate program is currently disabled. Existing balances are kept, but no new commission is settled.'
                )}
              </p>
            ) : null}
            {!complianceConfirmed ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Referral reward transfers and withdrawals are disabled until the administrator confirms compliance terms.'
                )}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

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
