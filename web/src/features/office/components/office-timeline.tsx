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
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  FileDiffIcon,
  SparklesIcon,
  TerminalIcon,
  WrenchIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { IconBadge } from '@/components/ui/icon-badge'
import { Spinner } from '@/components/ui/spinner'
import { translateServerText } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import type { OfficeFileChange, OfficeItem, OfficeTurn } from '../types'

type OfficeTimelineProps = {
  turns: OfficeTurn[]
}

/** Every prompt of the session and what the agent did in answer to it. */
export function OfficeTimeline(props: OfficeTimelineProps) {
  return (
    <div className='mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-5 sm:px-6 lg:py-6'>
      {props.turns.map((turn) => (
        <OfficeTurnItem key={turn.id} turn={turn} />
      ))}
    </div>
  )
}

function OfficeTurnItem(props: { turn: OfficeTurn }) {
  const { t } = useTranslation()
  const turn = props.turn
  const isRunning = turn.status === 'running'

  return (
    <section
      aria-label={t('Office task turn {{id}}', { id: turn.id })}
      className='border-border/50 space-y-4 border-b pb-6 last:border-b-0 last:pb-0'
    >
      <div className='flex flex-col items-end gap-1'>
        <span className='text-muted-foreground px-1 text-xs font-medium'>
          {t('You')}
        </span>
        <div className='border-border/70 bg-muted/70 text-foreground max-w-[85%] rounded-2xl rounded-br-md border px-4 py-2.5 text-[0.95rem] leading-6 wrap-break-word whitespace-pre-wrap shadow-xs sm:max-w-[68ch] sm:text-[0.975rem] sm:leading-7'>
          {turn.prompt}
        </div>
      </div>

      <div className='flex items-start gap-3'>
        <IconBadge
          className='ring-primary/15 mt-0.5 ring-1'
          size='sm'
          tone='primary'
        >
          <SparklesIcon />
        </IconBadge>
        <div className='min-w-0 flex-1 space-y-3'>
          <div className='flex min-h-6 items-center justify-between gap-2'>
            <p className='text-foreground text-xs font-semibold'>Codex</p>
            {isRunning && (
              <Badge className='gap-1.5' variant='secondary'>
                <Spinner className='size-3' />
                {t('Working on it…')}
              </Badge>
            )}
          </div>

          <div className='space-y-2.5'>
            {turn.notices.map((notice) => (
              <p
                className='border-border/60 bg-muted/35 text-muted-foreground rounded-xl border px-3 py-2 text-xs leading-5'
                key={notice}
              >
                {notice}
              </p>
            ))}

            {turn.steps.map((step) => (
              <OfficeStepItem isRunning={isRunning} key={step.id} step={step} />
            ))}

            {turn.messages.map((message) => (
              <Response
                className='text-foreground/90 max-w-[78ch] text-[0.95rem] leading-6 sm:text-[0.975rem] sm:leading-7 [&_p]:my-2'
                key={message.id}
              >
                {message.text}
              </Response>
            ))}

            {turn.status === 'failed' && turn.error && (
              <Alert variant='destructive'>
                <CircleAlertIcon />
                <AlertDescription>
                  {translateServerText(t, turn.error)}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function OfficeStepItem(props: { step: OfficeItem; isRunning: boolean }) {
  const { t } = useTranslation()
  const step = props.step

  if (step.type === 'reasoning') {
    return (
      <Reasoning
        className='mb-0'
        defaultOpen={props.isRunning}
        isStreaming={props.isRunning}
      >
        <ReasoningTrigger />
        <ReasoningContent>{step.text}</ReasoningContent>
      </Reasoning>
    )
  }

  if (step.type === 'error') {
    return (
      <div className='border-destructive/25 bg-destructive/5 text-destructive flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5'>
        <CircleAlertIcon
          aria-hidden='true'
          className='mt-0.5 size-4 shrink-0'
        />
        <span className='wrap-break-word whitespace-pre-wrap'>
          {step.message}
        </span>
      </div>
    )
  }

  if (step.type === 'command_execution') {
    const isInProgress = step.status === 'in_progress'
    let statusIcon = (
      <CircleAlertIcon aria-hidden='true' className='text-destructive size-3' />
    )
    if (isInProgress) {
      statusIcon = <Spinner aria-hidden='true' className='size-2.5' />
    } else if (step.exit_code === 0) {
      statusIcon = (
        <CheckCircle2Icon aria-hidden='true' className='text-success size-3' />
      )
    }

    return (
      <div className='border-border/70 bg-card overflow-hidden rounded-xl border shadow-2xs'>
        <div className='bg-muted/30 flex items-center gap-2.5 px-3 py-2 text-xs'>
          <TerminalIcon
            aria-hidden='true'
            className='text-muted-foreground size-3.5 shrink-0'
          />
          <code className='text-foreground min-w-0 flex-1 truncate font-mono text-xs'>
            {step.command}
          </code>
          <Badge
            className='gap-1 text-[11px] font-normal'
            variant={isInProgress ? 'secondary' : 'outline'}
          >
            {statusIcon}
            <span>{getCommandStatusLabel(step, t)}</span>
          </Badge>
        </div>

        {step.aggregated_output && (
          <Collapsible>
            <CollapsibleTrigger className='border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground group flex w-full items-center gap-1.5 border-t px-3 py-1.5 text-xs font-medium transition-colors'>
              <ChevronRightIcon
                aria-hidden='true'
                className='size-3.5 transition-transform group-data-[panel-open]:rotate-90'
              />
              {t('Output')}
            </CollapsibleTrigger>
            <CollapsibleContent className='border-border/60 border-t'>
              <pre className='bg-muted/15 text-muted-foreground max-h-80 overflow-auto px-3.5 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap'>
                {step.aggregated_output}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    )
  }

  if (step.type === 'file_change') {
    return (
      <div className='border-border/70 bg-card flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs shadow-2xs'>
        <FileDiffIcon
          aria-hidden='true'
          className='text-muted-foreground mt-0.5 size-3.5 shrink-0'
        />
        <ul className='min-w-0 flex-1 space-y-1'>
          {step.changes.map((change) => (
            <OfficeFileChangeItem change={change} key={change.path} />
          ))}
        </ul>
      </div>
    )
  }

  // Tools without a dedicated view are named by their type.
  return (
    <div className='border-border/60 bg-muted/30 text-muted-foreground flex items-center gap-2 rounded-xl border px-3 py-2 text-xs'>
      <WrenchIcon aria-hidden='true' className='size-3.5 shrink-0' />
      <span>{step.type.split('_').join(' ')}</span>
    </div>
  )
}

type OfficeCommand = Extract<OfficeItem, { type: 'command_execution' }>

/** How a command ended; a non-zero exit is shown with its code. */
function getCommandStatusLabel(
  command: OfficeCommand,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (command.status === 'in_progress') return t('Running')
  if (command.exit_code === 0) return t('Finished')
  return t('Exit code {{code}}', { code: command.exit_code })
}

const FILE_CHANGE_TONE_CLASS: Record<OfficeFileChange['kind'], string> = {
  add: 'bg-success/10 text-success',
  update: 'bg-info/10 text-info',
  delete: 'bg-destructive/10 text-destructive',
}

function OfficeFileChangeItem(props: { change: OfficeFileChange }) {
  const { t } = useTranslation()
  const change = props.change
  const kindLabel = {
    add: t('Added'),
    update: t('Updated'),
    delete: t('Deleted'),
  }[change.kind]

  return (
    <li className='flex items-center gap-2'>
      <span
        className={cn(
          'inline-flex shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          FILE_CHANGE_TONE_CLASS[change.kind]
        )}
      >
        {kindLabel}
      </span>
      <code
        className='text-foreground min-w-0 truncate font-mono text-xs'
        title={change.path}
      >
        {change.path}
      </code>
    </li>
  )
}
