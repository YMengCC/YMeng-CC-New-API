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
  BellRing,
  CalendarCheck2,
  CircleDollarSign,
  Gift,
  ListChecks,
  Monitor,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'

export function FeatureOverviewCard() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Feature overview')}</CardTitle>
        <CardDescription>
          {t('Available bot commands and how they work')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='info' size='stat'>
            <ListChecks />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Command help')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              <Trans
                t={t}
                i18nKey='Send <command/> in a QQ group to list all available commands: bind, unbind, binding status, balance, sign-in, send red packet, claim red packet, status monitoring, admin recharge, and help.'
                components={{
                  command: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /帮助
                    </code>
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='info' size='stat'>
            <Monitor />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Status monitoring')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              <Trans
                t={t}
                i18nKey='Send <command/> in a QQ group to capture a full-page screenshot of <site/> and post it to the group chat. No QQ binding is required, with a 30-second cooldown per group.'
                components={{
                  command: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /状态监控
                    </code>
                  ),
                  site: (
                    <a
                      href='https://health.ymeng.cc/'
                      target='_blank'
                      rel='noopener noreferrer'
                      className='text-foreground hover:text-primary font-medium underline underline-offset-4'
                    >
                      https://health.ymeng.cc
                    </a>
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='destructive' size='stat'>
            <BellRing />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Failure alerts')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              {t(
                'When a status monitor fails 3 consecutive checks, an alert is automatically posted to the admin-configured QQ groups, showing the group, monitor name, failure count, and latest failure time. Only one alert per outage; recovery is not announced.'
              )}
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='success' size='stat'>
            <CalendarCheck2 />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Daily sign-in')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              <Trans
                t={t}
                i18nKey='Send <command/> in a QQ group. If your bound account spent at least 10 (in site display currency) yesterday (Beijing time), you receive a random 1.00–5.00 quota reward (two decimal places, weighted toward smaller amounts) credited directly to your YMeng CC balance. Limited to once per YMeng CC account per day.'
                components={{
                  command: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /签到
                    </code>
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='warning' size='stat'>
            <Gift />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Send red packets')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              <Trans
                t={t}
                i18nKey='Send <sendCommand/> in a QQ group (for example, /发红包 10 5). The amount is deducted from the sender’s bound YMeng CC balance, and group members send <claimCommand/> to claim.'
                components={{
                  sendCommand: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /发红包 &lt;总量&gt; &lt;个数&gt;
                    </code>
                  ),
                  claimCommand: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /领取红包 &lt;红包码&gt;
                    </code>
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='primary' size='stat'>
            <WalletCards />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Balance check')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              <Trans
                t={t}
                i18nKey='Send <command/> (or alias <aliasCommand/>) in a QQ group to check the bound account’s current balance, used quota, and raw quota directly from YMeng CC.'
                components={{
                  command: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /余额
                    </code>
                  ),
                  aliasCommand: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /查询余额
                    </code>
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <div className='flex items-start gap-3 rounded-lg border px-3 py-3'>
          <IconBadge tone='warning' size='stat'>
            <CircleDollarSign />
          </IconBadge>
          <div className='min-w-0'>
            <div className='text-sm font-medium'>{t('Admin recharge')}</div>
            <p className='text-muted-foreground mt-0.5 text-sm'>
              <Trans
                t={t}
                i18nKey='Admins can send <command/> to add balance directly to the YMeng CC account bound to that QQ number. Non-admins receive a permission error without modifying any balance.'
                components={{
                  command: (
                    <code className='bg-muted rounded px-1 py-0.5 text-xs'>
                      /充值 &lt;QQ号&gt; &lt;金额&gt;
                    </code>
                  ),
                }}
              />
            </p>
          </div>
        </div>
        <div className='text-muted-foreground flex items-center gap-2 pt-1 text-xs'>
          <Sparkles className='size-3.5 shrink-0' aria-hidden='true' />
          <span>
            {t(
              'Send /帮助 anytime to view all commands. Status monitoring works without binding; sign-in, red packets, and balance check require QQ binding first; recharge is limited to admins.'
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
