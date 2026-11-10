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
import { EyeIcon, FileCode2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CodeBlock, CodeBlockFrame } from '@/components/ai-elements/code-block'
import { Response } from '@/components/ai-elements/response'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  hasHtmlPreview,
  type MessageSegment,
} from '../../lib/message/message-segments'

type PlaygroundSegmentCardProps = {
  segment: MessageSegment
  isFinal: boolean
  isSourceVisible: boolean
  className?: string
}

// LLM-generated HTML is untrusted: scripts may run, but the opaque origin
// keeps them away from the parent document, cookies and localStorage.
const HTML_PREVIEW_SANDBOX = 'allow-scripts'
const HTML_PREVIEW_MIN_HEIGHT = '20rem'

export function PlaygroundSegmentCard({
  segment,
  isFinal,
  isSourceVisible,
  className,
}: PlaygroundSegmentCardProps) {
  const { t } = useTranslation()
  const isMarkdown = segment.kind === 'markdown'
  const hasPreview = isMarkdown || hasHtmlPreview(segment)
  const [localMode, setLocalMode] = useState<'preview' | 'source'>(
    hasPreview ? 'preview' : 'source'
  )
  const [overrideMode, setOverrideMode] = useState<'preview' | 'source' | null>(
    null
  )
  const showSource = (overrideMode ?? localMode) === 'source'
  const title = isMarkdown ? t('Markdown') : segment.language

  useEffect(() => {
    let nextMode: 'preview' | 'source' = 'source'
    if (!isSourceVisible && hasPreview) {
      nextMode = 'preview'
    }

    setLocalMode(nextMode)
    setOverrideMode(null)
  }, [isSourceVisible, hasPreview])

  const handleToggle = () => {
    const nextMode = showSource ? 'preview' : 'source'
    setLocalMode(nextMode)
    setOverrideMode(nextMode)
  }

  // srcDoc is only attached once the response is complete, so streaming tokens
  // never remount the iframe.
  const canRenderHtmlPreview =
    hasHtmlPreview(segment) && isFinal && !segment.isOpen

  let body
  if (showSource) {
    body = (
      <CodeBlock
        className='my-0 rounded-none border-0 shadow-none'
        code={segment.content}
        defaultCollapsed={false}
        language={isMarkdown ? 'markdown' : segment.language}
        maxExpandedLines={48}
        showLineNumbers
        showToolbar={false}
        title={title}
      />
    )
  } else if (isMarkdown) {
    body = (
      <div className='px-4 py-3'>
        <Response final={isFinal}>{segment.content}</Response>
      </div>
    )
  } else if (canRenderHtmlPreview) {
    body = (
      <iframe
        className='w-full border-0'
        key={`html-${segment.key}`}
        loading='lazy'
        referrerPolicy='no-referrer'
        sandbox={HTML_PREVIEW_SANDBOX}
        srcDoc={segment.content}
        style={{ minHeight: HTML_PREVIEW_MIN_HEIGHT }}
        title={t('HTML preview')}
      />
    )
  } else if (hasHtmlPreview(segment)) {
    body = (
      <p className='text-muted-foreground px-4 py-6 text-center text-sm'>
        {t('Rendering preview when the response is complete')}
      </p>
    )
  } else {
    body = (
      <pre className='max-h-96 overflow-auto px-4 py-3 font-mono text-sm whitespace-pre-wrap'>
        {segment.content}
      </pre>
    )
  }

  const toggleLabel = showSource ? t('Show preview') : t('Show source')

  return (
    <CodeBlockFrame
      className={cn('my-2 w-full max-w-full', className)}
      endActions={
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={toggleLabel}
                  aria-pressed={showSource}
                  className='size-8'
                  onClick={handleToggle}
                  size='icon-sm'
                  type='button'
                  variant='ghost'
                >
                  {showSource ? (
                    <EyeIcon className='size-4' />
                  ) : (
                    <FileCode2Icon className='size-4' />
                  )}
                </Button>
              }
            />
            <TooltipContent>
              <p>{toggleLabel}</p>
            </TooltipContent>
          </Tooltip>
          <CopyButton
            className='size-8'
            value={segment.content}
            aria-label={t('Copy code')}
            tooltip={t('Copy code')}
          />
        </>
      }
      showToolbar
      title={title}
    >
      {body}
    </CodeBlockFrame>
  )
}
