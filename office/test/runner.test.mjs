import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

import { TurnRunner } from '../src/runner.mjs'
import { OfficeError, Store } from '../src/store.mjs'

const USER = 7
const TURN = {
  userId: USER,
  prompt: 'Summarise the workspace',
  apiKey: 'sk-test',
  model: 'gpt-test',
  timeoutMs: 60_000,
}
const tmpDirs = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

/**
 * A Codex SDK stand-in: every thread streams `events` once started, or waits
 * for the abort signal when `hang` is set.
 */
function fakeCodex(events, { hang = false, failWith = null } = {}) {
  const calls = { configs: [], threadOptions: [] }
  const createCodex = (options) => {
    calls.configs.push(options)
    const open = (threadOptions) => {
      calls.threadOptions.push(threadOptions)
      return {
        runStreamed: (_input, turnOptions) => ({
          events: (async function* () {
            if (turnOptions.signal.aborted) throw new Error('Codex Exec exited with code 143')
            if (hang) {
              await new Promise((resolve) => {
                turnOptions.signal.addEventListener('abort', () => resolve(), { once: true })
              })
              throw new Error('Codex Exec exited with code 143')
            }
            for (const event of events) yield event
            if (failWith) throw new Error(failWith)
          })(),
        }),
      }
    }
    return {
      startThread: (threadOptions) => open(threadOptions),
      resumeThread: (threadId, threadOptions) => {
        calls.resumed = threadId
        return open(threadOptions)
      },
    }
  }
  return { createCodex, calls }
}

async function setup(createCodex, maxConcurrentTurns = 4) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'office-runner-'))
  tmpDirs.push(root)
  const store = new Store(root)
  await store.init()
  const { id } = await store.createSession(USER)
  const runner = new TurnRunner({ store, callbackBaseUrl: 'http://site/v1', maxConcurrentTurns, createCodex })
  return { store, runner, sessionId: id }
}

async function collect(runner, turn) {
  const events = []
  for await (const event of runner.run(turn)) events.push(event)
  return events
}

test('a successful turn streams the Codex events and records the thread id', async () => {
  const codexEvents = [
    { type: 'thread.started', thread_id: 'thread-1' },
    { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Done' } },
    { type: 'turn.completed', usage: null },
  ]
  const fake = fakeCodex(codexEvents)
  const { store, runner, sessionId } = await setup(fake.createCodex)

  assert.deepEqual(await collect(runner, { ...TURN, sessionId }), codexEvents)
  assert.equal((await store.getMeta(USER, sessionId)).threadId, 'thread-1')
  assert.equal((await store.getMeta(USER, sessionId)).title, TURN.prompt)
  assert.equal(runner.runningCount, 0)
})

test('the agent runs sandboxed to the workspace without network and calls the site over HTTPS', async () => {
  const fake = fakeCodex([{ type: 'turn.completed', usage: null }])
  const { runner, sessionId } = await setup(fake.createCodex)

  await collect(runner, { ...TURN, sessionId })

  const [codexOptions] = fake.calls.configs
  assert.deepEqual(codexOptions.config.model_providers.office, {
    name: 'Site',
    base_url: 'http://site/v1',
    env_key: 'OFFICE_API_KEY',
    wire_api: 'responses',
  })
  assert.equal(codexOptions.config.model_provider, 'office')
  // A custom provider is what keeps the CLI off the WebSocket transport.
  assert.equal(codexOptions.baseUrl, undefined)
  assert.equal(codexOptions.apiKey, undefined)
  assert.equal(codexOptions.env.OFFICE_API_KEY, 'sk-test')
  assert.deepEqual(Object.keys(codexOptions.env).sort(), [
    'CODEX_HOME',
    'HOME',
    'LANG',
    'OFFICE_API_KEY',
    'PATH',
  ])
  assert.deepEqual(
    (({ workingDirectory, ...rest }) => rest)(fake.calls.threadOptions[0]),
    {
      skipGitRepoCheck: true,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
      model: 'gpt-test',
    }
  )
})

test('a later turn resumes the recorded thread', async () => {
  const fake = fakeCodex([{ type: 'turn.completed', usage: null }])
  const { store, runner, sessionId } = await setup(fake.createCodex)
  await store.setThreadId(USER, sessionId, 'thread-earlier')

  await collect(runner, { ...TURN, sessionId })

  assert.equal(fake.calls.resumed, 'thread-earlier')
  assert.equal(fake.calls.threadOptions.length, 1)
})

test('a CLI failure after turn.failed is reported exactly once', async () => {
  const failed = { type: 'turn.failed', error: { message: 'unexpected status 401 Unauthorized' } }
  const fake = fakeCodex([{ type: 'turn.started' }, failed], { failWith: 'Codex Exec exited with code 1' })
  const { runner, sessionId } = await setup(fake.createCodex)

  const events = await collect(runner, { ...TURN, sessionId })

  assert.deepEqual(events, [{ type: 'turn.started' }, failed])
})

test('a CLI crash without a terminal event ends the stream with one failure', async () => {
  const fake = fakeCodex([{ type: 'turn.started' }], { failWith: 'sandbox is not available' })
  const { runner, sessionId } = await setup(fake.createCodex)

  const events = await collect(runner, { ...TURN, sessionId })

  assert.equal(events.length, 2)
  assert.deepEqual(events[1], { type: 'turn.failed', error: { message: 'sandbox is not available' } })
})

test('stopping a running turn reports it as stopped', async () => {
  const fake = fakeCodex([], { hang: true })
  const { runner, sessionId } = await setup(fake.createCodex)
  const running = collect(runner, { ...TURN, sessionId })
  while (runner.runningCount === 0) await new Promise((resolve) => setImmediate(resolve))

  assert.equal(runner.stop(USER, sessionId), true)
  const events = await running

  assert.deepEqual(events, [{ type: 'turn.failed', error: { message: 'The turn was stopped' } }])
  assert.equal(runner.stop(USER, sessionId), false)
  assert.equal(runner.runningCount, 0)
})

test('a turn that exceeds its timeout is stopped and reported as timed out', async () => {
  const fake = fakeCodex([], { hang: true })
  const { runner, sessionId } = await setup(fake.createCodex)

  const events = await collect(runner, { ...TURN, sessionId, timeoutMs: 1000 })

  assert.deepEqual(events, [{ type: 'turn.failed', error: { message: 'The turn timed out and was stopped' } }])
})

test('only one turn runs per session and the global limit is enforced', async () => {
  const fake = fakeCodex([], { hang: true })
  const { runner, sessionId } = await setup(fake.createCodex, 1)
  const running = collect(runner, { ...TURN, sessionId })
  while (runner.runningCount === 0) await new Promise((resolve) => setImmediate(resolve))

  await assert.rejects(collect(runner, { ...TURN, sessionId }), { status: 409 })
  const { id: otherSession } = await runner.store.createSession(USER)
  await assert.rejects(collect(runner, { ...TURN, sessionId: otherSession }), { status: 429 })

  runner.stopAll()
  await running
})
