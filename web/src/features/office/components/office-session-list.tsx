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
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import type { OfficeSession } from '../types'

type OfficeSessionListProps = {
  sessions: OfficeSession[]
  activeId: string
  /** A running task stops when the open session changes. */
  isDisabled: boolean
  className?: string
  onNew: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

const UNTITLED_TASK = 'New office task'

/** Office sessions of the admin; each one owns a workspace on the server. */
export function OfficeSessionList(props: OfficeSessionListProps) {
  const { t } = useTranslation()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const confirmDelete = () => {
    if (pendingDeleteId) props.onDelete(pendingDeleteId)
    setPendingDeleteId(null)
    toast.success(t('Office task deleted'))
  }

  return (
    <aside
      aria-label={t('Office tasks')}
      className={cn(
        'bg-muted/20 flex min-h-0 w-64 shrink-0 flex-col border-r',
        props.className
      )}
    >
      <div className='flex min-h-14 items-center gap-1 border-b px-4 py-2'>
        <h2 className='text-foreground flex-1 truncate text-xs font-semibold tracking-wide'>
          {t('Office tasks')}
        </h2>
      </div>
      <div className='p-2'>
        <Button
          aria-label={t('New office task')}
          className='bg-background w-full justify-center gap-2'
          disabled={props.isDisabled}
          onClick={props.onNew}
          size='sm'
          variant='outline'
        >
          <PlusIcon className='size-4' />
          <span>{t('New office task')}</span>
        </Button>
      </div>
      <ScrollArea className='min-h-0 flex-1'>
        {props.sessions.length === 0 ? (
          <div className='px-2'>
            <EmptyState
              description={t('Start a new task to see it here.')}
              title={t('No office tasks yet')}
            />
          </div>
        ) : (
          <div className='space-y-0.5 px-2 pb-2'>
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
        'group flex items-center gap-1 rounded-md border border-transparent px-1.5 py-1',
        props.isActive && 'bg-background border-border/60 shadow-xs',
        !props.isActive && 'hover:bg-muted/60'
      )}
    >
      <button
        aria-current={props.isActive ? 'true' : undefined}
        className='focus-visible:ring-ring/50 min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none'
        onClick={props.onSelect}
        type='button'
      >
        <span className='block truncate text-sm font-medium'>{title}</span>
        <span className='text-muted-foreground block truncate text-[11px]'>
          {dayjs(props.session.updatedAt).format('YYYY-MM-DD HH:mm')}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t('Office task actions')}
              className='size-7 shrink-0'
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
