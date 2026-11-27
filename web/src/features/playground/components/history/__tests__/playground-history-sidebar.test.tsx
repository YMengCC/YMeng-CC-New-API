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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'

import type { PlaygroundConversation, PlaygroundHistory } from '../../../types'
import { PlaygroundHistorySidebar } from '../playground-history-sidebar'

const conversationA: PlaygroundConversation = {
  id: 'a',
  title: 'First chat',
  createdAt: 1000,
  updatedAt: 2000,
  messages: [],
}
const conversationB: PlaygroundConversation = {
  id: 'b',
  title: 'Second chat',
  createdAt: 3000,
  updatedAt: 4000,
  messages: [],
}

const history: PlaygroundHistory = {
  activeId: 'a',
  conversations: [conversationA, conversationB],
}

const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

beforeAll(() => {
  // jsdom does not implement the Web Animations API used by ScrollArea.
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  i18next.addResourceBundle('en', 'translation', {
    'New chat': 'New chat',
    'Conversation history': 'Conversation history',
    'Show conversation history': 'Show conversation history',
    'Hide conversation history': 'Hide conversation history',
    'Conversation title': 'Conversation title',
    'Conversation actions': 'Conversation actions',
    'No conversations yet': 'No conversations yet',
    'Start a new chat to see it here.': 'Start a new chat to see it here.',
    Rename: 'Rename',
    Delete: 'Delete',
    'Delete conversation?': 'Delete conversation?',
    'This conversation will be permanently deleted.':
      'This conversation will be permanently deleted.',
    'Clear conversation history': 'Clear conversation history',
    'Clear conversation history?': 'Clear conversation history?',
    'All conversation history will be permanently deleted.':
      'All conversation history will be permanently deleted.',
    Clear: 'Clear',
    Cancel: 'Cancel',
    'Conversation deleted': 'Conversation deleted',
    'Conversation history cleared': 'Conversation history cleared',
  })
})

afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
  }
})

function renderSidebar(
  overrides: Partial<Parameters<typeof PlaygroundHistorySidebar>[0]> = {}
) {
  const onNewConversation = vi.fn()
  const onSelectConversation = vi.fn()
  const onRenameConversation = vi.fn()
  const onDeleteConversation = vi.fn()
  const onClearHistory = vi.fn()
  const onToggleCollapsed = vi.fn()

  render(
    <PlaygroundHistorySidebar
      history={history}
      isCollapsed={false}
      isGenerating={false}
      onClearHistory={onClearHistory}
      onDeleteConversation={onDeleteConversation}
      onNewConversation={onNewConversation}
      onRenameConversation={onRenameConversation}
      onSelectConversation={onSelectConversation}
      onToggleCollapsed={onToggleCollapsed}
      {...overrides}
    />
  )

  return {
    onNewConversation,
    onSelectConversation,
    onRenameConversation,
    onDeleteConversation,
    onClearHistory,
    onToggleCollapsed,
  }
}

test('the new chat button calls its handler', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  await user.click(screen.getByRole('button', { name: 'New chat' }))
  expect(handlers.onNewConversation).toHaveBeenCalledOnce()
})

test('clicking a conversation selects it and the active item is exposed to assistive tech', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  const activeButton = screen.getByRole('button', { name: /First chat/ })
  expect(activeButton).toHaveAttribute('aria-current', 'true')

  await user.click(screen.getByRole('button', { name: /Second chat/ }))
  expect(handlers.onSelectConversation).toHaveBeenCalledWith('b')
})

test('renaming via the actions menu commits on Enter', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  await user.click(
    screen.getAllByRole('button', { name: 'Conversation actions' })[0]
  )
  await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

  const input = screen.getByRole('textbox', { name: 'Conversation title' })
  await user.clear(input)
  await user.type(input, 'Renamed chat{Enter}')

  expect(handlers.onRenameConversation).toHaveBeenCalledWith(
    'a',
    'Renamed chat'
  )
  expect(
    screen.queryByRole('textbox', { name: 'Conversation title' })
  ).toBeNull()
})

test('renaming with Escape cancels without calling the handler', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  await user.click(
    screen.getAllByRole('button', { name: 'Conversation actions' })[0]
  )
  await user.click(screen.getByRole('menuitem', { name: 'Rename' }))

  const input = screen.getByRole('textbox', { name: 'Conversation title' })
  await user.clear(input)
  await user.type(input, 'Discarded{Escape}')

  expect(handlers.onRenameConversation).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /First chat/ })).toBeInTheDocument()
})

test('deleting a conversation requires confirmation and passes its id', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  await user.click(
    screen.getAllByRole('button', { name: 'Conversation actions' })[0]
  )
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete' }))

  expect(handlers.onDeleteConversation).toHaveBeenCalledWith('a')
})

test('cancelling conversation deletion keeps the history unchanged', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  await user.click(
    screen.getAllByRole('button', { name: 'Conversation actions' })[0]
  )
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(handlers.onDeleteConversation).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: /First chat/ })).toBeInTheDocument()
})

test('clearing all history requires confirmation', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  await user.click(
    screen.getByRole('button', { name: 'Clear conversation history' })
  )
  await user.click(screen.getByRole('button', { name: 'Clear' }))

  expect(handlers.onClearHistory).toHaveBeenCalledOnce()
})

test('history deletion controls are disabled while a response is generating', () => {
  renderSidebar({ isGenerating: true })

  expect(
    screen.getByRole('button', { name: 'Clear conversation history' })
  ).toBeDisabled()
  expect(
    screen.getAllByRole('button', { name: 'Conversation actions' })[0]
  ).toBeDisabled()
})

test('the collapse toggle reports its expanded state', async () => {
  const user = userEvent.setup()
  const handlers = renderSidebar()

  const toggle = screen.getByRole('button', {
    name: 'Hide conversation history',
  })
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await user.click(toggle)
  expect(handlers.onToggleCollapsed).toHaveBeenCalledWith(true)

  render(
    <PlaygroundHistorySidebar
      history={history}
      isCollapsed
      isGenerating={false}
      onClearHistory={vi.fn()}
      onDeleteConversation={vi.fn()}
      onNewConversation={vi.fn()}
      onRenameConversation={vi.fn()}
      onSelectConversation={vi.fn()}
      onToggleCollapsed={vi.fn()}
    />
  )
  expect(
    screen.getByRole('button', { name: 'Show conversation history' })
  ).toHaveAttribute('aria-expanded', 'false')
})

test('an empty history shows an empty state instead of entries', () => {
  renderSidebar({
    history: { activeId: 'x', conversations: [] },
  })

  expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /First chat/ })).toBeNull()
})

test('new chat is disabled while a response is generating', () => {
  renderSidebar({ isGenerating: true })

  expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled()
})

test('collapsed sidebar hides conversation entries and clear action while keeping new chat accessible', () => {
  renderSidebar({ isCollapsed: true })

  const sidebar = screen.getByRole('complementary', {
    name: 'Conversation history',
  })
  expect(sidebar.className).toContain('w-12')
  expect(
    screen.getByRole('button', { name: 'Show conversation history' })
  ).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('button', { name: 'New chat' })).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: 'Clear conversation history' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /First chat/ })
  ).not.toBeInTheDocument()
})
