// Antigravity driver: one long-lived process per chat session.
// Protocol: agy --input-format stream-json --output-format stream-json --mode plan [--model] [--effort]
// (Note: agy's -p flag takes a prompt string argument; --input-format stream-json automatically enables multi-turn print mode.)
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { resolveBin, stopTree } from '../local'
import type { AgentDriver, AgentEvent, DriverOptions } from './types'

type Turn = {
  emit: (event: AgentEvent) => void
  finish: () => void
  interrupted: boolean
  lastStep?: string
  emittedText: string
  seenToolSteps: Set<number>
}

// Keep diagnostics safe: never include user prompts or raw secrets.
function diagnostic(detail: string): string {
  const clean = detail.replace(/\s+/g, ' ').trim()
  if (/unauthorized|authentication|401|not logged in|login|sign in|auth|api.?key/i.test(clean)) {
    return 'Check the Antigravity login and credentials.'
  }
  if (/quota|rate.?limit|429|resource.?exhausted/i.test(clean)) {
    return 'Antigravity rate or quota limit reached. Try again later or switch models.'
  }
  if (/model.*(not found|unsupported|invalid)|unknown model/i.test(clean)) {
    return 'The selected model is unavailable in Antigravity.'
  }
  if (/effort/i.test(clean)) {
    return 'The selected reasoning effort is unavailable for this model.'
  }
  if (/permission|sandbox|access denied/i.test(clean)) {
    return 'Check Antigravity permissions and working directory access.'
  }
  if (/connection|network|dns|timed? ?out|ECONN/i.test(clean)) {
    return 'Check the network connection for Antigravity.'
  }
  return 'Check the Antigravity (agy) installation, login, and configuration.'
}

function describeTool(toolName: string, params: any): { detail?: string; step: string } {
  const rawPath = params?.Path ?? params?.file_path ?? params?.TargetFile ?? params?.DirectoryPath ?? params?.SearchPath
  const file = typeof rawPath === 'string' && rawPath.trim() ? path.basename(rawPath.trim()) : ''
  if (/read_file|view_file|read|view/i.test(toolName)) {
    const target = file || 'document.md'
    return { detail: `${toolName} ${target}`, step: `Reading ${target}` }
  }
  if (/grep|search|find|list_dir/i.test(toolName)) {
    const q = String(params?.Query ?? params?.Pattern ?? file ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    return { detail: q ? `${toolName} ${q}` : toolName, step: q ? `Searching ${q}` : 'Searching files…' }
  }
  if (/run_command|command/i.test(toolName)) {
    const cmd = String(params?.CommandLine ?? params?.command ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    return { detail: cmd || undefined, step: /document\.md/.test(cmd) ? 'Reading document.md' : 'Running a command…' }
  }
  return {
    detail: file ? `${toolName} ${file}` : undefined,
    step: `Working: ${toolName.replace(/_/g, ' ')}`,
  }
}

export function createAgyDriver(opts: DriverOptions): AgentDriver {
  let child: ChildProcessWithoutNullStreams | undefined
  let exited = true, closed = false, needsRestart = false, stderr = ''
  let starting: Promise<void> | undefined
  let active: Turn | undefined

  const write = (value: unknown) => {
    if (!child || exited || closed) throw new Error('The Antigravity process is no longer running.')
    child.stdin.write(JSON.stringify(value) + '\n')
  }

  const complete = (event: Extract<AgentEvent, { type: 'done' | 'error' }>) => {
    const turn = active
    if (!turn) return
    active = undefined
    try { turn.emit(event) } finally { turn.finish() }
  }

  const failProcess = (message: string) => {
    exited = true
    starting = undefined
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
    const turn = active
    if (!turn) return

    if (msg.event === 'init') {
      step('Thinking…')
      return
    }

    if (msg.event === 'step_update' && msg.step_update && typeof msg.step_update === 'object') {
      const s = msg.step_update
      const stepType = String(s.step_type ?? '')

      if (stepType === 'agent_response') {
        if (typeof s.text_delta === 'string' && s.text_delta) {
          turn.emittedText += s.text_delta
          turn.emit({ type: 'text', delta: s.text_delta })
        } else if (s.state === 'ACTIVE') {
          step('Thinking…')
        }
        return
      }

      if (stepType === 'tool') {
        const idx = typeof s.step_index === 'number' ? s.step_index : -1
        const toolName = String(s.tool_name || s.tool_info?.name || 'tool')
        const info = describeTool(toolName, s.tool_info?.parameters)
        if (s.state === 'ACTIVE') step(info.step)
        if (idx < 0 || !turn.seenToolSteps.has(idx)) {
          if (idx >= 0) turn.seenToolSteps.add(idx)
          turn.emit({ type: 'tool', name: toolName, detail: info.detail })
        }
        return
      }

      if (stepType && stepType !== 'user_input' && s.state === 'ACTIVE') {
        if (/view|read|file/i.test(stepType)) step('Reading document.md')
        else if (/plan|think/i.test(stepType)) step('Thinking…')
        else step(`Working: ${stepType.replace(/_/g, ' ')}`)
      }
      return
    }

    if (msg.event === 'result') {
      const r = msg.result ?? {}
      const u = r.usage
      const usage = u && typeof u === 'object'
        ? {
            inputTokens: Number(u.input_tokens) || 0,
            outputTokens: Number(u.output_tokens) || 0,
          }
        : undefined

      if (turn.interrupted) {
        complete({ type: 'error', message: 'The turn was interrupted.', fatal: false })
        return
      }

      if (r.status === 'SUCCESS') {
        if (typeof r.response === 'string' && r.response) {
          if (!turn.emittedText) {
            turn.emittedText = r.response
            turn.emit({ type: 'text', delta: r.response })
          } else if (r.response.startsWith(turn.emittedText) && r.response.length > turn.emittedText.length) {
            const tail = r.response.slice(turn.emittedText.length)
            turn.emittedText = r.response
            turn.emit({ type: 'text', delta: tail })
          }
        }
        complete({ type: 'done', model: opts.model, usage })
      } else {
        complete({
          type: 'error',
          message: `Antigravity could not finish the turn. ${diagnostic(String(r.error ?? stderr))}`,
          fatal: false,
        })
      }
    }
  }

  const driver: AgentDriver = {
    agent: 'agy',
    async start() {
      if (starting) return starting
      starting = (async () => {
        const bin = resolveBin('agy')
        if (!bin) throw new Error('Antigravity (agy) was not found on this computer. Install it or add it to PATH.')
        if (closed) throw new Error('The Antigravity session is closed.')
        const args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--mode', 'plan']
        if (opts.model) args.push('--model', opts.model)
        if (opts.effort) args.push('--effort', opts.effort)

        stderr = ''
        const proc = spawn(bin.shell ? `"${bin.file}"` : bin.file, args, {
          cwd: opts.cwd,
          shell: bin.shell,
          windowsHide: true,
          env: { ...process.env, NO_COLOR: '1' },
        })
        child = proc
        exited = false
        proc.stderr.setEncoding('utf8').on('data', (data: string) => { stderr = (stderr + data).slice(-4096) })

        const lines = createInterface({ input: proc.stdout })
        lines.on('line', (line) => {
          let parsed
          try { parsed = JSON.parse(line) } catch { return }
          onMessage(parsed)
        })
        proc.on('close', () => lines.close())

        // agy emits 'init' only after the first user turn on stdin; wait briefly after spawn to catch immediate startup errors.
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const timer = setTimeout(() => {
            if (settled) return
            settled = true
            resolve()
          }, 150)
          proc.once('error', () => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reject(new Error(`Antigravity could not start. ${diagnostic(stderr)}`))
          })
          proc.once('exit', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            reject(new Error(`Antigravity exited during startup${code === null ? '' : ` (code ${code})`}. ${diagnostic(stderr)}`))
          })
        })

        proc.on('error', () => {
          if (child !== proc || needsRestart) return
          failProcess(`Antigravity process error. ${diagnostic(stderr)}`)
        })
        proc.on('exit', (code) => {
          if (child !== proc) return
          if (needsRestart) {
            exited = true
            starting = undefined
            return
          }
          failProcess(`Antigravity exited${code === null ? '' : ` (code ${code})`}. ${diagnostic(stderr)}`)
        })
        proc.stdin.on('error', () => {
          if (child !== proc || needsRestart) return
          failProcess('Antigravity closed its input channel.')
          stopTree(proc)
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
          emit({ type: 'step', text: 'Restarted Antigravity (earlier context is lost)' })
        } catch (err) {
          emit({ type: 'error', message: (err as Error).message, fatal: true })
          return
        }
      }
      if (!driver.alive()) {
        emit({ type: 'error', message: 'The Antigravity session is no longer running.', fatal: true })
        return
      }
      if (active) {
        emit({ type: 'error', message: 'The Antigravity session is already running a turn.' })
        return
      }

      let finish!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      const turn: Turn = {
        emit,
        finish,
        interrupted: false,
        emittedText: '',
        seenToolSteps: new Set(),
      }
      active = turn
      step('Thinking…')
      try {
        write({ event: 'user', message: { content: text } })
      } catch {
        if (active === turn) {
          complete({ type: 'error', message: `Could not send message to Antigravity. ${diagnostic(stderr)}`, fatal: true })
          await driver.close()
        }
      }
      await finished
    },

    async interrupt() {
      // agy stream-json reads one NDJSON user turn per line and has no in-band interrupt event.
      // Kill the process tree, emit a non-fatal error so the session remains usable, and auto-restart on the next turn.
      const turn = active
      if (!turn) return
      turn.interrupted = true
      needsRestart = true
      const proc = child
      child = undefined
      exited = true
      starting = undefined
      if (proc) stopTree(proc)
      complete({ type: 'error', message: 'The turn was interrupted.', fatal: false })
    },

    async close() {
      if (closed) return
      closed = true
      needsRestart = false
      const proc = child
      child = undefined
      if (proc) stopTree(proc)
      failProcess('The Antigravity session was closed.')
    },

    alive: () => !!child && !exited && !closed,
  }

  return driver
}
