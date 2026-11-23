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
import {
  CalendarCheck2,
  Gift,
  ListChecks,
  Sparkles,
  WalletCards,
} from 'lucide-react'

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
          <IconBadge tone='info' size='stat'>
            <ListChecks />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>帮助查询</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              在 QQ 群发送{' '}
              <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                /帮助
              </code>
              ，机器人会返回当前全部可用指令：绑定、解绑、绑定状态、余额、签到、发红包、领取红包与帮助。
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='success' size='stat'>
            <CalendarCheck2 />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>每日签到</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              在 QQ 群发送{' '}
              <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                /签到
              </code>
              。机器人统计绑定账号北京时间昨日的消费，达到 10（站点显示货币）即可随机获得
              1.00–5.00 额度（两位小数，金额越大抽中概率越低），直接计入 New API
              余额；每个 New API 账号每天限一次。
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='warning' size='stat'>
            <Gift />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>发红包</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              在 QQ 群发送{' '}
              <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                /发红包 &lt;总量&gt; &lt;个数&gt;
              </code>
              （例如 /发红包 10 5）。费用从发送者自己绑定的 New API
              余额扣除；群友发送{' '}
              <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                /领取红包 &lt;红包码&gt;
              </code>{' '}
              领取。
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='primary' size='stat'>
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
          发送 /帮助 可随时查看全部指令；签到、发红包与余额查询需先完成 QQ 绑定。
        </div>
      </CardContent>
    </Card>
  )
}
