import { useEffect, useMemo, useRef, useState } from 'react'
import { Plate, usePlateEditor, type PlateEditor } from 'platejs/react'
import { Toaster } from 'sonner'
import {
  BookOpen, ChartColumn, Database, FileDown, Sparkles, FileText, FolderOpen, ListTree, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Save, Search, Trash2,
} from 'lucide-react'
import { CopilotPlugin } from '@platejs/ai/react'
import { aiChatPlugin } from '@/components/editor/plugins/ai-kit'
import { AssistantPanel } from '@/ai/AssistantPanel'
import { aiStore } from '@/ai/store'
import { Editor, EditorContainer } from '@/components/ui/editor'
import { TooltipProvider } from '@/components/ui/tooltip'
import { deleteDoc, emptyDoc, ensureFirstDoc, listDocs, loadDoc, newDocId, saveDoc, type DocEntry } from '@/docs/store'
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
import { docSlug, exportDocHtml } from '@/publish/export-html'

export default function App() {
  const [docId, setDocId] = useState(() => ensureFirstDoc())
  const [docs, setDocs] = useState<DocEntry[]>(() => listDocs())
  const [sidebar, setSidebar] = useState(true)
  const [query, setQuery] = useState('')
  const [headings, setHeadings] = useState<Heading[]>([])
  const editorRef = useRef<PlateEditor | null>(null)
  const [editor, setEditor] = useState<PlateEditor | null>(null)
  const [assistant, setAssistant] = useState(() => { try { return localStorage.getItem('papercell.assistant') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('papercell.assistant', assistant ? '1' : '0') } catch { /* bỏ qua */ } }, [assistant])
  // Hai thanh bên cùng mở trên màn hình vừa sẽ ép hẹp vùng soạn bài: thu gọn thanh trái
  useEffect(() => { if (assistant && window.innerWidth < 1280) setSidebar(false) }, [assistant])

  const refresh = () => setDocs(listDocs())
  const create = (doc: PapercellDoc) => { const id = newDocId(); saveDoc(id, doc); refresh(); setDocId(id) }
  const remove = (id: string) => {
    deleteDoc(id)
    const rest = listDocs()
    if (id === docId) setDocId(rest[0]?.id ?? ensureFirstDoc())
    refresh()
  }
  const goTo = (id: string) => {
    const ed = editorRef.current; if (!ed) return
    const entry = ed.api.node({ at: [], match: (n: any) => n.id === id })
    const el = entry && (ed.api.toDOMNode(entry[0]) as HTMLElement | undefined)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const shown = docs.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <TooltipProvider>
      <div className="relative flex h-screen w-full overflow-hidden bg-background text-foreground">
        {sidebar && (
          <aside className="flex w-64 shrink-0 flex-col border-r bg-muted/30 text-sm" aria-label="Sidebar">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <span className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-md bg-foreground text-background text-xs">▤</span>Papercell</span>
              <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Collapse sidebar" onClick={() => setSidebar(false)}><PanelLeftClose className="size-4" /></button>
            </div>
            <label className="mx-3 mb-2 flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
              <Search className="size-4 text-muted-foreground" />
              <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>

            <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
              <span>Documents</span>
              <button className="rounded-md p-1 hover:bg-accent" aria-label="New document" title="New document" onClick={() => create(emptyDoc())}><Plus className="size-4" /></button>
            </div>
            <nav className="max-h-[38%] overflow-y-auto px-2">
              {shown.map((d) => (
                <div key={d.id} className={cn('group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent', d.id === docId && 'bg-accent font-medium')}>
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => setDocId(d.id)} title={d.title}>{d.title}</button>
                  <button className="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block" aria-label={'Delete ' + d.title}
                    onClick={() => { if (confirm(`Delete "${d.title}"?`)) remove(d.id) }}><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              {!shown.length && <p className="px-2 py-1 text-muted-foreground">No matching documents.</p>}
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
        )}
        <DocView key={docId} docId={docId} sidebar={sidebar} onShowSidebar={() => setSidebar(true)}
          onSaved={refresh} onHeadings={setHeadings} onEditor={(e) => { editorRef.current = e; setEditor(e) }} onOpenFile={create}
          assistant={assistant} onToggleAssistant={() => setAssistant(!assistant)} />
        {assistant && <AssistantPanel editor={editor} onClose={() => setAssistant(false)} />}
      </div>
      <Toaster />
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
  const editor = usePlateEditor({ plugins: PapercellKit, value: initial.content })
  if (import.meta.env.DEV) (window as any).__editor = editor
  const latest = useRef({ meta, files }); latest.current = { meta, files }
  const dataCtx = useMemo(() => ({ files, data: parseData(files), setFiles }), [files])
  const metaCtx = useMemo(() => ({ meta, setMeta }), [meta])
  const timer = useRef(0)

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
    const sync = () => {
      const aiConfig = aiStore.get().config
      const chat = editor.getOption(aiChatPlugin, 'chatOptions') ?? {}
      editor.setOption(aiChatPlugin, 'chatOptions', { ...chat, body: { ...(chat as any).body, aiConfig } })
      const comp = editor.getOption(CopilotPlugin, 'completeOptions') ?? {}
      editor.setOption(CopilotPlugin, 'completeOptions', { ...comp, body: { ...(comp as any).body, aiConfig } })
    }
    sync()
    return aiStore.subscribe(sync)
  }, [editor])
  useEffect(() => { location.hash = readOnly ? 'read' : 'edit' }, [readOnly])

  const download = () => {
    const blob = new Blob([JSON.stringify({ version: 3, meta, data: files, content: editor.children }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = docSlug(meta.title) + '.papercell.json'
    a.click(); URL.revokeObjectURL(a.href)
  }
  const exportHtml = () => exportDocHtml({ meta, files, content: editor.children })
  const open = async (f?: File) => {
    if (!f) return
    try { const d = JSON.parse(await f.text()); if (d?.version !== 3 || !Array.isArray(d.content)) throw new Error(); onOpenFile(d) }
    catch { alert('This file is not a Papercell document (version 3).') }
  }

  return (
    <MetaContext.Provider value={metaCtx}>
    <DataContext.Provider value={dataCtx}>
      <FigureNumbers.Provider value={figs}>
        <Plate editor={editor} readOnly={readOnly} onChange={({ value }) => { const s = scan(value); setFigs(s.figs); onHeadings(s.headings); persist() }}>
          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 text-sm whitespace-nowrap">
              {!sidebar && <button className="rounded-md p-1 text-muted-foreground hover:bg-accent" aria-label="Open sidebar" onClick={onShowSidebar}><PanelLeftOpen className="size-4" /></button>}
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{meta.title || 'Untitled'}</span>
              <div className="flex rounded-md border p-0.5" role="group" aria-label="Mode">
                <button aria-pressed={!readOnly} aria-label="Edit" title="Edit" onClick={() => setReadOnly(false)} className={cn('flex items-center gap-1.5 rounded px-2.5 py-1', !readOnly && 'bg-foreground text-background')}><PenLine className="size-3.5" /><span className="hidden lg:inline">Edit</span></button>
                <button aria-pressed={readOnly} aria-label="Preview" title="Preview" onClick={() => setReadOnly(true)} className={cn('flex items-center gap-1.5 rounded px-2.5 py-1', readOnly && 'bg-foreground text-background')}><BookOpen className="size-3.5" /><span className="hidden lg:inline">Preview</span></button>
              </div>
              {!readOnly && <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 hover:bg-accent" onClick={() => setDataOpen(true)}><Database className="size-3.5" /><span className="hidden lg:inline">Data</span> ({files.length})</button>}
              <button className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 hover:bg-accent', assistant && 'bg-accent')} aria-pressed={assistant} aria-label="AI Assistant" title="AI Assistant" onClick={onToggleAssistant}><Sparkles className="size-3.5" /><span className="hidden lg:inline">AI Assistant</span></button>
              <button className="rounded-md p-1.5 hover:bg-accent" aria-label="Open file" title="Open a .papercell.json file" onClick={() => fileRef.current?.click()}><FolderOpen className="size-4" /></button>
              <button className="rounded-md p-1.5 hover:bg-accent" aria-label="Save file" title="Download as .papercell.json" onClick={download}><Save className="size-4" /></button>
              <button className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 hover:bg-accent" aria-label="Export HTML" title="Export one HTML file to share: opens anywhere, no Python or server needed" onClick={exportHtml}><FileDown className="size-3.5" /><span className="hidden lg:inline">Export HTML</span></button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = '' }} />
            </header>
            <EditorContainer className="min-h-0 flex-1">
              <Editor variant="demo" placeholder="Type / to insert a block, or press Space on an empty line to ask AI…" />
            </EditorContainer>
          </main>
          {dataOpen && <DataPanel onChange={setFiles} onClose={() => setDataOpen(false)} />}
        </Plate>
      </FigureNumbers.Provider>
    </DataContext.Provider>
    </MetaContext.Provider>
  )
}
