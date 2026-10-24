// Run locally installed CLI agents (Claude Code, Codex, Antigravity…) in headless mode.
// Each agent works inside a temporary directory containing the article markdown in read-only/plan mode.
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

/** Parsed output chunk: response text delta, progress status line, or error message. */
type Parsed = { delta?: string; progress?: string; error?: string }
type Parser = { line: (l: string) => Parsed[]; end: () => Parsed[] }

type ChatOptions = { model?: string; effort?: string }

type AgentDef = {
  id: string
  label: string
  bin: string
  /** CLI arguments; if promptInArgs is true, the prompt is passed as an argument (requires direct executable without shell). */
  args: (prompt: string, opts?: ChatOptions) => string[]
  promptInArgs?: boolean
  makeParser: () => Parser
  note: string
}

const json = (line: string) => { try { return JSON.parse(line) } catch { return null } }
const short = (s: string, n = 90) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const describeCommand = (cmd: string) => (/document\.md/.test(cmd) ? 'Reading document.md' : `Running: ${short(cmd, 60)}`)

export const AGENTS: AgentDef[] = [
  {
    id: 'claude', label: 'Claude Code', bin: 'claude', note: 'claude -p, plan mode (read-only)',
    args: (_, opts) => ['-p', '--output-format', 'text', '--permission-mode', 'plan', ...(opts?.model ? ['--model', opts.model] : [])],
    makeParser: () => ({ line: (l) => [{ delta: l + '\n' }], end: () => [] }),
  },
  {
    id: 'codex', label: 'Codex', bin: 'codex', note: 'codex exec, sandbox read-only',
    args: (_, opts) => ['exec', '--json', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral',
      ...(opts?.model ? ['--model', opts.model] : []),
      ...(opts?.effort ? ['-c', `model_reasoning_effort=${JSON.stringify(opts.effort)}`] : []), '-'],
    makeParser: () => {
      // Codex emits multiple agent_message events; only the final one is the answer while earlier ones are progress notes.
      let pending: string | null = null
      const flush = (): Parsed[] => { const p = pending; pending = null; return p ? [{ delta: p + '\n' }] : [] }
      return {
        line: (l) => {
          const e = json(l); if (!e) return []
          const item = e.item ?? {}
          if (e.type === 'turn.started') return [{ progress: 'Thinking…' }]
          if (e.type === 'item.started' && item.type === 'command_execution') return [{ progress: describeCommand(String(item.command ?? '')) }]
          if (e.type === 'item.completed' && item.type === 'reasoning') return [{ progress: 'Thinking…' }]
          if (e.type === 'item.completed' && item.type === 'agent_message') {
            const out: Parsed[] = pending ? [{ progress: short(pending) }] : []
            pending = String(item.text ?? '')
            return out
          }
          if (e.type === 'turn.completed') return flush()
          if (e.type === 'turn.failed') return [{ error: e.error?.message ?? 'Codex reported an error.' }]
          if (e.type === 'error') return [{ error: e.message ?? 'Codex reported an error.' }]
          return []
        },
        end: flush,
      }
    },
  },
  {
    id: 'agy', label: 'Antigravity', bin: 'agy', note: 'agy -p, plan mode', promptInArgs: true,
    args: (prompt, opts) => [`-p=${prompt}`, '--output-format', 'stream-json', '--mode', 'plan',
      ...(opts?.model ? ['--model', opts.model] : []), ...(opts?.effort ? ['--effort', opts.effort] : [])],
    makeParser: () => ({
      line: (l) => {
        const e = json(l); if (!e) return []
        const s = e.step_update
        if (e.event === 'init') return [{ progress: 'Starting Antigravity…' }]
        if (e.event === 'step_update' && s) {
          if (s.step_type === 'agent_response') return s.text_delta ? [{ delta: s.text_delta }] : []
          if (s.step_type !== 'user_input' && s.state === 'ACTIVE') {
            const t = String(s.step_type ?? '')
            return [{ progress: /view|read|file/i.test(t) ? 'Reading document.md' : /plan|think/i.test(t) ? 'Thinking…' : `Working: ${t.replace(/_/g, ' ')}` }]
          }
        }
        if (e.event === 'result' && e.result?.status && e.result.status !== 'SUCCESS') return [{ error: e.result.error ?? `Antigravity finished with status ${e.result.status}.` }]
        return []
      },
      end: () => [],
    }),
  },
]

// ---- Locate executable on PATH (including .cmd/.exe on Windows) ----
/** Common installation paths per agent in case they are not on the server's PATH. */
function knownDirs(name: string): string[] {
  const home = homedir(), env = process.env
  const dirs: Record<string, string[]> = {
    claude: [path.join(home, '.local', 'bin'), path.join(home, '.claude', 'local'), path.join(home, '.claude', 'local', 'node_modules', '.bin')],
    codex: [env.APPDATA ? path.join(env.APPDATA, 'npm') : '', path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin')],
    agy: [env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'agy', 'bin') : '', path.join(home, '.local', 'bin')],
  }
  return (dirs[name] ?? []).filter(Boolean)
}

export function resolveBin(name: string): { file: string; shell: boolean } | null {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : ['']
  for (const dir of [...(process.env.PATH ?? '').split(path.delimiter), ...knownDirs(name)]) {
    if (!dir) continue
    for (const ext of process.platform === 'win32' ? ['.exe', ...exts.filter((e) => e !== '.exe')] : exts) {
      const file = path.join(dir, name + ext)
      if (existsSync(file)) return { file, shell: /\.(cmd|bat)$/i.test(file) }
    }
  }
  return null
}

/** Kill the entire process tree: on Windows, commands spawned via cmd leave child processes alive on plain kill(). */
export function stopTree(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGTERM')
}

function run(file: string, args: string[], shell: boolean, opts: { cwd?: string; input?: string; timeoutMs: number; signal?: AbortSignal; onLine?: (l: string) => void }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    // Use shell only when required (.cmd); arguments are fixed flags or validated model/effort strings.
    const child = spawn(shell ? `"${file}"` : file, args, { cwd: opts.cwd, shell, windowsHide: true, env: process.env })
    let stdout = '', stderr = '', buf = ''
    // Kill the entire process tree: on Windows, agents spawned via cmd leave child processes alive on plain kill().
    const stop = () => stopTree(child)
    const timer = setTimeout(stop, opts.timeoutMs)
    if (opts.signal?.aborted) stop()
    opts.signal?.addEventListener('abort', stop)
    child.stdout.setEncoding('utf8').on('data', (d: string) => {
      stdout += d
      if (!opts.onLine) return
      buf += d
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); if (line) opts.onLine(line) }
    })
    child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => { clearTimeout(timer); if (buf.trim()) opts.onLine?.(buf.trim()); resolve({ code, stdout, stderr }) })
    if (opts.input !== undefined) child.stdin.end(opts.input, 'utf8'); else child.stdin.end()
  })
}

export type AgentInfo = { id: string; label: string; available: boolean; version?: string; note: string }

let cache: { at: number; list: AgentInfo[] } | null = null

/** Detect CLI agents installed on the server host. */
export async function detectAgents(force = false): Promise<AgentInfo[]> {
  if (cache && !force && Date.now() - cache.at < 60_000) return cache.list
  const list = await Promise.all(AGENTS.map(async (a): Promise<AgentInfo> => {
    const bin = resolveBin(a.bin)
    if (!bin) return { id: a.id, label: a.label, available: false, note: a.note }
    try {
      const r = await run(bin.file, ['--version'], bin.shell, { timeoutMs: 20_000 })
      const version = (r.stdout || r.stderr).trim().split('\n')[0]
      return { id: a.id, label: a.label, available: true, version, note: a.note }
    } catch { return { id: a.id, label: a.label, available: false, note: a.note } }
  }))
  cache = { at: Date.now(), list }
  return list
}

const INSTRUCTIONS = `You are the writing assistant in Papercell. The open document is in document.md in the current working directory; read it when the question is about the document.
Do not edit or create any files. Reply in the language the user writes in.
When asked to write or edit content, return only that content in Markdown so it can be inserted directly, with no preamble. When asked to create or add a chart/figure/plot, output a fenced \`\`\`papercell-figure\`\`\` JSON block with "caption", "spec", "params", "js", and "python" following the rules in document.md. Never invent data.`

type Msg = { role: 'user' | 'assistant'; content: string }

async function materializeEmbeddedImages(rawPrompt: string, dir: string): Promise<string> {
  const tagRegex = /<attached_image\s+name="([^"]*)"\s+data_url="(data:image\/[^"]+)"\s*\/>/g
  if (!tagRegex.test(rawPrompt)) return rawPrompt
  tagRegex.lastIndex = 0
  const attDir = path.join(dir, 'attachments')
  await mkdir(attDir, { recursive: true })
  let idx = 0
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tagRegex.exec(rawPrompt)) !== null) {
    out += rawPrompt.slice(last, m.index)
    idx++
    const safeName = `${idx}-${(m[1] || 'image.png').replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const dataUrl = m[2]
    const comma = dataUrl.indexOf(',')
    if (comma !== -1) {
      const buf = Buffer.from(dataUrl.slice(comma + 1), 'base64')
      await writeFile(path.join(attDir, safeName), buf)
      out += `[Attached reference image saved at ./attachments/${safeName} — inspect this image file directly]`
    }
    last = m.index + m[0].length
  }
  out += rawPrompt.slice(last)
  return out
}

/** Run a local CLI agent and return a text stream; errors are appended after errorMark. */
export async function agentChat(agentId: string, messages: Msg[], doc: string, signal: AbortSignal, errorMark: string, progressMark: string, opts: ChatOptions = {}): Promise<Response> {
  const def = AGENTS.find((a) => a.id === agentId)
  const bin = def && resolveBin(def.bin)
  if (!def || !bin) return Response.json({ error: 'This agent was not found on the computer running the server.' }, { status: 404 })
  if (def.promptInArgs && bin.shell) return Response.json({ error: `${def.label} must be run directly, not through a shell.` }, { status: 500 })
  // Model/effort can reach a Windows .cmd wrapper; accept only CLI identifiers.
  if ([opts.model, opts.effort].some((v) => v !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(v))) {
    return Response.json({ error: 'Invalid model or reasoning effort.' }, { status: 400 })
  }

  const dir = await mkdtemp(path.join(tmpdir(), 'papercell-agent-'))
  await writeFile(path.join(dir, 'document.md'), doc || '(The document is empty.)', 'utf8')

  const history = messages.slice(0, -1).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
  const rawQuestion = messages[messages.length - 1]?.content ?? ''
  const question = await materializeEmbeddedImages(rawQuestion, dir)
  const prompt = `${INSTRUCTIONS}\n\n${history ? `Earlier conversation:\n${history}\n\n` : ''}Current question:\n${question}`

  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let sent = false, lastError = ''
      const fail = (m: string) => ctrl.enqueue(enc.encode(errorMark + m))
      const parser = def.makeParser()
      const emit = (items: Parsed[]) => items.forEach((p) => {
        if (p.delta) { sent = true; ctrl.enqueue(enc.encode(p.delta)) }
        if (p.progress) ctrl.enqueue(enc.encode(progressMark + p.progress + '\n'))
        if (p.error) lastError = p.error
      })
      ctrl.enqueue(enc.encode(progressMark + `Starting ${def.label}…\n`))
      try {
        const r = await run(bin.file, def.args(prompt, opts), bin.shell, {
          cwd: dir, input: def.promptInArgs ? undefined : prompt, timeoutMs: 5 * 60_000, signal,
          onLine: (line) => emit(parser.line(line)),
        })
        emit(parser.end())
        if (!sent && !signal.aborted) fail((lastError || r.stderr.trim().split('\n').slice(-3).join(' ') || `${def.label} did not answer (exit code ${r.code}).`).slice(0, 500))
      } catch (e) { if (!signal.aborted) fail((e as Error).message) }
      finally { ctrl.close(); rm(dir, { recursive: true, force: true }).catch(() => {}) }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
