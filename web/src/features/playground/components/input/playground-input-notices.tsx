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
import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input'

type PlaygroundInputNoticesProps = {
  webSearch: boolean
}

/**
 * Inline notices for the chat composer about where the request goes when web
 * search is on, alone or together with attachments.
 */
export function PlaygroundInputNotices(props: PlaygroundInputNoticesProps) {
  const { t } = useTranslation()
  const attachments = usePromptInputAttachments()

  if (!props.webSearch) return null

  const hasAttachments = attachments.files.length > 0

  return (
    <div className='text-muted-foreground flex w-full flex-col gap-1 px-3 pt-2 text-xs md:px-5'>
      <p className='flex items-start gap-1.5'>
        <InfoIcon aria-hidden='true' className='mt-0.5 size-3.5 shrink-0' />
        <span>
          {t(
            'Web search is on. The selected upstream may send your query to a search service and may charge tool fees.'
          )}
        </span>
      </p>
      {hasAttachments && (
        <p className='flex items-start gap-1.5'>
          <InfoIcon aria-hidden='true' className='mt-0.5 size-3.5 shrink-0' />
          <span>
            {t(
              'Attached files are still sent to the selected upstream when web search is on.'
            )}
          </span>
        </p>
      )}
    </div>
  )
}
