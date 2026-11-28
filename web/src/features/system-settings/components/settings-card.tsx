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
import { memo, type ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

type SettingsCardProps = {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export const SettingsCard = memo(function SettingsCard(
  props: SettingsCardProps
) {
  return (
    <Card className={cn('min-w-0', props.className)}>
      <CardHeader>
        {props.action ? (
          <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
            <div className='min-w-0 space-y-1'>
              <CardTitle>{props.title}</CardTitle>
              {props.description ? (
                <CardDescription>{props.description}</CardDescription>
              ) : null}
            </div>
            <div className='flex shrink-0 flex-wrap items-center gap-2'>
              {props.action}
            </div>
          </div>
        ) : (
          <>
            <CardTitle>{props.title}</CardTitle>
            {props.description ? (
              <CardDescription>{props.description}</CardDescription>
            ) : null}
          </>
        )}
      </CardHeader>
      <CardContent className={cn('min-w-0', props.contentClassName)}>
        {props.children}
      </CardContent>
    </Card>
  )
})
