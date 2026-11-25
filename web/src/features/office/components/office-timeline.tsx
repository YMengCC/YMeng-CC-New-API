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
  ChevronRightIcon,
  CircleAlertIcon,
  FileDiffIcon,
  SparklesIcon,
  TerminalIcon,
  UserIcon,
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
import { Spinner } from '@/components/ui/spinner'
import { translateServerText } from '@/lib/server-error-message'

import type { OfficeFileChange, OfficeItem, OfficeTurn } from '../types'

type OfficeTimelineProps = {
  turns: OfficeTurn[]
}

/** Every prompt of the session and what the agent did in answer to it. */
export function OfficeTimeline(props: OfficeTimelineProps) {
  return (
    <div className='mx-auto flex w-full max-w-[760px] flex-col px-4 py-6 sm:px-6 lg:py-8'>
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
      className='border-border/60 border-b py-6 first:pt-0 last:border-b-0 last:pb-0'
    >
      <div className='flex items-start gap-3'>
        <div
          aria-hidden='true'
          className='bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full'
        >
          <UserIcon className='size-3.5' />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-muted-foreground mb-1.5 text-xs font-medium'>
            {t('You')}
          </p>
          <p className='bg-muted/60 rounded-xl px-4 py-3 text-sm leading-6 wrap-break-word whitespace-pre-wrap'>
            {turn.prompt}
          </p>
        </div>
      </div>

      <div className='mt-5 flex items-start gap-3'>
        <div
          aria-hidden='true'
          className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full'
        >
          <SparklesIcon className='size-3.5' />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex h-7 items-center justify-between gap-2'>
            <p className='text-xs font-semibold'>Codex</p>
            {isRunning && (
              <Badge className='gap-1.5' variant='secondary'>
                <Spinner className='size-3' />
                {t('Working on it…')}
              </Badge>
            )}
          </div>
          <div className='mt-1 space-y-3'>
            {turn.notices.map((notice) => (
              <p
                className='text-muted-foreground bg-muted/40 rounded-md px-3 py-2 text-xs'
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
                className='text-sm leading-6 [&_p]:my-2'
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
      <p className='text-muted-foreground flex items-start gap-2 text-sm'>
        <CircleAlertIcon className='mt-0.5 size-4 shrink-0' />
        <span className='wrap-break-word whitespace-pre-wrap'>
          {step.message}
        </span>
      </p>
    )
  }
  if (step.type === 'command_execution') {
    return (
      <div className='border-border/60 bg-muted/20 overflow-hidden rounded-lg border'>
        <div className='flex items-center gap-2 px-3 py-2.5 text-xs'>
          <TerminalIcon className='text-muted-foreground size-4 shrink-0' />
          <code className='min-w-0 flex-1 truncate font-mono'>
            {step.command}
          </code>
          <span className='text-muted-foreground shrink-0'>
            {getCommandStatusLabel(step, t)}
          </span>
        </div>
        {step.aggregated_output && (
          <Collapsible>
            <CollapsibleTrigger className='text-muted-foreground group hover:text-foreground flex items-center gap-1 border-t px-3 py-1.5 text-xs'>
              <ChevronRightIcon
                className='size-3.5 transition-transform group-data-[panel-open]:rotate-90'
                data-icon='inline-start'
              />
              {t('Output')}
            </CollapsibleTrigger>
            <CollapsibleContent className='border-t'>
              <pre className='text-muted-foreground max-h-80 overflow-auto px-3 py-2 text-xs whitespace-pre-wrap'>
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
      <div className='border-border/60 bg-muted/20 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs'>
        <FileDiffIcon className='text-muted-foreground mt-0.5 size-4 shrink-0' />
        <ul className='min-w-0 flex-1 space-y-0.5'>
          {step.changes.map((change) => (
            <OfficeFileChangeItem change={change} key={change.path} />
          ))}
        </ul>
      </div>
    )
  }
  // Tools without a dedicated view are named by their type.
  return (
    <p className='text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-xs'>
      {step.type.split('_').join(' ')}
    </p>
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

function OfficeFileChangeItem(props: { change: OfficeFileChange }) {
  const { t } = useTranslation()
  const change = props.change
  const kindLabel = {
    add: t('Added'),
    update: t('Updated'),
    delete: t('Deleted'),
  }[change.kind]

  return (
    <li className='flex items-baseline gap-2'>
      <span className='text-muted-foreground w-12 shrink-0'>{kindLabel}</span>
      <code className='truncate font-mono'>{change.path}</code>
    </li>
  )
}
