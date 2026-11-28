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
import { beforeAll, expect, test, vi } from 'vitest'

import type { PlaygroundBackupParsed } from '../../../lib'
import {
  MAX_STORED_CONVERSATIONS,
  PLAYGROUND_BACKUP_FORMAT,
  PLAYGROUND_BACKUP_VERSION,
} from '../../../lib/storage/storage-schema'
import type { PlaygroundConversation, PlaygroundHistory } from '../../../types'
import { PlaygroundImportDialog } from '../playground-import-dialog'

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    'Import playground history': 'Import playground history',
    'Review the backup file and choose how to apply it to the current account.':
      'Review the backup file and choose how to apply it to the current account.',
    'Backup file': 'Backup file',
    'Exported at': 'Exported at',
    Conversations: 'Conversations',
    Messages: 'Messages',
    Settings: 'Settings',
    Included: 'Included',
    'Not in backup': 'Not in backup',
    'Import mode': 'Import mode',
    'Merge with existing history': 'Merge with existing history',
    'Keep existing conversations and add imported ones. Duplicate IDs keep the most recently updated version.':
      'Keep existing conversations and add imported ones. Duplicate IDs keep the most recently updated version.',
    'Replace all history': 'Replace all history',
    'Replace all conversations for the current account with the backup file.':
      'Replace all conversations for the current account with the backup file.',
    'Also restore playground settings': 'Also restore playground settings',
    'Unavailable models or groups on this account will automatically fall back to available options.':
      'Unavailable models or groups on this account will automatically fall back to available options.',
    'Existing conversations will be replaced':
      'Existing conversations will be replaced',
    'This will permanently replace all current conversations for this account in this browser.':
      'This will permanently replace all current conversations for this account in this browser.',
    'Some older conversations will be omitted':
      'Some older conversations will be omitted',
    'Browser storage keeps up to {{maxConversations}} conversations (4 MiB). {{dropped}} older conversation(s) will be omitted.':
      'Browser storage keeps up to {{maxConversations}} conversations (4 MiB). {{dropped}} older conversation(s) will be omitted.',
    Cancel: 'Cancel',
    Import: 'Import',
    'Replace and import': 'Replace and import',
  })
})

function createConversation(
  id: string,
  updatedAt: number,
  messageCount = 2
): PlaygroundConversation {
  return {
    id,
    title: `Chat ${id}`,
    createdAt: updatedAt,
    updatedAt,
    messages: Array.from({ length: messageCount }, (_, idx) => ({
      key: `${id}-m-${idx}`,
      from: idx % 2 === 0 ? 'user' : 'assistant',
      versions: [{ id: `v-${idx}`, content: `Message ${idx}` }],
    })),
  }
}

function createParsedBackup(
  conversations: PlaygroundConversation[],
  withConfig = true
): PlaygroundBackupParsed {
  const messageCount = conversations.reduce(
    (sum, item) => sum + item.messages.length,
    0
  )
  return {
    ok: true,
    conversationCount: conversations.length,
    messageCount,
    hasConfig: withConfig,
    backup: {
      format: PLAYGROUND_BACKUP_FORMAT,
      version: PLAYGROUND_BACKUP_VERSION,
      exportedAt: 1_700_000_000_000,
      history: {
        activeId: conversations[0].id,
        conversations,
      },
      ...(withConfig
        ? {
            config: {
              model: 'gpt-4o',
              group: 'default',
              stream: true,
              web_search: false,
            },
          }
        : {}),
    },
  }
}

const defaultCurrentHistory: PlaygroundHistory = {
  activeId: 'current-1',
  conversations: [createConversation('current-1', 1000, 1)],
}

test('shows backup summary and confirms merge with config restore by default', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  const parsed = createParsedBackup([
    createConversation('imp-1', 2000, 3),
    createConversation('imp-2', 3000, 2),
  ])

  render(
    <PlaygroundImportDialog
      currentHistory={defaultCurrentHistory}
      fileName='playground-backup.json'
      onConfirm={onConfirm}
      onOpenChange={vi.fn()}
      open
      parsed={parsed}
    />
  )

  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByText('playground-backup.json')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
  expect(screen.getByText('5')).toBeInTheDocument()
  expect(screen.getByText('Included')).toBeInTheDocument()
  expect(
    screen.getByRole('radio', { name: 'Merge with existing history' })
  ).toBeChecked()
  expect(
    screen.getByRole('checkbox', { name: 'Also restore playground settings' })
  ).toBeChecked()
  expect(
    screen.queryByText('Existing conversations will be replaced')
  ).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Import' }))
  expect(onConfirm).toHaveBeenCalledWith({
    mode: 'merge',
    restoreConfig: true,
  })
})

test('switching to replace shows destructive alert and allows opting out of config restore', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  const parsed = createParsedBackup([createConversation('imp-1', 2000, 1)])

  render(
    <PlaygroundImportDialog
      currentHistory={defaultCurrentHistory}
      fileName='backup.json'
      onConfirm={onConfirm}
      onOpenChange={vi.fn()}
      open
      parsed={parsed}
    />
  )

  await user.click(screen.getByRole('radio', { name: 'Replace all history' }))
  expect(
    screen.getByText('Existing conversations will be replaced')
  ).toBeInTheDocument()

  await user.click(
    screen.getByRole('checkbox', { name: 'Also restore playground settings' })
  )
  await user.click(screen.getByRole('button', { name: 'Replace and import' }))

  expect(onConfirm).toHaveBeenCalledWith({
    mode: 'replace',
    restoreConfig: false,
  })
})

test('hides config option when backup contains no settings and warns when storage cap omits older conversations', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  const currentConversations = Array.from(
    { length: MAX_STORED_CONVERSATIONS - 1 },
    (_, idx) => createConversation(`cur-${idx}`, 1000 + idx, 1)
  )
  const parsed = createParsedBackup(
    [
      createConversation('new-1', 5000, 1),
      createConversation('new-2', 6000, 1),
      createConversation('new-3', 7000, 1),
    ],
    false
  )

  render(
    <PlaygroundImportDialog
      currentHistory={{
        activeId: currentConversations[0].id,
        conversations: currentConversations,
      }}
      fileName='no-config.json'
      onConfirm={onConfirm}
      onOpenChange={vi.fn()}
      open
      parsed={parsed}
    />
  )

  expect(screen.getByText('Not in backup')).toBeInTheDocument()
  expect(
    screen.queryByRole('checkbox', { name: 'Also restore playground settings' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText('Some older conversations will be omitted')
  ).toBeInTheDocument()
  expect(
    screen.getByText(/2 older conversation\(s\) will be omitted/)
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Import' }))
  expect(onConfirm).toHaveBeenCalledWith({
    mode: 'merge',
    restoreConfig: false,
  })
})

test('cancelling closes the dialog without confirming', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  const parsed = createParsedBackup([createConversation('imp-1', 2000, 1)])

  render(
    <PlaygroundImportDialog
      currentHistory={defaultCurrentHistory}
      fileName='backup.json'
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open
      parsed={parsed}
    />
  )

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(onConfirm).not.toHaveBeenCalled()
})
