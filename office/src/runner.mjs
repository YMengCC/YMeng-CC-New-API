import { Codex } from '@openai/codex-sdk'

import { OfficeError } from './store.mjs'

// The worker only ever runs the agent inside the Codex bubblewrap sandbox:
// the workspace is the single writable root and agent commands have no network.
const THREAD_OPTIONS = Object.freeze({
  skipGitRepoCheck: true,
  sandboxMode: 'workspace-write',
  approvalPolicy: 'never',
  networkAccessEnabled: false,
  webSearchMode: 'disabled',
})

// The site is configured as its own model provider: the built-in OpenAI one
// tries a WebSocket first, which managed proxies do not forward, while a
// custom provider keeps the CLI on plain HTTPS. The remaining keys keep the
// CLI from checking for updates or sending analytics.
const PROVIDER_ID = 'office'
const API_KEY_ENV = 'OFFICE_API_KEY'
const PROVIDER_DEFAULTS = Object.freeze({
  check_for_update_on_startup: false,
  'analytics.enabled': false,
  'feedback.enabled': false,
})

const MAX_ERROR_LENGTH = 2000

export class TurnRunner {
  /**
   * @param {object} options
   * @param {import('./store.mjs').Store} options.store
   * @param {string} options.callbackBaseUrl site `/v1` base URL the CLI sends model calls to
   * @param {number} options.maxConcurrentTurns
   * @param {(options: object) => import('@openai/codex-sdk').Codex} [options.createCodex]
   */
  constructor({ store, callbackBaseUrl, maxConcurrentTurns, createCodex = (options) => new Codex(options) }) {
    this.store = store
    this.callbackBaseUrl = callbackBaseUrl
    this.maxConcurrentTurns = maxConcurrentTurns
    this.createCodex = createCodex
    /** @type {Map<string, AbortController>} */
    this.active = new Map()
  }

  /**
   * Runs one turn and yields the Codex thread events, ending with exactly one
   * `turn.completed` or `turn.failed`.
   * @param {object} turn
   * @param {number} turn.userId
   * @param {string} turn.sessionId
   * @param {string} turn.prompt
   * @param {string} turn.apiKey short-lived site token for the model calls
   * @param {string} turn.model
   * @param {number} turn.timeoutMs
   * @returns {AsyncGenerator<object>}
   */
  async *run({ userId, sessionId, prompt, apiKey, model, timeoutMs }) {
    const key = `${userId}:${sessionId}`
    if (this.active.has(key)) throw new OfficeError(409, 'A turn is already running in this session')
    if (this.active.size >= this.maxConcurrentTurns) {
      throw new OfficeError(429, 'Too many office turns are running')
    }
    await this.store.touch(userId, sessionId, prompt)

    const abort = new AbortController()
    this.active.set(key, abort)
    let timedOut = false
    let stopped = false
    let finished = false
    const timer = setTimeout(() => {
      timedOut = true
      abort.abort()
    }, timeoutMs)
    const onStop = () => {
      stopped = true
      abort.abort()
    }
    abort.signal.addEventListener('stop', onStop)

    try {
      const codexHome = this.store.codexHome(userId, sessionId)
      const meta = await this.store.getMeta(userId, sessionId)
      const codex = this.createCodex({
        config: {
          ...PROVIDER_DEFAULTS,
          model_provider: PROVIDER_ID,
          model_providers: {
            [PROVIDER_ID]: {
              name: 'Site',
              base_url: this.callbackBaseUrl,
              env_key: API_KEY_ENV,
              wire_api: 'responses',
            },
          },
        },
        // Only these variables reach the CLI, so neither the worker token nor
        // any other worker setting is visible to the agent.
        env: {
          PATH: process.env.PATH,
          HOME: codexHome,
          CODEX_HOME: codexHome,
          LANG: 'C.UTF-8',
          [API_KEY_ENV]: apiKey,
        },
      })
      const options = { model, ...THREAD_OPTIONS, workingDirectory: this.store.workspace(userId, sessionId) }
      const thread = meta.threadId ? codex.resumeThread(meta.threadId, options) : codex.startThread(options)
      // A stop that arrived while the session metadata was loading must not
      // depend on the SDK noticing an already aborted signal.
      if (abort.signal.aborted) throw new Error('aborted before the CLI started')
      const { events } = await thread.runStreamed(prompt, { signal: abort.signal })
      for await (const event of events) {
        if (event.type === 'thread.started' && event.thread_id !== meta.threadId) {
          await this.store.setThreadId(userId, sessionId, event.thread_id)
        }
        if (event.type === 'turn.completed' || event.type === 'turn.failed') finished = true
        yield event
      }
      // A stream that ends without a terminal event means the CLI died or was
      // aborted; the client always gets exactly one terminal event.
      if (!finished) {
        yield { type: 'turn.failed', error: { message: stopReason(timedOut, stopped) ?? 'The turn ended without a result' } }
      }
    } catch (error) {
      if (!finished) {
        yield {
          type: 'turn.failed',
          error: { message: stopReason(timedOut, stopped) ?? describeError(error) },
        }
      }
    } finally {
      clearTimeout(timer)
      abort.signal.removeEventListener('stop', onStop)
      this.active.delete(key)
    }
  }

  /** Aborts the running turn of a session. @returns {boolean} whether one was running */
  stop(userId, sessionId) {
    const abort = this.active.get(`${userId}:${sessionId}`)
    if (!abort) return false
    abort.signal.dispatchEvent(new Event('stop'))
    return true
  }

  get runningCount() {
    return this.active.size
  }

  stopAll() {
    for (const abort of this.active.values()) {
      abort.signal.dispatchEvent(new Event('stop'))
    }
  }
}

function stopReason(timedOut, stopped) {
  if (timedOut) return 'The turn timed out and was stopped'
  if (stopped) return 'The turn was stopped'
  return null
}

function describeError(error) {
  const message = String(error && error.message ? error.message : error)
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}...` : message
}
