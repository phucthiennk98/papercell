import { createContext, useContext } from 'react'
import { useEditorReadOnly } from 'platejs/react'
import TextareaAutosize from 'react-textarea-autosize'
import type { DocMeta } from './types'

export const MetaContext = createContext<{ meta: DocMeta; setMeta: (m: DocMeta) => void }>({ meta: { title: '', authors: '', date: '' }, setMeta: () => {} })

/** Article title, authors/affiliation, and publication date aligned with the body margins in both Edit and Preview modes. */
export function DocHeader() {
  const { meta, setMeta } = useContext(MetaContext)
  const readOnly = useEditorReadOnly()
  return (
    <div className="px-4 pt-6 sm:px-[max(64px,calc(50%-350px))] sm:pt-10">
      {readOnly ? (
        <h1 className="text-2xl font-bold tracking-tight leading-tight break-words sm:text-4xl">{meta.title}</h1>
      ) : (
        <TextareaAutosize
          rows={1}
          className="block w-full resize-none overflow-hidden bg-transparent text-2xl font-bold tracking-tight leading-tight break-words outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
          value={meta.title}
          placeholder="Title"
          aria-label="Title"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault()
          }}
          onChange={(e) => setMeta({ ...meta, title: e.target.value.replace(/\r?\n/g, ' ') })}
        />
      )}
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {readOnly ? (
          <>
            <span className="min-w-[180px] flex-1">{meta.authors}</span>
            {meta.date && <time className="shrink-0 tabular-nums">{meta.date}</time>}
          </>
        ) : (
          <>
            <input
              className="min-w-[180px] flex-1 bg-transparent outline-none"
              value={meta.authors}
              placeholder="Authors, affiliation"
              aria-label="Authors"
              onChange={(e) => setMeta({ ...meta, authors: e.target.value })}
            />
            <input
              className="shrink-0 bg-transparent tabular-nums outline-none"
              type="date"
              value={meta.date}
              aria-label="Date"
              onChange={(e) => setMeta({ ...meta, date: e.target.value })}
            />
          </>
        )}
      </div>
    </div>
  )
}
