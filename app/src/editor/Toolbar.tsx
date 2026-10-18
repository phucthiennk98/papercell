import type { ReactNode } from 'react'
import type { TElement } from 'platejs'
import { useEditorRef, useEditorSelector } from 'platejs/react'
import { setAlign, type Alignment } from '@platejs/basic-styles'
import { indent, outdent } from '@platejs/indent'
import { setColumns, toggleColumnGroup } from '@platejs/layout'
import { newPythonNode } from './types'

const BLOCKS: [string, string][] = [['p', 'Đoạn văn'], ['h1', 'Tiêu đề 1'], ['h2', 'Tiêu đề 2'], ['h3', 'Tiêu đề 3'], ['blockquote', 'Trích dẫn']]
const MARKS: [string, ReactNode, string][] = [
  ['bold', <b>B</b>, 'Đậm (Ctrl+B)'], ['italic', <i>I</i>, 'Nghiêng (Ctrl+I)'], ['underline', <u>U</u>, 'Gạch chân (Ctrl+U)'],
  ['superscript', <span>x<sup>2</sup></span>, 'Chỉ số trên'], ['subscript', <span>x<sub>2</sub></span>, 'Chỉ số dưới'], ['code', <span className="mono">{'<>'}</span>, 'Code trong dòng'],
]
const ALIGNS: [Alignment, string, string][] = [['left', 'M3 6h18M3 12h12M3 18h16', 'Căn trái'], ['center', 'M3 6h18M6 12h12M4 18h16', 'Căn giữa'], ['right', 'M3 6h18M9 12h12M5 18h16', 'Căn phải'], ['justify', 'M3 6h18M3 12h18M3 18h18', 'Căn đều']]
const COLUMNS: [string, string[]][] = [['1 cột', ['100%']], ['2 cột · 50/50', ['50%', '50%']], ['2 cột · 33/67', ['33.33%', '66.67%']], ['2 cột · 67/33', ['66.67%', '33.33%']], ['3 cột', ['33.33%', '33.33%', '33.34%']]]

const Icon = ({ d }: { d: string }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d={d} /></svg>

function Btn({ on, title, onAct, children }: { on?: boolean; title: string; onAct: () => void; children: ReactNode }) {
  return <button type="button" className={'tb' + (on ? ' on' : '')} title={title} aria-label={title} onMouseDown={(e) => { e.preventDefault(); onAct() }}>{children}</button>
}

export function Toolbar() {
  const editor = useEditorRef()
  const block = useEditorSelector((ed) => (ed.api.block({ highest: false })?.[0] as TElement | undefined), [])
  const marks = useEditorSelector((ed) => ed.api.marks() ?? {}, []) as Record<string, unknown>
  const inColumns = useEditorSelector((ed) => !!ed.api.above({ match: { type: 'column_group' } }), [])
  const type = (block?.type as string) ?? 'p'
  const align = ((block as any)?.align as string) ?? 'left'

  const applyColumns = (widths: string[]) => {
    const group = editor.api.above({ match: { type: 'column_group' } })
    if (widths.length === 1) {
      if (!group) return
      editor.tf.withoutNormalizing(() => {
        editor.tf.unwrapNodes({ at: group[1], match: (n) => (n as TElement).type === 'column', mode: 'all' })
        editor.tf.unwrapNodes({ at: group[1] })
      })
    } else if (group) setColumns(editor, { at: group[1], widths })
    else toggleColumnGroup(editor, { widths })
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Định dạng">
      <select className="tb-select" value={BLOCKS.some(([k]) => k === type) ? type : 'p'} aria-label="Kiểu khối"
        onChange={(e) => { editor.tf.toggleBlock(e.target.value); editor.tf.focus() }}>
        {BLOCKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="sep" />
      {MARKS.map(([k, label, title]) => <Btn key={k} on={!!marks[k]} title={title} onAct={() => editor.tf.toggleMark(k)}>{label}</Btn>)}
      <span className="sep" />
      {ALIGNS.map(([k, d, title]) => <Btn key={k} on={align === k} title={title} onAct={() => setAlign(editor, k)}><Icon d={d} /></Btn>)}
      <Btn title="Giảm thụt lề" onAct={() => outdent(editor)}><Icon d="M21 6H11M21 12H11M21 18H11M7 9l-3 3 3 3" /></Btn>
      <Btn title="Tăng thụt lề" onAct={() => indent(editor)}><Icon d="M21 6H11M21 12H11M21 18H11M3 9l3 3-3 3" /></Btn>
      <span className="sep" />
      <select className="tb-select" value="" aria-label="Chia cột" onChange={(e) => { const c = COLUMNS[+e.target.value]; if (c) applyColumns(c[1]); e.target.value = '' }}>
        <option value="" disabled>{inColumns ? 'Đổi cột…' : 'Chia cột…'}</option>
        {COLUMNS.map(([l], i) => <option key={l} value={i} disabled={i === 0 && !inColumns}>{l}</option>)}
      </select>
      <span className="sep" />
      <Btn title="Chèn ô Python" onAct={() => editor.tf.insertNodes(newPythonNode('# Viết code Python, nhấn Shift+Enter để chạy\n'), { select: true })}><span className="tb-text">+ Python</span></Btn>
      <Btn title="Chèn đường kẻ" onAct={() => editor.tf.insertNodes({ type: 'hr', children: [{ text: '' }] } as any)}><Icon d="M3 12h18" /></Btn>
    </div>
  )
}
