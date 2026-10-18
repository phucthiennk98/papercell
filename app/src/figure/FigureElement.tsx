import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react'
import { CircleCheck, CircleX, Maximize2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CAPTION_LABEL, DEFAULT_FIG_PADDING, type FigureNode, type FigureParam } from '../editor/types'
import { MetaContext } from '../editor/DocHeader'
import { captionKind, NEXT_CAPTION } from '../editor/scan'
import { FigureDialog, type DialogTab } from './FigureDialog'
import { FigureView, ParamSliders } from './FigureView'

/** Số thứ tự hình theo id thẻ. */
/** Caption number per figure id, e.g. "Figure 3" or "Table 1". */
export const FigureNumbers = createContext<Map<string, string>>(new Map())

/** Code người đọc được thấy, theo quyền tác giả đặt. */
export function visibleCode(fig: FigureNode): { lang: 'JS' | 'Python'; code: string }[] {
  const out: { lang: 'JS' | 'Python'; code: string }[] = []
  if ((fig.codeAccess === 'python' || fig.codeAccess === 'both') && fig.python.trim()) out.push({ lang: 'Python', code: fig.python })
  if (fig.codeAccess === 'js' || fig.codeAccess === 'both') out.push({ lang: 'JS', code: fig.js })
  return out
}

export function FigureElement(props: PlateElementProps) {
  const { editor } = props
  const fig = props.element as unknown as FigureNode
  const readOnly = useReadOnly()
  const update = (patch: Partial<FigureNode>) => { const at = editor.api.findPath(props.element); if (at) editor.tf.setNodes(patch, { at }) }
  const { meta, setMeta } = useContext(MetaContext)
  /** Make every figure use this padding: it becomes the document default and per-figure overrides are cleared. */
  const applyPaddingAll = (px: number) => {
    setMeta({ ...meta, figurePadding: px })
    editor.tf.setNodes({ padding: undefined } as Partial<FigureNode>, { at: [], mode: 'all', match: (n) => (n as { type?: string }).type === 'figure' })
  }
  const remove = () => {
    const at = editor.api.findPath(props.element); if (!at) return
    editor.tf.removeNodes({ at })
    toast('Figure deleted', { action: { label: 'Undo', onClick: () => editor.undo() } })
  }
  return (
    <PlateElement {...props} className={figClass(fig, readOnly)}>
      {readOnly && fig.display === 'hidden' ? null : <FigureCard fig={fig} readOnly={readOnly} update={update} remove={remove} applyPaddingAll={applyPaddingAll} />}
      {props.children}
    </PlateElement>
  )
}

export const figClass = (fig: FigureNode, readOnly: boolean) =>
  readOnly && fig.display === 'hidden' ? 'fig-hidden' : 'fig' + (readOnly ? ' is-read' : ' is-edit') + (fig.display === 'hidden' ? ' is-hidden' : '')

/** Thân thẻ hình (dùng chung cho editor và trang đọc tĩnh khi xuất HTML). */
export function FigureCard({ fig, readOnly, update, remove, applyPaddingAll }: {
  fig: FigureNode; readOnly: boolean; update: (p: Partial<FigureNode>) => void; remove?: () => void; applyPaddingAll?: (px: number) => void
}) {
  const no = useContext(FigureNumbers).get(fig.id)
  const { meta } = useContext(MetaContext)
  const pad = fig.padding ?? meta.figurePadding ?? DEFAULT_FIG_PADDING
  // Giá trị tham số đang kéo; người đọc kéo thì không ghi vào tài liệu.
  const [params, setParams] = useState<FigureParam[]>(fig.params)
  const [dialog, setDialog] = useState<DialogTab | null>(null)
  useEffect(() => { setParams(fig.params) }, [fig.params])
  useEffect(() => { if (fig.autoOpen && !readOnly) { setDialog('design'); update({ autoOpen: undefined }) } }, [fig.autoOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const slide = (name: string, v: number) => setParams((ps) => ps.map((p) => (p.name === name ? { ...p, value: v } : p)))
  const commit = () => { if (!readOnly) update({ params }) }

  const caption = (
    <span>{no ? <b className="fig-no">{no}.</b> : null} {fig.caption}</span>
  )
  const codes = readOnly ? visibleCode(fig) : [{ lang: 'JS' as const, code: fig.js }]
  const showInlineCode = (fig.display === 'both' || fig.display === 'code') && codes.length > 0

  return (
    <>
      <div contentEditable={false} className="fig-card">
        {/* Always visible: states the author must not miss */}
        {!readOnly && (fig.verify?.ok === false || fig.display === 'hidden') && (
          <div className="fig-alerts">
            {fig.verify?.ok === false && <span className="fig-verify bad" data-tip={fig.verify.message}><CircleX size={13} />Mismatch</span>}
            {fig.display === 'hidden' && <span className="fig-badge muted">Hidden when published</span>}
          </div>
        )}
        {/* Floating toolbar, shown on hover: status + actions */}
        <div className="fig-tools">
          {!readOnly && fig.python.trim() && <span className="fig-badge" data-tip="Has original Python code">Python</span>}
          {!readOnly && fig.verify?.ok && <span className="fig-verify ok" data-tip={fig.verify.message}><CircleCheck size={13} />Verified</span>}
          {!readOnly && fig.scenarios && <span className="fig-badge" data-tip={`${fig.scenarios.count} combinations precomputed with Python`}>Precomputed {fig.scenarios.count.toLocaleString('en-US')}</span>}
          {!readOnly && <button type="button" className="pc-icon-btn" aria-label="Edit figure and code" data-tip="Edit figure and code" onClick={() => setDialog(fig.spec && !fig.specDetached ? 'design' : 'js')}><Pencil size={15} /></button>}
          <button type="button" className="pc-icon-btn" aria-label="Enlarge" data-tip="Enlarge" onClick={() => setDialog('figure')}><Maximize2 size={15} /></button>
          {!readOnly && remove && <button type="button" className="pc-icon-btn danger" aria-label="Delete figure" data-tip="Delete (Ctrl+Z to undo)" onClick={remove}><Trash2 size={15} /></button>}
        </div>
        {fig.display !== 'code' && (
          <div className="fig-click" style={{ padding: pad }} onClick={() => setDialog('figure')} role="button" tabIndex={0} aria-label="Open large figure"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setDialog('figure') }}>
            <FigureView js={fig.js} params={params} scenarios={fig.scenarios} />
          </div>
        )}
        <ParamSliders params={params} onChange={slide} onCommit={commit} idPrefix={fig.id} grid={fig.scenarios?.grid} />
        {showInlineCode && codes.map((c) => (
          <details key={c.lang} className="fig-inline-code" open={fig.display === 'code'}>
            <summary>Code {c.lang}</summary><pre>{c.code}</pre>
          </details>
        ))}
        <div className="fig-caption">
          {readOnly ? caption : (
            <>
              <button type="button" className={'fig-no fig-no-btn' + (no ? '' : ' none')} data-tip="Click to switch: Figure → Table → no number"
                aria-label="Caption label" onClick={() => update({ label: NEXT_CAPTION[captionKind(fig)] })}>
                {no ? `${no}.` : captionKind(fig) === 'none' ? 'No number' : CAPTION_LABEL[captionKind(fig)]}
              </button>
              <CaptionInput key={fig.caption} value={fig.caption} onSave={(v) => update({ caption: v })} />
            </>
          )}
        </div>
      </div>
      {dialog && (
        <FigureDialog fig={fig} params={params} onParam={slide} onCommitParams={commit} readOnly={readOnly}
          number={no} initialTab={dialog} onClose={() => setDialog(null)} onUpdate={update} applyPaddingAll={applyPaddingAll} />
      )}
    </>
  )
}

/** Caption field that wraps onto several lines and grows with its text; Enter saves instead of adding a line. */
function CaptionInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fit = () => { const t = ref.current; if (!t) return; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }
  useLayoutEffect(() => {
    fit()
    const ro = new ResizeObserver(fit)
    if (ref.current) ro.observe(ref.current)
    // Web fonts change text width without resizing the box: measure again once they have loaded
    document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [])
  return (
    <textarea ref={ref} rows={1} defaultValue={value} placeholder="Caption (needed for numbering)" aria-label="Caption"
      onInput={fit}
      onBlur={(e) => { const v = e.target.value.replace(/\s*\n\s*/g, ' '); if (v !== value) onSave(v) }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }} />
  )
}
