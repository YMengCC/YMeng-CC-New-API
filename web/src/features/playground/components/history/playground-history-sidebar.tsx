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
  DownloadIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import { DEFAULT_CONVERSATION_TITLE } from '../../constants'
import type { PlaygroundConversation, PlaygroundHistory } from '../../types'

type PlaygroundHistorySidebarProps = {
  history: PlaygroundHistory
  isCollapsed: boolean
  isGenerating: boolean
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
  onRenameConversation: (id: string, title: string) => void
  onDeleteConversation: (id: string) => void
  onClearHistory: () => void
  onExportHistory: () => void
  onImportHistory: () => void
  onToggleCollapsed: (collapsed: boolean) => void
  className?: string
}

type ConversationItemProps = {
  conversation: PlaygroundConversation
  isActive: boolean
  isDisabled: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

function ConversationItem(props: ConversationItemProps) {
  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(props.conversation.title)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const displayTitle =
    props.conversation.title === DEFAULT_CONVERSATION_TITLE
      ? t(DEFAULT_CONVERSATION_TITLE)
      : props.conversation.title

  const startRename = () => {
    setDraftTitle(displayTitle)
    setIsRenaming(true)
  }

  const commitRename = () => {
    props.onRename(draftTitle)
    setIsRenaming(false)
  }

  const handleDelete = () => {
    props.onDelete()
    setDeleteConfirmOpen(false)
    toast.success(t('Conversation deleted'))
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors',
        props.isActive &&
          'border-border/80 bg-background ring-primary/10 shadow-xs ring-1',
        !props.isActive && 'hover:bg-muted/70'
      )}
    >
      {isRenaming ? (
        <Input
          aria-label={t('Conversation title')}
          autoFocus
          className='h-8 min-w-0 flex-1 text-sm'
          onChange={(event) => setDraftTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitRename()
            if (event.key === 'Escape') setIsRenaming(false)
          }}
          value={draftTitle}
        />
      ) : (
        <button
          aria-current={props.isActive ? 'true' : undefined}
          className='focus-visible:ring-ring/50 min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none'
          onClick={props.onSelect}
          type='button'
        >
          <span className='block truncate text-sm font-medium'>
            {displayTitle}
          </span>
          <span className='text-muted-foreground mt-0.5 block truncate text-[11px] tabular-nums'>
            {dayjs(props.conversation.updatedAt).format('YYYY-MM-DD HH:mm')}
          </span>
        </button>
      )}

      {!isRenaming && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t('Conversation actions')}
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
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={startRename}>
                <PencilIcon />
                {t('Rename')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2Icon />
                {t('Delete')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        destructive
        desc={t('This conversation will be permanently deleted.')}
        confirmText={t('Delete')}
        handleConfirm={handleDelete}
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('Delete conversation?')}
      />
    </div>
  )
}

export function PlaygroundHistorySidebar(props: PlaygroundHistorySidebarProps) {
  const { t } = useTranslation()
  const conversations = props.history.conversations
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  const handleClearHistory = () => {
    props.onClearHistory()
    setClearConfirmOpen(false)
    toast.success(t('Conversation history cleared'))
  }

  const toggleLabel = props.isCollapsed
    ? t('Show conversation history')
    : t('Hide conversation history')

  return (
    <aside
      aria-label={t('Conversation history')}
      className={cn(
        'border-border/80 bg-muted/25 flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-200',
        props.isCollapsed ? 'w-12' : 'w-64',
        props.className
      )}
    >
      <div
        className={cn(
          'border-border/80 flex h-12 shrink-0 items-center gap-1 border-b',
          props.isCollapsed ? 'justify-center px-1' : 'px-2.5'
        )}
      >
        {!props.isCollapsed && (
          <>
            <h2 className='text-foreground min-w-0 flex-1 truncate px-1 text-xs font-semibold tracking-wide'>
              {t('Conversation history')}
            </h2>
            {conversations.length > 0 && (
              <Badge
                className='h-5 px-1.5 text-[11px] tabular-nums'
                variant='secondary'
              >
                {conversations.length}
              </Badge>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('Clear conversation history')}
                    className='text-muted-foreground hover:text-destructive size-8 shrink-0'
                    disabled={props.isGenerating || conversations.length === 0}
                    onClick={() => setClearConfirmOpen(true)}
                    size='icon-sm'
                    variant='ghost'
                  />
                }
              >
                <Trash2Icon className='size-4' />
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('Clear conversation history')}</p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={toggleLabel}
                aria-expanded={!props.isCollapsed}
                className='text-muted-foreground hover:text-foreground size-8 shrink-0'
                onClick={() => props.onToggleCollapsed(!props.isCollapsed)}
                size='icon-sm'
                variant='ghost'
              />
            }
          >
            {props.isCollapsed ? (
              <PanelLeftOpenIcon className='size-4' />
            ) : (
              <PanelLeftCloseIcon className='size-4' />
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>{toggleLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className={cn(props.isCollapsed ? 'p-2' : 'p-2.5')}>
        <Button
          aria-label={t('New chat')}
          className={cn(
            props.isCollapsed
              ? 'mx-auto flex size-8 p-0'
              : 'h-9 w-full justify-center gap-2 shadow-xs'
          )}
          disabled={props.isGenerating}
          onClick={props.onNewConversation}
          size={props.isCollapsed ? 'icon-sm' : 'sm'}
        >
          <PlusIcon className='size-4' />
          {!props.isCollapsed && <span>{t('New chat')}</span>}
        </Button>
      </div>

      {props.isCollapsed ? null : (
        <>
          <ScrollArea className='min-h-0 flex-1'>
            {conversations.length === 0 ? (
              <Empty className='border-0'>
                <EmptyTitle>{t('No conversations yet')}</EmptyTitle>
                <EmptyDescription>
                  {t('Start a new chat to see it here.')}
                </EmptyDescription>
              </Empty>
            ) : (
              <div className='space-y-1 px-2.5 pb-3'>
                {conversations.map((conversation) => (
                  <ConversationItem
                    conversation={conversation}
                    isActive={conversation.id === props.history.activeId}
                    isDisabled={props.isGenerating}
                    key={conversation.id}
                    onDelete={() => props.onDeleteConversation(conversation.id)}
                    onRename={(title) =>
                      props.onRenameConversation(conversation.id, title)
                    }
                    onSelect={() => props.onSelectConversation(conversation.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          <div className='border-border/80 flex shrink-0 items-center gap-1.5 border-t p-2.5'>
            <Button
              className='h-8 min-w-0 flex-1 gap-1.5'
              disabled={props.isGenerating || conversations.length === 0}
              onClick={props.onExportHistory}
              size='sm'
              type='button'
              variant='outline'
            >
              <DownloadIcon aria-hidden='true' className='size-3.5 shrink-0' />
              <span className='truncate'>{t('Export')}</span>
            </Button>
            <Button
              className='h-8 min-w-0 flex-1 gap-1.5'
              disabled={props.isGenerating}
              onClick={props.onImportHistory}
              size='sm'
              type='button'
              variant='outline'
            >
              <UploadIcon aria-hidden='true' className='size-3.5 shrink-0' />
              <span className='truncate'>{t('Import')}</span>
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        destructive
        desc={t('All conversation history will be permanently deleted.')}
        confirmText={t('Clear')}
        handleConfirm={handleClearHistory}
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title={t('Clear conversation history?')}
      />
    </aside>
  )
}
