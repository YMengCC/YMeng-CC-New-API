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
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  onToggleCollapsed: (collapsed: boolean) => void
  className?: string
}

type ConversationItemProps = {
  conversation: PlaygroundConversation
  isActive: boolean
  onSelect: () => void
  onRename: (title: string) => void
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
}: ConversationItemProps) {
  const { t } = useTranslation()
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState(conversation.title)
  const displayTitle =
    conversation.title === DEFAULT_CONVERSATION_TITLE
      ? t(DEFAULT_CONVERSATION_TITLE)
      : conversation.title

  const startRename = () => {
    setDraftTitle(displayTitle)
    setIsRenaming(true)
  }

  const commitRename = () => {
    onRename(draftTitle)
    setIsRenaming(false)
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-md border border-transparent px-1.5 py-1',
        isActive && 'bg-muted border-border/60',
        !isActive && 'hover:bg-muted/60'
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
          aria-current={isActive ? 'true' : undefined}
          className='focus-visible:ring-ring/50 min-w-0 flex-1 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none'
          onClick={onSelect}
          type='button'
        >
          <span className='block truncate text-sm font-medium'>
            {displayTitle}
          </span>
          <span className='text-muted-foreground block truncate text-xs'>
            {dayjs(conversation.updatedAt).format('YYYY-MM-DD HH:mm')}
          </span>
        </button>
      )}

      {!isRenaming && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={t('Conversation actions')}
                className='size-7 shrink-0'
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
                <PencilIcon className='mr-2 size-4' />
                {t('Rename')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

export function PlaygroundHistorySidebar({
  history,
  isCollapsed,
  isGenerating,
  onNewConversation,
  onSelectConversation,
  onRenameConversation,
  onToggleCollapsed,
  className,
}: PlaygroundHistorySidebarProps) {
  const { t } = useTranslation()
  const { conversations } = history

  const toggleLabel = isCollapsed
    ? t('Show conversation history')
    : t('Hide conversation history')

  return (
    <aside
      aria-label={t('Conversation history')}
      className={cn(
        'bg-card/40 flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-200',
        isCollapsed ? 'w-12' : 'w-60',
        className
      )}
    >
      <div className='flex items-center gap-1 border-b p-2'>
        {!isCollapsed && (
          <h2 className='text-foreground flex-1 truncate px-1 text-sm font-semibold'>
            {t('Conversation history')}
          </h2>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={toggleLabel}
                aria-expanded={!isCollapsed}
                className='size-8 shrink-0'
                onClick={() => onToggleCollapsed(!isCollapsed)}
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
      </div>

      <div className='p-2'>
        <Button
          aria-label={t('New chat')}
          className={cn('w-full justify-center gap-2', isCollapsed && 'px-0')}
          disabled={isGenerating}
          onClick={onNewConversation}
          size='sm'
          variant='outline'
        >
          <PlusIcon className='size-4' />
          {!isCollapsed && <span>{t('New chat')}</span>}
        </Button>
      </div>

      {isCollapsed ? null : (
        <ScrollArea className='min-h-0 flex-1'>
          {conversations.length === 0 ? (
            <Empty className='border-0'>
              <EmptyTitle>{t('No conversations yet')}</EmptyTitle>
              <EmptyDescription>
                {t('Start a new chat to see it here.')}
              </EmptyDescription>
            </Empty>
          ) : (
            <div className='space-y-0.5 px-2 pb-2'>
              {conversations.map((conversation) => (
                <ConversationItem
                  conversation={conversation}
                  isActive={conversation.id === history.activeId}
                  key={conversation.id}
                  onRename={(title) =>
                    onRenameConversation(conversation.id, title)
                  }
                  onSelect={() => onSelectConversation(conversation.id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </aside>
  )
}
