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
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vitest'

import { OfficeView } from '../components/office-view'
import type { OfficeEvent, OfficeSession } from '../types'

const mocks = vi.hoisted(() => ({
  api: {
    createOfficeSession: vi.fn(),
    deleteOfficeFile: vi.fn(),
    deleteOfficeSession: vi.fn(),
    downloadOfficeFile: vi.fn(),
    getOfficeSessionEvents: vi.fn(),
    listOfficeFiles: vi.fn(),
    listOfficeSessions: vi.fn(),
    officeTurnStreamUrl: (id: string) => `/api/office/turns/${id}`,
    stopOfficeTurn: vi.fn(),
    uploadOfficeFile: vi.fn(),
  },
  playgroundApi: {
    getPricingModels: vi.fn(),
    getUserGroups: vi.fn(),
    getUserModels: vi.fn(),
  },
  libApi: {
    getFreshAuthHeaders: vi.fn(),
  },
  streams: [] as Array<{
    url: string
    payload: string
    readyState: number
    emit: (type: string, event: { data?: string }) => void
  }>,
}))

vi.mock('../api', () => mocks.api)
vi.mock('@/features/playground/api', () => mocks.playgroundApi)
vi.mock('@/lib/api', () => mocks.libApi)
vi.mock('sse.js', () => ({
  SSE: class {
    url: string
    payload: string
    readyState = 0
    listeners = new Map<string, Array<(event: { data?: string }) => void>>()

    constructor(url: string, options: { payload: string }) {
      this.url = url
      this.payload = options.payload
      mocks.streams.push(this)
    }

    addEventListener(
      type: string,
      listener: (event: { data?: string }) => void
    ) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }

    emit(type: string, event: { data?: string }) {
      for (const listener of this.listeners.get(type) ?? []) listener(event)
    }

    stream() {
      this.readyState = 1
    }

    close() {
      this.readyState = 2
    }
  },
}))

const SESSION_ID = 'a'.repeat(32)

function session(id = SESSION_ID, title = ''): OfficeSession {
  return { id, title, createdAt: 1, updatedAt: 1 }
}

function openSession(options: { events?: OfficeEvent[]; title?: string } = {}) {
  localStorage.setItem('office:active-session', SESSION_ID)
  mocks.api.listOfficeSessions.mockResolvedValue([
    session(SESSION_ID, options.title ?? 'Quarterly report'),
  ])
  mocks.api.getOfficeSessionEvents.mockResolvedValue(options.events ?? [])
}

/** Types a task and sends it; the office worker stream is the fake SSE. */
async function sendTask(text: string) {
  const user = userEvent.setup()
  // The composer stays disabled until the model list has loaded.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  )
  await user.type(
    await screen.findByPlaceholderText('Describe the task for Codex'),
    `${text}{Enter}`
  )
  await waitFor(() => expect(mocks.streams).toHaveLength(1))
  const stream = mocks.streams[0]
  // The worker echoes the prompt as the first frame of the stream.
  act(() => {
    stream.emit('message', {
      data: JSON.stringify({ type: 'user_input', text, at: 1 }),
    })
  })
  return stream
}

/** The server closes the stream after the terminal event. */
function closeStream(stream: (typeof mocks.streams)[number]) {
  act(() => {
    stream.readyState = 2
    stream.emit('readystatechange', {})
  })
}

let clients: QueryClient[] = []
// jsdom has no Web Animations API, which the empty-state entrance uses.
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
  mocks.streams.length = 0
  localStorage.clear()
  // The playground option loaders return the mapped lists, not the envelope.
  mocks.playgroundApi.getUserGroups.mockResolvedValue([
    { label: 'default', value: 'default', ratio: 1, desc: 'Default group' },
    { label: 'vip', value: 'vip', ratio: 2, desc: 'VIP group' },
  ])
  mocks.playgroundApi.getUserModels.mockImplementation(async (group: string) =>
    (group === 'vip' ? ['o3'] : ['gpt-5.1-codex']).map((model) => ({
      label: model,
      value: model,
    }))
  )
  mocks.playgroundApi.getPricingModels.mockResolvedValue(null)
  mocks.libApi.getFreshAuthHeaders.mockResolvedValue({})
  mocks.api.createOfficeSession.mockResolvedValue(session('b'.repeat(32)))
  mocks.api.listOfficeSessions.mockResolvedValue([])
  mocks.api.listOfficeFiles.mockResolvedValue([])
  mocks.api.getOfficeSessionEvents.mockResolvedValue([])
  mocks.api.stopOfficeTurn.mockResolvedValue(undefined)
  mocks.api.uploadOfficeFile.mockResolvedValue(undefined)
  mocks.api.deleteOfficeFile.mockResolvedValue(undefined)
})

afterEach(() => {
  clients.forEach((client) => client.clear())
  clients = []
  localStorage.clear()
})

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <OfficeView />
    </QueryClientProvider>
  )
}

test('a new task is created on request when none is open', async () => {
  const user = userEvent.setup()
  renderView()

  expect(await screen.findByText('No office task open')).toBeInTheDocument()
  const [, newTask] = await screen.findAllByRole('button', {
    name: 'New office task',
  })
  await user.click(newTask)

  await waitFor(() =>
    expect(mocks.api.createOfficeSession).toHaveBeenCalledTimes(1)
  )
  expect(
    await screen.findByText('Nothing has been asked yet')
  ).toBeInTheDocument()
})

test('the recorded steps of the open task are replayed', async () => {
  openSession({
    events: [
      { type: 'user_input', text: 'Summarise the inbox', at: 1 },
      {
        type: 'item.completed',
        item: {
          id: 'item_0',
          type: 'command_execution',
          command: 'ls -la',
          aggregated_output: 'total 0',
          exit_code: 0,
          status: 'completed',
        },
      },
      {
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'All clear' },
      },
      { type: 'turn.completed', usage: null },
    ],
  })
  renderView()

  expect(
    await screen.findByRole('heading', { name: 'Quarterly report' })
  ).toBeInTheDocument()
  const taskList = screen.getByRole('complementary', { name: 'Office tasks' })
  expect(within(taskList).getByText('Quarterly report')).toBeInTheDocument()

  const timeline = screen.getByRole('log')
  expect(within(timeline).getByText('You')).toBeInTheDocument()
  expect(within(timeline).getByText('Summarise the inbox')).toBeInTheDocument()
  expect(within(timeline).getByText('ls -la')).toBeInTheDocument()
  expect(within(timeline).getByText('Finished')).toBeInTheDocument()
  expect(await within(timeline).findByText('All clear')).toBeInTheDocument()

  const context = screen.getByRole('complementary', { name: 'Context' })
  expect(within(context).getByText('gpt-5.1-codex')).toBeInTheDocument()
  expect(within(context).getByText('Ready')).toBeInTheDocument()
  expect(
    within(context).getByRole('button', { name: 'Upload file' })
  ).toBeInTheDocument()
})

test('completed reasoning stays collapsed until the reader expands it', async () => {
  const user = userEvent.setup()
  openSession({
    events: [
      { type: 'user_input', text: 'Inspect the workspace', at: 1 },
      {
        type: 'item.completed',
        item: {
          id: 'reasoning_0',
          type: 'reasoning',
          text: 'Check the available files first',
        },
      },
      { type: 'turn.completed', usage: null },
    ],
  })
  renderView()

  const trigger = await screen.findByRole('button', {
    name: 'Thought for 0 seconds',
  })
  expect(
    screen.queryByText('Check the available files first')
  ).not.toBeInTheDocument()

  await user.click(trigger)

  expect(
    await screen.findByText('Check the available files first')
  ).toBeVisible()
})

test('a sent task streams the worker events and ends with the terminal event', async () => {
  openSession()
  renderView()
  const stream = await sendTask('Write a report')

  expect(stream.url).toBe(`/api/office/turns/${SESSION_ID}`)
  expect(JSON.parse(stream.payload)).toEqual({
    prompt: 'Write a report',
    model: 'gpt-5.1-codex',
    group: 'default',
  })
  expect(
    within(screen.getByRole('log')).getByText('Working on it…')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

  act(() => {
    stream.emit('message', {
      data: JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_0', type: 'agent_message', text: 'Report ready' },
      }),
    })
  })
  expect(await screen.findByText('Report ready')).toBeInTheDocument()

  act(() => {
    stream.emit('message', {
      data: JSON.stringify({ type: 'turn.completed', usage: null }),
    })
  })
  closeStream(stream)

  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Stop' })
    ).not.toBeInTheDocument()
  )
  expect(screen.queryByText('Working on it…')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
})

test('a turn runs in the chosen group with a model of that group', async () => {
  const user = userEvent.setup()
  openSession()
  renderView()

  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  )
  await user.click(screen.getByRole('combobox'))
  await user.click(await screen.findByRole('button', { name: 'vip' }))
  await user.keyboard('{Escape}')

  await waitFor(() =>
    expect(mocks.playgroundApi.getUserModels).toHaveBeenCalledWith('vip')
  )
  const stream = await sendTask('Write a report')

  expect(JSON.parse(stream.payload)).toEqual({
    prompt: 'Write a report',
    model: 'o3',
    group: 'vip',
  })
  const context = screen.getByRole('complementary', { name: 'Context' })
  expect(await within(context).findByText('o3')).toBeInTheDocument()
})

type DropEntry = { name: string; isDirectory?: boolean }

/** A file drop as the browser reports it: one drag item per file. */
function dropData(...entries: DropEntry[]) {
  return {
    types: ['Files'],
    files: entries.map((entry) => new File(['x'], entry.name)),
    items: entries.map((entry) => ({
      kind: 'file',
      webkitGetAsEntry: () => ({ isDirectory: entry.isDirectory ?? false }),
    })),
  }
}

function taskBox(container: HTMLElement) {
  const form = container.querySelector('form')
  if (!form) throw new Error('the task box is missing')
  return form
}

const DROP_HINT = 'Drop files to upload them to the workspace'

test('files dropped on the task box are uploaded into the workspace', async () => {
  openSession()
  const { container } = renderView()

  fireEvent.drop(taskBox(container), {
    dataTransfer: dropData({ name: 'notes.md' }, { name: 'report.pdf' }),
  })

  await waitFor(() =>
    expect(mocks.api.uploadOfficeFile).toHaveBeenCalledTimes(2)
  )
  expect(mocks.api.uploadOfficeFile).toHaveBeenNthCalledWith(
    1,
    SESSION_ID,
    expect.objectContaining({ name: 'notes.md' }),
    undefined
  )
  expect(mocks.api.uploadOfficeFile).toHaveBeenNthCalledWith(
    2,
    SESSION_ID,
    expect.objectContaining({ name: 'report.pdf' }),
    undefined
  )
  // Uploading is not a turn: no task stream was opened.
  expect(mocks.streams).toHaveLength(0)
})

test('files dropped on the workspace files panel are uploaded', async () => {
  openSession()
  renderView()

  fireEvent.drop(screen.getByRole('region', { name: 'Workspace files' }), {
    dataTransfer: dropData({ name: 'report.pdf' }),
  })

  await waitFor(() =>
    expect(mocks.api.uploadOfficeFile).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ name: 'report.pdf' }),
      undefined
    )
  )
})

test('dragging files over an upload area shows the drop hint until the drag leaves', async () => {
  openSession()
  const { container } = renderView()
  const box = taskBox(container)
  const panel = screen.getByRole('region', { name: 'Workspace files' })
  const drag = { dataTransfer: { types: ['Files'], files: [], items: [] } }

  expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()

  fireEvent.dragEnter(box, drag)
  expect(await screen.findByText(DROP_HINT)).toBeInTheDocument()
  fireEvent.dragLeave(box, drag)
  await waitFor(() =>
    expect(screen.queryByText(DROP_HINT)).not.toBeInTheDocument()
  )

  fireEvent.dragEnter(panel, drag)
  expect(await within(panel).findByText(DROP_HINT)).toBeInTheDocument()
  // Nothing is uploaded before the files are dropped.
  expect(mocks.api.uploadOfficeFile).not.toHaveBeenCalled()
})

test('a dropped folder is not uploaded and is reported', async () => {
  const report = vi.spyOn(toast, 'error').mockImplementation(() => 1)
  openSession()
  renderView()

  fireEvent.drop(screen.getByRole('region', { name: 'Workspace files' }), {
    dataTransfer: dropData({ name: 'assets', isDirectory: true }),
  })

  await waitFor(() =>
    expect(report).toHaveBeenCalledWith(
      'Folders cannot be uploaded. Drop their files instead.'
    )
  )
  expect(mocks.api.uploadOfficeFile).not.toHaveBeenCalled()
  report.mockRestore()
})

const WORKSPACE = [
  { path: 'docs', size: 0, isDir: true },
  { path: 'docs/brief.txt', size: 15, isDir: false },
]

async function askToDelete(name: string) {
  const user = userEvent.setup()
  const panel = screen.getByRole('region', { name: 'Workspace files' })
  await user.click(await within(panel).findByRole('button', { name }))
  return { dialog: await screen.findByRole('alertdialog'), user }
}

test('a workspace file is deleted only after it is confirmed', async () => {
  mocks.api.listOfficeFiles.mockResolvedValue(WORKSPACE)
  openSession()
  renderView()
  // A path with special characters is named as it is written.
  expect(
    await within(
      screen.getByRole('region', { name: 'Workspace files' })
    ).findByRole('button', { name: 'Download docs/brief.txt' })
  ).toBeInTheDocument()
  const { dialog, user } = await askToDelete('Delete docs/brief.txt')

  expect(
    within(dialog).getByText('Delete "docs/brief.txt"?')
  ).toBeInTheDocument()
  expect(mocks.api.deleteOfficeFile).not.toHaveBeenCalled()

  await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

  await waitFor(() =>
    expect(mocks.api.deleteOfficeFile).toHaveBeenCalledWith(
      SESSION_ID,
      'docs/brief.txt'
    )
  )
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
})

test('a workspace folder can be deleted as well', async () => {
  mocks.api.listOfficeFiles.mockResolvedValue(WORKSPACE)
  openSession()
  renderView()
  const { dialog, user } = await askToDelete('Delete docs')

  await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

  await waitFor(() =>
    expect(mocks.api.deleteOfficeFile).toHaveBeenCalledWith(SESSION_ID, 'docs')
  )
})

test('cancelling the deletion keeps the workspace file', async () => {
  mocks.api.listOfficeFiles.mockResolvedValue(WORKSPACE)
  openSession()
  renderView()
  const { dialog, user } = await askToDelete('Delete docs/brief.txt')

  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
  expect(mocks.api.deleteOfficeFile).not.toHaveBeenCalled()
  expect(
    within(screen.getByRole('region', { name: 'Workspace files' })).getByText(
      'docs/brief.txt'
    )
  ).toBeInTheDocument()
})

test('workspace files cannot be deleted while a task is running', async () => {
  mocks.api.listOfficeFiles.mockResolvedValue(WORKSPACE)
  openSession()
  renderView()
  const panel = screen.getByRole('region', { name: 'Workspace files' })
  expect(
    await within(panel).findByRole('button', { name: 'Delete docs/brief.txt' })
  ).toBeEnabled()

  await sendTask('Write a report')

  expect(
    within(panel).getByRole('button', { name: 'Delete docs/brief.txt' })
  ).toBeDisabled()
})

test('Stop ends the running task and tells the server', async () => {
  const user = userEvent.setup()
  openSession()
  renderView()
  await sendTask('Write a report')

  await user.click(screen.getByRole('button', { name: 'Stop' }))

  await waitFor(() =>
    expect(mocks.api.stopOfficeTurn).toHaveBeenCalledWith(SESSION_ID)
  )
  expect(await screen.findByText('The turn was stopped')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
})

test('a rejected start shows the server message instead of a running task', async () => {
  openSession()
  renderView()
  const stream = await sendTask('Write a report')

  act(() => {
    stream.emit('error', {
      data: JSON.stringify({
        success: false,
        message: 'You already have an office task in progress',
        message_key: 'You already have an office task in progress',
      }),
    })
  })
  closeStream(stream)

  expect(
    await screen.findByText('You already have an office task in progress')
  ).toBeInTheDocument()
  expect(screen.queryByText('Working on it…')).not.toBeInTheDocument()
})

test('a dropped connection is reported as lost and leaves no running task', async () => {
  openSession()
  renderView()
  const stream = await sendTask('Write a report')

  closeStream(stream)

  expect(
    await screen.findByText('Connection to the office task was lost')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument()
})
