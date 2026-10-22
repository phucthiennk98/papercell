import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { PlateEditor } from 'platejs/react'
import { Bot, Check, ClipboardCopy, Eye, EyeOff, KeyRound, Laptop, Loader2, RefreshCw, Settings2, Sparkles, Square, TextCursorInput, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PROVIDERS, defaultConfig, type ProviderId } from './config'
import { aiStore, useAI } from './store'
import { parseStream } from './ask'
import { AgentSessionError, closeSession, createSession, fetchAgentModels, interruptSession, runTurn, type AgentModel, type AgentSession } from './agent-session'

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
  steps?: { name: string; detail?: string }[]
  notice?: string
  failure?: string
}

/** Model hay viết công thức bằng \( \) và \[ \]; đổi sang $ và $$ để Markdown không nuốt dấu \ và để vẽ bằng KaTeX. */
export function normalizeMath(md: string) {
  return md
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => '\n$$\n' + m.trim() + '\n$$\n')
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => '$' + m.trim() + '$')
}

const STOPPED = '_Stopped._'

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`

const SUGGESTIONS = [
  'Summarize this document in 3 sentences',
  'Write a Conclusion based on the Results',
  'Check spelling and grammar',
  'Suggest a figure for the Results section',
]

/** Nội dung bài dạng Markdown để làm ngữ cảnh; thẻ hình JS được thay bằng chú thích + code. */
function docAsMarkdown(editor: PlateEditor) {
  const parts: string[] = []
  const text = (n: any): string => (typeof n.text === 'string' ? n.text : (n.children ?? []).map(text).join(''))
  for (const node of editor.children as any[]) {
    if (node.type === 'figure') { parts.push(`[Figure: ${node.caption || 'no caption'}]\n\`\`\`js\n${node.js}\n\`\`\``); continue }
    try { parts.push((editor.api as any).markdown.serialize({ value: [node] })) }
    catch { parts.push(text(node)) }
  }
  return parts.join('\n\n')
}

export function AssistantPanel({ editor, onClose }: { editor: PlateEditor | null; onClose: () => void }) {
  const { config, remember, mode, agent, agentSettings } = useAI()
  const { model: agentModel, effort: agentEffort } = agentSettings[agent] ?? {}
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
  const [localModels, setLocalModels] = useState<AgentModel[]>([])
  const [localModelsMsg, setLocalModelsMsg] = useState('')
  const [loadingLocalModels, setLoadingLocalModels] = useState(false)
  const [sessionNote, setSessionNote] = useState('')
  const modelRequest = useRef(0)
  const session = useRef<AgentSession | null>(null)
  const generation = useRef(0)
  const selectedModel = localModels.find((m) => agentModel ? m.id === agentModel : m.isDefault)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const list = useRef<HTMLDivElement>(null)
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
    } catch { setAgents([]); setAgentNote('Could not detect agents: is the server running?') } finally { setDetecting(false) }
  }
  useEffect(() => { if (mode === 'agent' && agents === null) detect() }, [mode])
  useEffect(() => { fetch('/api/ai/status').then((r) => r.json()).then((j) => setServerKeys(j.serverKeys ?? {})).catch(() => {}) }, [])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }) }, [messages])
  useEffect(() => { setModels([]); setModelsMsg('') }, [config.provider])

  const discardSession = () => {
    generation.current++
    abort.current?.abort(); abort.current = null
    const old = session.current; session.current = null
    if (old) void closeSession(old.id).catch(() => {})
  }
  useEffect(() => {
    setBusy(false)
    if (mode === 'agent') setSessionNote(`New session with ${agentModel || 'CLI default'}`)
    return discardSession
  }, [mode, agent, agentModel, agentEffort])

  const loadLocalModels = async (refresh = false) => {
    const request = ++modelRequest.current
    setLoadingLocalModels(true); setLocalModelsMsg('')
    try {
      const result = await fetchAgentModels(agent, refresh)
      if (request !== modelRequest.current) return
      setLocalModels(result.models); setLocalModelsMsg(result.warning ?? '')
    } catch (e) {
      if (request === modelRequest.current) setLocalModelsMsg((e as Error).message)
    } finally { if (request === modelRequest.current) setLoadingLocalModels(false) }
  }
  useEffect(() => {
    setLocalModels([]); setLocalModelsMsg('')
    if (mode === 'agent' && agent) void loadLocalModels()
    return () => { modelRequest.current++ }
  }, [mode, agent])

  const stop = () => {
    abort.current?.abort()
    if (session.current) void interruptSession(session.current.id).catch(() => {})
    else if (mode === 'agent') {
      // Session creation can still be waiting for the CLI handshake; close a late result.
      generation.current++; abort.current = null; setBusy(false)
      setMessages((m) => m.length ? [...m.slice(0, -1), { ...m[m.length - 1], content: m[m.length - 1].content || STOPPED, progress: '' }] : m)
    }
  }
  const newChat = () => {
    discardSession(); setBusy(false); setMessages([]); setSessionNote('')
  }

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
    const q = text.trim(); if (!q || busy || abort.current) return
    if (!ready) { setSettings(true); return }
    const next: Msg[] = [...messages.filter((m) => !m.error), { role: 'user', content: q }]
    const by = mode === 'agent' ? `${current?.label ?? 'Agent'} · ${agentModel || 'CLI default'}` : config.model
    const startedAt = Date.now()
    const ctl = new AbortController(); abort.current = ctl
    const turnGeneration = generation.current
    let received = ''
    const update = (patch: Partial<Msg>) => {
      if (abort.current !== ctl || turnGeneration !== generation.current) return
      if (patch.content !== undefined) received = patch.content
      setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], ...patch }])
    }
    setMessages([...next, { role: 'assistant', content: '', by, startedAt, progress: mode === 'agent' ? `Starting ${by}…` : 'Sending…' }])
    setInput(''); setBusy(true); setSettings(false)
    try {
      const doc = editor ? docAsMarkdown(editor) : ''
      if (mode === 'agent') {
        for (let attempt = 0; attempt < 2; attempt++) {
          let content = ''
          const steps: NonNullable<Msg['steps']> = []
          try {
            if (!session.current) {
              update({ progress: `Starting ${current?.label ?? 'agent'}…` })
              const created = await createSession({ agent, model: agentModel, effort: agentEffort })
              if (turnGeneration !== generation.current) {
                void closeSession(created.id).catch(() => {})
                throw new DOMException('Stopped', 'AbortError')
              }
              session.current = created
            }
            ctl.signal.throwIfAborted()
            await runTurn(session.current.id, { text: q, doc }, {
              signal: ctl.signal,
              onEvent: (event) => {
                if (event.type === 'text') { content += event.delta; update({ content, progress: '' }) }
                else if (event.type === 'step') update({ progress: event.text })
                else if (event.type === 'tool') { steps.push({ name: event.name, detail: event.detail }); update({ steps: [...steps] }) }
                else if (event.type === 'done') update({ by: `${current?.label ?? 'Agent'} · ${event.model || agentModel || 'CLI default'}`, progress: '', ms: Date.now() - startedAt })
              },
            })
            break
          } catch (e) {
            if (ctl.signal.aborted || turnGeneration !== generation.current) throw e
            const lost = e instanceof AgentSessionError && (e.status === 404 || e.fatal)
            if (lost) {
              const old = session.current; session.current = null
              if (old) void closeSession(old.id).catch(() => {})
            }
            if (!lost || attempt > 0) throw e
            update({ content: '', steps: [], notice: 'Session restarted, earlier context is lost', progress: 'Restarting session…' })
          }
        }
        return
      }
      const r = await fetch('/api/assistant/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({ aiConfig: config, messages: next, doc }),
      })
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Error ${r.status}`) }
      const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
      let raw = '', content = ''
      for (;;) {
        const { value, done } = await reader.read(); if (done) break
        raw += value
        const s = parseStream(raw)
        if (s.error) throw new Error(s.error)
        content = s.content
        update({ content, progress: s.progress || (content ? '' : 'Thinking…') })
      }
      if (!content.trim()) throw new Error('No answer received. Check the model and API key.')
      update({ progress: '', ms: Date.now() - startedAt })
    } catch (e) {
      if (ctl.signal.aborted || (e as Error).name === 'AbortError') update({ progress: '', ms: Date.now() - startedAt, content: received.trim() ? received : STOPPED })
      else if (mode === 'agent') update({ failure: (e as Error).message, progress: '', ms: Date.now() - startedAt })
      else update({ content: (e as Error).message, error: true, progress: '' })
    } finally { if (abort.current === ctl) { setBusy(false); abort.current = null } }
  }
  const insert = (md: string) => {
    if (!editor) return
    const nodes = (editor.api as any).markdown.deserialize(normalizeMath(md))
    const top = editor.selection ? editor.api.block({ highest: true }) : undefined
    editor.tf.insertNodes(nodes, { at: top ? [top[1][0] + 1] : [editor.children.length], select: true })
    editor.tf.focus()
  }
  const copy = async (i: number, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(null), 1500) } catch { /* bỏ qua */ } }

  const field = 'h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring'
  return (
    <aside className="flex w-[360px] max-w-full shrink-0 flex-col border-l bg-muted/20 text-sm max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-40 max-[900px]:bg-background max-[900px]:shadow-2xl" aria-label="AI Assistant">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <span className="flex items-center gap-2 font-semibold"><Sparkles className="size-4" />AI Assistant</span>
        <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Close assistant" onClick={() => { discardSession(); onClose() }}><X className="size-4" /></button>
      </div>

      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{mode === 'agent' ? (current ? `${current.label} · ${agentModel || 'CLI default'}` : 'No local agent selected') : `${info.label} · ${config.model || 'no model selected'}`}</span>
        {mode === 'agent' && <button className="shrink-0 rounded-md border px-2 py-1 hover:bg-accent" onClick={newChat}>New chat</button>}
        <button className={cn('rounded-md p-1 hover:bg-accent', settings && 'bg-accent text-foreground')} aria-label="Provider settings" aria-expanded={settings} onClick={() => setSettings(!settings)}><Settings2 className="size-4" /></button>
      </div>

      {settings && (
        <div className="flex gap-1 border-b px-3 pt-3 pb-2" role="radiogroup" aria-label="How to run AI">
          {([['api', KeyRound, 'API key'], ['agent', Laptop, 'Local agent']] as const).map(([m, Icon, label]) => (
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
            <span>Agents found on this computer</span>
            <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-accent" onClick={() => detect(true)}>
              {detecting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Rescan
            </button>
          </div>
          {agents === null || (detecting && !agents.length) ? <p className="text-xs text-muted-foreground">Scanning…</p> : (
            <div className="space-y-1">
              {agents.map((a) => (
                <label key={a.id} className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5', !a.available && 'opacity-50', a.id === agent && a.available && 'border-foreground')}>
                  <input type="radio" name="pc-agent" disabled={!a.available} checked={a.id === agent && a.available} onChange={() => aiStore.setMode('agent', a.id)} />
                  <Bot className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.available ? `${a.version ?? ''} · ${a.note}` : 'Not installed on this computer'}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {agent && (
            <div className="space-y-2">
              <label className="grid grid-cols-[60px_1fr] items-center gap-2">Model
                <select className={field} value={agentModel ?? ''} onChange={(e) => aiStore.setAgentSettings(agent, { model: e.target.value || undefined, effort: undefined })}>
                  <option value="">CLI default</option>
                  {agentModel && !localModels.some((m) => m.id === agentModel) && <option value={agentModel}>{agentModel}</option>}
                  {localModels.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}{m.isDefault ? ' (default)' : ''}</option>)}
                </select>
              </label>
              <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50" disabled={loadingLocalModels} onClick={() => loadLocalModels(true)}>
                {loadingLocalModels ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}Rescan models
              </button>
              {!!selectedModel?.efforts?.length && (
                <label className="grid grid-cols-[60px_1fr] items-center gap-2">Effort
                  <select className={field} value={agentEffort ?? ''} onChange={(e) => aiStore.setAgentSettings(agent, { effort: e.target.value || undefined })}>
                    <option value="">CLI default</option>
                    {agentEffort && !selectedModel.efforts.includes(agentEffort) && <option value={agentEffort}>{agentEffort}</option>}
                    {selectedModel.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                  </select>
                </label>
              )}
              {localModelsMsg && <p className="text-xs text-amber-600" role="status">{localModelsMsg}</p>}
            </div>
          )}
          <div className="space-y-1 text-xs text-muted-foreground">
            {agentNote && <p className="text-amber-600">{agentNote}</p>}
            <p>Uses the account already signed in to the agent; no key needed.</p>
            <p>The agent runs in read-only mode and remembers this chat until you start a new chat or close the assistant. Each message includes the current document.</p>
            {agents && !agents.some((a) => a.available) && <p className="text-amber-600">No agents found. Install Claude Code, Codex or Antigravity, then click Rescan.</p>}
          </div>
        </div>
      )}

      {settings && mode === 'api' && (
        <div className="space-y-2.5 border-b px-3 py-3">
          <div className="text-xs font-medium text-muted-foreground">AI provider</div>
          <label className="grid grid-cols-[72px_1fr] items-center gap-2">Provider
            <select className={field} value={config.provider} onChange={(e) => { const p = e.target.value as ProviderId; aiStore.set({ ...defaultConfig(p), apiKey: '' }) }}>
              {(Object.keys(PROVIDERS) as ProviderId[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}
            </select>
          </label>
          <label className="grid grid-cols-[72px_1fr_auto] items-center gap-2">Model
            <input className={field} list="pc-models" value={config.model} placeholder={info.defaultModel || 'model name'} onChange={(e) => aiStore.set({ model: e.target.value })} />
            <button className="grid size-8 place-items-center rounded-md border hover:bg-accent" aria-label="Load models" title="Load the model list from the provider" onClick={refreshModels}>
              {loadingModels ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </button>
          </label>
          <datalist id="pc-models">{[...new Set([...info.suggestions, ...models])].map((m) => <option key={m} value={m} />)}</datalist>
          {modelsMsg && <p className="pl-[80px] text-xs text-muted-foreground">{modelsMsg}</p>}
          <label className="grid grid-cols-[72px_1fr] items-center gap-2">Base URL
            <input className={field} value={config.baseURL} onChange={(e) => aiStore.set({ baseURL: e.target.value })} spellCheck={false} />
          </label>
          <label className="grid grid-cols-[72px_1fr_auto] items-center gap-2">API key
            <input className={field} type={showKey ? 'text' : 'password'} value={config.apiKey} autoComplete="off" spellCheck={false}
              placeholder={serverKeys[config.provider] ? 'the server has a key, can be empty' : info.keyOptional ? 'optional' : 'paste your key'}
              onChange={(e) => aiStore.set({ apiKey: e.target.value })} />
            <button className="grid size-8 place-items-center rounded-md border hover:bg-accent" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(!showKey)}>
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={(e) => aiStore.set({}, e.target.checked)} />Remember key on this computer</label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{info.note}</p>
            <p>{remember ? 'The key is stored in this browser.' : 'The key is kept for this session only; closing the tab forgets it.'} You can also set <code>{info.envVar}</code> on the server instead.</p>
            <p>Each question sends the open document to the selected provider.</p>
            {info.keyUrl && <a className="text-blue-600 hover:underline" href={info.keyUrl} target="_blank" rel="noreferrer">Get a key</a>}
            {!hasKey && <p className="text-amber-600">Enter an API key to use the assistant.</p>}
            <p>The in-document AI menu (Space on an empty line, Ctrl+J) uses these settings too.</p>
          </div>
        </div>
      )}

      <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {mode === 'agent' && sessionNote && <p className="text-xs text-muted-foreground" role="status">{sessionNote}</p>}
        {!messages.length && (
          <div className="space-y-3">
            <p className="text-muted-foreground">Ask about the document, or have it write, edit or summarize. The assistant reads the document to answer; click <b>Insert</b> to put an answer at the cursor.</p>
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
              {m.notice && <p className="text-xs text-amber-600" role="status">{m.notice}</p>}
              {live && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" />
                  <span key={m.progress} className="chat-shimmer min-w-0 truncate">{m.progress || 'Answering…'}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{m.startedAt ? seconds(now - m.startedAt) : ''}</span>
                </div>
              )}
              {m.content && (
                <div className={cn('chat-md rounded-lg border bg-background px-3 py-2 leading-relaxed', live && 'is-streaming')}>
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMath(m.content)}</ReactMarkdown>
                </div>
              )}
              {!!m.steps?.length && (
                <details className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{m.steps.length} {m.steps.length === 1 ? 'step' : 'steps'}</summary>
                  <ol className="mt-1 space-y-1 pl-3">
                    {m.steps.map((step, j) => <li key={j} className="whitespace-pre-wrap break-words"><span className="font-medium">{step.name}</span>{step.detail && <span> · {step.detail}</span>}</li>)}
                  </ol>
                </details>
              )}
              {m.failure && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700" role="alert">{m.failure}</div>}
              {!live && (m.content || m.ms !== undefined) && m.content !== STOPPED && (
                <div className="flex items-center gap-1.5 text-xs">
                  {m.content && <>
                    <button className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" onClick={() => insert(m.content)}><TextCursorInput className="size-3.5" />Insert</button>
                    <button className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" onClick={() => copy(i, m.content)}>{copied === i ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}{copied === i ? 'Copied' : 'Copy'}</button>
                  </>}
                  {m.ms !== undefined && <span className="ml-auto text-muted-foreground">{m.by} · {seconds(m.ms)}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t p-3">
        <textarea className="min-h-[64px] w-full resize-none rounded-md border bg-background px-2.5 py-2 outline-none focus:border-ring" value={input}
          placeholder="Ask about the document, or ask for a paragraph…" aria-label="Message to the assistant"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) } }} />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter to send, Shift+Enter for a new line</span>
          {busy ? <button className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-foreground hover:bg-accent" onClick={stop}><Square className="size-3.5" />Stop</button>
            : <button className="rounded-md bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-40" disabled={!input.trim()} onClick={() => send(input)}>Send</button>}
        </div>
      </div>
    </aside>
  )
}
