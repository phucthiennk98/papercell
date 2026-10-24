import { useContext, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { PlateEditor } from 'platejs/react'
import {
  Bot,
  ChartColumn,
  Check,
  ClipboardCopy,
  Eye,
  EyeOff,
  FileText,
  History,
  KeyRound,
  Laptop,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react'
import type { FigureNode, FigureParam, ParamValue } from '@/editor/types'
import { FigureView, ParamSliders } from '@/figure/FigureView'
import { DataContext } from '@/figure/runtime'
import { cn } from '@/lib/utils'
import { PROVIDERS, defaultConfig, type ProviderId } from './config'
import { aiStore, useAI } from './store'
import { parseStream } from './ask'
import {
  AgentSessionError,
  closeSession,
  createSession,
  fetchAgentModels,
  interruptSession,
  runTurn,
  type AgentModel,
  type AgentSession,
} from './agent-session'
import {
  buildPromptWithAttachments,
  createEmptyThread,
  deleteDocThread,
  loadDocThreads,
  readClipboardAttachments,
  readFileListAttachments,
  saveDocThread,
  type AIAttachment,
  type ChatHistoryMsg,
  type DocChatThread,
} from './chat-history'
import {
  deserializeMarkdownWithFigures,
  docAsContextMarkdown,
  extractFigureSegments,
  normalizeMath,
} from './figure-nodes'

export { normalizeMath }

type AgentInfo = { id: string; label: string; available: boolean; version?: string; note: string }
type Msg = ChatHistoryMsg

const STOPPED = '_Stopped._'

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`

function formatShortTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const SUGGESTIONS = [
  'Create an interactive figure from the document data',
  'Write a math formula for this section',
  'Summarize this document in 3 sentences',
  'Write a Conclusion based on the Results',
]

function AssistantFigurePreview({ fig, onInsert }: { fig: FigureNode; onInsert: (f: FigureNode) => void }) {
  const [params, setParams] = useState<FigureParam[]>(fig.params)
  useEffect(() => { setParams(fig.params) }, [fig.params])
  const slide = (name: string, v: ParamValue) =>
    setParams((ps) => ps.map((p) => (p.name === name ? { ...p, value: v } : p)))

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <ChartColumn className="size-3.5 shrink-0 text-blue-600" />
            <span>Papercell Figure Card</span>
            {fig.spec && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">{fig.spec.type} · {fig.spec.data}</span>}
          </div>
          {fig.caption && <p className="mt-1 text-muted-foreground">{fig.caption}</p>}
        </div>
        <button className="flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 font-medium text-white hover:bg-blue-700" onClick={() => onInsert({ ...fig, params })}>
          <TextCursorInput className="size-3.5" />Insert figure
        </button>
      </div>
      <div className="rounded-md border bg-background p-2 overflow-x-auto">
        <FigureView js={fig.js} params={params} />
      </div>
      {params.length > 0 && (
        <div className="rounded-md border bg-background px-2.5 py-1.5">
          <ParamSliders params={params} onChange={slide} idPrefix={'chat-' + fig.id} />
        </div>
      )}
      {params.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <SlidersHorizontal className="size-3 text-muted-foreground" />
          {params.map((d) => (
            <span key={d.name} className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
              <b className="text-foreground">{d.label || d.name}</b>: {String(d.value)}
              {d.kind === 'range' ? ` (${d.min}..${d.max}${d.unit ? ' ' + d.unit : ''})` : ''}
            </span>
          ))}
        </div>
      )}
      <details className="rounded border bg-background px-2 py-1 text-[11px]">
        <summary className="cursor-pointer font-medium text-muted-foreground">View figure JS &amp; Python code</summary>
        <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{fig.js}</pre>
      </details>
    </div>
  )
}

export function AssistantPanel({
  docId = 'default',
  editor,
  onClose,
}: {
  docId?: string
  editor: PlateEditor | null
  onClose: () => void
}) {
  const { files, data } = useContext(DataContext)
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
  const [historyOpen, setHistoryOpen] = useState(false)
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

  // Per-document chat threads
  const [threads, setThreads] = useState<DocChatThread[]>(() => loadDocThreads(docId))
  const [activeThread, setActiveThread] = useState<DocChatThread>(() => {
    const loaded = loadDocThreads(docId)
    return loaded[0] ?? createEmptyThread(docId)
  })
  const [messages, setMessages] = useState<Msg[]>(() => activeThread.messages)
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<AIAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const abort = useRef<AbortController | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const attachInputRef = useRef<HTMLInputElement | null>(null)
  // Đồng hồ đếm giây khi đang chờ trả lời
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [busy])

  // Reload threads when switching documents
  useEffect(() => {
    const loaded = loadDocThreads(docId)
    const initial = loaded[0] ?? createEmptyThread(docId)
    setThreads(loaded)
    setActiveThread(initial)
    setMessages(initial.messages)
    setAttachments([])
  }, [docId])

  // Persist current thread whenever messages change
  useEffect(() => {
    const nextThread: DocChatThread = {
      ...activeThread,
      docId,
      messages,
    }
    setActiveThread(nextThread)
    const updatedThreads = saveDocThread(docId, nextThread)
    setThreads(updatedThreads)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, docId])

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
      generation.current++; abort.current = null; setBusy(false)
      setMessages((m) => m.length ? [...m.slice(0, -1), { ...m[m.length - 1], content: m[m.length - 1].content || STOPPED, progress: '' }] : m)
    }
  }

  const newChat = () => {
    discardSession()
    setBusy(false)
    const fresh = createEmptyThread(docId)
    setActiveThread(fresh)
    setMessages([])
    setAttachments([])
    setSessionNote('')
    setHistoryOpen(false)
  }

  const selectThread = (thread: DocChatThread) => {
    if (busy) stop()
    discardSession()
    setActiveThread(thread)
    setMessages(thread.messages)
    setAttachments([])
    setHistoryOpen(false)
    setSessionNote('')
  }

  const removeThread = (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const nextList = deleteDocThread(docId, threadId)
    setThreads(nextList)
    if (activeThread.id === threadId) {
      discardSession()
      setBusy(false)
      const fallback = nextList[0] ?? createEmptyThread(docId)
      setActiveThread(fallback)
      setMessages(fallback.messages)
    }
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

  const send = async (text: string, customAttachments = attachments) => {
    const q = text.trim()
    if ((!q && customAttachments.length === 0) || busy || abort.current) return
    if (!ready) { setSettings(true); return }

    const userMsg: Msg = {
      role: 'user',
      content: q,
      ...(customAttachments.length > 0 ? { attachments: customAttachments } : {}),
    }
    const priorMessages = messages.filter((m) => !m.error)
    const next: Msg[] = [...priorMessages, userMsg]
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
    setInput('')
    setAttachments([])
    setBusy(true)
    setSettings(false)
    setHistoryOpen(false)
    try {
      const doc = editor ? docAsContextMarkdown(editor, files, data) : ''
      if (mode === 'agent') {
        const promptText = buildPromptWithAttachments(q, customAttachments)
        // If continuing a restored thread from history on a brand-new CLI session, include prior turns
        const historyPrefix =
          !session.current && priorMessages.length > 0
            ? `Earlier conversation in this thread:\n${priorMessages
                .slice(-8)
                .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n\n')}\n\nCurrent request:\n`
            : ''

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
            await runTurn(
              session.current.id,
              {
                text: `${historyPrefix}${promptText}`,
                doc,
                attachments: customAttachments.map((a) => ({
                  name: a.name,
                  kind: a.kind,
                  dataUrl: a.dataUrl,
                  textContent: a.textContent,
                })),
              },
              {
                signal: ctl.signal,
                onEvent: (event) => {
                  if (event.type === 'text') { content += event.delta; update({ content, progress: '' }) }
                  else if (event.type === 'step') update({ progress: event.text })
                  else if (event.type === 'tool') { steps.push({ name: event.name, detail: event.detail }); update({ steps: [...steps] }) }
                  else if (event.type === 'done') update({ by: `${current?.label ?? 'Agent'} · ${event.model || agentModel || 'CLI default'}`, progress: '', ms: Date.now() - startedAt })
                },
              },
            )
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

  const insertNodesAtCursor = (nodes: any[]) => {
    if (!editor || !nodes.length) return
    const top = editor.selection ? editor.api.block({ highest: true }) : undefined
    editor.tf.insertNodes(nodes, { at: top ? [top[1][0] + 1] : [editor.children.length], select: true })
    editor.tf.focus()
  }
  const insert = (md: string) => {
    if (!editor) return
    insertNodesAtCursor(deserializeMarkdownWithFigures(editor, md))
  }
  const insertFigure = (fig: FigureNode) => {
    const fresh: FigureNode = { ...fig, id: 'fig-' + Math.random().toString(36).slice(2, 8), children: [{ text: '' }] }
    insertNodesAtCursor([fresh])
  }
  const copy = async (i: number, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied(null), 1500) } catch { /* bỏ qua */ } }

  const field = 'h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus:border-ring'
  return (
    <aside className="flex w-[360px] max-w-full shrink-0 flex-col border-l bg-muted/20 text-sm max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:z-40 max-[900px]:bg-background max-[900px]:shadow-2xl" aria-label="AI Assistant">
      <div className="flex h-12 items-center justify-between border-b px-3">
        <span className="flex items-center gap-2 font-semibold"><Sparkles className="size-4" />AI Assistant</span>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={newChat}
            title="Start a new chat conversation"
          >
            <Plus className="size-3.5" />
            New chat
          </button>
          <button
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent',
              historyOpen ? 'border-foreground bg-accent text-foreground font-medium' : 'text-muted-foreground'
            )}
            aria-label="Chat history"
            aria-expanded={historyOpen}
            title="View saved conversations for this document"
            onClick={() => {
              setHistoryOpen((v) => !v)
              if (!historyOpen) setSettings(false)
            }}
          >
            <History className="size-3.5" />
            <span>History</span>
            {threads.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-foreground">
                {threads.length}
              </span>
            )}
          </button>
          <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Close assistant" onClick={() => { discardSession(); onClose() }}><X className="size-4" /></button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{mode === 'agent' ? (current ? `${current.label} · ${agentModel || 'CLI default'}` : 'No local agent selected') : `${info.label} · ${config.model || 'no model selected'}`}</span>
        <button className={cn('rounded-md p-1 hover:bg-accent', settings && 'bg-accent text-foreground')} aria-label="Provider settings" aria-expanded={settings} onClick={() => { setSettings(!settings); if (!settings) setHistoryOpen(false) }}><Settings2 className="size-4" /></button>
      </div>

      {/* Per-document Chat History Drawer */}
      {historyOpen && (
        <div className="max-h-72 space-y-2 overflow-y-auto border-b bg-background/95 px-3 py-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Saved conversations for this document ({threads.length})</span>
            <button
              type="button"
              onClick={newChat}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-blue-600 hover:bg-blue-50"
            >
              <Plus className="size-3" />
              New chat
            </button>
          </div>

          {threads.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              No saved conversations for this document yet.
            </p>
          ) : (
            <div className="space-y-1">
              {threads.map((t) => {
                const isCurrent = t.id === activeThread.id
                return (
                  <div
                    key={t.id}
                    onClick={() => selectThread(t)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectThread(t) }}
                    className={cn(
                      'group flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                      isCurrent
                        ? 'border-blue-400 bg-blue-50/60 font-medium text-foreground'
                        : 'bg-background hover:bg-accent/70'
                    )}
                  >
                    <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{t.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {t.messages.length} {t.messages.length === 1 ? 'message' : 'messages'} · {formatShortTime(t.updatedAt)}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete conversation "${t.title}"`}
                      title="Delete conversation"
                      onClick={(e) => removeThread(t.id, e)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
            <p>The agent runs in read-only mode and remembers this chat until you start a new chat or close the assistant. Each message includes the current document and datasets.</p>
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
            <p>Each question sends the open document and dataset schema to the selected provider.</p>
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
            <p className="text-muted-foreground">Ask about the document, paste a screenshot (<b>Ctrl+V</b>), attach reference files, or generate interactive figures and math formulas. Click <b>Insert</b> to put results at the cursor.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => <button key={s} className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const live = busy && i === messages.length - 1
          if (m.role === 'user') {
            return (
              <div key={i} className="chat-in ml-8 space-y-1.5 rounded-2xl rounded-br-sm bg-foreground/[.06] px-3 py-2">
                {!!m.attachments?.length && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.attachments.map((att) =>
                      att.kind === 'image' && att.dataUrl ? (
                        <img
                          key={att.id}
                          src={att.dataUrl}
                          alt={att.name}
                          className="max-h-28 max-w-[180px] rounded border object-cover"
                        />
                      ) : (
                        <span
                          key={att.id}
                          className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[11px] font-medium"
                        >
                          <FileText className="size-3 text-blue-600" />
                          {att.name}
                        </span>
                      )
                    )}
                  </div>
                )}
                {m.content && <div className="whitespace-pre-wrap break-words">{m.content}</div>}
              </div>
            )
          }
          if (m.error) return <div key={i} className="chat-in rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">{m.content}</div>
          const parsed = m.content ? extractFigureSegments(m.content) : null
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
              {parsed && (
                <div className={cn('space-y-2', live && 'is-streaming')}>
                  {parsed.segments.map((seg, idx) => seg.type === 'md' ? (
                    <div key={idx} className="chat-md rounded-lg border bg-background px-3 py-2 leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizeMath(seg.text)}</ReactMarkdown>
                    </div>
                  ) : (
                    <AssistantFigurePreview key={idx} fig={seg.node} onInsert={insertFigure} />
                  ))}
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
                    <button className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" onClick={() => insert(m.content)}>
                      <TextCursorInput className="size-3.5" />{parsed && parsed.figures.length > 0 ? 'Insert all' : 'Insert'}
                    </button>
                    <button className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent" onClick={() => copy(i, m.content)}>{copied === i ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}{copied === i ? 'Copied' : 'Copy'}</button>
                  </>}
                  {m.ms !== undefined && <span className="ml-auto text-muted-foreground">{m.by} · {seconds(m.ms)}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="border-t p-3 space-y-2">
        {/* Pending Attachments Preview Strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 rounded-md border bg-background p-1.5">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center gap-1.5 rounded border bg-muted/40 p-1 pr-6 text-xs"
              >
                {att.kind === 'image' && att.dataUrl ? (
                  <img
                    src={att.dataUrl}
                    alt={att.name}
                    className="size-10 rounded object-cover"
                  />
                ) : (
                  <FileText className="size-4 shrink-0 text-blue-600" />
                )}
                <span className="max-w-[120px] truncate text-[11px] font-medium">
                  {att.name}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${att.name}`}
                  onClick={() =>
                    setAttachments((prev) => prev.filter((x) => x.id !== att.id))
                  }
                  className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          className="min-h-[64px] w-full resize-none rounded-md border bg-background px-2.5 py-2 outline-none focus:border-ring"
          value={input}
          placeholder="Ask about the document, paste an image (Ctrl+V), or attach reference files…"
          aria-label="Message to the assistant"
          onChange={(e) => setInput(e.target.value)}
          onPaste={async (e) => {
            const pasted = await readClipboardAttachments(e.clipboardData)
            if (pasted.length > 0) {
              setAttachments((prev) => [...prev, ...pasted])
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(input)
            }
          }}
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => attachInputRef.current?.click()}
              className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-foreground hover:bg-accent"
              title="Attach image or reference file (CSV, Excel, Markdown, code, text)"
            >
              <Paperclip className="size-3.5" />
              <span>Attach</span>
            </button>
            <input
              ref={attachInputRef}
              type="file"
              multiple
              hidden
              accept="image/*,.csv,.tsv,.json,.xlsx,.xls,.txt,.md,.py,.js,.ts,.tex"
              onChange={async (e) => {
                const added = await readFileListAttachments(e.target.files)
                if (added.length > 0) {
                  setAttachments((prev) => [...prev, ...added])
                }
                e.target.value = ''
              }}
            />
            <span className="truncate text-[11px]">Ctrl+V image or attach file</span>
          </div>
          {busy ? (
            <button
              className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-foreground hover:bg-accent"
              onClick={stop}
            >
              <Square className="size-3.5" />
              Stop
            </button>
          ) : (
            <button
              className="rounded-md bg-foreground px-4 py-1.5 font-medium text-background disabled:opacity-40"
              disabled={!input.trim() && attachments.length === 0}
              onClick={() => void send(input)}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
