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
import type { CSSProperties } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUserAvatar } from '@/hooks/use-user-avatar'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { cn } from '@/lib/utils'

interface UserAvatarProps {
  userId?: number
  /** Bumps on avatar upload/removal; 0 or absent means no uploaded avatar. */
  avatarVersion?: number
  /** Name used for initials and the generated fallback color. */
  name?: string
  className?: string
  fallbackClassName?: string
  imageClassName?: string
  style?: CSSProperties
  alt?: string
}

/**
 * One user avatar: the uploaded image when the user has one, otherwise the
 * initials block used across the dashboard since before uploads existed.
 */
export function UserAvatar(props: UserAvatarProps) {
  const url = useUserAvatar(props.userId, props.avatarVersion)
  const name = props.name?.trim() || '?'

  return (
    <Avatar className={props.className} style={props.style}>
      {url ? (
        <AvatarImage
          src={url}
          alt={props.alt ?? name}
          className={props.imageClassName}
        />
      ) : null}
      <AvatarFallback
        className={cn('font-semibold text-white', props.fallbackClassName)}
        style={getUserAvatarStyle(name)}
      >
        {getUserAvatarFallback(name)}
      </AvatarFallback>
    </Avatar>
  )
}
