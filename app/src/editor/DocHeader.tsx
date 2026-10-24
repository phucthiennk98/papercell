import { createContext, useContext } from 'react'
import { useEditorReadOnly } from 'platejs/react'
import type { DocMeta } from './types'

export const MetaContext = createContext<{ meta: DocMeta; setMeta: (m: DocMeta) => void }>({ meta: { title: '', authors: '', date: '' }, setMeta: () => {} })

/** Tiêu đề, tác giả, ngày của bài: nằm ngay dưới thanh công cụ, cùng lề với nội dung. */
export function DocHeader() {
  const { meta, setMeta } = useContext(MetaContext)
  const readOnly = useEditorReadOnly()
  return (
    <div className="px-4 pt-6 sm:px-[max(64px,calc(50%-350px))] sm:pt-10">
      {readOnly ? <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">{meta.title}</h1>
        : <input className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
            value={meta.title} placeholder="Title" aria-label="Title" onChange={(e) => setMeta({ ...meta, title: e.target.value })} />}
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground sm:gap-4">
        {readOnly ? <span>{meta.authors}{meta.authors && meta.date ? ' · ' : ''}{meta.date}</span> : <>
          <input className="min-w-[180px] flex-1 bg-transparent outline-none" value={meta.authors} placeholder="Authors, affiliation" aria-label="Authors" onChange={(e) => setMeta({ ...meta, authors: e.target.value })} />
          <input className="bg-transparent outline-none" type="date" value={meta.date} aria-label="Date" onChange={(e) => setMeta({ ...meta, date: e.target.value })} />
        </>}
      </div>
    </div>
  )
}
