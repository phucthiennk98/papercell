import { createContext, useContext, useMemo, useState } from 'react'
import katex from 'katex'
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react'
import type { EquationNode } from './types'

/** Số thứ tự công thức theo id. */
export const EquationNumbers = createContext<Map<string, number>>(new Map())

const render = (tex: string) => {
  try { return { html: katex.renderToString(tex || '\\square', { displayMode: true, throwOnError: true }), error: '' } }
  catch (e) { return { html: '', error: (e as Error).message.replace(/^KaTeX parse error: /, '') } }
}

export function EquationElement(props: PlateElementProps) {
  const { editor } = props
  const node = props.element as unknown as EquationNode
  const readOnly = useReadOnly()
  const no = useContext(EquationNumbers).get(node.id)
  const [editing, setEditing] = useState(false)
  const [tex, setTex] = useState(node.texExpression)
  const shown = useMemo(() => render(editing ? tex : node.texExpression), [editing, tex, node.texExpression])

  const commit = () => {
    const at = editor.api.findPath(props.element)
    if (at && tex !== node.texExpression) editor.tf.setNodes({ texExpression: tex } as Partial<EquationNode>, { at })
    setEditing(false)
  }

  return (
    <PlateElement {...props} className="pc-eq">
      <div contentEditable={false}>
        <div className={'pc-eq-row' + (readOnly ? '' : ' is-edit')} onClick={() => { if (!readOnly && !editing) { setTex(node.texExpression); setEditing(true) } }}
          role={readOnly ? undefined : 'button'} aria-label={readOnly ? undefined : 'Sửa công thức'}>
          {shown.error ? <span className="pc-err">{shown.error}</span> : <span className="pc-eq-math" dangerouslySetInnerHTML={{ __html: shown.html }} />}
          {no ? <span className="pc-eq-no">({no})</span> : null}
        </div>
        {editing && (
          <div className="pc-eq-edit">
            <textarea autoFocus spellCheck={false} value={tex} rows={2} placeholder="Gõ công thức TeX, ví dụ \frac{a}{b}"
              onChange={(e) => setTex(e.target.value)} onBlur={commit}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() } if (e.key === 'Escape') setEditing(false) }} />
            <span className="hint">Enter để lưu · Shift+Enter xuống dòng · Esc để hủy</span>
          </div>
        )}
      </div>
      {props.children}
    </PlateElement>
  )
}
