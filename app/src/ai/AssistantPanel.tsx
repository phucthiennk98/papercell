import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { PlateEditor } from 'platejs/react'
import { Bot, Check, ClipboardCopy, Eye, EyeOff, KeyRound, Laptop, Loader2, RefreshCw, Settings2, Sparkles, Square, TextCursorInput, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROVIDERS, defaultConfig, type ProviderId } from './config'
import { aiStore, useAI } from './store'

/** Phải trùng với server/ai/assistant.ts */
const ERROR_MARK = '\u0000ERR:'
const PROGRESS_MARK = '\u0000P:'

type AgentInfo = { id: string; label: string; available: boolean; version?: string; note: string }

type Msg = {
  role: 'user' | 'assistant'
  content: string
  error?: boolean
  /** Bước đang làm (đọc file, suy nghĩ…) khi agent chưa trả lời xong. */
  progress?: string
  /** Ai trả lời và mất bao lâu, hiện dưới câu trả lời. */
  by?: string
  startedAt?: number
  ms?: number
}

/** Tách dòng tiến độ và lỗi ra khỏi chữ của câu trả lời trong luồng dữ liệu từ server. */
function parseStream(raw: string): { content: string; progress: string; error?: string } {
  let content = '', progress = '', i = 0
  for (;;) {
    const p = raw.indexOf(PROGRESS_MARK, i), e = raw.indexOf(ERROR_MARK, i)
    const next = [p, e].filter((x) => x >= 0).sort((a, b) => a - b)[0]
    if (next === undefined) { content += raw.slice(i); break }
    content += raw.slice(i, next)
    if (next === e) return { content, progress, error: raw.slice(e + ERROR_MARK.length) || 'Nhà cung cấp báo lỗi.' }
    const nl = raw.indexOf('\n', p + PROGRESS_MARK.length)
    if (nl < 0) break // dòng tiến độ chưa đến đủ
    progress = raw.slice(p + PROGRESS_MARK.length, nl)
    i = nl + 1
  }
  return { content: content.replace(/^\s+/, ''), progress }
}

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))} giây`

const SUGGESTIONS = [
  'Tóm tắt bài này trong 3 câu',
  'Viết đoạn Kết luận dựa trên phần Kết quả',
  'Kiểm tra lỗi chính tả và câu văn',
  'Gợi ý một hình nên có trong phần Kết quả',
]

/** Nội dung bài dạng Markdown để làm ngữ cảnh; thẻ hình JS được thay bằng chú thích + code. */
function docAsMarkdown(editor: PlateEditor) {
  const parts: string[] = []
  const text = (n: any): string => (typeof n.text === 'string' ? n.text : (n.children ?? []).map(text).join(''))
  for (const node of editor.children as any[]) {
    if (node.type === 'figure') { parts.push(`[Hình: ${node.caption || 'chưa có chú thích'}]\n\`\`\`js\n${node.js}\n\`\`\``); continue }
    try { parts.push((editor.api as any).markdown.serialize({ value: [node] })) }
    catch { parts.push(text(node)) }
  }
  return parts.join('\n\n')
}

export function AssistantPanel({ editor, onClose }: { editor: PlateEditor | null; onClose: () => void }) {
  const { config, remember, mode, agent } = useAI()
  const info = PROVIDERS[config.provider]
  const [serverKeys, setServerKeys] = useState<Record<string, boolean>>({})
  const [agents, setAgents] = useState<AgentInfo[] | null>(null)
  const [agentNote, setAgentNote] = useState('')
  const [detecting, setDetecting] = useState(false)
  const current = agents?.find((a) => a.id === agent && a.available)
  const hasKey = !!config.apiKey || !!serverKeys[config.provider] || !!info.keyOptional
  const ready = mode === 'agent' ? !!current : hasKey
  const [settings, setSettings] = useState(mode === 'api' ? !config.apiKey : !agent)
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [modelsMsg, setModelsMsg] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const latest = useRef<Msg[]>([]); latest.current = messages
  // Đồng hồ đếm giây khi đang chờ trả lời
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [busy])

  const detect = async (refresh = false) => {
    setDetecting(true)
    try {
      const j = await (await fetch('/api/agents' + (refresh ? '?refresh=1' : ''))).json()
      setAgents(j.agents ?? []); setAgentNote(j.note ?? '')
      const first = (j.agents as AgentInfo[]).find((a) => a.available)
      if (first && !(j.agents as AgentInfo[]).some((a) => a.id === aiStore.get().agent && a.available)) aiStore.setMode(aiStore.get().mode, first.id)
    } catch { setAgents([]); setAgentNote('Không dò được agent: server chưa chạy?') } finally { setDetecting(false) }
  }
  useEffect(() => { if (mode === 'agent' && agents === null) detect() }, [mode])
  useEffect(() => { fetch('/api/ai/status').then((r) => r.json()).then((j) => setServerKeys(j.serverKeys ?? {})).catch(() => {}) }, [])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [messages])
  useEffect(() => { setModels([]); setModelsMsg('') }, [config.provider])

  const refreshModels = async () => {
    setLoadingModels(true); setModelsMsg('')
    try {
      const r = await fetch('/api/ai/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ aiConfig: config }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setModels(j.models); setModelsMsg(`${j.models.length} model`)
    } catch (e) { setModelsMsg((e as Error).message) } finally { setLoadingModels(false) }
  }

  const send = async (text: string) => {
    const q = text.trim(); if (!q || busy) return
    if (!ready) { setSettings(true); return }
    const next: Msg[] = [...messages.filter((m) => !m.error), { role: 'user', content: q }]
    const by = mode === 'agent' ? (current?.label ?? 'Agent') : config.model
    const startedAt = Date.now()
    const update = (patch: Partial<Msg>) => setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], ...patch }])
    setMessages([...next, { role: 'assistant', content: '', by, startedAt, progress: mode === 'agent' ? `Đang mở ${by}…` : 'Đang gửi câu hỏi…' }])
    setInput(''); setBusy(true); setSettings(false)
    const ctl = new AbortController(); abort.current = ctl
    try {
      const doc = editor ? docAsMarkdown(editor) : ''
      const r = await fetch(mode === 'agent' ? '/api/agents/chat' : '/api/assistant/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify(mode === 'agent' ? { agent, messages: next, doc } : { aiConfig: config, messages: next, doc }),
      })
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Lỗi ${r.status}`) }
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
      let raw = '', content = ''
      for (;;) {
        const { value, done } = await reader.read(); if (done) break
        raw += value
        const s = parseStream(raw)
        if (s.error) throw new Error(s.error)
        content = s.content
        update({ content, progress: s.progress || (content ? '' : 'Đang suy nghĩ…') })
      }
      if (!content.trim()) throw new Error('Không nhận được câu trả lời. Kiểm tra model và key.')
      update({ progress: '', ms: Date.now() - startedAt })
    } catch (e) {
      if ((e as Error).name === 'AbortError') update({ progress: '', ms: Date.now() - startedAt, content: messagesContentOrStopped() })
      else update({ content: (e as Error).message, error: true, progress: '' })
    } finally { setBusy(false); abort.current = null }
  }
  // Khi người dùng bấm Dừng: giữ phần đã nhận, nếu chưa có gì thì ghi chú đã dừng.
  const messagesContentOrStopped = () => {
    const last = latest.current[latest.current.length - 1]
    return last?.content?.trim() ? last.content : '_Đã dừng._'
  }

  const insert = (md: string) => {
    if (!editor) return
    const nodes = (editor.api as any).markdown.deserialize(md)
    const top = editor.selection ? editor.api.block({ highest: true }) : undefined
    editor.tf.insertNodes(nodes, { at: top ? [top[1][0] + 1] : [editor.children.length], select: true })
    editor.tf.focus()
  }
  const copy = async (i: number, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(null), 1500) } catch { /* bỏ qua */ } }

  const field = 'h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring'
  return (
    <aside className="flex w-[360px] max-w-full shrink-0 flex-col border-l bg-muted/20 text-sm max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-40 max-[900px]:bg-background max-[900px]:shadow-2xl" aria-label="Trợ lý AI">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <span className="flex items-center gap-2 font-semibold"><Sparkles className="size-4" />Trợ lý AI</span>
        <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Đóng trợ lý" onClick={onClose}><X className="size-4" /></button>
      </div>

      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{mode === 'agent' ? (current ? `${current.label} · trên máy` : 'Chưa chọn agent trên máy') : `${info.label} · ${config.model || 'chưa chọn model'}`}</span>
        <button className={cn('rounded-md p-1 hover:bg-accent', settings && 'bg-accent text-foreground')} aria-label="Cài đặt nhà cung cấp" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 className="size-4" /></button>
      </div>

      {settings && (
        <div className="flex gap-1 border-b px-3 pt-3 pb-2" role="radiogroup" aria-label="Cách chạy AI">
          {([['api', KeyRound, 'Nhập API key'], ['agent', Laptop, 'Agent trên máy']] as const).map(([m, Icon, label]) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => aiStore.setMode(m)}
              className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5', mode === m ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent')}>
              <Icon className="size-3.5" />{label}
            </button>
          ))}
        </div>
      )}

      {settings && mode === 'agent' && (
        <div className="space-y-2 border-b px-3 py-3">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Agent tìm thấy trên máy</span>
            <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent" onClick={() => detect(true)}>
              {detecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Dò lại
            </button>
          </div>
          {agents === null || (detecting && !agents.length) ? <p className="text-xs text-muted-foreground">Đang dò…</p> : (
            <div className="space-y-1">
              {agents.map((a) => (
                <label key={a.id} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5', !a.available && 'opacity-50', a.id === agent && a.available && 'border-foreground')}>
                  <input type="radio" name="pc-agent" disabled={!a.available} checked={a.id === agent && a.available} onChange={() => aiStore.setMode('agent', a.id)} />
                  <Bot className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.available ? `${a.version ?? ''} · ${a.note}` : 'Chưa cài trên máy này'}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="space-y-1 text-xs text-muted-foreground">
            {agentNote && <p className="text-amber-600">{agentNote}</p>}
            <p>Dùng tài khoản đã đăng nhập sẵn trong agent, không cần nhập key.</p>
            <p>Agent chạy trên máy này ở chế độ chỉ đọc, trong một thư mục tạm chứa nội dung bài (<code>bai-viet.md</code>); thư mục bị xóa sau khi trả lời.</p>
            {agents && !agents.some((a) => a.available) && <p className="text-amber-600">Chưa thấy agent nào. Cài Claude Code, Codex hoặc Antigravity rồi bấm Dò lại.</p>}
          </div>
        </div>
      )}

      {settings && mode === 'api' && (
        <div className="space-y-2.5 border-b px-3 py-3">
          <div className="text-xs font-medium text-muted-foreground">Nhà cung cấp AI</div>
          <label className="grid grid-cols-[72px_1fr] items-center gap-2">Nhà cung cấp
            <select className={field} value={config.provider} onChange={(e) => { const p = e.target.value as ProviderId; aiStore.set({ ...defaultConfig(p), apiKey: '' }) }}>
              {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}
            </select>
          </label>
          <label className="grid grid-cols-[72px_1fr_auto] items-center gap-2">Model
            <input className={field} list="pc-models" value={config.model} placeholder={info.defaultModel || 'tên model'} onChange={(e) => aiStore.set({ model: e.target.value })} />
            <button className="grid size-8 place-items-center rounded-md border hover:bg-accent" aria-label="Tải danh sách model" title="Tải danh sách model từ nhà cung cấp" onClick={refreshModels}>
              {loadingModels ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
          </label>
          <datalist id="pc-models">{[...new Set([...info.suggestions, ...models])].map((m) => <option key={m} value={m} />)}</datalist>
          {modelsMsg && <p className="pl-[80px] text-xs text-muted-foreground">{modelsMsg}</p>}
          <label className="grid grid-cols-[72px_1fr] items-center gap-2">Địa chỉ
            <input className={field} value={config.baseURL} onChange={(e) => aiStore.set({ baseURL: e.target.value })} spellCheck={false} />
          </label>
          <label className="grid grid-cols-[72px_1fr_auto] items-center gap-2">API key
            <input className={field} type={showKey ? 'text' : 'password'} value={config.apiKey} autoComplete="off" spellCheck={false}
              placeholder={serverKeys[config.provider] ? 'server đã có key, có thể để trống' : info.keyOptional ? 'không bắt buộc' : 'dán key vào đây'}
              onChange={(e) => aiStore.set({ apiKey: e.target.value })} />
            <button className="grid size-8 place-items-center rounded-md border hover:bg-accent" aria-label={showKey ? 'Ẩn key' : 'Hiện key'} onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={(e) => aiStore.set({}, e.target.checked)} />Nhớ key trên máy này</label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{info.note}</p>
            <p>{remember ? 'Key được lưu trong trình duyệt của máy này.' : 'Key chỉ giữ trong phiên này, đóng tab là mất.'} Có thể đặt sẵn biến môi trường <code>{info.envVar}</code> cho server để không phải nhập.</p>
            <p>Mỗi câu hỏi gửi kèm nội dung bài đang mở tới nhà cung cấp đã chọn.</p>
            {info.keyUrl && <a className="text-blue-600 hover:underline" href={info.keyUrl} target="_blank" rel="noreferrer">Lấy key</a>}
            {!hasKey && <p className="text-amber-600">Nhập API key để dùng trợ lý.</p>}
            <p>Menu AI trong bài (Space ở dòng trống, Ctrl+J) cũng dùng cài đặt này.</p>
          </div>
        </div>
      )}

      <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-muted-foreground">Hỏi về bài đang viết, hoặc nhờ viết, sửa, tóm tắt. Trợ lý đọc nội dung bài để trả lời; bấm <b>Chèn vào bài</b> để đưa câu trả lời vào vị trí con trỏ.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => <button key={s} className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const live = busy && i === messages.length - 1
          if (m.role === 'user') return <div key={i} className="chat-in ml-8 whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-foreground/[.06] px-3 py-2">{m.content}</div>
          if (m.error) return <div key={i} className="chat-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{m.content}</div>
          return (
            <div key={i} className="chat-in space-y-2">
              {live && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  <span key={m.progress} className="chat-shimmer min-w-0 truncate">{m.progress || 'Đang trả lời…'}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{m.startedAt ? seconds(now - m.startedAt) : ''}</span>
                </div>
              )}
              {m.content && (
                <div className={cn('chat-md rounded-lg border bg-background px-3 py-2 leading-relaxed', live && 'is-streaming')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
              {!live && m.content && (
                <div className="flex items-center gap-1.5 text-xs">
                  <button className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" onClick={() => insert(m.content)}><TextCursorInput className="size-3.5" />Chèn vào bài</button>
                  <button className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" onClick={() => copy(i, m.content)}>{copied === i ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}{copied === i ? 'Đã chép' : 'Sao chép'}</button>
                  {m.ms !== undefined && <span className="ml-auto text-muted-foreground">{m.by} · {seconds(m.ms)}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t p-3">
        <textarea className="min-h-[64px] w-full resize-none rounded-md border bg-background px-2.5 py-2 outline-none focus:border-ring" value={input}
          placeholder="Hỏi về bài, hoặc nhờ viết một đoạn…" aria-label="Câu hỏi cho trợ lý"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) } }} />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter để gửi, Shift+Enter xuống dòng</span>
          {busy ? <button className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-foreground hover:bg-accent" onClick={() => abort.current?.abort()}><Square className="size-3.5" />Dừng</button>
            : <button className="rounded-md bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-40" disabled={!input.trim()} onClick={() => send(input)}>Gửi</button>}
        </div>
      </div>
    </aside>
  )
}
