import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

// Session ids are server generated (hex, no separators), which keeps every
// session directory a fixed depth under the store root.
const SESSION_ID = /^[a-f0-9]{32}$/
const MAX_FILE_ENTRIES = 2000
const MAX_FILE_DEPTH = 8
const SKIPPED_DIR_NAMES = new Set(['node_modules', '.git'])

export class OfficeError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * Sessions of one user live in `<root>/sessions/<userId>/<sessionId>/`:
 * `workspace/` is the only directory Codex may write to, `codex-home/` holds
 * the Codex threads, `meta.json` and `events.jsonl` are written by the worker.
 */
export class Store {
  /** @param {string} root */
  constructor(root) {
    this.root = path.resolve(root)
  }

  async init() {
    await fs.mkdir(path.join(this.root, 'sessions'), { recursive: true, mode: 0o755 })
  }

  /**
   * @param {unknown} userId
   * @param {unknown} sessionId
   * @returns {string | null}
   */
  sessionDir(userId, sessionId) {
    if (!Number.isInteger(userId) || userId <= 0) return null
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null
    return path.join(this.root, 'sessions', String(userId), sessionId)
  }

  /** @param {number} userId */
  async createSession(userId) {
    const id = randomUUID().replace(/-/g, '')
    const dir = this.sessionDir(userId, id)
    if (!dir) throw new OfficeError(400, 'Invalid user id')
    await fs.mkdir(path.join(dir, 'workspace'), { recursive: true, mode: 0o755 })
    await fs.mkdir(path.join(dir, 'codex-home'), { recursive: true, mode: 0o755 })
    const meta = { id, userId, createdAt: Date.now(), updatedAt: Date.now(), title: '', threadId: null }
    await writeJson(path.join(dir, 'meta.json'), meta)
    return meta
  }

  /**
   * Reads the session metadata and proves it belongs to `userId`.
   * @returns {Promise<{id: string, userId: number, createdAt: number, updatedAt: number, title: string, threadId: string | null}>}
   */
  async getMeta(userId, sessionId) {
    const dir = this.sessionDir(userId, sessionId)
    if (!dir) throw new OfficeError(400, 'Invalid session id')
    const meta = await readJson(path.join(dir, 'meta.json')).catch(() => null)
    if (!meta || meta.userId !== userId) throw new OfficeError(404, 'Office session not found')
    return meta
  }

  async saveMeta(meta) {
    await writeJson(path.join(this.sessionDir(meta.userId, meta.id), 'meta.json'), meta)
  }

  /** @returns {Promise<Array<{id: string, title: string, createdAt: number, updatedAt: number}>>} */
  async listSessions(userId) {
    if (!Number.isInteger(userId) || userId <= 0) throw new OfficeError(400, 'Invalid user id')
    const userDir = path.join(this.root, 'sessions', String(userId))
    const names = await fs.readdir(userDir).catch(() => [])
    const metas = []
    for (const name of names) {
      if (!SESSION_ID.test(name)) continue
      const meta = await this.getMeta(userId, name).catch(() => null)
      if (meta) metas.push(meta)
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async deleteSession(userId, sessionId) {
    await this.getMeta(userId, sessionId)
    await fs.rm(this.sessionDir(userId, sessionId), { recursive: true, force: true })
  }

  async touch(userId, sessionId, title) {
    const meta = await this.getMeta(userId, sessionId)
    meta.updatedAt = Date.now()
    if (!meta.title && title) meta.title = title.slice(0, 60)
    await this.saveMeta(meta)
    return meta
  }

  async setThreadId(userId, sessionId, threadId) {
    const meta = await this.getMeta(userId, sessionId)
    meta.threadId = threadId
    await this.saveMeta(meta)
  }

  async appendEvent(userId, sessionId, event) {
    const dir = this.sessionDir(userId, sessionId)
    if (!dir) throw new OfficeError(400, 'Invalid session id')
    await fs.appendFile(path.join(dir, 'events.jsonl'), JSON.stringify(event) + '\n')
  }

  /** @returns {Promise<object[]>} */
  async readEvents(userId, sessionId) {
    await this.getMeta(userId, sessionId)
    const lines = await fs
      .readFile(path.join(this.sessionDir(userId, sessionId), 'events.jsonl'), 'utf8')
      .catch(() => '')
    return lines
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
  }

  /** @returns {string} */
  workspace(userId, sessionId) {
    return path.join(this.sessionDir(userId, sessionId), 'workspace')
  }

  /** @returns {string} */
  codexHome(userId, sessionId) {
    return path.join(this.sessionDir(userId, sessionId), 'codex-home')
  }

  /**
   * Resolves a workspace-relative path, refusing anything that escapes the
   * workspace including through symlinks created by the agent.
   * @param {boolean} createParent create missing parent directories for an upload
   * @returns {Promise<string>} absolute path
   */
  async resolveFile(userId, sessionId, relative, createParent = false) {
    const workspace = this.workspace(userId, sessionId)
    if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0')) {
      throw new OfficeError(400, 'Invalid file path')
    }
    const target = path.resolve(workspace, relative)
    if (!target.startsWith(workspace + path.sep)) {
      throw new OfficeError(400, 'File path escapes the workspace')
    }
    const realRoot = await fs.realpath(workspace)
    if (createParent) {
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o755 })
    }
    const realParent = await fs.realpath(path.dirname(target))
    if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
      throw new OfficeError(400, 'File path escapes the workspace')
    }
    return target
  }

  /** @returns {Promise<Array<{path: string, size: number, isDir: boolean}>>} */
  async listFiles(userId, sessionId) {
    const workspace = this.workspace(userId, sessionId)
    const realRoot = await fs.realpath(workspace)
    const entries = []
    await walk(workspace, '')
    return entries

    async function walk(dir, prefix) {
      const names = await fs.readdir(dir, { withFileTypes: true })
      names.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of names) {
        if (entries.length >= MAX_FILE_ENTRIES) return
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name
        const full = path.join(dir, entry.name)
        let stat = await fs.lstat(full)
        if (stat.isSymbolicLink()) {
          const real = await fs.realpath(full).catch(() => null)
          if (!real || (real !== realRoot && !real.startsWith(realRoot + path.sep))) continue
          stat = await fs.stat(full).catch(() => null)
          if (!stat) continue
        }
        if (stat.isDirectory()) {
          entries.push({ path: relative, size: 0, isDir: true })
          if (SKIPPED_DIR_NAMES.has(entry.name)) continue
          if (prefix.split('/').length < MAX_FILE_DEPTH) await walk(full, relative)
        } else if (stat.isFile()) {
          entries.push({ path: relative, size: stat.size, isDir: false })
        }
      }
    }
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value), { mode: 0o644 })
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}
