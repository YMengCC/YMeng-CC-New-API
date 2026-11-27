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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

import { DEFAULT_CONFIG } from '../constants'
import { Playground } from '../index'

const office = vi.hoisted(() => ({
  getOfficeStatus: vi.fn(),
  OfficeView: vi.fn(),
}))

vi.mock('@/features/office', () => office)
vi.mock('../hooks', () => ({
  useChatHandler: () => ({
    sendChat: vi.fn(),
    stopGeneration: vi.fn(),
    isGenerating: false,
  }),
  useMediaGeneration: () => ({
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    stopGeneration: vi.fn(),
    isGenerating: false,
  }),
  usePlaygroundConversation: () => ({
    editingMessageKey: null,
    isUploading: false,
    cancelPendingSend: vi.fn(),
    handleSendMessage: vi.fn(),
    handleRegenerateMessage: vi.fn(),
    handleEditMessage: vi.fn(),
    handleEditOpenChange: vi.fn(),
    applyEdit: vi.fn(),
    handleDeleteMessage: vi.fn(),
  }),
  usePlaygroundOptions: () => ({ isLoadingModels: false }),
  usePlaygroundState: () => ({
    config: DEFAULT_CONFIG,
    messages: [],
    history: { activeId: '', conversations: [] },
    isLoadingMessages: false,
    isHistoryCollapsed: false,
    models: [],
    groups: [],
    updateMessages: vi.fn(),
    setModels: vi.fn(),
    setGroups: vi.fn(),
    updateConfig: vi.fn(),
    clearMessages: vi.fn(),
    newConversation: vi.fn(),
    switchConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    clearHistory: vi.fn(),
    setHistoryCollapsed: vi.fn(),
  }),
}))

const user = userEvent.setup()
let clients: QueryClient[] = []
// jsdom has no Web Animations API, which the history scroll area uses.
const getAnimationsDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'getAnimations'
)

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
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
  office.OfficeView.mockImplementation(() => <div>office view</div>)
})

afterEach(() => {
  clients.forEach((client) => client.clear())
  clients = []
  useAuthStore.setState(useAuthStore.getInitialState(), true)
})

function renderPlayground(
  props: {
    mode?: 'chat' | 'office'
    role?: number
    officeEnabled?: boolean
  } = {}
) {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'admin',
    role: props.role ?? ROLE.ADMIN,
  })
  office.getOfficeStatus.mockResolvedValue(props.officeEnabled ?? true)
  const onModeChange = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Playground mode={props.mode ?? 'chat'} onModeChange={onModeChange} />
    </QueryClientProvider>
  )
  return { onModeChange }
}

test('the office switch is offered to admins when the office mode is configured', async () => {
  renderPlayground()

  expect(await screen.findByRole('button', { name: 'Office' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(
    screen.getByRole('heading', { level: 1, name: 'Playground' })
  ).toBeInTheDocument()
  expect(screen.getByText('Chat with AI models')).toBeInTheDocument()
})

test('the office switch is hidden from users who are not admins', async () => {
  renderPlayground({ role: ROLE.USER })

  // The new-chat button exists twice: in the sidebar and the mobile header.
  expect(screen.getAllByRole('button', { name: 'New chat' })).not.toHaveLength(
    0
  )
  expect(
    screen.queryByRole('button', { name: 'Office' })
  ).not.toBeInTheDocument()
  expect(office.getOfficeStatus).not.toHaveBeenCalled()
})

test('the office switch is hidden while the office mode is not configured', async () => {
  renderPlayground({ officeEnabled: false })

  await waitFor(() => expect(office.getOfficeStatus).toHaveBeenCalledTimes(1))
  expect(
    screen.queryByRole('button', { name: 'Office' })
  ).not.toBeInTheDocument()
})

test('pressing Office asks the route to switch the mode', async () => {
  const { onModeChange } = renderPlayground()

  await user.click(await screen.findByRole('button', { name: 'Office' }))

  expect(onModeChange).toHaveBeenCalledWith('office')
})

test('the office mode replaces the chat with the office view', async () => {
  renderPlayground({ mode: 'office' })

  expect(await screen.findByText('office view')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Office' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  expect(screen.getByText('Work with Codex')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'New chat' })
  ).not.toBeInTheDocument()
})

test('the office mode falls back to chat while it is unavailable', async () => {
  renderPlayground({ mode: 'office', officeEnabled: false })

  expect(screen.getAllByRole('button', { name: 'New chat' })).not.toHaveLength(
    0
  )
  await waitFor(() => expect(office.getOfficeStatus).toHaveBeenCalledTimes(1))
  expect(screen.queryByText('office view')).not.toBeInTheDocument()
})

test('the mode switch group stays centered in the header and ignores re-pressing the active mode', async () => {
  const { onModeChange } = renderPlayground({ mode: 'chat' })

  const group = await screen.findByRole('group', { name: 'Playground mode' })
  expect(group.className).toContain('md:justify-self-center')

  const chatButton = screen.getByRole('button', { name: 'Chat' })
  expect(chatButton).toHaveAttribute('aria-pressed', 'true')

  await user.click(chatButton)
  expect(onModeChange).not.toHaveBeenCalled()
  expect(chatButton).toHaveAttribute('aria-pressed', 'true')
})
