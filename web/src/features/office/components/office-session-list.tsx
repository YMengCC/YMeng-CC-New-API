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
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import type { OfficeSession } from '../types'

type OfficeSessionListProps = {
  sessions: OfficeSession[]
  activeId: string
  /** A running task stops when the open session changes. */
  isDisabled: boolean
  isCollapsed?: boolean
  className?: string
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onToggleCollapsed?: (collapsed: boolean) => void
}

const UNTITLED_TASK = 'New office task'

/** Office sessions of the admin; each one owns a workspace on the server. */
export function OfficeSessionList(props: OfficeSessionListProps) {
  const { t } = useTranslation()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const isCollapsed = props.isCollapsed ?? false

  const confirmDelete = () => {
    if (pendingDeleteId) props.onDelete(pendingDeleteId)
    setPendingDeleteId(null)
    toast.success(t('Office task deleted'))
  }

  const toggleLabel = isCollapsed
    ? t('Show office tasks')
    : t('Hide office tasks')

  return (
    <aside
      aria-label={t('Office tasks')}
      className={cn(
        'border-border/80 bg-muted/25 flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-200',
        isCollapsed ? 'w-12' : 'w-64',
        props.className
      )}
    >
      <div
        className={cn(
          'border-border/80 flex h-12 shrink-0 items-center gap-1 border-b',
          isCollapsed ? 'justify-center px-1' : 'px-2.5'
        )}
      >
        {!isCollapsed && (
          <>
            <h2 className='text-foreground min-w-0 flex-1 truncate px-1 text-xs font-semibold tracking-wide'>
              {t('Office tasks')}
            </h2>
            {props.sessions.length > 0 && (
              <Badge
                className='h-5 px-1.5 text-[11px] tabular-nums'
                variant='secondary'
              >
                {props.sessions.length}
              </Badge>
            )}
          </>
        )}
        {props.onToggleCollapsed && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={toggleLabel}
                  aria-expanded={!isCollapsed}
                  className='text-muted-foreground hover:text-foreground size-8 shrink-0'
                  onClick={() => props.onToggleCollapsed?.(!isCollapsed)}
                  size='icon-sm'
                  variant='ghost'
                />
              }
            >
              {isCollapsed ? (
                <PanelLeftOpenIcon className='size-4' />
              ) : (
                <PanelLeftCloseIcon className='size-4' />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{toggleLabel}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className={cn(isCollapsed ? 'p-2' : 'p-2.5')}>
        <Button
          aria-label={t('New office task')}
          className={cn(
            isCollapsed
              ? 'mx-auto flex size-8 p-0'
              : 'h-9 w-full justify-center gap-2 shadow-xs'
          )}
          disabled={props.isDisabled}
          onClick={props.onNew}
          size={isCollapsed ? 'icon-sm' : 'sm'}
        >
          <PlusIcon className='size-4' />
          {!isCollapsed && <span>{t('New office task')}</span>}
        </Button>
      </div>

      {isCollapsed ? null : (
        <ScrollArea className='min-h-0 flex-1'>
          {props.sessions.length === 0 ? (
            <div className='px-2'>
              <EmptyState
                description={t('Start a new task to see it here.')}
                title={t('No office tasks yet')}
              />
            </div>
          ) : (
            <div className='space-y-1 px-2.5 pb-3'>
              {props.sessions.map((session) => (
                <OfficeSessionItem
                  isActive={session.id === props.activeId}
                  isDisabled={props.isDisabled}
                  key={session.id}
                  session={session}
                  onDelete={() => setPendingDeleteId(session.id)}
                  onSelect={() => props.onSelect(session.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      )}

      <ConfirmDialog
        destructive
        confirmText={t('Delete')}
        desc={t(
          'The task and its workspace files will be permanently deleted.'
        )}
        handleConfirm={confirmDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        open={pendingDeleteId !== null}
        title={t('Delete office task?')}
      />
    </aside>
  )
}

type OfficeSessionItemProps = {
  session: OfficeSession
  isActive: boolean
  isDisabled: boolean
  onSelect: () => void
  onDelete: () => void
}

function OfficeSessionItem(props: OfficeSessionItemProps) {
  const { t } = useTranslation()
  const title = props.session.title || t(UNTITLED_TASK)

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors',
        props.isActive &&
          'border-border/80 bg-background ring-primary/10 shadow-xs ring-1',
        !props.isActive && 'hover:bg-muted/70'
      )}
    >
      <button
        aria-current={props.isActive ? 'true' : undefined}
        className='focus-visible:ring-ring/50 min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none'
        onClick={props.onSelect}
        type='button'
      >
        <span className='block truncate text-sm font-medium'>{title}</span>
        <span className='text-muted-foreground mt-0.5 block truncate text-[11px] tabular-nums'>
          {dayjs(props.session.updatedAt).format('YYYY-MM-DD HH:mm')}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t('Office task actions')}
              className='text-muted-foreground hover:text-foreground size-7 shrink-0 opacity-70 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100'
              disabled={props.isDisabled}
              size='icon-sm'
              variant='ghost'
            />
          }
        >
          <MoreHorizontalIcon className='size-4' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end'>
          <DropdownMenuItem
            className='text-destructive focus:text-destructive'
            onClick={props.onDelete}
          >
            <Trash2Icon />
            {t('Delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
