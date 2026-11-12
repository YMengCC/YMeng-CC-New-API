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
import { useNavigate } from '@tanstack/react-router'
import { FileText, Hash } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useSystemConfig } from '@/hooks/use-system-config'

import { useDocsSearchIndex } from '../hooks/use-doc-content'
import { useDocsBaseUrl } from '../hooks/use-docs-base-url'
import {
  DOCS_GROUP_TITLE_KEYS,
  DOCS_GROUPS,
  getDocsPage,
} from '../lib/registry'
import {
  applyDocsSearchTokens,
  buildDocsSearchResults,
  docsSearchResultValue,
  matchesDocsSearch,
  type DocsSearchResult,
} from '../lib/search'

interface DocsSearchDialogProps {
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function DocsSearchDialog(props: DocsSearchDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { systemName } = useSystemConfig()
  const baseUrl = useDocsBaseUrl()
  const { data } = useDocsSearchIndex()

  const results = useMemo(
    () =>
      buildDocsSearchResults(
        applyDocsSearchTokens(data, { baseUrl, systemName }),
        (slug) => getDocsPage(slug)?.group
      ),
    [data, baseUrl, systemName]
  )

  function handleSelect(result: DocsSearchResult): void {
    const hash = result.heading ? `#${result.heading.id}` : ''
    void navigate({ href: `/docs/${result.slug}${hash}` })
    props.onOpenChange(false)
  }

  return (
    <CommandDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Search docs')}
      description={t('Search the API guide')}
    >
      <Command
        filter={(value, search) => (matchesDocsSearch(search, value) ? 1 : 0)}
      >
        <CommandInput placeholder={t('Search docs...')} />
        <CommandList className='max-h-[min(24rem,60vh)]'>
          <CommandEmpty>{t('No results found.')}</CommandEmpty>
          {DOCS_GROUPS.map((group) => {
            const groupResults = results.filter(
              (result) => result.group === group
            )
            if (groupResults.length === 0) {
              return null
            }
            return (
              <CommandGroup
                key={group}
                heading={t(DOCS_GROUP_TITLE_KEYS[group])}
              >
                {groupResults.map((result) => (
                  <CommandItem
                    key={`${result.slug}#${result.heading?.id ?? ''}`}
                    value={docsSearchResultValue(result)}
                    onSelect={() => handleSelect(result)}
                  >
                    {result.heading ? (
                      <Hash
                        className='text-muted-foreground'
                        aria-hidden='true'
                      />
                    ) : (
                      <FileText
                        className='text-muted-foreground'
                        aria-hidden='true'
                      />
                    )}
                    <div className='min-w-0 flex-1'>
                      <p className='truncate'>
                        {result.heading ? result.heading.text : result.title}
                      </p>
                      <p className='text-muted-foreground truncate text-xs'>
                        {result.heading ? result.title : result.description}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )
          })}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
