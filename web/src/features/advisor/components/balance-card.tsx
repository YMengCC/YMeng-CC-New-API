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
import { Activity, BarChart3, RefreshCw, WalletCards } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { CurrencyAmount } from '@/components/currency-display'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { UserProfile } from '@/features/profile/types'

interface BalanceCardProps {
  profile: UserProfile | null
  loading: boolean
  onRefresh: () => void | Promise<void>
}

export function BalanceCard({
  profile,
  loading,
  onRefresh,
}: BalanceCardProps) {
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const stats: {
    label: string
    value: ReactNode
    description: string
    icon: typeof WalletCards
    tone: IconBadgeTone
  }[] = [
    {
      label: '当前余额',
      value: <CurrencyAmount amount={profile?.quota ?? 0} mode='quota' />,
      description: '剩余额度',
      icon: WalletCards,
      tone: 'success',
    },
    {
      label: '累计已用',
      value: <CurrencyAmount amount={profile?.used_quota ?? 0} mode='quota' />,
      description: '总消耗额度',
      icon: BarChart3,
      tone: 'info',
    },
    {
      label: '请求次数',
      value: (profile?.request_count ?? 0).toLocaleString(),
      description: '累计调用次数',
      icon: Activity,
      tone: 'chart-4',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>账户余额</CardTitle>
            <CardDescription>
              {profile
                ? `账号：${profile.username}（ID ${profile.id}）`
                : '登录后显示你的 YMeng CC 账户额度'}
            </CardDescription>
          </div>
          <Button
            variant='outline'
            size='sm'
            onClick={refresh}
            disabled={refreshing || loading}
          >
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='grid grid-cols-3 divide-x rounded-lg border'>
            {['balance', 'usage', 'requests'].map((key) => (
              <div key={key} className='min-w-0 px-2.5 py-2.5 sm:px-5 sm:py-4'>
                <Skeleton className='h-3.5 w-full' />
                <Skeleton className='mt-2 h-6 w-full sm:h-7' />
                <Skeleton className='mt-1.5 hidden h-3.5 w-24 md:block' />
              </div>
            ))}
          </div>
        ) : (
          <div className='grid grid-cols-3 divide-x rounded-lg border'>
            {stats.map((item) => (
              <div
                key={item.label}
                className='min-w-0 px-2.5 py-2.5 sm:px-5 sm:py-4'
              >
                <div className='flex items-center gap-1.5 sm:gap-2.5'>
                  <IconBadge tone={item.tone} size='stat'>
                    <item.icon />
                  </IconBadge>
                  <div className='text-muted-foreground truncate text-[11px] font-medium tracking-wider uppercase sm:text-xs'>
                    {item.label}
                  </div>
                </div>
                <div className='text-foreground mt-1.5 font-mono text-sm font-bold tracking-tight break-all tabular-nums sm:mt-2.5 sm:text-2xl'>
                  {item.value}
                </div>
                <div className='text-muted-foreground/60 mt-1 hidden text-xs md:block'>
                  {item.description}
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && !profile ? (
          <p className='text-destructive mt-3 text-sm'>
            无法加载账户信息，请刷新页面后重试。
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
