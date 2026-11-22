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
import { Sparkles, WalletCards } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'

export function FeatureOverviewCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>功能一览</CardTitle>
        <CardDescription>当前已上线的功能与用途</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='success' size='stat'>
            <WalletCards />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>余额查询</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              在 QQ 群发送{' '}
              <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                /余额
              </code>
              （别名{' '}
              <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                /查询余额
              </code>
              ），机器人会返回当前绑定账号的余额、已用额度和原始额度，数据直接来自
              New API。
            </p>
          </div>
        </div>
        <div className='text-muted-foreground flex items-center gap-2 pt-1 text-xs'>
          <Sparkles className='size-3.5' />
          更多功能正在准备中，后续会在这里上线。
        </div>
      </CardContent>
    </Card>
  )
}
