import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { TurnRunner } from '../src/runner.mjs'
import { createServer } from '../src/server.mjs'
import { Store } from '../src/store.mjs'

const TOKEN = 'worker-shared-token'
const AUTH = { authorization: `Bearer ${TOKEN}` }
const USER = 7

let server
let baseUrl
let store
const root = (await fs.mkdtemp(path.join(os.tmpdir(), 'office-server-')))

before(async () => {
  store = new Store(root)
  await store.init()
  const codexEvents = [
    { type: 'thread.started', thread_id: 'thread-1' },
    { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Done' } },
    { type: 'turn.completed', usage: null },
  ]
  const createCodex = () => ({
    startThread: () => ({ runStreamed: () => ({ events: (async function* () { yield* codexEvents })() }) }),
    resumeThread: () => ({ runStreamed: () => ({ events: (async function* () { yield* codexEvents })() }) }),
  })
  const runner = new TurnRunner({ store, callbackBaseUrl: 'http://site/v1', maxConcurrentTurns: 2, createCodex })
  server = createServer({ store, runner, token: TOKEN, maxUploadBytes: 16 })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(root, { recursive: true, force: true })
})

function request(method, pathname, { body, headers = {}, raw } = {}) {
  const init = { method, headers: { ...AUTH, ...headers } }
  if (body !== undefined) init.body = JSON.stringify(body)
  if (raw !== undefined) init.body = raw
  return fetch(`${baseUrl}${pathname}`, init)
}

async function json(response) {
  return { status: response.status, ...(await response.json()) }
}

test('requests without the worker token are rejected', async () => {
  assert.equal((await request('GET', '/sessions?userId=7', { headers: { authorization: 'Bearer wrong' } })).status, 401)
  assert.equal((await fetch(`${baseUrl}/sessions?userId=7`)).status, 401)
  const health = await (await fetch(`${baseUrl}/health`)).json()
  assert.equal(health.success, true)
})

test('sessions can be created, listed and deleted over the API', async () => {
  const created = await json(await request('POST', '/sessions', { body: { userId: USER } }))
  assert.equal(created.success, true)
  assert.match(created.data.id, /^[a-f0-9]{32}$/)

  const listed = await json(await request('GET', `/sessions?userId=${USER}`))
  assert.deepEqual(listed.data.sessions.map((item) => item.id), [created.data.id])
  assert.deepEqual((await json(await request('GET', '/sessions?userId=8'))).data.sessions, [])

  assert.equal((await request('DELETE', `/sessions/${created.data.id}?userId=8`)).status, 404)
  assert.equal((await request('DELETE', `/sessions/${created.data.id}?userId=${USER}`)).status, 200)
  assert.equal((await request('GET', `/sessions/${created.data.id}/events?userId=${USER}`)).status, 404)
  assert.equal((await request('POST', '/sessions', { body: { userId: 0 } })).status, 400)
})

test('a turn streams server-sent events and is replayable afterwards', async () => {
  const { data } = await json(await request('POST', '/sessions', { body: { userId: USER } }))
  const body = { userId: USER, prompt: 'Write a report', apiKey: 'sk-short-lived', model: 'gpt-test', timeoutMs: 30_000 }

  const response = await request('POST', `/turns/${data.id}`, { body })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/event-stream/)
  const frames = (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, '')))

  assert.deepEqual(
    frames.map((event) => event.type),
    ['user_input', 'thread.started', 'item.completed', 'turn.completed']
  )
  const replay = await json(await request('GET', `/sessions/${data.id}/events?userId=${USER}`))
  assert.deepEqual(replay.data.events, frames)
  const meta = (await json(await request('GET', `/sessions?userId=${USER}`))).data.sessions.find((item) => item.id === data.id)
  assert.equal(meta.threadId, 'thread-1')
  assert.equal(meta.title, 'Write a report')
})

test('invalid turns and turns of unknown sessions are JSON errors, not streams', async () => {
  const { data } = await json(await request('POST', '/sessions', { body: { userId: USER } }))
  const valid = { userId: USER, prompt: 'hi', apiKey: 'sk', model: 'gpt-test', timeoutMs: 30_000 }

  for (const [patch, status] of [
    [{ prompt: '   ' }, 400],
    [{ apiKey: '' }, 400],
    [{ timeoutMs: 5 }, 400],
  ]) {
    const response = await request('POST', `/turns/${data.id}`, { body: { ...valid, ...patch } })
    assert.equal(response.status, status)
    assert.match(response.headers.get('content-type'), /^application\/json/)
  }
  assert.equal((await request('POST', `/turns/${'f'.repeat(32)}`, { body: valid })).status, 404)
  assert.equal((await request('POST', `/turns/${data.id}/stop`, { body: { userId: USER } })).status, 200)
  assert.deepEqual((await json(await request('POST', `/turns/${data.id}/stop`, { body: { userId: USER } }))).data, {
    stopped: false,
  })
})

test('files can be uploaded into and downloaded from the workspace only', async () => {
  const { data } = await json(await request('POST', '/sessions', { body: { userId: USER } }))
  const base = `/sessions/${data.id}/files`

  const uploaded = await request('POST', `${base}?userId=${USER}&path=docs/brief.txt`, {
    raw: 'quarterly brief',
    headers: { 'content-type': 'text/plain' },
  })
  assert.equal(uploaded.status, 200)

  const download = await request('GET', `${base}/content?userId=${USER}&path=docs/brief.txt`)
  assert.equal(await download.text(), 'quarterly brief')
  assert.match(download.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''brief\.txt$/)

  const listed = await json(await request('GET', `${base}?userId=${USER}`))
  assert.deepEqual(listed.data.files, [
    { path: 'docs', size: 0, isDir: true },
    { path: 'docs/brief.txt', size: 15, isDir: false },
  ])

  assert.equal((await request('POST', `${base}?userId=${USER}&path=../meta.json`, { raw: 'x' })).status, 400)
  assert.equal((await request('GET', `${base}/content?userId=${USER}&path=../meta.json`)).status, 400)
  assert.equal((await request('GET', `${base}/content?userId=${USER}&path=missing.txt`)).status, 404)
  assert.equal((await request('GET', `${base}/content?userId=8&path=docs/brief.txt`)).status, 404)
  assert.equal((await request('POST', `${base}?userId=${USER}&path=big.bin`, { raw: 'x'.repeat(17) })).status, 413)
  assert.equal((await request('GET', `${base}?userId=${USER}`)).status, 200)
})

test('workspace files can be deleted over the API only by their owner', async () => {
  const { data } = await json(await request('POST', '/sessions', { body: { userId: USER } }))
  const base = `/sessions/${data.id}/files`
  await request('POST', `${base}?userId=${USER}&path=docs/brief.txt`, {
    raw: 'quarterly brief',
    headers: { 'content-type': 'text/plain' },
  })

  assert.equal((await request('DELETE', `${base}?userId=8&path=docs/brief.txt`)).status, 404)
  assert.equal((await request('DELETE', `${base}?userId=${USER}&path=missing.txt`)).status, 404)
  assert.equal((await request('DELETE', `${base}?userId=${USER}&path=../meta.json`)).status, 400)
  assert.deepEqual((await json(await request('GET', `${base}?userId=${USER}`))).data.files, [
    { path: 'docs', size: 0, isDir: true },
    { path: 'docs/brief.txt', size: 15, isDir: false },
  ])

  assert.equal((await request('DELETE', `${base}?userId=${USER}&path=docs`)).status, 200)
  assert.deepEqual((await json(await request('GET', `${base}?userId=${USER}`))).data.files, [])
})
