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
import { HistoryIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

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

export function Playground() {
  const { t } = useTranslation()
  const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false)
  const {
    config,
    parameterEnabled,
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
    updateParameterEnabled,
    clearMessages,
    newConversation,
    switchConversation,
    renameConversation,
    setHistoryCollapsed,
  } = usePlaygroundState()

  const { sendChat, stopGeneration, isGenerating } = useChatHandler({
    config,
    parameterEnabled,
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
  const combinedGenerating = isGenerating || isMediaGenerating
  const stopAll = () => {
    stopGeneration()
    stopMediaGeneration()
  }

  const {
    editingMessageKey,
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

  const { isLoadingModels } = usePlaygroundOptions({
    currentGroup: config.group,
    currentModel: config.model,
    setGroups,
    setModels,
    updateConfig,
  })

  const sidebarProps = {
    history,
    isGenerating,
    onNewConversation: startNewConversation,
    onRenameConversation: renameConversation,
    onSelectConversation: selectConversation,
  }

  return (
    <div className='relative flex size-full min-h-0 overflow-hidden'>
      <div className='hidden md:flex'>
        <PlaygroundHistorySidebar
          {...sidebarProps}
          isCollapsed={isHistoryCollapsed}
          onToggleCollapsed={setHistoryCollapsed}
        />
      </div>

      <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex items-center gap-2 px-2 pt-2 md:hidden'>
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
          <Button
            aria-label={t('New chat')}
            className='gap-2'
            disabled={isGenerating}
            onClick={startNewConversation}
            size='sm'
            variant='outline'
          >
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
              modelMode === 'chat' ? handleSendMessage : undefined
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
              onParameterEnabledChange={updateParameterEnabled}
              onStop={stopAll}
              onSubmit={handleSendMessage}
              parameterEnabled={parameterEnabled}
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
  )
}
