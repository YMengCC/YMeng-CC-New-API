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
import { act, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { expect, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { FeatureOverviewCard } from '../components/feature-overview-card'

test('keeps /帮助 as the first command when the feature overview renders', () => {
  render(<FeatureOverviewCard />)

  const commands = screen.getAllByRole('code').map((el) => el.textContent)
  expect(commands).toEqual([
    '/帮助',
    '/状态监控',
    '/签到',
    '/发红包 <总量> <个数>',
    '/领取红包 <红包码>',
    '/余额',
    '/查询余额',
    '/充值 <QQ号> <金额>',
  ])
})

test('renders the /状态监控 and /充值 command details across locales', async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    resources: { en, zhCN: zh, zhTW },
  })

  render(
    <I18nextProvider i18n={i18n}>
      <FeatureOverviewCard />
    </I18nextProvider>
  )

  expect(screen.getByText('Feature overview')).toBeVisible()
  expect(screen.getByText('Status monitoring')).toBeVisible()
  expect(screen.getByText('Failure alerts')).toBeVisible()
  expect(
    screen.getByText(
      /fails 3 consecutive checks.*Only one alert per outage.*recovery notice is posted/
    )
  ).toBeVisible()
  expect(screen.getByText('Admin recharge')).toBeVisible()
  expect(screen.getByText('/状态监控', { selector: 'code' })).toBeVisible()
  expect(
    screen.getByText('/充值 <QQ号> <金额>', { selector: 'code' })
  ).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'https://health.ymeng.cc' })
  ).toHaveAttribute('href', 'https://health.ymeng.cc/')
  expect(
    screen.getByText(/No QQ binding is required.*30-second cooldown/)
  ).toBeVisible()
  expect(
    screen.getByText(/Non-admins receive a permission error/)
  ).toBeVisible()

  await act(() => i18n.changeLanguage('zhCN'))

  expect(screen.getByText('功能一览')).toBeVisible()
  expect(screen.getByText('状态监控')).toBeVisible()
  expect(screen.getByText('故障告警')).toBeVisible()
  expect(
    screen.getByText(
      /连续 3 次检查失败.*同一次故障只推送一条.*恢复后推送恢复通知/
    )
  ).toBeVisible()
  expect(screen.getByText('管理员充值')).toBeVisible()
  expect(screen.getByText('/状态监控', { selector: 'code' })).toBeVisible()
  expect(
    screen.getByText('/充值 <QQ号> <金额>', { selector: 'code' })
  ).toBeVisible()
  expect(
    screen.getByRole('link', { name: 'https://health.ymeng.cc' })
  ).toHaveAttribute('href', 'https://health.ymeng.cc/')
  expect(
    screen.getByText(/整页截图并发送到群聊；无需绑定 QQ 即可使用.*30 秒/)
  ).toBeVisible()
  expect(
    screen.getByText(
      /状态监控无需绑定，签到、发红包与余额查询需先完成 QQ 绑定，充值仅限管理员使用/
    )
  ).toBeVisible()

  await act(() => i18n.changeLanguage('zhTW'))

  expect(screen.getByText('功能一覽')).toBeVisible()
  expect(screen.getByText('狀態監控')).toBeVisible()
  expect(screen.getByText('故障告警')).toBeVisible()
  expect(
    screen.getByText(
      /連續 3 次檢查失敗.*同一故障只推送一則.*恢復後推送恢復通知/
    )
  ).toBeVisible()
  expect(screen.getByText('管理員儲值')).toBeVisible()
  expect(screen.getByText('/状态监控', { selector: 'code' })).toBeVisible()
  expect(
    screen.getByText('/充值 <QQ号> <金额>', { selector: 'code' })
  ).toBeVisible()
})
