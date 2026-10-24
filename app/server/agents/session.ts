// Phiên chat giữ một tiến trình CLI và thư mục tài liệu riêng.
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DRIVERS } from './drivers'
import type { AgentDriver, AgentEvent, AgentId } from './drivers/types'

type Options = { agent: AgentId; model?: string; effort?: string }
type Session = Options & {
  id: string
  cwd: string
  driver: AgentDriver
  busy: boolean
  firstTurn: boolean
  lastUsed: number
  restart: boolean
  stop?: (message: string) => void
}

export class SessionError extends Error {
  constructor(message: string, public readonly status: 404 | 409 | 503) { super(message) }
}

const sessions = new Map<string, Session>()
const labels: Record<AgentId, string> = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' }
const INSTRUCTIONS = `You are the writing assistant in Papercell. Read document.md in the current working directory when the question concerns the open document.
Do not edit or create files. Reply in the user's language. When providing content to insert into the document, return only Markdown content without a preamble. When asked to create or add a chart/figure/plot, output a fenced \`\`\`papercell-figure\`\`\` JSON block with "caption", "spec", "params", "js", and "python" following the rules in document.md. Never invent data.`
const message = (e: unknown) => e instanceof Error ? e.message : String(e)
const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms).unref() })
let creating: Promise<unknown> = Promise.resolve()
let exiting = false

const info = (s: Session) => ({ id: s.id, agent: s.agent, model: s.model, effort: s.effort })
const get = (id: string) => {
  const s = sessions.get(id)
  if (!s) throw new SessionError('This agent session no longer exists. Start a new session.', 404)
  return s
}

export function createSession(opts: Options) {
  // Serialize creation so simultaneous requests cannot exceed the session limit.
  const result = creating.then(async () => {
    if (exiting) throw new SessionError('The server is shutting down.', 503)
    if (sessions.size >= 8) {
      const oldest = [...sessions.values()].filter((s) => !s.busy).sort((a, b) => a.lastUsed - b.lastUsed)[0]
      if (!oldest) throw new SessionError('All eight agent sessions are busy. Close a session or wait for a turn to finish.', 409)
      await closeSession(oldest.id)
    }
    const cwd = await mkdtemp(path.join(tmpdir(), 'papercell-session-'))
    let driver: AgentDriver | undefined
    let s: Session | undefined
    try {
      driver = DRIVERS[opts.agent]({ cwd, model: opts.model, effort: opts.effort })
      s = { ...opts, id: randomUUID(), cwd, driver, busy: true, firstTurn: true, lastUsed: Date.now(), restart: false }
      sessions.set(s.id, s)
      await driver.start()
      if (exiting || !sessions.has(s.id)) throw new Error('The session was closed while the agent was starting.')
      s.busy = false
      s.lastUsed = Date.now()
      return info(s)
    } catch (e) {
      if (s) sessions.delete(s.id)
      await driver?.close().catch(() => {})
      await rm(cwd, { recursive: true, force: true })
      throw new Error(`Could not start ${labels[opts.agent]}: ${message(e)}`)
    }
  })
  creating = result.catch(() => {})
  return result
}

export function listSessions() {
  return [...sessions.values()].map((s) => ({ ...info(s), alive: s.driver.alive(), busy: s.busy, lastUsed: s.lastUsed }))
}

export type TurnAttachment = {
  name?: string
  kind?: 'image' | 'file'
  dataUrl?: string
  textContent?: string
}

export function runTurn(
  id: string,
  text: string,
  doc: string,
  signal: AbortSignal,
  attachments: TurnAttachment[] = [],
): ReadableStream<Uint8Array> {
  const s = get(id)
  if (s.busy) throw new SessionError('This agent session is already answering a question.', 409)
  s.busy = true
  s.lastUsed = Date.now()
  const enc = new TextEncoder()
  let disconnected = false
  let stopTurn: (reason: string) => void = () => {}
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      let terminal: AgentEvent | undefined
      let finished = false, stopped = false
      let interrupting: Promise<void> | undefined
      let resolveStop: () => void
      const stopPromise = new Promise<void>((resolve) => { resolveStop = resolve })
      const emit = (event: AgentEvent) => {
        if (finished || terminal) return
        if (event.type === 'done' || event.type === 'error') terminal = event
        else if (!disconnected) ctrl.enqueue(enc.encode(JSON.stringify(event) + '\n'))
      }
      const finish = () => {
        if (finished) return
        finished = true
        if (!disconnected) {
          ctrl.enqueue(enc.encode(JSON.stringify(terminal ?? { type: 'done' }) + '\n'))
          ctrl.close()
        }
      }
      stopTurn = (reason) => {
        if (stopped || finished) return
        stopped = true
        terminal = { type: 'error', message: reason }
        interrupting = Promise.resolve().then(() => s.driver.interrupt()).catch(() => { s.restart = true })
        resolveStop!()
        finish()
      }
      s.stop = stopTurn
      const abort = () => stopTurn('The agent turn was interrupted.')
      const timer = setTimeout(() => stopTurn('The agent turn timed out after 10 minutes.'), 10 * 60_000)
      timer.unref()
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()

      const work = (async () => {
        if (stopped) return
        await writeFile(path.join(s.cwd, 'document.md'), doc.slice(0, 500_000) || '(The document is empty.)', 'utf8')
        const savedAttPaths: string[] = []
        if (Array.isArray(attachments) && attachments.length > 0) {
          const attDir = path.join(s.cwd, 'attachments')
          await mkdir(attDir, { recursive: true })
          for (let i = 0; i < attachments.length; i++) {
            const att = attachments[i]
            const safeName = `${i + 1}-${String(att.name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_')}`
            const fullPath = path.join(attDir, safeName)
            if (att.kind === 'image' && typeof att.dataUrl === 'string') {
              const commaIdx = att.dataUrl.indexOf(',')
              if (commaIdx !== -1) {
                const buf = Buffer.from(att.dataUrl.slice(commaIdx + 1), 'base64')
                await writeFile(fullPath, buf)
                savedAttPaths.push(`./attachments/${safeName} (image)`)
              }
            } else if (typeof att.textContent === 'string') {
              await writeFile(fullPath, att.textContent.slice(0, 100_000), 'utf8')
              savedAttPaths.push(`./attachments/${safeName} (reference file)`)
            }
          }
        }
        if (stopped) return
        if (s.restart || !s.driver.alive()) {
          await s.driver.close()
          if (stopped) return
          s.driver = DRIVERS[s.agent]({ cwd: s.cwd, model: s.model, effort: s.effort })
          s.firstTurn = true
          s.restart = false
          await s.driver.start()
          if (stopped) return
          emit({ type: 'step', text: `Restarted ${labels[s.agent]} (earlier context is lost)` })
        }
        const attNotice = savedAttPaths.length
          ? `Attached reference files saved in your working directory (inspect/read them directly):\n${savedAttPaths.map((p) => `- ${p}`).join('\n')}\n\n`
          : ''
        const fullText = `${attNotice}${text}`
        const prompt = s.firstTurn ? `${INSTRUCTIONS}\n\n${fullText}` : fullText
        s.firstTurn = false
        await s.driver.send(prompt, emit)
      })().catch((e) => {
        s.restart = true
        emit({ type: 'error', message: message(e), fatal: !s.driver.alive() })
      })

      void (async () => {
        try {
          await Promise.race([work, stopPromise])
          if (stopped) {
            // A broken driver must not keep a session busy forever after cancellation.
            let settled = false
            await Promise.race([Promise.all([work, interrupting]).then(() => { settled = true }), wait(2000)])
            if (!settled) {
              s.restart = true
              await Promise.race([s.driver.close().catch(() => {}), wait(2000)])
            }
          }
        } finally {
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          s.stop = undefined
          s.busy = false
          s.lastUsed = Date.now()
          finish()
        }
      })()
    },
    cancel() { disconnected = true; stopTurn('The agent turn was interrupted.') },
  })
}

export async function interrupt(id: string) {
  const s = get(id)
  if (s.stop) s.stop('The agent turn was interrupted.')
  else await s.driver.interrupt()
}

export async function closeSession(id: string) {
  const s = get(id)
  sessions.delete(id)
  s.stop?.('The agent session was closed.')
  try { await s.driver.close() }
  finally { await rm(s.cwd, { recursive: true, force: true }) }
}

const cleanup = setInterval(() => {
  for (const s of sessions.values()) {
    if (!s.busy && Date.now() - s.lastUsed >= 20 * 60_000) void closeSession(s.id).catch(() => {})
  }
}, 60_000)
cleanup.unref()

process.once('exit', () => { for (const s of sessions.values()) void s.driver.close().catch(() => {}) })
const shutdown = (code: number) => {
  if (exiting) return
  exiting = true
  const deadline = setTimeout(() => process.exit(code), 5000)
  void Promise.allSettled([...sessions.keys()].map(closeSession)).then(() => { clearTimeout(deadline); process.exit(code) })
}
process.once('SIGINT', () => shutdown(130))
process.once('SIGTERM', () => shutdown(143))
