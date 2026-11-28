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
import { useQuery } from '@tanstack/react-query'
import { HistoryIcon, PlusIcon } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { getOfficeStatus, OfficeView } from '@/features/office'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { PlaygroundChat } from './components/chat/playground-chat'
import { PlaygroundHistorySidebar } from './components/history/playground-history-sidebar'
import { PlaygroundImportDialog } from './components/history/playground-import-dialog'
import { PlaygroundGenerationForm } from './components/input/playground-generation-form'
import { PlaygroundInput } from './components/input/playground-input'
import { PlaygroundHeader } from './components/playground-header'
import { DEFAULT_CONVERSATION_TITLE } from './constants'
import {
  useChatHandler,
  useMediaGeneration,
  usePlaygroundConversation,
  usePlaygroundOptions,
  usePlaygroundState,
} from './hooks'
import {
  MAX_IMPORT_FILE_BYTES,
  parsePlaygroundBackup,
  type PlaygroundBackupParsed,
  type PlaygroundBackupParseError,
  type PlaygroundImportOptions,
} from './lib'

export type PlaygroundMode = 'chat' | 'office'

type PlaygroundProps = {
  mode: PlaygroundMode
  onModeChange: (mode: PlaygroundMode) => void
}

export function Playground(props: PlaygroundProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<{
    fileName: string
    parsed: PlaygroundBackupParsed
  } | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  // The office mode runs an agent on the server: admins only, and only where
  // the office worker is configured.
  const role = useAuthStore((state) => state.auth.user?.role ?? 0)
  const officeStatusQuery = useQuery({
    queryKey: ['office', 'status'],
    queryFn: getOfficeStatus,
    enabled: role >= ROLE.ADMIN,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    meta: { errorToast: false },
  })
  const isOfficeAvailable = officeStatusQuery.data === true
  const isOffice = props.mode === 'office' && isOfficeAvailable
  const {
    config,
    messages,
    history,
    isLoadingMessages,
    isHistoryCollapsed,
    models,
    groups,
    updateMessages,
    setModels,
    setGroups,
    updateConfig,
    clearMessages,
    newConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    clearHistory,
    setHistoryCollapsed,
    exportPlaygroundData,
    importPlaygroundData,
  } = usePlaygroundState()

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    onMessageUpdate: updateMessages,
  })

  const {
    generateImage,
    generateVideo,
    stopGeneration: stopMediaGeneration,
    isGenerating: isMediaGenerating,
  } = useMediaGeneration({ config, updateMessages })

  const modelMode =
    models.find((model) => model.value === config.model)?.mode ?? 'chat'

  const {
    editingMessageKey,
    isUploading,
    cancelPendingSend,
    handleSendMessage,
    handleRegenerateMessage,
    handleEditMessage,
    handleEditOpenChange,
    applyEdit,
    handleDeleteMessage,
  } = usePlaygroundConversation({
    messages,
    updateMessages,
    sendChat,
  })

  const isChatBusy = isGenerating || isUploading
  const combinedGenerating = isChatBusy || isMediaGenerating
  const stopAll = () => {
    cancelPendingSend()
    stopGeneration()
    stopMediaGeneration()
  }

  const startNewConversation = () => {
    stopAll()
    handleEditOpenChange(false)
    newConversation()
    setIsMobileHistoryOpen(false)
  }

  const selectConversation = (id: string) => {
    if (id === history.activeId) {
      setIsMobileHistoryOpen(false)
      return
    }

    stopAll()
    handleEditOpenChange(false)
    switchConversation(id)
    setIsMobileHistoryOpen(false)
  }

  const handleClearMessages = () => {
    handleEditOpenChange(false)
    clearMessages()
  }

  const handleDeleteConversation = (id: string) => {
    stopAll()
    handleEditOpenChange(false)
    deleteConversation(id)
    setIsMobileHistoryOpen(false)
  }

  const handleClearHistory = () => {
    stopAll()
    handleEditOpenChange(false)
    clearHistory()
    setIsMobileHistoryOpen(false)
  }

  const getImportErrorMessage = (error: PlaygroundBackupParseError): string => {
    switch (error) {
      case 'file_too_large':
        return t('Import file exceeds the {{size}} MiB limit', {
          size: formatNumber(MAX_IMPORT_FILE_BYTES / (1024 * 1024), locale),
        })
      case 'invalid_json':
        return t('Invalid JSON file')
      case 'unsupported_version':
        return t('Unsupported playground backup version')
      case 'empty':
        return t('Backup file contains no conversations')
      case 'invalid_format':
      default:
        return t('Invalid playground backup file')
    }
  }

  const handleExportHistory = () => {
    if (history.conversations.length === 0) return

    const { count } = exportPlaygroundData()
    toast.success(
      t('Exported {{count}} conversation(s)', {
        count: formatNumber(count, locale),
      })
    )
  }

  const handleRequestImport = () => {
    importInputRef.current?.click()
  }

  const handleImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast.error(getImportErrorMessage('file_too_large'))
      return
    }

    let rawText: string
    try {
      rawText = await file.text()
    } catch {
      toast.error(t('Failed to read import file'))
      return
    }

    const parsed = parsePlaygroundBackup(rawText)
    if (!parsed.ok) {
      toast.error(getImportErrorMessage(parsed.error))
      return
    }

    setIsMobileHistoryOpen(false)
    setPendingImport({ fileName: file.name, parsed })
  }

  const handleConfirmImport = (options: PlaygroundImportOptions) => {
    if (!pendingImport) return

    stopAll()
    handleEditOpenChange(false)
    const result = importPlaygroundData(pendingImport.parsed.backup, options)
    if (!result.ok) {
      toast.error(
        t('Failed to save imported data. Browser storage quota may be full.')
      )
      return
    }

    setPendingImport(null)
    if (result.droppedCount > 0) {
      toast.success(
        t(
          'Imported {{count}} conversation(s); {{dropped}} older conversation(s) omitted due to browser storage limits',
          {
            count: formatNumber(result.importedCount, locale),
            dropped: formatNumber(result.droppedCount, locale),
          }
        )
      )
      return
    }

    toast.success(
      t('Imported {{count}} conversation(s)', {
        count: formatNumber(result.importedCount, locale),
      })
    )
  }

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    setGroups,
    setModels,
    updateConfig,
  })

  const sidebarProps = {
    history,
    isGenerating: combinedGenerating,
    onNewConversation: startNewConversation,
    onRenameConversation: renameConversation,
    onDeleteConversation: handleDeleteConversation,
    onClearHistory: handleClearHistory,
    onExportHistory: handleExportHistory,
    onImportHistory: handleRequestImport,
    onSelectConversation: selectConversation,
  }

  const activeConversation = history.conversations.find(
    (conversation) => conversation.id === history.activeId
  )
  const activeConversationTitle =
    !activeConversation ||
    activeConversation.title === DEFAULT_CONVERSATION_TITLE
      ? t(DEFAULT_CONVERSATION_TITLE)
      : activeConversation.title

  const pageHeader = (
    <PlaygroundHeader
      isOffice={isOffice}
      isOfficeAvailable={isOfficeAvailable}
      onModeChange={props.onModeChange}
    />
  )

  if (isOffice) {
    return (
      <div className='bg-background flex size-full min-h-0 flex-col overflow-hidden'>
        {pageHeader}
        <div className='relative min-h-0 flex-1 overflow-hidden'>
          <OfficeView />
        </div>
      </div>
    )
  }

  return (
    <div className='bg-background flex size-full min-h-0 flex-col overflow-hidden'>
      {pageHeader}
      <div className='relative flex min-h-0 flex-1 overflow-hidden'>
        <div className='hidden md:flex'>
          <PlaygroundHistorySidebar
            {...sidebarProps}
            isCollapsed={isHistoryCollapsed}
            onToggleCollapsed={setHistoryCollapsed}
          />
        </div>

        <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
          <div className='border-border/80 bg-background flex h-12 shrink-0 items-center gap-2.5 border-b px-3 md:px-4'>
            <div className='md:hidden'>
              <Sheet
                onOpenChange={setIsMobileHistoryOpen}
                open={isMobileHistoryOpen}
              >
                <SheetTrigger
                  render={
                    <Button
                      aria-label={t('Show conversation history')}
                      size='icon-sm'
                      variant='ghost'
                    />
                  }
                >
                  <HistoryIcon className='size-4' />
                </SheetTrigger>
                <SheetContent className='w-72 p-0' side='left'>
                  <SheetTitle className='sr-only'>
                    {t('Conversation history')}
                  </SheetTitle>
                  <PlaygroundHistorySidebar
                    {...sidebarProps}
                    className='bg-background w-full border-r-0'
                    isCollapsed={false}
                    onToggleCollapsed={() => setIsMobileHistoryOpen(false)}
                  />
                </SheetContent>
              </Sheet>
            </div>

            <h2 className='min-w-0 flex-1 truncate text-sm font-semibold'>
              {activeConversationTitle}
            </h2>

            {config.model && (
              <Badge
                className='hidden max-w-52 font-mono text-[11px] font-normal sm:inline-flex'
                title={config.model}
                variant='outline'
              >
                <span className='truncate'>{config.model}</span>
              </Badge>
            )}

            <div className='md:hidden'>
              <Button
                aria-label={t('New chat')}
                className='gap-1.5'
                disabled={isChatBusy}
                onClick={startNewConversation}
                size='sm'
                variant='outline'
              >
                <PlusIcon aria-hidden='true' data-icon='inline-start' />
                {t('New chat')}
              </Button>
            </div>
          </div>

          {/* Full-width scroll container: scrolling works even over side whitespace */}
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <PlaygroundChat
              key={history.activeId}
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              onRegenerateMessage={handleRegenerateMessage}
              onEditMessage={handleEditMessage}
              onDeleteMessage={handleDeleteMessage}
              onSelectPrompt={
                modelMode === 'chat'
                  ? (prompt) => void handleSendMessage(prompt)
                  : undefined
              }
              isGenerating={combinedGenerating}
              editingKey={editingMessageKey}
              onCancelEdit={handleEditOpenChange}
              onSaveEdit={(newContent) => applyEdit(newContent, false)}
              onSaveEditAndSubmit={(newContent) => applyEdit(newContent, true)}
            />
          </div>

          {/* Input area: center content and constrain to the same container width */}
          <div className='mx-auto w-full max-w-4xl'>
            {modelMode === 'chat' ? (
              <PlaygroundInput
                config={config}
                disabled={combinedGenerating}
                groups={groups}
                groupValue={config.group}
                isGenerating={combinedGenerating}
                isModelLoading={isLoadingModels}
                modelValue={config.model}
                models={models}
                onGroupChange={(value) => updateConfig('group', value)}
                onConfigChange={updateConfig}
                onClearMessages={handleClearMessages}
                onModelChange={(value) => updateConfig('model', value)}
                onStop={stopAll}
                onSubmit={handleSendMessage}
                hasMessages={messages.length > 0}
              />
            ) : (
              <PlaygroundGenerationForm
                config={config}
                disabled={combinedGenerating}
                groups={groups}
                isGenerating={isMediaGenerating}
                isModelLoading={isLoadingModels}
                mode={modelMode}
                models={models}
                onGroupChange={(value) => updateConfig('group', value)}
                onModelChange={(value) => updateConfig('model', value)}
                onStop={stopMediaGeneration}
                onSubmitImage={generateImage}
                onSubmitVideo={generateVideo}
              />
            )}
          </div>
        </div>
      </div>
      <input
        accept='.json,application/json'
        aria-label={t('Import playground history')}
        className='hidden'
        onChange={(event) => void handleImportFileChange(event)}
        ref={importInputRef}
        type='file'
      />

      <PlaygroundImportDialog
        currentHistory={history}
        fileName={pendingImport?.fileName ?? ''}
        onConfirm={handleConfirmImport}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null)
        }}
        open={pendingImport !== null}
        parsed={pendingImport?.parsed ?? null}
      />
    </div>
  )
}
