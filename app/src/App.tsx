import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plate, usePlateEditor, type PlateEditor } from 'platejs/react'
import { Toaster, toast } from 'sonner'
import {
  BookOpen, ChartColumn, Database, Sparkles, FileText, FolderOpen, ListTree, PanelLeftClose, PanelLeftOpen, PenLine, Pin, Plus, Save, Search, Trash2, X,
} from 'lucide-react'
import { CopilotPlugin } from '@platejs/ai/react'
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit'
import { AssistantPanel } from '@/ai/AssistantPanel'
import { describeDocData, FIGURE_PROMPT_GUIDE } from '@/ai/figure-nodes'
import { aiStore } from '@/ai/store'
import { fetchWithAIConfig, withAIRequestConfig } from '@/ai/request-config'
import { Editor, EditorContainer } from '@/components/ui/editor'
import { ExportToolbarButton } from '@/components/ui/export-toolbar-button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { deleteDoc, emptyDoc, ensureFirstDoc, listDocs, loadDoc, newDocId, saveDoc, togglePinDoc, type DocEntry } from '@/docs/store'
import { MetaContext } from '@/editor/DocHeader'
import { PapercellKit } from '@/editor/papercell-kit'
import type { DataFile, DocMeta, PapercellDoc } from '@/editor/types'
import { DataPanel } from '@/figure/DataPanel'
import { FigureNumbers } from '@/figure/FigureElement'
import { DataContext, parseData } from '@/figure/runtime'
import { makeSample } from '@/sample'
import { makeGallery } from '@/gallery'
import { scan, type Heading } from '@/editor/scan'
import { cn } from '@/lib/utils'
import { docSlug } from '@/publish/export-html'

export default function App() {
  const [docId, setDocId] = useState(() => ensureFirstDoc())
  const [docs, setDocs] = useState<DocEntry[]>(() => listDocs())
  const [sidebar, setSidebar] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900)
  const [query, setQuery] = useState('')
  const [headings, setHeadings] = useState<Heading[]>([])
  const [confirmDelete, setConfirmDelete] = useState<DocEntry | null>(null)
  const editorRef = useRef<PlateEditor | null>(null)
  const [assistant, setAssistant] = useState(() => { try { return localStorage.getItem('papercell.assistant') === '1' && (typeof window === 'undefined' || window.innerWidth >= 900) } catch { return false } })
  useEffect(() => { try { localStorage.setItem('papercell.assistant', assistant ? '1' : '0') } catch { /* bỏ qua */ } }, [assistant])
  // Hai thanh bên cùng mở trên màn hình vừa sẽ ép hẹp vùng soạn bài: thu gọn thanh trái
  useEffect(() => { if (assistant && window.innerWidth < 1280) setSidebar(false) }, [assistant])
  useEffect(() => {
    if (!confirmDelete) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmDelete(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDelete])

  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 900) setSidebar(false)
  }
  const refresh = () => setDocs(listDocs())
  const create = (doc: PapercellDoc) => { const id = newDocId(); saveDoc(id, doc); refresh(); setDocId(id); closeSidebarOnMobile() }
  const togglePin = (entry: DocEntry) => {
    togglePinDoc(entry.id)
    refresh()
  }
  const remove = (entry: DocEntry) => {
    const backup = loadDoc(entry.id)
    const wasActive = entry.id === docId
    deleteDoc(entry.id)
    const rest = listDocs()
    let fallbackId: string | null = null
    if (wasActive) {
      if (rest[0]) {
        setDocId(rest[0].id)
      } else {
        fallbackId = newDocId()
        saveDoc(fallbackId, emptyDoc())
        setDocId(fallbackId)
      }
    }
    refresh()
    toast(`Document "${entry.title || 'Untitled'}" deleted`, {
      action: backup
        ? {
            label: 'Undo',
            onClick: () => {
              if (fallbackId) deleteDoc(fallbackId)
              saveDoc(entry.id, backup, entry.updated, entry.pinned)
              refresh()
              if (wasActive) setDocId(entry.id)
            },
          }
        : undefined,
    })
  }
  const goTo = (id: string) => {
    const ed = editorRef.current; if (!ed) return
    const entry = ed.api.node({ at: [], match: (n: any) => n.id === id })
    const el = entry && (ed.api.toDOMNode(entry[0]) as HTMLElement | undefined)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    closeSidebarOnMobile()
  }
  const shown = docs.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
  const pinnedDocs = shown.filter((d) => d.pinned)
  const unpinnedDocs = shown.filter((d) => !d.pinned)

  const renderDocRow = (d: DocEntry) => (
    <div key={d.id} className={cn('group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent', d.id === docId && 'bg-accent font-medium')}>
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <button className="min-w-0 flex-1 truncate text-left" onClick={() => { setDocId(d.id); closeSidebarOnMobile() }} title={d.title}>{d.title}</button>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex max-[900px]:flex">
        <button
          type="button"
          className={cn(
            'rounded p-1 transition-colors hover:bg-background/80',
            d.pinned ? 'text-primary hover:text-primary/80' : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label={(d.pinned ? 'Unpin ' : 'Pin ') + d.title}
          title={d.pinned ? 'Unpin document' : 'Pin document'}
          onClick={(e) => { e.stopPropagation(); togglePin(d) }}
        >
          <Pin className={cn('size-3.5', d.pinned && 'rotate-45 fill-current')} />
        </button>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={'Delete ' + d.title}
          title="Delete document"
          onClick={(e) => {
            e.stopPropagation()
            ;(document.activeElement as HTMLElement | null)?.blur?.()
            editorRef.current?.tf.deselect()
            setConfirmDelete(d)
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )

  return (
    <TooltipProvider>
      <div className="relative flex h-dvh w-full overflow-hidden bg-background text-foreground">
        {sidebar && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
              aria-hidden="true"
              onClick={() => setSidebar(false)}
            />
            <aside className="flex w-64 max-w-[82vw] shrink-0 flex-col border-r bg-muted/30 text-sm max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-40 max-[900px]:bg-background max-[900px]:shadow-2xl" aria-label="Sidebar">
              <div className="flex items-center justify-between px-3 pt-3 pb-2">
                <span className="flex items-center gap-2 font-semibold"><svg className="size-6 shrink-0" viewBox="0 0 100 100" aria-hidden="true"><rect x="10" y="8" width="24" height="24" rx="5.5" fill="currentColor" /><path d="M45.5 8H63L82 25V26.5Q82 32 76.5 32H45.5Q40 32 40 26.5V13.5Q40 8 45.5 8Z" fill="#4468EB" /><path d="M63 8V19.5Q63 25 68.5 25H82Z" fill="#FFFFFF" fillOpacity=".56" /><path d="M15.5 38H28.5Q34 38 34 43.5Q34 47 37.5 47H62.5Q67 47 67 42.5Q67 38 71.5 38H76.5Q82 38 82 43.5V45Q82 62 65 62H15.5Q10 62 10 56.5V43.5Q10 38 15.5 38Z" fill="currentColor" /><rect x="10" y="68" width="24" height="24" rx="5.5" fill="currentColor" /></svg>Papercell</span>
                <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Collapse sidebar" onClick={() => setSidebar(false)}><PanelLeftClose className="size-4" /></button>
              </div>
              <label className="mx-3 mb-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                <Search className="size-4 text-muted-foreground" />
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>

              {pinnedDocs.length > 0 && (
                <>
                  <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Pin className="size-3.5 rotate-45 text-primary/80" />
                      Pinned
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold text-muted-foreground">
                      {pinnedDocs.length}
                    </span>
                  </div>
                  <nav className="max-h-[24%] overflow-y-auto px-2 pb-1" aria-label="Pinned documents">
                    {pinnedDocs.map(renderDocRow)}
                  </nav>
                </>
              )}

              <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                <span>Documents</span>
                <button className="rounded-md p-1 hover:bg-accent" aria-label="New document" title="New document" onClick={() => create(emptyDoc())}><Plus className="size-4" /></button>
              </div>
              <nav className="max-h-[38%] overflow-y-auto px-2" aria-label="Documents">
                {unpinnedDocs.map(renderDocRow)}
                {!shown.length && <p className="px-2 py-1 text-muted-foreground">No matching documents.</p>}
                {shown.length > 0 && !unpinnedDocs.length && <p className="px-2 py-1 text-xs text-muted-foreground">All documents are pinned above.</p>}
              </nav>

              <div className="flex items-center gap-1 px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground"><ListTree className="size-3.5" />Outline</div>
              <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {headings.map((h) => (
                  <button key={h.id} onClick={() => goTo(h.id)} className="block w-full truncate rounded-md py-1 pr-2 text-left text-muted-foreground hover:bg-accent hover:text-foreground"
                    style={{ paddingLeft: 8 + (h.level - 1) * 12 }}>{h.text || '(empty)'}</button>
                ))}
                {!headings.length && <p className="px-2 text-muted-foreground">Add headings to get an outline.</p>}
              </nav>

              <div className="border-t p-2">
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent" onClick={() => create(makeSample())}>
                  <BookOpen className="size-4 text-muted-foreground" />New sample document
                </button>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent" onClick={() => create(makeGallery())}>
                  <ChartColumn className="size-4 text-muted-foreground" />New chart gallery
                </button>
              </div>
            </aside>
          </>
        )}
        <DocView key={docId} docId={docId} sidebar={sidebar} onShowSidebar={() => { setSidebar(true); if (window.innerWidth < 900 && assistant) setAssistant(false) }}
          onSaved={refresh} onHeadings={setHeadings} onEditor={(e) => { editorRef.current = e }} onOpenFile={create}
          assistant={assistant} onToggleAssistant={() => setAssistant(!assistant)} />
      </div>
      {confirmDelete && createPortal(
        <div className="dlg-backdrop" style={{ zIndex: 80 }} onMouseDown={() => setConfirmDelete(null)}>
          <div
            className="dlg dlg-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-doc-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="dlg-head">
              <span id="delete-doc-title" className="dlg-title">Delete document</span>
              <button type="button" className="pc-icon-btn" aria-label="Close" onClick={() => setConfirmDelete(null)}>
                <X size={17} />
              </button>
            </header>
            <div className="dlg-confirm-body">
              <p className="dlg-confirm-lead">
                Are you sure you want to delete <b>{confirmDelete.title || 'Untitled'}</b>?
              </p>
              <p className="hint">
                Updated {new Date(confirmDelete.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · You can click <b>Undo</b> in the toast banner right after deleting.
              </p>
              <div className="dlg-confirm-actions">
                <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    remove(confirmDelete)
                    setConfirmDelete(null)
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <Toaster position="top-center" />
    </TooltipProvider>
  )
}

function DocView({ docId, sidebar, onShowSidebar, onSaved, onHeadings, onEditor, onOpenFile, assistant, onToggleAssistant }: {
  docId: string; sidebar: boolean; onShowSidebar: () => void; onSaved: () => void
  onHeadings: (h: Heading[]) => void; onEditor: (e: PlateEditor) => void; onOpenFile: (d: PapercellDoc) => void
  assistant: boolean; onToggleAssistant: () => void
}) {
  const initial = useMemo(() => loadDoc(docId) ?? emptyDoc(), [docId])
  const [meta, setMeta] = useState<DocMeta>(initial.meta)
  const [files, setFiles] = useState<DataFile[]>(initial.data ?? [])
  const [readOnly, setReadOnly] = useState(() => location.hash === '#read')
  const [figs, setFigs] = useState(() => scan(initial.content).figs)
  const [dataOpen, setDataOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const scrollAnchor = useRef<{
    atTop: boolean
    blockId?: string
    blockIndex: number
    offsetTop: number
    scrollTop: number
    scrollRatio: number
  } | null>(null)
  const pendingRestore = useRef(false)
  const editor = usePlateEditor({ plugins: PapercellKit, value: initial.content })
  if (import.meta.env.DEV) (window as any).__editor = editor
  const latest = useRef({ meta, files }); latest.current = { meta, files }
  const dataCtx = useMemo(() => ({ files, data: parseData(files), setFiles }), [files])
  const metaCtx = useMemo(() => ({ meta, setMeta }), [meta])
  const timer = useRef(0)

  const getScroller = () =>
    mainRef.current?.querySelector<HTMLElement>('.ignore-click-outside\\/toolbar') ?? null

  const captureScrollAnchor = () => {
    const scroller = getScroller()
    if (!scroller) return
    const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
    if (scroller.scrollTop <= 8) {
      scrollAnchor.current = {
        atTop: true,
        blockIndex: 0,
        offsetTop: 0,
        scrollTop: scroller.scrollTop,
        scrollRatio: 0,
      }
      return
    }
    const containerTop = scroller.getBoundingClientRect().top
    const children = editor.children as any[]
    let chosenIdx = -1
    let chosenId: string | undefined
    let chosenOffset = 0
    for (let i = 0; i < children.length; i++) {
      const node = children[i]
      if (node?.type === 'figure' && node?.display === 'hidden') continue
      const dom = editor.api.toDOMNode(node) as HTMLElement | undefined
      if (!dom || dom.offsetParent === null) continue
      const rect = dom.getBoundingClientRect()
      if (rect.bottom > containerTop + 44) {
        chosenIdx = i
        chosenId = typeof node?.id === 'string' ? node.id : undefined
        chosenOffset = rect.top - containerTop
        break
      }
    }
    scrollAnchor.current = {
      atTop: false,
      blockId: chosenId,
      blockIndex: Math.max(0, chosenIdx),
      offsetTop: chosenOffset,
      scrollTop: scroller.scrollTop,
      scrollRatio: scroller.scrollTop / maxScroll,
    }
  }

  const switchMode = (nextReadOnly: boolean) => {
    if (nextReadOnly === readOnly) return
    captureScrollAnchor()
    pendingRestore.current = true
    if (nextReadOnly) {
      ;(document.activeElement as HTMLElement | null)?.blur?.()
    }
    setReadOnly(nextReadOnly)
  }

  const persist = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      saveDoc(docId, { version: 3, meta: latest.current.meta, data: latest.current.files, content: editor.children })
      onSaved()
    }, 400)
  }
  useEffect(() => { onEditor(editor); onHeadings(scan(editor.children).headings) }, [editor])
  useEffect(() => { persist() }, [meta, files])
  // Menu AI trong bài của Plate dùng chung cài đặt với sidebar Trợ lý AI.
  useEffect(() => {
    const docData = `${describeDocData(files, dataCtx.data)}\n\n${FIGURE_PROMPT_GUIDE}`
    const sync = () => {
      const chat = editor.getOption(aiChatPlugin, 'chatOptions') ?? {}
      editor.setOption(aiChatPlugin, 'chatOptions', { ...chat, body: { ...withAIRequestConfig(chat.body), docData } })
      const comp = editor.getOption(CopilotPlugin, 'completeOptions') ?? {}
      editor.setOption(CopilotPlugin, 'completeOptions', { ...comp, body: withAIRequestConfig(comp.body), fetch: fetchWithAIConfig })
    }
    sync()
    return aiStore.subscribe(sync)
  }, [editor, files, dataCtx.data])
  useLayoutEffect(() => {
    history.replaceState(null, '', readOnly ? '#read' : '#edit')
    if (!pendingRestore.current || !scrollAnchor.current) return
    const anchor = scrollAnchor.current
    const applyAnchor = () => {
      const scroller = getScroller()
      if (!scroller) return
      if (anchor.atTop) {
        scroller.scrollTop = 0
        return
      }
      const children = editor.children as any[]
      let targetNode =
        (anchor.blockId ? children.find((n) => n?.id === anchor.blockId) : undefined) ??
        children[anchor.blockIndex]
      if (targetNode?.type === 'figure' && targetNode?.display === 'hidden') {
        targetNode = children.slice(anchor.blockIndex).find((n) => !(n?.type === 'figure' && n?.display === 'hidden'))
      }
      const dom = targetNode ? (editor.api.toDOMNode(targetNode) as HTMLElement | undefined) : undefined
      if (dom && dom.offsetParent !== null) {
        const containerTop = scroller.getBoundingClientRect().top
        const currentOffset = dom.getBoundingClientRect().top - containerTop
        scroller.scrollTop += currentOffset - anchor.offsetTop
      } else {
        const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
        scroller.scrollTop = anchor.scrollRatio * maxScroll
      }
    }
    applyAnchor()
    const raf = requestAnimationFrame(() => {
      applyAnchor()
      pendingRestore.current = false
    })
    return () => cancelAnimationFrame(raf)
  }, [readOnly, editor])

  const download = () => {
    const blob = new Blob([JSON.stringify({ version: 3, meta, data: files, content: editor.children }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = docSlug(meta.title) + '.papercell.json'
    a.click(); URL.revokeObjectURL(a.href)
  }
  const open = async (f?: File) => {
    if (!f) return
    try { const d = JSON.parse(await f.text()); if (d?.version !== 3 || !Array.isArray(d.content)) throw new Error(); onOpenFile(d) }
    catch { toast.error('This file is not a Papercell document (version 3).') }
  }

  return (
    <MetaContext.Provider value={metaCtx}>
    <DataContext.Provider value={dataCtx}>
      <FigureNumbers.Provider value={figs}>
        <Plate editor={editor} readOnly={readOnly} onChange={({ value }) => { const s = scan(value); setFigs(s.figs); onHeadings(s.headings); persist() }}>
          <main ref={mainRef} className="flex min-w-0 flex-1 flex-col">
            <header className="scrollbar-hide flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b px-2.5 text-sm whitespace-nowrap sm:gap-2 sm:px-3">
              {!sidebar && <button className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Open sidebar" onClick={onShowSidebar}><PanelLeftOpen className="size-4" /></button>}
              <span className="min-w-[60px] flex-1 truncate text-muted-foreground">{meta.title || 'Untitled'}</span>
              <div className="flex shrink-0 rounded-md border p-0.5" role="group" aria-label="Mode">
                <button aria-pressed={!readOnly} aria-label="Edit" title="Edit" onClick={() => switchMode(false)} className={cn('flex items-center gap-1.5 rounded px-2 py-1 sm:px-2.5', !readOnly && 'bg-foreground text-background')}><PenLine className="size-3.5" /><span className="hidden lg:inline">Edit</span></button>
                <button aria-pressed={readOnly} aria-label="Preview" title="Preview" onClick={() => switchMode(true)} className={cn('flex items-center gap-1.5 rounded px-2 py-1 sm:px-2.5', readOnly && 'bg-foreground text-background')}><BookOpen className="size-3.5" /><span className="hidden lg:inline">Preview</span></button>
              </div>
              {!readOnly && <button className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent sm:gap-1.5 sm:px-2.5" onClick={() => setDataOpen(true)}><Database className="size-3.5" /><span className="hidden lg:inline">Data</span><span className="text-xs sm:text-sm">({files.length})</span></button>}
              <button className={cn('flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-accent sm:px-2.5', assistant && 'bg-accent')} aria-pressed={assistant} aria-label="AI Assistant" title="AI Assistant" onClick={onToggleAssistant}><Sparkles className="size-3.5" /><span className="hidden lg:inline">AI Assistant</span></button>
              <button className="shrink-0 rounded-md p-1.5 hover:bg-accent" aria-label="Open file" title="Open a .papercell.json file" onClick={() => fileRef.current?.click()}><FolderOpen className="size-4" /></button>
              <button className="shrink-0 rounded-md p-1.5 hover:bg-accent" aria-label="Save file" title="Download as .papercell.json" onClick={download}><Save className="size-4" /></button>
              <ExportToolbarButton variant="header" />
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = '' }} />
            </header>
            <EditorContainer className="min-h-0 flex-1">
              <Editor variant="demo" placeholder="Type / to insert a block, or press Space on an empty line to ask AI…" />
            </EditorContainer>
          </main>
          {assistant && <AssistantPanel docId={docId} editor={editor} onClose={onToggleAssistant} />}
          {dataOpen && <DataPanel onChange={setFiles} onClose={() => setDataOpen(false)} />}
        </Plate>
      </FigureNumbers.Provider>
    </DataContext.Provider>
    </MetaContext.Provider>
  )
}
