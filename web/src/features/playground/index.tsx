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
import {
  BriefcaseBusinessIcon,
  HistoryIcon,
  MessagesSquareIcon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { getOfficeStatus, OfficeView } from '@/features/office'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { PlaygroundChat } from './components/chat/playground-chat'
import { PlaygroundHistorySidebar } from './components/history/playground-history-sidebar'
import { PlaygroundGenerationForm } from './components/input/playground-generation-form'
import { PlaygroundInput } from './components/input/playground-input'
import {
  useChatHandler,
  useMediaGeneration,
  usePlaygroundConversation,
  usePlaygroundOptions,
  usePlaygroundState,
} from './hooks'

export type PlaygroundMode = 'chat' | 'office'

type PlaygroundProps = {
  mode: PlaygroundMode
  onModeChange: (mode: PlaygroundMode) => void
}

export function Playground(props: PlaygroundProps) {
  const { t } = useTranslation()
  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false)
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

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    setGroups,
    setModels,
    updateConfig,
  })

  const sidebarProps = {
    history,
    isGenerating: isChatBusy,
    onNewConversation: startNewConversation,
    onRenameConversation: renameConversation,
    onDeleteConversation: handleDeleteConversation,
    onClearHistory: handleClearHistory,
    onSelectConversation: selectConversation,
  }

  const pageHeader = (
    <header className='bg-background flex shrink-0 flex-col gap-3 border-b px-3 py-3 sm:px-4 md:min-h-18 md:flex-row md:items-center md:justify-between'>
      <div className='flex min-w-0 items-center gap-3'>
        <IconBadge size='lg' tone='primary'>
          {isOffice ? <BriefcaseBusinessIcon /> : <MessagesSquareIcon />}
        </IconBadge>
        <div className='min-w-0'>
          <h1 className='truncate text-sm font-semibold sm:text-base'>
            {t('Playground')}
          </h1>
          <p className='text-muted-foreground truncate text-xs'>
            {isOffice ? t('Work with Codex') : t('Chat with AI models')}
          </p>
        </div>
      </div>
      {isOfficeAvailable && (
        <ToggleGroup
          aria-label={t('Playground mode')}
          className='bg-muted/70 grid w-full grid-cols-2 gap-1 rounded-xl border p-1 md:w-auto'
          onValueChange={(value) => {
            // Pressing the selected mode again keeps it selected.
            if (value.length) props.onModeChange(value[0] as PlaygroundMode)
          }}
          spacing={1}
          value={[isOffice ? 'office' : 'chat']}
        >
          <ToggleGroupItem
            className='aria-pressed:bg-background aria-pressed:text-foreground h-10 min-w-0 gap-2 rounded-lg px-3 aria-pressed:shadow-xs md:min-w-32'
            value='chat'
          >
            <MessagesSquareIcon aria-hidden='true' />
            {t('Chat')}
          </ToggleGroupItem>
          <ToggleGroupItem
            className='aria-pressed:bg-background aria-pressed:text-foreground h-10 min-w-0 gap-2 rounded-lg px-3 aria-pressed:shadow-xs md:min-w-32'
            value='office'
          >
            <BriefcaseBusinessIcon aria-hidden='true' />
            {t('Office')}
          </ToggleGroupItem>
        </ToggleGroup>
      )}
    </header>
  )

  if (isOffice) {
    return (
      <div className='bg-muted/30 flex size-full min-h-0 flex-col'>
        {pageHeader}
        <div className='min-h-0 flex-1 p-2 sm:p-3 lg:p-4'>
          <div className='bg-background relative size-full min-h-0 overflow-hidden rounded-xl border shadow-xs'>
            <OfficeView />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='bg-muted/30 flex size-full min-h-0 flex-col'>
      {pageHeader}
      <div className='min-h-0 flex-1 p-2 sm:p-3 lg:p-4'>
        <div className='bg-background relative flex size-full min-h-0 overflow-hidden rounded-xl border shadow-xs'>
          <div className='hidden md:flex'>
            <PlaygroundHistorySidebar
              {...sidebarProps}
              isCollapsed={isHistoryCollapsed}
              onToggleCollapsed={setHistoryCollapsed}
            />
          </div>

          <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
            <div className='flex items-center gap-2 border-b px-3 py-2 md:hidden'>
              <Sheet
                onOpenChange={setIsMobileHistoryOpen}
                open={isMobileHistoryOpen}
              >
                <SheetTrigger
                  render={
                    <Button
                      aria-label={t('Show conversation history')}
                      size='icon-sm'
                      variant='outline'
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
                    className='w-full border-r-0'
                    isCollapsed={false}
                    onToggleCollapsed={() => setIsMobileHistoryOpen(false)}
                  />
                </SheetContent>
              </Sheet>
              <span className='text-muted-foreground min-w-0 flex-1 truncate text-xs font-medium'>
                {t('Conversation history')}
              </span>
              <Button
                aria-label={t('New chat')}
                className='gap-2'
                disabled={isChatBusy}
                onClick={startNewConversation}
                size='sm'
                variant='outline'
              >
                <PlusIcon aria-hidden='true' data-icon='inline-start' />
                {t('New chat')}
              </Button>
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
                onSaveEditAndSubmit={(newContent) =>
                  applyEdit(newContent, true)
                }
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
      </div>
    </div>
  )
}
