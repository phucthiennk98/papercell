// Claude Code driver: one long-lived process per chat session.
// Protocol: claude -p --input-format stream-json --output-format stream-json --verbose --permission-mode plan [--model]
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { resolveBin, stopTree } from '../local'
import type { AgentDriver, AgentEvent, DriverOptions } from './types'

type Turn = {
  emit: (event: AgentEvent) => void
  finish: () => void
  finished: Promise<void>
  interrupted: boolean
  interrupting?: Promise<void>
  interruptTimer?: ReturnType<typeof setTimeout>
  lastStep?: string
  emittedText: string
  msgText: Map<string, string>
  seenTools: Set<string>
  model?: string
}

// Keep diagnostics safe: never include user prompts or raw secrets.
function diagnostic(detail: string): string {
  const clean = detail.replace(/\s+/g, ' ').trim()
  if (/you've hit your.*limit|session limit|usage_limit_reached|rate.?limit|429/i.test(clean)) {
    const m = clean.match(/You've hit your[^"\n]{0,120}/i)
    return m ? m[0].trim() : 'Claude Code rate or session limit reached. Wait for reset or check your plan.'
  }
  if (/unauthorized|authentication|401|not logged in|login|sign in|api.?key/i.test(clean)) {
    return 'Check the Claude Code login (`claude auth status`) and provider credentials.'
  }
  if (/model.*(not found|unsupported|invalid)|unknown model/i.test(clean)) {
    return 'The selected model is unavailable in Claude Code.'
  }
  if (/effort/i.test(clean)) {
    return 'The selected reasoning effort is unavailable for this model.'
  }
  if (/permission|sandbox|access denied/i.test(clean)) {
    return 'Check Claude Code permissions and working directory access.'
  }
  if (/connection|network|dns|timed? ?out|ECONN/i.test(clean)) {
    return 'Check the network connection to Claude.'
  }
  return 'Check the Claude Code installation, login, and configuration.'
}

function describeTool(name: string, input: any): { detail?: string; step: string } {
  const rawPath = input?.file_path ?? input?.path ?? input?.notebook_path
  const file = typeof rawPath === 'string' && rawPath.trim() ? path.basename(rawPath.trim()) : ''
  if (/^(Read|View)$/i.test(name)) {
    const target = file || 'document.md'
    return { detail: `${name} ${target}`, step: `Reading ${target}` }
  }
  if (/^(Glob|Grep|Search|Find|ToolSearch)$/i.test(name)) {
    const pat = String(input?.pattern ?? input?.query ?? file ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    return { detail: pat ? `${name} ${pat}` : name, step: pat ? `Searching ${pat}` : 'Searching files…' }
  }
  if (/^(Bash|PowerShell)$/i.test(name)) {
    const cmd = String(input?.command ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    return { detail: cmd || undefined, step: /document\.md/.test(cmd) ? 'Reading document.md' : 'Running a read-only command…' }
  }
  const firstStr = input && typeof input === 'object'
    ? Object.values(input).find((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : undefined
  const detail = firstStr ? firstStr.replace(/\s+/g, ' ').trim().slice(0, 80) : undefined
  return { detail: detail ? `${name} ${detail}` : undefined, step: `Using ${name}…` }
}

export function createClaudeDriver(opts: DriverOptions): AgentDriver {
  let child: ChildProcessWithoutNullStreams | undefined
  let exited = true, closed = false, needsRestart = false, stderr = '', sequence = 0
  let sessionModel = opts.model
  let starting: Promise<void> | undefined
  let active: Turn | undefined
  let initResolve: (() => void) | undefined
  let initReject: ((err: Error) => void) | undefined

  const write = (value: unknown) => {
    if (!child || exited || closed) throw new Error('The Claude Code process is no longer running.')
    child.stdin.write(JSON.stringify(value) + '\n')
  }

  const complete = (event: Extract<AgentEvent, { type: 'done' | 'error' }>) => {
    const turn = active
    if (!turn) return
    active = undefined
    clearTimeout(turn.interruptTimer)
    try { turn.emit(event) } finally { turn.finish() }
  }

  const failProcess = (message: string) => {
    exited = true
    starting = undefined
    if (initReject) {
      const rej = initReject
      initResolve = undefined
      initReject = undefined
      rej(new Error(message))
    }
    complete({ type: 'error', message, fatal: true })
  }

  const step = (text: string) => {
    if (active && active.lastStep !== text) {
      active.lastStep = text
      active.emit({ type: 'step', text })
    }
  }

  const onMessage = (msg: any) => {
    if (!msg || typeof msg !== 'object') return

    // Initialization control response during start()
    if (msg.type === 'control_response' && msg.response?.request_id === 'init') {
      if (msg.response?.subtype === 'success') {
        const res = initResolve
        initResolve = undefined
        initReject = undefined
        res?.()
      } else {
        const rej = initReject
        initResolve = undefined
        initReject = undefined
        rej?.(new Error(`Claude Code initialization failed. ${diagnostic(stderr)}`))
      }
      return
    }

    // Deny any interactive tool permission requests in read-only plan mode so the CLI never blocks.
    if (msg.type === 'control_request' && typeof msg.request_id === 'string') {
      try {
        write({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: msg.request_id,
            response: { behavior: 'deny', message: 'Papercell runs agents in read-only plan mode.' },
          },
        })
      } catch { /* ignore write errors */ }
      return
    }

    if (msg.type === 'system') {
      if (msg.subtype === 'init') {
        if (typeof msg.model === 'string' && msg.model) sessionModel = msg.model
        if (initResolve) {
          const res = initResolve
          initResolve = undefined
          initReject = undefined
          res()
        }
      }
      if (!active) return
      if (msg.subtype === 'thinking_tokens' || msg.subtype === 'status') step('Thinking…')
      else if (msg.subtype === 'compact_boundary') step('Compacting conversation…')
      return
    }

    const turn = active
    if (!turn) return

    if (msg.type === 'stream_event') {
      const ev = msg.event
      if (!ev || typeof ev !== 'object') return
      const msgId = String(msg.api_message_id ?? 'stream')
      if (ev.type === 'content_block_start') {
        const cb = ev.content_block
        if (cb?.type === 'thinking') step('Thinking…')
      } else if (ev.type === 'content_block_delta') {
        const d = ev.delta
        if (d?.type === 'thinking_delta') step('Thinking…')
        else if (d?.type === 'text_delta' && typeof d.text === 'string' && d.text) {
          const key = `${msgId}:${ev.index ?? 0}`
          turn.msgText.set(key, (turn.msgText.get(key) ?? '') + d.text)
          turn.emittedText += d.text
          turn.emit({ type: 'text', delta: d.text })
        }
      }
      return
    }

    if (msg.type === 'assistant') {
      const m = msg.message
      if (!m || typeof m !== 'object') return
      // Synthetic API error messages are reported via the following 'result' event; do not emit as assistant text.
      if (msg.is_api_error_message || msg.error || m.model === '<synthetic>') return
      if (typeof m.model === 'string' && m.model) {
        sessionModel = m.model
        turn.model = m.model
      }
      const msgId = String(m.id ?? msg.uuid ?? 'msg')
      const content = Array.isArray(m.content) ? m.content : []
      content.forEach((block: any, idx: number) => {
        if (!block || typeof block !== 'object') return
        if (block.type === 'thinking') {
          step('Thinking…')
        } else if (block.type === 'tool_use') {
          const toolId = String(block.id ?? `${msgId}:tool:${idx}`)
          if (turn.seenTools.has(toolId)) return
          turn.seenTools.add(toolId)
          const name = String(block.name ?? 'tool')
          const info = describeTool(name, block.input)
          step(info.step)
          turn.emit({ type: 'tool', name, detail: info.detail })
        } else if (block.type === 'text' && typeof block.text === 'string') {
          const key = `${msgId}:${idx}`
          const prev = turn.msgText.get(key) ?? ''
          const curr = block.text
          if (curr.startsWith(prev)) {
            const delta = curr.slice(prev.length)
            turn.msgText.set(key, curr)
            if (delta) {
              turn.emittedText += delta
              turn.emit({ type: 'text', delta })
            }
          } else if (curr !== prev) {
            turn.msgText.set(key, curr)
            turn.emittedText += curr
            turn.emit({ type: 'text', delta: curr })
          }
        }
      })
      return
    }

    if (msg.type === 'result') {
      const u = msg.usage
      const usage = u && typeof u === 'object'
        ? {
            inputTokens: (Number(u.input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0),
            outputTokens: Number(u.output_tokens) || 0,
          }
        : undefined
      const modelFromUsage = msg.modelUsage && typeof msg.modelUsage === 'object' ? Object.keys(msg.modelUsage)[0] : undefined
      const resolvedModel = turn.model || modelFromUsage || sessionModel

      if (turn.interrupted || msg.terminal_reason === 'aborted_streaming' || msg.terminal_reason === 'aborted_tools') {
        complete({ type: 'error', message: 'The turn was interrupted.', fatal: false })
        return
      }

      if (msg.is_error || (msg.subtype && msg.subtype !== 'success')) {
        const rawErr = typeof msg.result === 'string' && msg.result
          ? msg.result
          : Array.isArray(msg.errors) ? msg.errors.join(' ') : stderr
        complete({
          type: 'error',
          message: `Claude Code could not finish the turn. ${diagnostic(rawErr)}`,
          fatal: false,
        })
        return
      }

      if (typeof msg.result === 'string' && msg.result) {
        if (!turn.emittedText) {
          turn.emittedText = msg.result
          turn.emit({ type: 'text', delta: msg.result })
        } else if (msg.result.startsWith(turn.emittedText) && msg.result.length > turn.emittedText.length) {
          const tail = msg.result.slice(turn.emittedText.length)
          turn.emittedText = msg.result
          turn.emit({ type: 'text', delta: tail })
        }
      }

      complete({ type: 'done', model: resolvedModel, usage })
    }
  }

  const driver: AgentDriver = {
    agent: 'claude',
    async start() {
      if (starting) return starting
      starting = (async () => {
        const bin = resolveBin('claude')
        if (!bin) throw new Error('Claude Code was not found on this computer. Install it or add it to PATH.')
        if (closed) throw new Error('The Claude Code session is closed.')
        const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'plan']
        if (opts.model) args.push('--model', opts.model)
        if (opts.effort) args.push('--effort', opts.effort)

        stderr = ''
        child = spawn(bin.shell ? `"${bin.file}"` : bin.file, args, {
          cwd: opts.cwd,
          shell: bin.shell,
          windowsHide: true,
          env: { ...process.env, NO_COLOR: '1' },
        })
        exited = false
        child.stderr.setEncoding('utf8').on('data', (data: string) => { stderr = (stderr + data).slice(-4096) })
        child.on('error', () => failProcess(`Claude Code could not start. ${diagnostic(stderr)}`))
        child.on('exit', (code) => {
          if (needsRestart) {
            exited = true
            starting = undefined
            return
          }
          failProcess(`Claude Code exited${code === null ? '' : ` (code ${code})`}. ${diagnostic(stderr)}`)
        })
        child.stdin.on('error', () => {
          if (needsRestart) return
          failProcess('Claude Code closed its input channel.')
          if (child) stopTree(child)
        })

        const lines = createInterface({ input: child.stdout })
        lines.on('line', (line) => {
          let parsed
          try { parsed = JSON.parse(line) } catch { return }
          onMessage(parsed)
        })
        child.on('close', () => lines.close())

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            initResolve = undefined
            initReject = undefined
            reject(new Error('Claude Code initialization timed out after 15 seconds.'))
          }, 15_000)
          initResolve = () => { clearTimeout(timer); resolve() }
          initReject = (err) => { clearTimeout(timer); reject(err) }
          try {
            write({ type: 'control_request', request_id: 'init', request: { subtype: 'initialize', hooks: {}, sdkMcpServers: [] } })
          } catch (err) {
            clearTimeout(timer)
            initResolve = undefined
            initReject = undefined
            reject(err as Error)
          }
        })
      })().catch(async (error: Error) => {
        starting = undefined
        if (child) stopTree(child)
        exited = true
        throw new Error(`${error.message} ${diagnostic(stderr)}`.trim())
      })
      return starting
    },

    async send(text, emit) {
      if (!driver.alive() && !closed && needsRestart) {
        needsRestart = false
        try {
          await driver.start()
          emit({ type: 'step', text: 'Restarted Claude Code (earlier context is lost)' })
        } catch (err) {
          emit({ type: 'error', message: (err as Error).message, fatal: true })
          return
        }
      }
      if (!driver.alive()) {
        emit({ type: 'error', message: 'The Claude Code session is no longer running.', fatal: true })
        return
      }
      if (active) {
        emit({ type: 'error', message: 'The Claude Code session is already running a turn.' })
        return
      }

      let finish!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      const turn: Turn = {
        emit,
        finish,
        finished,
        interrupted: false,
        emittedText: '',
        msgText: new Map(),
        seenTools: new Set(),
        model: sessionModel,
      }
      active = turn
      step('Thinking…')
      try {
        write({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } })
      } catch {
        if (active === turn) {
          complete({ type: 'error', message: `Could not send message to Claude Code. ${diagnostic(stderr)}`, fatal: true })
          await driver.close()
        }
      }
      await finished
    },

    async interrupt() {
      const turn = active
      if (!turn) return
      if (turn.interrupting) return turn.interrupting
      turn.interrupted = true
      turn.interrupting = (async () => {
        if (!driver.alive()) return
        try {
          write({ type: 'control_request', request_id: `int_${++sequence}`, request: { subtype: 'interrupt' } })
          turn.interruptTimer = setTimeout(() => {
            if (active === turn) {
              needsRestart = true
              if (child) stopTree(child)
              exited = true
              starting = undefined
              complete({ type: 'error', message: 'The turn was interrupted.', fatal: false })
            }
          }, 5_000)
          await turn.finished
        } catch {
          if (active === turn) {
            needsRestart = true
            if (child) stopTree(child)
            exited = true
            starting = undefined
            complete({ type: 'error', message: 'The turn was interrupted.', fatal: false })
          }
        }
      })()
      return turn.interrupting
    },

    async close() {
      if (closed) return
      closed = true
      needsRestart = false
      if (child) stopTree(child)
      failProcess('The Claude Code session was closed.')
    },

    alive: () => !!child && !exited && !closed,
  }

  return driver
}
