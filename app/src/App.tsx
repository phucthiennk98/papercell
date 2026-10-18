import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Plate, PlateContent, usePlateEditor } from 'platejs/react'
import { plugins } from './editor/plugins'
import { FigureNumbers } from './editor/PythonCell'
import { Toolbar } from './editor/Toolbar'
import { runAll } from './editor/run'
import type { DocMeta, PapercellDoc, PythonNode } from './editor/types'
import { kernel } from './python/kernel'
import { SAMPLE } from './sample'

const STORE = 'papercell.doc.v1'
let booted = false

function loadStored(): PapercellDoc | null {
  try { const s = localStorage.getItem(STORE); const d = s && JSON.parse(s); return d?.version === 1 && Array.isArray(d.content) ? d : null } catch { return null }
}

/** Đánh số hình theo thứ tự xuất hiện: chỉ ô có chú thích và không bị ẩn. */
function figureNumbers(content: any[]) {
  const m = new Map<string, number>(); let i = 0
  const walk = (nodes: any[]) => nodes.forEach((n) => {
    if (n.type === 'python') { const c = n as PythonNode; if (c.caption?.trim() && c.display !== 'hidden') m.set(c.id, ++i) }
    else if (n.children) walk(n.children)
  })
  walk(content)
  return m
}

function KernelStatus() {
  const s = useSyncExternalStore((l) => kernel.subscribe(l), () => kernel.status)
  return <span className={'kstatus' + (s.ready ? ' ok' : '')}><span className="dot" />{s.text}</span>
}

export default function App() {
  const initial = useMemo(() => loadStored() ?? SAMPLE, [])
  const [meta, setMeta] = useState<DocMeta>(initial.meta)
  const [mode, setMode] = useState<'edit' | 'read'>(() => (location.hash === '#read' ? 'read' : 'edit'))
  const [figs, setFigs] = useState(() => figureNumbers(initial.content))
  const editor = usePlateEditor({ plugins, value: initial.content })
  const fileRef = useRef<HTMLInputElement>(null)
  const metaRef = useRef(meta); metaRef.current = meta

  const save = (content = editor.children) => {
    try { localStorage.setItem(STORE, JSON.stringify({ version: 1, meta: metaRef.current, content })) } catch { /* bộ nhớ trình duyệt bị chặn */ }
  }
  useEffect(() => { save() }, [meta])
  useEffect(() => { location.hash = mode === 'read' ? 'read' : 'edit' }, [mode])

  // Lần đầu mở: khởi động Python và chạy các ô chưa có kết quả (chỉ một lần).
  useEffect(() => {
    if (booted) return
    booted = true
    kernel.start()
    const needsRun = [...editor.api.nodes({ at: [], match: (n: any) => n.type === 'python' })].some(([n]: any) => !n.outputs)
    if (needsRun) runAll(editor)
  }, [editor])

  const loadDoc = (d: PapercellDoc) => {
    setMeta(d.meta); editor.tf.setValue(d.content); setFigs(figureNumbers(d.content)); kernel.restart(); runAll(editor)
  }
  const download = () => {
    const blob = new Blob([JSON.stringify({ version: 1, meta, content: editor.children }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = (meta.title || 'bai-viet').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() + '.papercell.json'
    a.click(); URL.revokeObjectURL(a.href)
  }
  const open = async (f?: File) => {
    if (!f) return
    try { const d = JSON.parse(await f.text()); if (d?.version !== 1 || !Array.isArray(d.content)) throw new Error(); loadDoc(d) }
    catch { alert('File này không phải tài liệu Papercell.') }
  }

  const readOnly = mode === 'read'
  return (
    <FigureNumbers.Provider value={figs}>
      <Plate editor={editor} readOnly={readOnly} onChange={({ value }) => { setFigs(figureNumbers(value)); save(value) }}>
        <div className="chrome">
        <header className="appbar">
          <div className="brand"><span className="logo" aria-hidden="true">▤</span>Papercell</div>
          <div className="seg" role="group" aria-label="Chế độ">
            <button aria-pressed={!readOnly} onClick={() => setMode('edit')}>Soạn</button>
            <button aria-pressed={readOnly} onClick={() => setMode('read')}>Xem trước</button>
          </div>
          <div className="appbar-actions">
            <KernelStatus />
            {!readOnly && <button className="btn" onClick={() => runAll(editor)}>Chạy tất cả</button>}
            <button className="btn" onClick={() => fileRef.current?.click()}>Mở</button>
            <button className="btn" onClick={download}>Lưu file</button>
            {!readOnly && <button className="btn ghost" onClick={() => loadDoc(structuredClone(SAMPLE))}>Bài mẫu</button>}
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
            <PlateContent className="doc-body" placeholder="Bắt đầu viết…" spellCheck={false} />
          </article>
        </main>
      </Plate>
    </FigureNumbers.Provider>
  )
}
