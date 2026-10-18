// Chạy các agent đã cài trên máy (Claude Code, Codex, Antigravity…) ở chế độ không giao diện.
// Agent làm việc trong một thư mục tạm chứa bai-viet.md, ở chế độ chỉ đọc / lập kế hoạch.
import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

/** Một mẩu đầu ra đã hiểu: chữ của câu trả lời, dòng trạng thái tiến độ, hoặc lỗi. */
type Parsed = { delta?: string; progress?: string; error?: string }
type Parser = { line: (l: string) => Parsed[]; end: () => Parsed[] }

type AgentDef = {
  id: string
  label: string
  bin: string
  /** Tham số chạy; nếu promptInArgs thì câu hỏi nằm trong tham số (cần file chạy trực tiếp, không qua shell). */
  args: (prompt: string) => string[]
  promptInArgs?: boolean
  makeParser: () => Parser
  note: string
}

const json = (line: string) => { try { return JSON.parse(line) } catch { return null } }
const short = (s: string, n = 90) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const describeCommand = (cmd: string) => (/bai-viet\.md/.test(cmd) ? 'Đang đọc bai-viet.md' : `Đang chạy lệnh: ${short(cmd, 60)}`)

export const AGENTS: AgentDef[] = [
  {
    id: 'claude', label: 'Claude Code', bin: 'claude', note: 'claude -p, chế độ plan (chỉ đọc)',
    args: () => ['-p', '--output-format', 'text', '--permission-mode', 'plan'],
    makeParser: () => ({ line: (l) => [{ delta: l + '\n' }], end: () => [] }),
  },
  {
    id: 'codex', label: 'Codex', bin: 'codex', note: 'codex exec, sandbox read-only',
    args: () => ['exec', '--json', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-'],
    makeParser: () => {
      // Codex gửi nhiều agent_message; chỉ cái cuối là câu trả lời, các cái trước là lời dẫn tiến độ.
      let pending: string | null = null
      const flush = (): Parsed[] => { const p = pending; pending = null; return p ? [{ delta: p + '\n' }] : [] }
      return {
        line: (l) => {
          const e = json(l); if (!e) return []
          const item = e.item ?? {}
          if (e.type === 'turn.started') return [{ progress: 'Đang suy nghĩ…' }]
          if (e.type === 'item.started' && item.type === 'command_execution') return [{ progress: describeCommand(String(item.command ?? '')) }]
          if (e.type === 'item.completed' && item.type === 'reasoning') return [{ progress: 'Đang suy nghĩ…' }]
          if (e.type === 'item.completed' && item.type === 'agent_message') {
            const out: Parsed[] = pending ? [{ progress: short(pending) }] : []
            pending = String(item.text ?? '')
            return out
          }
          if (e.type === 'turn.completed') return flush()
          if (e.type === 'turn.failed') return [{ error: e.error?.message ?? 'Codex báo lỗi.' }]
          if (e.type === 'error') return [{ error: e.message ?? 'Codex báo lỗi.' }]
          return []
        },
        end: flush,
      }
    },
  },
  {
    id: 'agy', label: 'Antigravity', bin: 'agy', note: 'agy -p, chế độ plan', promptInArgs: true,
    args: (prompt) => [`-p=${prompt}`, '--output-format', 'stream-json', '--mode', 'plan'],
    makeParser: () => ({
      line: (l) => {
        const e = json(l); if (!e) return []
        const s = e.step_update
        if (e.event === 'init') return [{ progress: 'Đang khởi động Antigravity…' }]
        if (e.event === 'step_update' && s) {
          if (s.step_type === 'agent_response') return s.text_delta ? [{ delta: s.text_delta }] : []
          if (s.step_type !== 'user_input' && s.state === 'ACTIVE') {
            const t = String(s.step_type ?? '')
            return [{ progress: /view|read|file/i.test(t) ? 'Đang đọc bai-viet.md' : /plan|think/i.test(t) ? 'Đang suy nghĩ…' : `Đang thực hiện: ${t.replace(/_/g, ' ')}` }]
          }
        }
        if (e.event === 'result' && e.result?.status && e.result.status !== 'SUCCESS') return [{ error: e.result.error ?? `Antigravity kết thúc với trạng thái ${e.result.status}.` }]
        return []
      },
      end: () => [],
    }),
  },
]

// ---- Tìm file chạy trên PATH (kể cả .cmd/.exe trên Windows) ----
/** Nơi cài đặt quen thuộc của từng agent, phòng khi thư mục đó không nằm trong PATH. */
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

/** Tắt cả cây tiến trình: trên Windows, chương trình chạy qua cmd nên kill() chỉ tắt lớp vỏ ngoài. */
export function stopTree(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
  else child.kill('SIGTERM')
}

function run(file: string, args: string[], shell: boolean, opts: { cwd?: string; input?: string; timeoutMs: number; signal?: AbortSignal; onLine?: (l: string) => void }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    // Qua shell chỉ khi bắt buộc (.cmd); khi đó tham số là hằng số, không chứa nội dung người dùng.
    const child = spawn(shell ? `"${file}"` : file, args, { cwd: opts.cwd, shell, windowsHide: true, env: process.env })
    let stdout = '', stderr = '', buf = ''
    // Tắt cả cây tiến trình: trên Windows, agent chạy qua cmd nên kill() chỉ tắt lớp vỏ ngoài.
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

/** Dò các agent đã cài trên máy chạy server. */
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

const INSTRUCTIONS = `Bạn là trợ lý viết bài khoa học trong Papercell. Nội dung bài đang mở nằm trong file bai-viet.md ở thư mục làm việc hiện tại; hãy đọc file đó khi câu hỏi liên quan tới bài.
Không sửa, không tạo file nào. Trả lời bằng ngôn ngữ của người dùng (mặc định tiếng Việt).
Khi được nhờ viết hoặc sửa nội dung, chỉ trả về phần nội dung bằng Markdown để chèn thẳng vào bài, không kèm lời dẫn. Không bịa số liệu.`

type Msg = { role: 'user' | 'assistant'; content: string }

/** Chạy một agent cục bộ, trả về stream chữ; lỗi được gửi sau errorMark. */
export async function agentChat(agentId: string, messages: Msg[], doc: string, signal: AbortSignal, errorMark: string, progressMark: string): Promise<Response> {
  const def = AGENTS.find((a) => a.id === agentId)
  const bin = def && resolveBin(def.bin)
  if (!def || !bin) return Response.json({ error: 'Không tìm thấy agent này trên máy chạy server.' }, { status: 404 })
  if (def.promptInArgs && bin.shell) return Response.json({ error: `${def.label} cần chạy trực tiếp, không qua shell.` }, { status: 500 })

  const history = messages.slice(0, -1).map((m) => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content}`).join('\n\n')
  const question = messages[messages.length - 1]?.content ?? ''
  const prompt = `${INSTRUCTIONS}\n\n${history ? `Hội thoại trước:\n${history}\n\n` : ''}Câu hỏi hiện tại:\n${question}`

  const dir = await mkdtemp(path.join(tmpdir(), 'papercell-agent-'))
  await writeFile(path.join(dir, 'bai-viet.md'), doc || '(Bài đang trống.)', 'utf8')

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
      ctrl.enqueue(enc.encode(progressMark + `Đang mở ${def.label}…\n`))
      try {
        const r = await run(bin.file, def.args(prompt), bin.shell, {
          cwd: dir, input: def.promptInArgs ? undefined : prompt, timeoutMs: 5 * 60_000, signal,
          onLine: (line) => emit(parser.line(line)),
        })
        emit(parser.end())
        if (!sent && !signal.aborted) fail((lastError || r.stderr.trim().split('\n').slice(-3).join(' ') || `${def.label} không trả lời (mã thoát ${r.code}).`).slice(0, 500))
      } catch (e) { if (!signal.aborted) fail((e as Error).message) }
      finally { ctrl.close(); rm(dir, { recursive: true, force: true }).catch(() => {}) }
    },
  })
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
