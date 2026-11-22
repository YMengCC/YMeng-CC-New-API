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
import { Sparkles } from 'lucide-react'

import { Main } from '@/components/layout'
import {
  CardStaggerContainer,
  CardStaggerItem,
} from '@/components/page-transition'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useProfile } from '@/features/profile/hooks'

import { BalanceCard } from './components/balance-card'
import { QqBindingCard } from './components/qq-binding-card'

export function Advisor() {
  const { profile, loading, refreshProfile } = useProfile()

  return (
    <Main>
      <div className='min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-4 sm:py-6'>
        <CardStaggerContainer className='mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-6'>
          <CardStaggerItem>
            <div className='flex items-center gap-3'>
              <div className='bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl'>
                <Sparkles className='size-6' />
              </div>
              <div className='min-w-0'>
                <h1 className='text-xl font-semibold tracking-tight'>
                  萌萌的专属顾问
                </h1>
                <p className='text-muted-foreground text-sm'>
                  你的 New API 账户小助手
                </p>
              </div>
            </div>
          </CardStaggerItem>

          <CardStaggerItem>
            <BalanceCard
              profile={profile}
              loading={loading}
              onRefresh={refreshProfile}
            />
          </CardStaggerItem>

          <CardStaggerItem>
            <QqBindingCard />
          </CardStaggerItem>

          <CardStaggerItem>
            <Card>
              <CardHeader>
                <CardTitle>更多功能</CardTitle>
                <CardDescription>
                  正在准备中，后续会在这里陆续上线。
                </CardDescription>
              </CardHeader>
            </Card>
          </CardStaggerItem>
        </CardStaggerContainer>
      </div>
    </Main>
  )
}
