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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Loader } from '@/components/ai-elements/loader'
import { MessageContent } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import { Response } from '@/components/ai-elements/response'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources'
import { cn } from '@/lib/utils'

import { MESSAGE_STATUS } from '../../constants'
import {
  getMessageAlignmentClass,
  getMessageContentState,
  isErrorMessage,
  type MessageAlignment,
} from '../../lib'
import { splitMessageSegments } from '../../lib/message/message-segments'
import { getMessageContentStyles } from '../../lib/message/message-styles'
import type { Message } from '../../types'
import { MessageError } from './message-error'
import { MessageMetadata } from './message-metadata'
import { PlaygroundMediaCard } from './playground-media-card'
import { PlaygroundSegmentCard } from './playground-segment-card'

type PlaygroundMessageContentProps = {
  actions: ReactNode
  alignment: MessageAlignment
  errorActions?: ReactNode
  isSourceVisible?: boolean
  message: Message
  versionContent: string
}

export function PlaygroundMessageContent({
  actions,
  alignment,
  errorActions,
  isSourceVisible = false,
  message,
  versionContent,
}: PlaygroundMessageContentProps) {
  const { t } = useTranslation()
  const {
    displayContent,
    hasReasoning,
    hasSources,
    isAssistant,
    reasoningContent,
    showLoader,
    showMessageContent,
    sources,
  } = getMessageContentState(message, versionContent)
  const isError = isErrorMessage(message)
  const isMessageFinal =
    message.status !== MESSAGE_STATUS.LOADING &&
    message.status !== MESSAGE_STATUS.STREAMING
  const segments = splitMessageSegments(displayContent)
  const hasCodeSegments =
    isAssistant && segments.some((segment) => segment.kind === 'code')

  let contentBody
  if (hasCodeSegments) {
    contentBody = (
      <div className='w-full min-w-0'>
        {segments.map((segment) => (
          <PlaygroundSegmentCard
            isFinal={isMessageFinal}
            isSourceVisible={isSourceVisible}
            key={segment.key}
            segment={segment}
          />
        ))}
      </div>
    )
  } else if (isSourceVisible) {
    contentBody = (
      <MessageContent
        variant='flat'
        className={cn(getMessageContentStyles(), 'font-mono text-sm')}
      >
        <pre className='overflow-auto whitespace-pre-wrap'>
          {displayContent}
        </pre>
      </MessageContent>
    )
  } else {
    contentBody = (
      <MessageContent variant='flat' className={cn(getMessageContentStyles())}>
        <Response final={isMessageFinal}>{displayContent}</Response>
      </MessageContent>
    )
  }

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col',
        getMessageAlignmentClass(alignment)
      )}
    >
      {hasSources && (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source
                href={source.href}
                key={`${source.href}-${source.title}`}
                title={source.title}
              />
            ))}
          </SourcesContent>
        </Sources>
      )}

      {hasReasoning && (
        <Reasoning
          defaultOpen
          duration={message.reasoning?.duration}
          isStreaming={message.isReasoningStreaming}
        >
          <ReasoningTrigger />
          <ReasoningContent>{reasoningContent}</ReasoningContent>
        </Reasoning>
      )}

      {showLoader && (
        <div className='flex items-center gap-2 py-2'>
          <Loader />
          <Shimmer className='text-sm' duration={1}>
            {t('Responding...')}
          </Shimmer>
        </div>
      )}

      {isError && (
        <>
          <MessageError message={message} className='mb-2' />
          <MessageMetadata alignment={alignment} message={message} />
          {errorActions}
        </>
      )}

      {message.images && message.images.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {message.images.map((url) => (
            <img
              alt={t('Attached image')}
              className='border-border size-20 rounded-md border object-cover'
              key={url}
              src={url}
            />
          ))}
        </div>
      )}

      {message.media && message.media.length > 0 && (
        <div className='w-full min-w-0'>
          {message.media.map((item) => (
            <PlaygroundMediaCard
              key={item.taskId ?? item.url ?? `${item.type}-${item.prompt}`}
              media={item}
            />
          ))}
        </div>
      )}

      {!isError && showMessageContent && (
        <>
          {contentBody}
          <MessageMetadata alignment={alignment} message={message} />
          {actions}
        </>
      )}
    </div>
  )
}
