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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest'

import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { Playground } from '../index'
import {
  buildPlaygroundBackup,
  loadConfig,
  loadHistory,
  saveConfig,
  saveHistory,
} from '../lib'

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  getUserModels: vi.fn(),
  getUserGroups: vi.fn(),
  getPricingModels: vi.fn(),
  getOfficeStatus: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}))
vi.mock('@/features/office', () => ({
  getOfficeStatus: mocks.getOfficeStatus,
  OfficeView: () => <div>office</div>,
}))
vi.mock('../api', () => ({
  getUserModels: mocks.getUserModels,
  getUserGroups: mocks.getUserGroups,
  getPricingModels: mocks.getPricingModels,
  uploadPlaygroundFile: vi.fn(),
  deletePlaygroundFile: vi.fn(),
}))

const getAnimationsDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'getAnimations'
)
const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL
let clients: QueryClient[] = []

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
  i18next.addResourceBundle('en', 'translation', {
    Export: 'Export',
    Import: 'Import',
    Cancel: 'Cancel',
    'Import playground history': 'Import playground history',
    'Merge with existing history': 'Merge with existing history',
    'Replace all history': 'Replace all history',
    'Replace and import': 'Replace and import',
    'Also restore playground settings': 'Also restore playground settings',
    'Exported {{count}} conversation(s)': 'Exported {{count}} conversation(s)',
    'Imported {{count}} conversation(s)': 'Imported {{count}} conversation(s)',
    'Invalid JSON file': 'Invalid JSON file',
    'Failed to save imported data. Browser storage quota may be full.':
      'Failed to save imported data. Browser storage quota may be full.',
  })
})

afterAll(() => {
  if (getAnimationsDescriptor) {
    Object.defineProperty(
      Element.prototype,
      'getAnimations',
      getAnimationsDescriptor
    )
  } else {
    Reflect.deleteProperty(Element.prototype, 'getAnimations')
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  mocks.getOfficeStatus.mockResolvedValue(false)
  mocks.getPricingModels.mockResolvedValue([])
  mocks.getUserGroups.mockResolvedValue([
    { label: 'Default', value: 'default', ratio: 1 },
  ])
  mocks.getUserModels.mockResolvedValue([{ label: 'gpt-4o', value: 'gpt-4o' }])
})

afterEach(() => {
  clients.forEach((client) => client.clear())
  clients = []
  Object.assign(URL, {
    createObjectURL: originalCreateObjectURL,
    revokeObjectURL: originalRevokeObjectURL,
  })
  vi.restoreAllMocks()
})

function renderPlayground(userId: number) {
  useAuthStore.getState().auth.setUser({
    id: userId,
    username: `user-${userId}`,
    role: ROLE.USER,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <Playground mode='chat' onModeChange={vi.fn()} />
    </QueryClientProvider>
  )
}

function createJsonFile(content: string, name = 'backup.json'): File {
  const file = new File([content], name, { type: 'application/json' })
  // jsdom File may lack .text() in some versions; ensure deterministic reading.
  Object.defineProperty(file, 'text', {
    value: () => Promise.resolve(content),
  })
  return file
}

test('exports the current account history and config as a valid backup file', async () => {
  const user = userEvent.setup()
  let exportedBlob: Blob | null = null
  const createObjectURL = vi.fn((blob: Blob) => {
    exportedBlob = blob
    return 'blob:playground-backup'
  })
  const revokeObjectURL = vi.fn()
  Object.assign(URL, { createObjectURL, revokeObjectURL })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'user-1',
    role: ROLE.USER,
  })
  saveHistory({
    activeId: 'c-1',
    conversations: [
      {
        id: 'c-1',
        title: 'Saved conversation',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [
          {
            key: 'm-1',
            from: 'user',
            versions: [{ id: 'v-1', content: 'Hello backup' }],
          },
        ],
      },
    ],
  })
  saveConfig({
    model: 'gpt-4o',
    group: 'default',
    stream: false,
    web_search: true,
  })

  renderPlayground(1)
  await screen.findByRole('button', { name: /Saved conversation/ })

  await user.click(screen.getByRole('button', { name: 'Export' }))

  expect(createObjectURL).toHaveBeenCalledOnce()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:playground-backup')
  expect(mocks.toastSuccess).toHaveBeenCalledWith('Exported 1 conversation(s)')
  expect(exportedBlob).not.toBeNull()

  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      'load',
      () => resolve(String(reader.result ?? '')),
      {
        once: true,
      }
    )
    reader.addEventListener('error', () => reject(reader.error), { once: true })
    reader.readAsText(exportedBlob as Blob)
  })
  const payload = JSON.parse(text) as {
    format: string
    version: number
    history: { conversations: Array<{ title: string }> }
    config: { stream: boolean; web_search: boolean }
  }
  expect(payload.format).toBe('new-api-playground-backup')
  expect(payload.version).toBe(1)
  expect(payload.history.conversations[0].title).toBe('Saved conversation')
  expect(payload.config.stream).toBe(false)
  expect(payload.config.web_search).toBe(true)
})

test('imports a backup into another account, persists it, and falls back unavailable model and group', async () => {
  const user = userEvent.setup()
  const backup = buildPlaygroundBackup(
    {
      activeId: 'from-a',
      conversations: [
        {
          id: 'from-a',
          title: 'Migrated from A',
          createdAt: 1000,
          updatedAt: 2000,
          messages: [
            {
              key: 'm-a',
              from: 'user',
              versions: [{ id: 'v-a', content: 'Carry this context' }],
            },
          ],
        },
      ],
    },
    {
      model: 'unavailable-model',
      group: 'unavailable-group',
      stream: false,
      web_search: true,
    }
  )

  renderPlayground(2)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled()
  )

  const fileInput = screen.getByLabelText('Import playground history')
  fireEvent.change(fileInput, {
    target: { files: [createJsonFile(JSON.stringify(backup), 'from-a.json')] },
  })

  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('from-a.json')).toBeInTheDocument()

  await user.click(within(dialog).getByRole('button', { name: 'Import' }))

  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  expect(
    await screen.findByRole('button', { name: /Migrated from A/ })
  ).toBeInTheDocument()
  expect(mocks.toastSuccess).toHaveBeenCalledWith('Imported 1 conversation(s)')

  expect(loadHistory().conversations.map((item) => item.id)).toEqual(['from-a'])
  await waitFor(() => {
    expect(loadConfig()).toEqual({
      model: 'gpt-4o',
      group: 'default',
      stream: false,
      web_search: true,
    })
  })
})

test('shows an error toast for malformed JSON without opening the import dialog', async () => {
  renderPlayground(3)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled()
  )

  const fileInput = screen.getByLabelText('Import playground history')
  fireEvent.change(fileInput, {
    target: { files: [createJsonFile('{not-json', 'broken.json')] },
  })

  await waitFor(() => {
    expect(mocks.toastError).toHaveBeenCalledWith('Invalid JSON file')
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('keeps existing conversations intact when localStorage fails during import', async () => {
  const user = userEvent.setup()
  useAuthStore.getState().auth.setUser({
    id: 4,
    username: 'user-4',
    role: ROLE.USER,
  })
  saveHistory({
    activeId: 'existing-1',
    conversations: [
      {
        id: 'existing-1',
        title: 'Keep existing chat',
        createdAt: 1000,
        updatedAt: 2000,
        messages: [
          {
            key: 'e-1',
            from: 'user',
            versions: [{ id: 'v-e', content: 'Stay intact' }],
          },
        ],
      },
    ],
  })

  renderPlayground(4)
  await screen.findByRole('button', { name: /Keep existing chat/ })

  const backup = buildPlaygroundBackup(
    {
      activeId: 'new-1',
      conversations: [
        {
          id: 'new-1',
          title: 'Will fail to persist',
          createdAt: 3000,
          updatedAt: 4000,
          messages: [],
        },
      ],
    },
    {}
  )

  const fileInput = screen.getByLabelText('Import playground history')
  fireEvent.change(fileInput, {
    target: { files: [createJsonFile(JSON.stringify(backup))] },
  })
  expect(await screen.findByRole('dialog')).toBeInTheDocument()

  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  const dialog = screen.getByRole('dialog')
  await user.click(within(dialog).getByRole('button', { name: 'Import' }))

  expect(mocks.toastError).toHaveBeenCalledWith(
    'Failed to save imported data. Browser storage quota may be full.'
  )

  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  expect(
    screen.getByRole('button', { name: /Keep existing chat/ })
  ).toBeInTheDocument()
  expect(loadHistory().conversations.map((item) => item.id)).toEqual([
    'existing-1',
  ])
})
