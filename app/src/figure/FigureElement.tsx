import { createContext, useContext, useEffect, useState } from 'react'
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react'
import { CircleCheck, CircleX, Maximize2, Pencil } from 'lucide-react'
import type { FigureNode, FigureParam } from '../editor/types'
import { FigureDialog, type DialogTab } from './FigureDialog'
import { FigureView, ParamSliders } from './FigureView'

/** Số thứ tự hình theo id thẻ. */
export const FigureNumbers = createContext<Map<string, number>>(new Map())

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
  const no = useContext(FigureNumbers).get(fig.id)
  // Giá trị tham số đang kéo; người đọc kéo thì không ghi vào tài liệu.
  const [params, setParams] = useState<FigureParam[]>(fig.params)
  const [dialog, setDialog] = useState<DialogTab | null>(null)
  useEffect(() => { setParams(fig.params) }, [fig.params])
  useEffect(() => { if (fig.autoOpen && !readOnly) { setDialog('design'); update({ autoOpen: undefined }) } }, [fig.autoOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<FigureNode>) => { const at = editor.api.findPath(props.element); if (at) editor.tf.setNodes(patch, { at }) }
  const slide = (name: string, v: number) => setParams((ps) => ps.map((p) => (p.name === name ? { ...p, value: v } : p)))
  const commit = () => { if (!readOnly) update({ params }) }

  if (readOnly && fig.display === 'hidden') return <PlateElement {...props} className="fig-hidden">{props.children}</PlateElement>

  const caption = (
    <span>{no ? <b className="fig-no">Hình {no}.</b> : null} {fig.caption}</span>
  )
  const codes = readOnly ? visibleCode(fig) : [{ lang: 'JS' as const, code: fig.js }]
  const showInlineCode = (fig.display === 'both' || fig.display === 'code') && codes.length > 0

  return (
    <PlateElement {...props} className={'fig' + (readOnly ? ' is-read' : ' is-edit') + (fig.display === 'hidden' ? ' is-hidden' : '')}>
      <div contentEditable={false} className="fig-card">
        <div className="fig-head">
          <span className="fig-badges">
            {!readOnly && <span className="fig-badge">JS{fig.python.trim() ? ' · có Python gốc' : ''}</span>}
            {!readOnly && fig.verify && (
              <span className={'fig-verify ' + (fig.verify.ok ? 'ok' : 'bad')} data-tip={fig.verify.message}>
                {fig.verify.ok ? <CircleCheck size={13} /> : <CircleX size={13} />}{fig.verify.ok ? 'Đã kiểm chứng' : 'Chưa khớp'}
              </span>
            )}
            {!readOnly && fig.display === 'hidden' && <span className="fig-badge muted">Ẩn khi xuất bản</span>}
          </span>
          <span className="fig-actions">
            {!readOnly && <button type="button" className="pc-icon-btn" aria-label="Sửa hình và code" data-tip="Sửa hình và code" onClick={() => setDialog(fig.spec && !fig.specDetached ? 'design' : 'js')}><Pencil size={15} /></button>}
            <button type="button" className="pc-icon-btn" aria-label="Phóng to" data-tip="Phóng to" onClick={() => setDialog('figure')}><Maximize2 size={15} /></button>
          </span>
        </div>
        {fig.display !== 'code' && (
          <div className="fig-click" onClick={() => setDialog('figure')} role="button" tabIndex={0} aria-label="Mở hình lớn"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') setDialog('figure') }}>
            <FigureView js={fig.js} params={params} />
          </div>
        )}
        <ParamSliders params={params} onChange={slide} onCommit={commit} idPrefix={fig.id} />
        {showInlineCode && codes.map((c) => (
          <details key={c.lang} className="fig-inline-code" open={fig.display === 'code'}>
            <summary>Code {c.lang}</summary><pre>{c.code}</pre>
          </details>
        ))}
        <div className="fig-caption">
          {readOnly ? caption : (
            <>
              {no ? <b className="fig-no">Hình {no}.</b> : null}
              <input defaultValue={fig.caption} placeholder="Chú thích hình (để trống thì không đánh số)" aria-label="Chú thích hình"
                onBlur={(e) => { if (e.target.value !== fig.caption) update({ caption: e.target.value }) }} onKeyDown={(e) => e.stopPropagation()} />
            </>
          )}
        </div>
      </div>
      {dialog && (
        <FigureDialog fig={fig} params={params} onParam={slide} onCommitParams={commit} readOnly={readOnly}
          number={no} initialTab={dialog} onClose={() => setDialog(null)} onUpdate={update} />
      )}
      {props.children}
    </PlateElement>
  )
}
