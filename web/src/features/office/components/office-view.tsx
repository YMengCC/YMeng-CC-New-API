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
import { BriefcaseBusinessIcon, HistoryIcon, PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

import { useOfficeFiles } from '../hooks/use-office-files'
import { useOfficeOptions } from '../hooks/use-office-options'
import { useOfficeSessions } from '../hooks/use-office-sessions'
import { useOfficeTurn } from '../hooks/use-office-turn'
import { buildOfficeTurns } from '../lib/office-timeline'
import { OfficeContextPanel } from './office-context-panel'
import { OfficeFiles } from './office-files'
import { OfficeInput } from './office-input'
import { OfficeSessionList } from './office-session-list'
import { OfficeTimeline } from './office-timeline'

/** The office mode of the playground: Codex does the work, the admin watches. */
export function OfficeView() {
  const { t } = useTranslation()
  const sessions = useOfficeSessions()
  const turn = useOfficeTurn(sessions.activeId)
  const files = useOfficeFiles(sessions.activeId)
  const options = useOfficeOptions()
  const [isMobileListOpen, setIsMobileListOpen] = useState(false)

  const turns = useMemo(() => buildOfficeTurns(turn.events), [turn.events])
  const activeTitle =
    sessions.sessions.find((session) => session.id === sessions.activeId)
      ?.title || t('New office task')

  const createTask = () => sessions.createSession.mutate()
  const sessionListProps = {
    activeId: sessions.activeId,
    isDisabled: turn.isRunning || sessions.createSession.isPending,
    sessions: sessions.sessions,
    onDelete: (id: string) => sessions.deleteSession.mutate(id),
    onNew: createTask,
    onSelect: (id: string) => {
      sessions.setActiveId(id)
      setIsMobileListOpen(false)
    },
  }

  const fileProps = {
    files: files.files,
    isDeleteDisabled: turn.isRunning,
    isDeleting: files.remove.isPending,
    isLoading: files.isLoading,
    isUploading: files.upload.isPending,
    onDownload: files.download,
    onRemove: (path: string) => files.remove.mutate(path),
    onUpload: (list: File[]) => void files.uploadFiles(list),
  }
  const hasActiveSession = sessions.activeId !== ''

  return (
    <div className='relative flex size-full min-h-0 overflow-hidden'>
      <div className='hidden md:flex'>
        <OfficeSessionList {...sessionListProps} />
      </div>

      <div className='bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        <header className='flex min-h-16 shrink-0 items-center gap-2 border-b px-3 md:px-4'>
          <div className='md:hidden'>
            <Sheet onOpenChange={setIsMobileListOpen} open={isMobileListOpen}>
              <SheetTrigger
                render={
                  <Button
                    aria-label={t('Office tasks')}
                    size='icon-sm'
                    variant='ghost'
                  />
                }
              >
                <HistoryIcon className='size-4' />
              </SheetTrigger>
              <SheetContent className='w-72 p-0' side='left'>
                <SheetTitle className='sr-only'>{t('Office tasks')}</SheetTitle>
                <OfficeSessionList
                  {...sessionListProps}
                  className='bg-background w-full border-r-0'
                />
              </SheetContent>
            </Sheet>
          </div>
          <div className='min-w-0 flex-1'>
            <h1 className='truncate text-sm font-semibold'>
              {hasActiveSession ? activeTitle : t('Office tasks')}
            </h1>
            {hasActiveSession && (
              <p className='text-muted-foreground hidden text-[11px] sm:block'>
                Codex · {t('Office')}
              </p>
            )}
          </div>
          {hasActiveSession && (
            <Badge
              className='hidden sm:inline-flex'
              variant={turn.isRunning ? 'secondary' : 'outline'}
            >
              <span
                aria-hidden='true'
                className={
                  turn.isRunning
                    ? 'bg-primary size-1.5 animate-pulse rounded-full'
                    : 'bg-success size-1.5 rounded-full'
                }
              />
              {turn.isRunning ? t('Working on it…') : t('Ready')}
            </Badge>
          )}
          {hasActiveSession && (
            <div className='xl:hidden'>
              <OfficeFiles {...fileProps} />
            </div>
          )}
        </header>

        {!hasActiveSession ? (
          <EmptyState
            action={
              <Button
                disabled={sessions.createSession.isPending}
                onClick={createTask}
                variant='outline'
              >
                <PlusIcon data-icon='inline-start' />
                {t('New office task')}
              </Button>
            }
            className='flex-1'
            description={t(
              'Codex will do the work in an isolated workspace and show every step here.'
            )}
            icon={BriefcaseBusinessIcon}
            title={t('No office task open')}
          />
        ) : (
          <div className='flex min-h-0 flex-1'>
            <div className='flex min-w-0 flex-1 flex-col'>
              <Conversation>
                <ConversationContent className='p-0'>
                  <OfficeTimelineArea
                    error={turn.eventsError}
                    isLoading={turn.isLoadingEvents}
                    onRetry={() => void turn.retryEvents()}
                    turns={turns}
                  />
                </ConversationContent>
                <ConversationScrollButton
                  aria-label={t('Scroll to bottom')}
                  className='shadow-sm'
                />
              </Conversation>
              <OfficeInput
                disabled={options.models.length === 0}
                groupValue={options.group}
                groups={options.groups}
                isModelLoading={options.isLoadingModels}
                isRunning={turn.isRunning}
                modelValue={options.model}
                models={options.models}
                onDropFiles={fileProps.onUpload}
                onGroupChange={options.onGroupChange}
                onModelChange={options.onModelChange}
                onSubmit={(text) =>
                  void turn.send(text, options.model, options.group)
                }
                onStop={turn.stop}
              />
            </div>
            <OfficeContextPanel
              {...fileProps}
              isRunning={turn.isRunning}
              model={options.model}
            />
          </div>
        )}
      </div>
    </div>
  )
}

type OfficeTimelineAreaProps = {
  error: unknown
  isLoading: boolean
  turns: ReturnType<typeof buildOfficeTurns>
  onRetry: () => void
}

/** The recorded turns, or why none can be shown right now. */
function OfficeTimelineArea(props: OfficeTimelineAreaProps) {
  const { t } = useTranslation()

  if (props.isLoading) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-6'>
        <LoadingState message={t('Loading the office task…')} />
      </div>
    )
  }
  if (props.error) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-6'>
        <ErrorState
          description={t(
            'The recorded steps of this task could not be loaded.'
          )}
          onRetry={props.onRetry}
        />
      </div>
    )
  }
  if (props.turns.length === 0) {
    return (
      <div className='flex min-h-[50vh] items-center justify-center p-6'>
        <EmptyState
          className='w-full'
          description={t(
            'Describe the task below. Codex will plan, run commands and change files in its workspace.'
          )}
          icon={BriefcaseBusinessIcon}
          title={t('Nothing has been asked yet')}
        />
      </div>
    )
  }
  return <OfficeTimeline turns={props.turns} />
}
