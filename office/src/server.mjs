import { createHash, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { TurnRunner } from './runner.mjs'
import { OfficeError, Store } from './store.mjs'

const require = createRequire(import.meta.url)
const JSON_BODY_LIMIT = 1 << 20
const MAX_PROMPT_LENGTH = 64_000
const MAX_TIMEOUT_MS = 3 * 60 * 60 * 1000
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
}

/**
 * Builds the internal HTTP API. Only the gateway calls it, authenticated by the
 * shared worker token; it carries the acting user id on every request.
 * @param {object} options
 * @param {Store} options.store
 * @param {TurnRunner} options.runner
 * @param {string} options.token
 * @param {number} options.maxUploadBytes
 * @returns {http.Server}
 */
export function createServer({ store, runner, token, maxUploadBytes }) {
  const tokenDigest = createHash('sha256').update(token).digest()

  return http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const status = error instanceof OfficeError ? error.status : 500
      const message = status === 500 ? 'Office worker internal error' : error.message
      if (status === 500) console.error('office worker request failed:', error)
      sendJson(res, status, { success: false, message })
    })
  })

  async function handle(req, res) {
    const url = new URL(req.url, 'http://office-worker')
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { success: true, data: { codex: require('@openai/codex/package.json').version } })
      return
    }
    if (!authorized(req)) throw new OfficeError(401, 'Unauthorized')
    const route = url.pathname.split('/').filter(Boolean)
    const userIdParam = url.searchParams.get('userId')
    const userId = /^\d+$/.test(userIdParam ?? '') ? Number(userIdParam) : 0

    // Session collection
    if (route.length === 1 && route[0] === 'sessions') {
      if (req.method === 'POST') {
        const body = await readJson(req)
        sendJson(res, 200, { success: true, data: await store.createSession(validUserId(body.userId)) })
        return
      }
      if (req.method === 'GET') {
        sendJson(res, 200, { success: true, data: { sessions: await store.listSessions(validUserId(userId)) } })
        return
      }
    }

    // One session: /sessions/:id[/events|/files|/files/content]
    if (route[0] === 'sessions' && route.length >= 2) {
      const sessionId = route[1]
      if (route.length === 2 && req.method === 'DELETE') {
        await store.deleteSession(validUserId(userId), sessionId)
        sendJson(res, 200, { success: true })
        return
      }
      if (route.length === 3 && route[2] === 'events' && req.method === 'GET') {
        sendJson(res, 200, { success: true, data: { events: await store.readEvents(validUserId(userId), sessionId) } })
        return
      }
      if (route.length === 3 && route[2] === 'files') {
        if (req.method === 'GET') {
          sendJson(res, 200, { success: true, data: { files: await store.listFiles(validUserId(userId), sessionId) } })
          return
        }
        if (req.method === 'POST') {
          await receiveFile(validUserId(userId), sessionId, url.searchParams.get('path') ?? '', req)
          sendJson(res, 200, { success: true })
          return
        }
        if (req.method === 'DELETE') {
          await store.deleteFile(validUserId(userId), sessionId, url.searchParams.get('path') ?? '')
          sendJson(res, 200, { success: true })
          return
        }
      }
      if (route.length === 4 && route[2] === 'files' && route[3] === 'content' && req.method === 'GET') {
        await sendFile(validUserId(userId), sessionId, url.searchParams.get('path') ?? '', res)
        return
      }
    }

    // Turns: /turns/:id and /turns/:id/stop
    if (route[0] === 'turns' && route.length === 2 && req.method === 'POST') {
      const body = await readJson(req)
      await streamTurn(validUserId(body.userId), route[1], body, res)
      return
    }
    if (route[0] === 'turns' && route.length === 3 && route[2] === 'stop' && req.method === 'POST') {
      const body = await readJson(req)
      const stopped = runner.stop(validUserId(body.userId), route[1])
      sendJson(res, 200, { success: true, data: { stopped } })
      return
    }
    throw new OfficeError(404, 'Not found')
  }

  function authorized(req) {
    const header = req.headers.authorization ?? ''
    if (!header.startsWith('Bearer ')) return false
    const digest = createHash('sha256').update(header.slice(7)).digest()
    return timingSafeEqual(digest, tokenDigest)
  }

  async function streamTurn(userId, sessionId, body, res) {
    const prompt = body.prompt
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
      throw new OfficeError(400, 'Invalid prompt')
    }
    if (typeof body.apiKey !== 'string' || !body.apiKey || typeof body.model !== 'string' || !body.model) {
      throw new OfficeError(400, 'Invalid turn request')
    }
    const timeoutMs = Number(body.timeoutMs)
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new OfficeError(400, 'Invalid turn timeout')
    }
    await store.getMeta(userId, sessionId)

    const events = runner.run({ userId, sessionId, prompt, apiKey: body.apiKey, model: body.model, timeoutMs })
    // The gateway only closes early when the browser disconnected or the turn
    // is being stopped; either way the agent must not keep running.
    res.on('close', () => {
      if (!res.writableFinished) runner.stop(userId, sessionId)
    })
    // Start the turn before sending headers so a busy or unknown session is
    // reported as JSON instead of as an empty stream.
    let step = await events.next()
    const input = { type: 'user_input', text: prompt, at: Date.now() }
    await store.appendEvent(userId, sessionId, input)

    res.writeHead(200, SSE_HEADERS)
    const write = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
    write(input)
    while (!step.done) {
      await store.appendEvent(userId, sessionId, step.value)
      write(step.value)
      step = await events.next()
    }
    res.end()
  }

  async function receiveFile(userId, sessionId, relative, req) {
    const target = await store.resolveFile(userId, sessionId, relative, true)
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > maxUploadBytes) throw new OfficeError(413, 'File is too large')
      chunks.push(chunk)
    }
    await fs.writeFile(target, Buffer.concat(chunks), { mode: 0o644 })
  }

  async function sendFile(userId, sessionId, relative, res) {
    let target
    try {
      target = await store.resolveFile(userId, sessionId, relative)
    } catch (error) {
      throw error.code === 'ENOENT' ? new OfficeError(404, 'File not found') : error
    }
    let stat
    try {
      stat = await fs.stat(target)
    } catch {
      throw new OfficeError(404, 'File not found')
    }
    if (!stat.isFile()) throw new OfficeError(404, 'File not found')
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(target))}`,
    })
    for await (const chunk of createReadStream(target)) res.write(chunk)
    res.end()
  }
}

function validUserId(value) {
  if (!Number.isInteger(value) || value <= 0) throw new OfficeError(400, 'Invalid user id')
  return value
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

async function readJson(req) {
  const buffer = await readBody(req, JSON_BODY_LIMIT)
  try {
    return JSON.parse(buffer.toString('utf8') || '{}')
  } catch {
    throw new OfficeError(400, 'Invalid JSON body')
  }
}

async function readBody(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new OfficeError(413, 'Request body is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function main() {
  const token = process.env.OFFICE_WORKER_TOKEN
  const callbackBaseUrl = process.env.OFFICE_CALLBACK_BASE_URL
  if (!token || !callbackBaseUrl) {
    console.error('OFFICE_WORKER_TOKEN and OFFICE_CALLBACK_BASE_URL are required')
    process.exit(1)
  }
  const dataDir = process.env.OFFICE_DATA_DIR ?? '/var/lib/new-api/office'
  const store = new Store(dataDir)
  await store.init()
  const maxConcurrentTurns = Number(process.env.OFFICE_MAX_CONCURRENT_TURNS) || 4
  const runner = new TurnRunner({ store, callbackBaseUrl, maxConcurrentTurns })
  const server = createServer({
    store,
    runner,
    token,
    maxUploadBytes: Number(process.env.OFFICE_MAX_UPLOAD_BYTES) || 20 * 1024 * 1024,
  })
  // Turn streams stay open for many minutes; disable the default request timeout.
  server.requestTimeout = 0
  server.listen(Number(process.env.PORT) || 8090, () => {
    console.log(`office worker listening on port ${server.address().port}`)
  })
  const shutdown = () => {
    runner.stopAll()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

const fsSync = await import('node:fs')

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('office worker failed to start:', error)
    process.exit(1)
  })
}
