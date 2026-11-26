import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

import { OfficeError, Store } from '../src/store.mjs'

const USER = 7
const tmpDirs = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

async function createStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'office-store-'))
  tmpDirs.push(root)
  const store = new Store(root)
  await store.init()
  return store
}

async function statusOf(promise) {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    return error instanceof OfficeError ? error.status : error
  }
}

test('a session is readable only by the user who created it', async () => {
  const store = await createStore()
  const meta = await store.createSession(USER)

  assert.equal((await store.getMeta(USER, meta.id)).id, meta.id)
  assert.equal(await statusOf(store.getMeta(USER + 1, meta.id)), 404)
  assert.equal(await statusOf(store.getMeta(USER, 'not-a-session-id')), 400)
  assert.deepEqual((await store.listSessions(USER)).map((item) => item.id), [meta.id])
  assert.deepEqual(await store.listSessions(USER + 1), [])
})

test('the title is taken from the first prompt and the thread id is persisted', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)

  const touched = await store.touch(USER, id, 'Write the quarterly report')
  await store.touch(USER, id, 'A second prompt')
  await store.setThreadId(USER, id, 'thread-1')

  assert.equal(touched.title, 'Write the quarterly report')
  const meta = await store.getMeta(USER, id)
  assert.equal(meta.title, 'Write the quarterly report')
  assert.equal(meta.threadId, 'thread-1')
})

test('deleting a session removes it for good', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)

  await store.deleteSession(USER, id)

  assert.equal(await statusOf(store.getMeta(USER, id)), 404)
  assert.equal(await statusOf(store.deleteSession(USER + 1, id)), 404)
})

test('events are replayed in the order they were appended', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)

  await store.appendEvent(USER, id, { type: 'user_input', text: 'hello' })
  await store.appendEvent(USER, id, { type: 'turn.completed', usage: null })

  assert.deepEqual(await store.readEvents(USER, id), [
    { type: 'user_input', text: 'hello' },
    { type: 'turn.completed', usage: null },
  ])
})

test('file paths that leave the workspace are rejected', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)
  const workspace = store.workspace(USER, id)
  await fs.writeFile(path.join(workspace, 'notes.md'), 'ok')

  assert.equal(path.basename(await store.resolveFile(USER, id, 'notes.md')), 'notes.md')
  assert.equal(path.basename(await store.resolveFile(USER, id, './reports/../notes.md')), 'notes.md')
  for (const escape of ['../meta.json', 'reports/../../meta.json', '/etc/passwd', '..', '', 'a\0b']) {
    assert.equal(await statusOf(store.resolveFile(USER, id, escape)), 400, escape)
  }
})

test('a symlink created by the agent cannot expose files outside the workspace', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)
  const workspace = store.workspace(USER, id)
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'office-outside-'))
  tmpDirs.push(outside)
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')
  await fs.symlink(outside, path.join(workspace, 'link'), process.platform === 'win32' ? 'junction' : 'dir')

  assert.equal(await statusOf(store.resolveFile(USER, id, 'link/secret.txt')), 400)
  const files = await store.listFiles(USER, id)
  assert.equal(files.some((entry) => entry.path === 'link/secret.txt'), false)
})

test('a workspace file or folder can be deleted, nothing outside it', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)
  const workspace = store.workspace(USER, id)
  await fs.mkdir(path.join(workspace, 'out', 'drafts'), { recursive: true })
  await fs.writeFile(path.join(workspace, 'notes.md'), 'ok')
  await fs.writeFile(path.join(workspace, 'out', 'report.md'), '12345')
  await fs.writeFile(path.join(workspace, 'out', 'drafts', 'report.md'), 'old')
  const paths = async () => (await store.listFiles(USER, id)).map((entry) => entry.path)

  await store.deleteFile(USER, id, 'out/drafts/report.md')
  // Deleting a file leaves its folder in place.
  assert.deepEqual(await paths(), ['notes.md', 'out', 'out/drafts', 'out/report.md'])

  await store.deleteFile(USER, id, 'out')
  assert.deepEqual(await paths(), ['notes.md'])

  // The session files sit next to the workspace: unreachable and untouched.
  assert.equal(await statusOf(store.deleteFile(USER, id, '../meta.json')), 400)
  assert.equal(await statusOf(store.deleteFile(USER, id, '.')), 400)
  assert.equal(await statusOf(store.deleteFile(USER, id, 'missing.txt')), 404)
  assert.equal(await statusOf(store.deleteFile(USER + 1, id, 'notes.md')), 404)
  assert.equal(await statusOf(store.getMeta(USER, id)), 'resolved')
  assert.deepEqual(await paths(), ['notes.md'])
})

test('deleting a symbolic link removes the link, not what it points to', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)
  const workspace = store.workspace(USER, id)
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'office-outside-'))
  tmpDirs.push(outside)
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')
  await fs.symlink(outside, path.join(workspace, 'link'), process.platform === 'win32' ? 'junction' : 'dir')

  await store.deleteFile(USER, id, 'link')

  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'secret')
  assert.deepEqual(await store.listFiles(USER, id), [])
})

test('the file listing skips dependency folders and reports sizes', async () => {
  const store = await createStore()
  const { id } = await store.createSession(USER)
  const workspace = store.workspace(USER, id)
  await fs.mkdir(path.join(workspace, 'node_modules', 'pkg'), { recursive: true })
  await fs.mkdir(path.join(workspace, 'out'), { recursive: true })
  await fs.writeFile(path.join(workspace, 'out', 'report.md'), '12345')

  const files = await store.listFiles(USER, id)

  assert.deepEqual(files, [
    { path: 'node_modules', size: 0, isDir: true },
    { path: 'out', size: 0, isDir: true },
    { path: 'out/report.md', size: 5, isDir: false },
  ])
})
