// Codex driver: one long-lived process per chat session.
// Protocol: codex app-server (JSON-RPC over stdio), read-only sandbox, approval never
// Method names/payloads checked against codex-cli 0.163.0 app-server generate-ts.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolveBin, stopTree } from '../local'
import type { AgentDriver, AgentEvent, DriverOptions } from './types'

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
type Turn = {
  id?: string
  emit: (event: AgentEvent) => void
  finish: () => void
  started: Promise<void>
  markStarted: () => void
  interrupting?: Promise<void>
  interruptTimer?: ReturnType<typeof setTimeout>
  failure?: string
  lastStep?: string
  usage?: { inputTokens?: number; outputTokens?: number }
  text: Map<string, string>
}

// Diagnostics may contain prompts/credentials. Keep a bounded tail, expose only known categories.
function diagnostic(detail: string): string {
  if (/unauthorized|authentication|401|login|log in|sign in|api.?key/i.test(detail)) return 'Check the Codex CLI login and provider credentials.'
  if (/model.*(not found|unsupported|invalid)|unsupported.*model/i.test(detail)) return 'The selected model is unavailable. Check the Codex CLI model settings.'
  if (/effort|reasoning_effort/i.test(detail)) return 'The selected reasoning effort is unavailable for this model.'
  if (/sandbox|permission denied|access denied/i.test(detail)) return 'Check the Codex read-only sandbox and filesystem permissions.'
  if (/connection|network|dns|timed? ?out|ECONN/i.test(detail)) return 'Check the Codex provider connection.'
  if (/invalid (request|params)|unknown (field|method)/i.test(detail)) return 'The installed Codex CLI protocol is incompatible. Update Codex and retry.'
  return 'Check the Codex CLI installation, login, and configuration.'
}

export function createCodexDriver(opts: DriverOptions): AgentDriver {
  let child: ChildProcessWithoutNullStreams | undefined
  let exited = true, closed = false, stderr = '', sequence = 0, threadId = '', model = opts.model
  let starting: Promise<void> | undefined, active: Turn | undefined
  const pending = new Map<number, Pending>()
  const write = (value: unknown) => {
    if (!child || exited || closed) throw new Error('The Codex process is no longer running.')
    child.stdin.write(JSON.stringify(value) + '\n')
  }
  const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Codex ${method} timed out after 15 seconds.`))
    }, 15_000)
    pending.set(id, { resolve, reject, timer })
    try { write({ id, method, params }) }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
  const complete = (event: Extract<AgentEvent, { type: 'done' | 'error' }>) => {
    const turn = active
    if (!turn) return
    active = undefined
    clearTimeout(turn.interruptTimer)
    turn.markStarted()
    try { turn.emit(event) } finally { turn.finish() }
  }
  const failProcess = (message: string) => {
    exited = true
    for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error(message)) }
    pending.clear()
    complete({ type: 'error', message, fatal: true })
  }
  const step = (text: string) => {
    if (active && active.lastStep !== text) {
      active.lastStep = text
      active.emit({ type: 'step', text })
    }
  }
  const onMessage = (message: any) => {
    if (!message || typeof message !== 'object') return
    if (message.id !== undefined && !message.method) {
      const call = pending.get(message.id)
      if (!call) return
      pending.delete(message.id)
      clearTimeout(call.timer)
      if (message.error) call.reject(new Error(`Codex rejected the request. ${diagnostic(String(message.error.message ?? ''))}`))
      else call.resolve(message.result)
      return
    }
    if (message.id !== undefined && message.method) {
      // No interactive approvals or external client tools can grant writes in this session.
      write({ id: message.id, error: { code: -32601, message: 'Interactive tools and permission changes are disabled in Papercell.' } })
      return
    }
    const p = message.params ?? {}, turn = active
    if (!turn || p.threadId !== threadId || (turn.id && p.turnId && p.turnId !== turn.id)) return
    if (message.method === 'turn/started') {
      turn.id = p.turn?.id
      turn.markStarted()
      step('Thinking…')
    } else if (message.method === 'item/agentMessage/delta' && typeof p.delta === 'string') {
      turn.text.set(p.itemId, (turn.text.get(p.itemId) ?? '') + p.delta)
      turn.emit({ type: 'text', delta: p.delta })
    } else if (message.method === 'item/completed' && p.item?.type === 'agentMessage') {
      const text = p.item.text, sent = turn.text.get(p.item.id) ?? ''
      if (typeof text === 'string' && text.startsWith(sent) && text.length > sent.length) {
        turn.text.set(p.item.id, text)
        turn.emit({ type: 'text', delta: text.slice(sent.length) })
      }
    } else if (message.method === 'item/started') {
      const item = p.item ?? {}
      if (item.type === 'reasoning') step('Thinking…')
      else if (item.type === 'commandExecution') {
        const reads = (item.commandActions ?? []).filter((a: any) => a.type === 'read')
        step(reads.length ? `Reading ${reads.map((a: any) => String(a.name || a.path)).join(', ').slice(0, 120)}` : 'Running a read-only command…')
        turn.emit({ type: 'tool', name: 'command', detail: String(item.command ?? '').slice(0, 200) })
      } else if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') {
        turn.emit({ type: 'tool', name: String(item.tool ?? 'tool') })
      } else if (item.type === 'webSearch') step('Searching the web…')
      else if (item.type === 'contextCompaction') step('Compacting conversation…')
    } else if (message.method === 'item/reasoning/summaryTextDelta' || message.method === 'item/reasoning/textDelta') {
      step('Thinking…')
    } else if (message.method === 'turn/plan/updated') step('Planning…')
    else if (message.method === 'model/rerouted' && typeof p.toModel === 'string') model = p.toModel
    else if (message.method === 'thread/tokenUsage/updated') {
      const usage = p.tokenUsage?.last
      if (usage) turn.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
    } else if (message.method === 'error') {
      if (p.willRetry) step('Reconnecting to the model…')
      else turn.failure = `Codex could not finish the turn. ${diagnostic(String(p.error?.message ?? ''))}`
    } else if (message.method === 'turn/completed') {
      if (turn.id && p.turn?.id !== turn.id) return
      if (p.turn?.status === 'interrupted') complete({ type: 'error', message: 'The turn was interrupted.' })
      else if (p.turn?.status === 'failed' || turn.failure) complete({ type: 'error', message: turn.failure ?? `Codex could not finish the turn. ${diagnostic(String(p.turn?.error?.message ?? ''))}` })
      else complete({ type: 'done', model, usage: turn.usage })
    } else if (message.method === 'thread/closed') {
      complete({ type: 'error', message: 'Codex closed the conversation. Start a new session.', fatal: true })
      void driver.close()
    }
  }
  const driver: AgentDriver = {
    agent: 'codex',
    async start() {
      if (starting) return starting
      starting = (async () => {
        const bin = resolveBin('codex')
        if (!bin) throw new Error('Codex was not found on this computer. Install it or add it to PATH.')
        if (closed) throw new Error('The Codex session is closed.')
        child = spawn(bin.shell ? `"${bin.file}"` : bin.file, [
          'app-server', '--stdio', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"',
          '-c', 'features.hooks=false', '-c', 'features.apps=false', '-c', 'features.multi_agent=false',
        ], { cwd: opts.cwd, shell: bin.shell, windowsHide: true, env: { ...process.env, NO_COLOR: '1' } })
        exited = false
        child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr = (stderr + data).slice(-4096) })
        child.on('error', () => failProcess(`Codex could not start. ${diagnostic(stderr)}`))
        child.on('exit', (code) => failProcess(`Codex exited${code === null ? '' : ` (code ${code})`}. ${diagnostic(stderr)}`))
        child.stdin.on('error', () => { failProcess('Codex closed its input channel.'); if (child) stopTree(child) })
        const lines = createInterface({ input: child.stdout })
        lines.on('line', (line) => {
          let message
          try { message = JSON.parse(line) } catch { return }
          onMessage(message)
        })
        child.on('close', () => lines.close())
        await request('initialize', { clientInfo: { name: 'papercell', version: '1.0.0' } })
        write({ method: 'initialized', params: {} })
        // External MCP/plugin tools are not covered by the local filesystem sandbox.
        const settings = await request('config/read', { cwd: opts.cwd, includeLayers: false })
        const config: Record<string, unknown> = {}
        for (const section of ['mcp_servers', 'plugins']) {
          for (const name of Object.keys(settings.config?.[section] ?? {})) {
            if (name.includes('.')) throw new Error('Codex has an external tool name that cannot be safely disabled for a read-only session.')
            config[`${section}.${name}.enabled`] = false
          }
        }
        if (opts.effort) config.model_reasoning_effort = opts.effort
        const result = await request('thread/start', {
          cwd: opts.cwd, ...(opts.model ? { model: opts.model } : {}), config,
          sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true,
          developerInstructions: 'You are the writing assistant in Papercell. Read document.md when needed. Do not edit or create files. Return requested writing as Markdown. Never invent data.',
        })
        if (!result.thread?.id) throw new Error('Codex did not create a conversation.')
        if (result.approvalPolicy !== 'never' || result.sandbox?.type !== 'readOnly') throw new Error('Codex did not apply the required read-only sandbox.')
        threadId = result.thread.id
        model = result.model || opts.model
      })().catch(async (error: Error) => {
        await driver.close()
        throw new Error(`${error.message} ${diagnostic(stderr)}`)
      })
      return starting
    },
    async send(text, emit) {
      if (!driver.alive() || !threadId) { emit({ type: 'error', message: 'The Codex session is no longer running.', fatal: true }); return }
      if (active) { emit({ type: 'error', message: 'The Codex session is already running a turn.' }); return }
      let finish!: () => void, markStarted!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      const started = new Promise<void>((resolve) => { markStarted = resolve })
      const turn: Turn = { emit, finish, started, markStarted, text: new Map() }
      active = turn
      step('Thinking…')
      try {
        const result = await request('turn/start', {
          threadId, input: [{ type: 'text', text, text_elements: [] }],
          ...(opts.model ? { model: opts.model } : {}), ...(opts.effort ? { effort: opts.effort } : {}),
          approvalPolicy: 'never', sandboxPolicy: { type: 'readOnly', networkAccess: false },
        })
        if (active === turn) {
          turn.id = result.turn?.id || turn.id
          turn.markStarted()
          if (!turn.id) throw new Error('Codex did not start a turn.')
        }
      } catch (error) {
        // A timed-out start may still be running remotely; retire that process before reuse.
        if (active === turn) {
          complete({ type: 'error', message: (error as Error).message, fatal: true })
          await driver.close()
        }
      }
      await finished
    },
    async interrupt() {
      const turn = active
      if (!turn) return
      if (turn.interrupting) return turn.interrupting
      turn.interrupting = (async () => {
        await turn.started
        if (active !== turn || !turn.id || !driver.alive()) return
        try {
          await request('turn/interrupt', { threadId, turnId: turn.id })
          if (active === turn) turn.interruptTimer = setTimeout(() => {
            if (active !== turn) return
            complete({ type: 'error', message: 'Codex did not stop the turn. Start a new session.', fatal: true })
            void driver.close()
          }, 10_000)
        }
        catch {
          if (active === turn) {
            complete({ type: 'error', message: 'Codex could not interrupt the turn. Start a new session.', fatal: true })
            await driver.close()
          }
        }
      })()
      return turn.interrupting
    },
    async close() {
      if (closed) return
      closed = true
      if (child) stopTree(child)
      failProcess('The Codex session was closed.')
    },
    alive: () => !!child && !exited && !closed,
  }
  return driver
}
