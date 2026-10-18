import { useEffect, useMemo, useRef, useState } from 'react'
import { Plate, PlateContent, usePlateEditor } from 'platejs/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Database } from 'lucide-react'
import { EquationNumbers } from './editor/EquationBlock'
import { plugins } from './editor/plugins'
import { checkSlashTrigger, handleSlashKey, SlashMenu } from './editor/SlashMenu'
import { Toolbar } from './editor/Toolbar'
import type { DataFile, DocMeta, FigureNode, PapercellDoc } from './editor/types'
import { DataPanel } from './figure/DataPanel'
import { FigureNumbers } from './figure/FigureElement'
import { DataContext, parseData } from './figure/runtime'
import { makeSample } from './sample'

const STORE = 'papercell.doc.v3'

function loadStored(): PapercellDoc | null {
  try { const s = localStorage.getItem(STORE); const d = s && JSON.parse(s); return d?.version === 3 && Array.isArray(d.content) ? d : null } catch { return null }
}

/** Đánh số theo thứ tự xuất hiện: hình (có chú thích, không ẩn) và công thức. */
function numbering(content: any[]) {
  const figs = new Map<string, number>(), eqs = new Map<string, number>()
  const walk = (nodes: any[]) => nodes.forEach((n) => {
    if (n.type === 'figure') { const f = n as FigureNode; if (f.caption?.trim() && f.display !== 'hidden') figs.set(f.id, figs.size + 1) }
    else if (n.type === 'equation') eqs.set(n.id, eqs.size + 1)
    else if (n.children) walk(n.children)
  })
  walk(content)
  return { figs, eqs }
}

export default function App() {
  const initial = useMemo(() => loadStored() ?? makeSample(), [])
  const [meta, setMeta] = useState<DocMeta>(initial.meta)
  const [files, setFiles] = useState<DataFile[]>(initial.data)
  const [mode, setMode] = useState<'edit' | 'read'>(() => (location.hash === '#read' ? 'read' : 'edit'))
  const [nums, setNums] = useState(() => numbering(initial.content))
  const [dataOpen, setDataOpen] = useState(false)
  const editor = usePlateEditor({ plugins, value: initial.content })
  if (import.meta.env.DEV) (window as any).__editor = editor
  const fileRef = useRef<HTMLInputElement>(null)
  const latest = useRef({ meta, files }); latest.current = { meta, files }
  const dataCtx = useMemo(() => ({ files, data: parseData(files) }), [files])

  const save = (content = editor.children) => {
    try { localStorage.setItem(STORE, JSON.stringify({ version: 3, meta: latest.current.meta, data: latest.current.files, content })) } catch { /* bộ nhớ trình duyệt bị chặn hoặc đầy */ }
  }
  useEffect(() => { save() }, [meta, files])
  useEffect(() => { location.hash = mode === 'read' ? 'read' : 'edit' }, [mode])

  const loadDoc = (d: PapercellDoc) => { setMeta(d.meta); setFiles(d.data ?? []); editor.tf.setValue(d.content); setNums(numbering(d.content)) }
  const download = () => {
    const blob = new Blob([JSON.stringify({ version: 3, meta, data: files, content: editor.children }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = (meta.title || 'bai-viet').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() + '.papercell.json'
    a.click(); URL.revokeObjectURL(a.href)
  }
  const open = async (f?: File) => {
    if (!f) return
    try { const d = JSON.parse(await f.text()); if (d?.version !== 3 || !Array.isArray(d.content)) throw new Error(); loadDoc(d) }
    catch { alert('File này không phải tài liệu Papercell (phiên bản 3).') }
  }

  const readOnly = mode === 'read'
  return (
    <DndProvider backend={HTML5Backend}>
    <DataContext.Provider value={dataCtx}>
    <FigureNumbers.Provider value={nums.figs}>
    <EquationNumbers.Provider value={nums.eqs}>
      <Plate editor={editor} readOnly={readOnly} onChange={({ value }) => { setNums(numbering(value)); save(value); if (!readOnly) checkSlashTrigger(editor) }}>
        <div className="chrome">
          <header className="appbar">
            <div className="brand"><span className="logo" aria-hidden="true">▤</span>Papercell</div>
            <div className="seg" role="group" aria-label="Chế độ">
              <button aria-pressed={!readOnly} onClick={() => setMode('edit')}>Soạn</button>
              <button aria-pressed={readOnly} onClick={() => setMode('read')}>Xem trước</button>
            </div>
            <div className="appbar-actions">
              {!readOnly && <button className="btn" onClick={() => setDataOpen(true)}><Database size={14} /> Dữ liệu ({files.length})</button>}
              <button className="btn" onClick={() => fileRef.current?.click()}>Mở</button>
              <button className="btn" onClick={download}>Lưu file</button>
              {!readOnly && <button className="btn ghost" onClick={() => loadDoc(makeSample())}>Bài mẫu</button>}
              <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = '' }} />
            </div>
          </header>
          {!readOnly && <Toolbar />}
        </div>
        <main className={'canvas ' + mode}>
          <article className="page">
            <header className="doc-head">
              {readOnly ? <h1 className="doc-title">{meta.title}</h1>
                : <input className="doc-title" value={meta.title} placeholder="Tiêu đề bài viết" onChange={(e) => setMeta({ ...meta, title: e.target.value })} />}
              {readOnly ? <p className="doc-byline">{meta.authors} · {meta.date}</p>
                : <div className="doc-byline">
                    <input value={meta.authors} placeholder="Tác giả, đơn vị" onChange={(e) => setMeta({ ...meta, authors: e.target.value })} />
                    <input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
                  </div>}
            </header>
            <PlateContent className="doc-body" placeholder="Bắt đầu viết, hoặc gõ / để chèn khối…" spellCheck={false}
              onKeyDown={(e) => { handleSlashKey(editor, e) }} />
          </article>
        </main>
        {!readOnly && <SlashMenu />}
        {dataOpen && <DataPanel onChange={setFiles} onClose={() => setDataOpen(false)} />}
      </Plate>
    </EquationNumbers.Provider>
    </FigureNumbers.Provider>
    </DataContext.Provider>
    </DndProvider>
  )
}
