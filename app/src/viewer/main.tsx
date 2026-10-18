// Trang đọc của file HTML xuất bản: tài liệu (nén gzip + base64) nằm sẵn trong thẻ <script id="papercell-doc">.
import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createStaticEditor } from 'platejs/static'
import { BaseEditorKit } from '@/components/editor/editor-base-kit'
import { EditorStatic } from '@/components/ui/editor-static'
import { scan } from '@/editor/scan'
import type { PapercellDoc } from '@/editor/types'
import { FigureNumbers } from '@/figure/FigureElement'
import { MetaContext } from '@/editor/DocHeader'
import { FigureStaticPlugin } from '@/figure/FigureStatic'
import { DataContext, parseData } from '@/figure/runtime'
import { unpackText } from '@/lib/pack'
import 'katex/dist/katex.min.css'
import '../index.css'
import '../figure/papercell.css'
import '../figure/figure.css'
import './viewer.css'

const EMPTY = '__PC' + '_DOC__'

async function readDoc(): Promise<PapercellDoc> {
  const raw = document.getElementById('papercell-doc')?.textContent?.trim() ?? ''
  if (!raw || raw === EMPTY) throw new Error('This file has no document in it. Export one from Papercell with the "Export HTML" button.')
  return JSON.parse(await unpackText(raw))
}

function Viewer({ doc }: { doc: PapercellDoc }) {
  const editor = useMemo(() => createStaticEditor({ plugins: [...BaseEditorKit, FigureStaticPlugin], value: doc.content }), [doc])
  const { figs, headings } = useMemo(() => scan(doc.content), [doc])
  const data = useMemo(() => ({ files: doc.data ?? [], data: parseData(doc.data ?? []), setFiles: () => {} }), [doc])
  const { title, authors, date } = doc.meta
  const metaCtx = useMemo(() => ({ meta: doc.meta, setMeta: () => {} }), [doc])
  useEffect(() => { if (title) document.title = title }, [title])
  return (
    <DataContext.Provider value={data}>
      <MetaContext.Provider value={metaCtx}>
      <FigureNumbers.Provider value={figs}>
        <div className="pv">
          {headings.length > 1 && (
            <nav className="pv-toc" aria-label="Contents">
              <b>Contents</b>
              {headings.map((h) => <a key={h.id} href={'#' + h.id} style={{ paddingLeft: (h.level - 1) * 12 }}
                onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' }) }}>{h.text}</a>)}
            </nav>
          )}
          <main className="pv-main">
            <header className="px-16 pt-10 sm:px-[max(64px,calc(50%-350px))]">
              <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
              {(authors || date) && <p className="mt-2 text-sm text-muted-foreground">{authors}{authors && date ? ' · ' : ''}{date}</p>}
            </header>
            <EditorStatic editor={editor} variant="demo" className="pb-24" />
            <footer className="pv-foot">Exported with Papercell. Figures and precomputed results live inside this file; no Python or server needed.</footer>
          </main>
        </div>
      </FigureNumbers.Provider>
      </MetaContext.Provider>
    </DataContext.Provider>
  )
}

function App() {
  const [doc, setDoc] = useState<PapercellDoc | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { readDoc().then(setDoc, (e) => setErr((e as Error).message)) }, [])
  if (err) return <p className="pv-msg">{err}</p>
  if (!doc) return <p className="pv-msg">Opening…</p>
  return <Viewer doc={doc} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
