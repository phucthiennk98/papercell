import type { ReactNode } from 'react'
import type { Path, TElement } from 'platejs'
import { useEditorRef, useEditorSelector } from 'platejs/react'
import { setAlign, type Alignment } from '@platejs/basic-styles'
import { indent, outdent } from '@platejs/indent'
import { setColumns, toggleColumnGroup } from '@platejs/layout'
import {
  Bold, ChartColumn, Code, Columns2, Columns3, Italic, ListIndentDecrease, ListIndentIncrease, Minus, RectangleHorizontal, Sigma,
  Subscript, Superscript, TextAlignCenter, TextAlignEnd, TextAlignJustify, TextAlignStart, Underline,
  type LucideIcon,
} from 'lucide-react'
import { ITEMS } from './SlashMenu'

const BLOCKS: [string, string][] = [['p', 'Đoạn văn'], ['h1', 'Tiêu đề 1'], ['h2', 'Tiêu đề 2'], ['h3', 'Tiêu đề 3'], ['blockquote', 'Trích dẫn']]
const MARKS: [string, LucideIcon, string][] = [
  ['bold', Bold, 'Đậm (Ctrl+B)'], ['italic', Italic, 'Nghiêng (Ctrl+I)'], ['underline', Underline, 'Gạch chân (Ctrl+U)'],
  ['superscript', Superscript, 'Chỉ số trên'], ['subscript', Subscript, 'Chỉ số dưới'], ['code', Code, 'Code trong dòng'],
]
const ALIGNS: [Alignment, LucideIcon, string][] = [['left', TextAlignStart, 'Căn trái'], ['center', TextAlignCenter, 'Căn giữa'], ['right', TextAlignEnd, 'Căn phải'], ['justify', TextAlignJustify, 'Căn đều hai bên']]
const COLUMNS: [LucideIcon, string, string[]][] = [[RectangleHorizontal, '1 cột (gộp cột)', ['100%']], [Columns2, '2 cột', ['50%', '50%']], [Columns3, '3 cột', ['33.33%', '33.33%', '33.34%']]]
const INSERTS: [string, LucideIcon, string][] = [['figure', ChartColumn, 'Chèn hình (JS)'], ['equation', Sigma, 'Chèn công thức'], ['hr', Minus, 'Chèn đường kẻ']]

function Btn({ on, tip, onAct, children }: { on?: boolean; tip: string; onAct: () => void; children: ReactNode }) {
  return <button type="button" className={'tb' + (on ? ' on' : '')} data-tip={tip} aria-label={tip} aria-pressed={on} onMouseDown={(e) => { e.preventDefault(); onAct() }}>{children}</button>
}
const I = ({ icon: Icon }: { icon: LucideIcon }) => <Icon size={16} strokeWidth={1.8} />

export function Toolbar() {
  const editor = useEditorRef()
  const block = useEditorSelector((ed) => ed.api.block({ highest: false })?.[0] as TElement | undefined, [])
  const marks = useEditorSelector((ed) => ed.api.marks() ?? {}, []) as Record<string, unknown>
  const colCount = useEditorSelector((ed) => (ed.api.above({ match: { type: 'column_group' } })?.[0] as TElement | undefined)?.children.length ?? 1, [])
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

  const insert = (key: string) => {
    const item = ITEMS.find((i) => i.key === key)!
    const top = editor.api.block({ highest: true })
    const at: Path = top ? [top[1][0] + 1] : [editor.children.length]
    editor.tf.insertNodes(item.make(editor), { at, select: true })
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Định dạng">
      <select className="tb-select" value={BLOCKS.some(([k]) => k === type) ? type : 'p'} aria-label="Kiểu khối"
        onChange={(e) => { editor.tf.toggleBlock(e.target.value); editor.tf.focus() }}>
        {BLOCKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="sep" />
      {MARKS.map(([k, icon, tip]) => <Btn key={k} on={!!marks[k]} tip={tip} onAct={() => editor.tf.toggleMark(k)}><I icon={icon} /></Btn>)}
      <span className="sep" />
      {ALIGNS.map(([k, icon, tip]) => <Btn key={k} on={align === k} tip={tip} onAct={() => setAlign(editor, k)}><I icon={icon} /></Btn>)}
      <Btn tip="Giảm thụt lề" onAct={() => outdent(editor)}><I icon={ListIndentDecrease} /></Btn>
      <Btn tip="Tăng thụt lề" onAct={() => indent(editor)}><I icon={ListIndentIncrease} /></Btn>
      <span className="sep" />
      {COLUMNS.map(([icon, tip, widths]) => <Btn key={tip} on={colCount === widths.length} tip={tip} onAct={() => applyColumns(widths)}><I icon={icon} /></Btn>)}
      <span className="sep" />
      {INSERTS.map(([k, icon, tip]) => <Btn key={k} tip={tip} onAct={() => insert(k)}><I icon={icon} /></Btn>)}
      <span className="tb-hint">Gõ <kbd>/</kbd> ở dòng trống để chèn khối</span>
    </div>
  )
}
