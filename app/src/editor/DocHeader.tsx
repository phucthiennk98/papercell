import { createContext, useContext } from 'react'
import { useEditorReadOnly } from 'platejs/react'
import type { DocMeta } from './types'

export const MetaContext = createContext<{ meta: DocMeta; setMeta: (m: DocMeta) => void }>({ meta: { title: '', authors: '', date: '' }, setMeta: () => {} })

/** Tiêu đề, tác giả, ngày của bài: nằm ngay dưới thanh công cụ, cùng lề với nội dung. */
export function DocHeader() {
  const { meta, setMeta } = useContext(MetaContext)
  const readOnly = useEditorReadOnly()
  return (
    <div className="px-16 pt-10 sm:px-[max(64px,calc(50%-350px))]">
      {readOnly ? <h1 className="text-4xl font-bold tracking-tight">{meta.title}</h1>
        : <input className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
            value={meta.title} placeholder="Tiêu đề bài viết" aria-label="Tiêu đề bài viết" onChange={(e) => setMeta({ ...meta, title: e.target.value })} />}
      <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
        {readOnly ? <span>{meta.authors}{meta.authors && meta.date ? ' · ' : ''}{meta.date}</span> : <>
          <input className="min-w-0 flex-1 bg-transparent outline-none" value={meta.authors} placeholder="Tác giả, đơn vị" aria-label="Tác giả" onChange={(e) => setMeta({ ...meta, authors: e.target.value })} />
          <input className="bg-transparent outline-none" type="date" value={meta.date} aria-label="Ngày" onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
        </>}
      </div>
    </div>
  )
}
