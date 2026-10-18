import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react'
import type { CellOutput } from '../python/kernel'
import { isRunning, onRunningChange, runCell } from './run'
import { DISPLAY_LABEL, type CellDisplay, type PythonNode } from './types'

/** Số thứ tự hình theo id ô (chỉ đếm ô có chú thích và không ẩn). */
export const FigureNumbers = createContext<Map<string, number>>(new Map())

function Outputs({ node }: { node: PythonNode }) {
  const outs = node.outputs ?? []
  return (
    <div className="pc-outputs">
      {outs.map((o: CellOutput, i) =>
        o.mime === 'text/plain'
          ? <pre key={i} className="pc-out-text">{o.data}</pre>
          : <div key={i} className={o.mime === 'text/html' ? 'pc-out-html' : 'pc-out-svg'} dangerouslySetInnerHTML={{ __html: o.data }} />,
      )}
      {node.stdout ? <pre className="pc-out-text">{node.stdout}</pre> : null}
      {node.error ? <pre className="pc-out-error">{node.error}</pre> : null}
    </div>
  )
}

function CodeArea({ value, onChange, onRun, onBlur, readOnly }: { value: string; onChange: (v: string) => void; onRun: () => void; onBlur?: () => void; readOnly?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' } }, [value])
  return (
    <textarea
      ref={ref} className="pc-code" spellCheck={false} value={value} readOnly={readOnly} rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun() }
        if (e.key === 'Tab') {
          e.preventDefault()
          const t = e.currentTarget, s = t.selectionStart
          onChange(t.value.slice(0, s) + '    ' + t.value.slice(t.selectionEnd))
          requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4 })
        }
      }}
    />
  )
}

export function PythonCellElement(props: PlateElementProps) {
  const { editor } = props
  const node = props.element as unknown as PythonNode
  const readOnly = useReadOnly()
  const figNo = useContext(FigureNumbers).get(node.id)
  const running = useSyncExternalStore(onRunningChange, () => isRunning(node.id))
  const [code, setCode] = useState(node.code)
  const [showCode, setShowCode] = useState(false)
  useEffect(() => { setCode(node.code) }, [node.code])

  const path = () => editor.api.findPath(props.element)
  const set = (p: Partial<PythonNode>) => { const at = path(); if (at) editor.tf.setNodes(p, { at }) }
  const commit = () => { if (code !== node.code) set({ code }) }
  const run = () => { commit(); runCell(editor, node.id, code) }

  const d = node.display
  const caption = figNo ? <span className="pc-fig-no">Hình {figNo}.</span> : null

  // Chế độ đọc (xem trước / xuất bản)
  if (readOnly) {
    if (d === 'hidden') return <PlateElement {...props} className="pc-hidden-read">{props.children}</PlateElement>
    const codeOpen = d === 'both' || d === 'code' || showCode
    return (
      <PlateElement {...props}>
        <figure className="pc-figure" contentEditable={false}>
          {d !== 'code' && <Outputs node={node} />}
          {codeOpen && <pre className="pc-code-read">{node.code}</pre>}
          {(node.caption || d === 'output') && (
            <figcaption>
              <span>{caption} {node.caption}</span>
              {d === 'output' && <button className="pc-link" onClick={() => setShowCode(!showCode)}>{showCode ? 'Ẩn code' : '‹/› Code'}</button>}
            </figcaption>
          )}
        </figure>
        {props.children}
      </PlateElement>
    )
  }

  // Chế độ soạn
  const showEditorCode = d !== 'output' || showCode
  return (
    <PlateElement {...props} className={'pc-cell' + (d === 'hidden' ? ' is-hidden' : '')}>
      <div contentEditable={false} className="pc-cell-inner">
        <div className="pc-cell-head">
          <span className="pc-cell-tag">[{node.execCount ?? ' '}] Python{d === 'hidden' ? ' · ẩn khi xuất bản' : ''}</span>
          <span className="pc-cell-tools">
            {d === 'output' && <button className="pc-btn-ghost" onClick={() => setShowCode(!showCode)}>{showCode ? 'Thu code' : '‹/› Code'}</button>}
            <select value={d} onChange={(e) => set({ display: e.target.value as CellDisplay })} aria-label="Chế độ hiển thị">
              {(Object.keys(DISPLAY_LABEL) as CellDisplay[]).map((k) => <option key={k} value={k}>{DISPLAY_LABEL[k]}</option>)}
            </select>
            <button className="pc-run" onClick={run} disabled={running} title="Chạy (Shift+Enter)">{running ? '…' : '▶'}</button>
          </span>
        </div>
        {showEditorCode && <CodeArea value={code} onChange={setCode} onRun={run} onBlur={commit} />}
        {d !== 'code' && <Outputs node={node} />}
        <div className="pc-caption-row">
          {caption}
          <input className="pc-caption" placeholder="Chú thích hình (để trống nếu không đánh số)" defaultValue={node.caption}
            onBlur={(e) => { if (e.target.value !== node.caption) set({ caption: e.target.value }) }}
            onKeyDown={(e) => e.stopPropagation()} />
        </div>
      </div>
      {props.children}
    </PlateElement>
  )
}
