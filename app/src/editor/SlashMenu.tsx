import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Path, SlateEditor, TElement } from 'platejs'
import { useEditorRef } from 'platejs/react'
import {
  Columns2, Columns3, Heading1, Heading2, Heading3, Minus, Pilcrow, Quote, SlidersHorizontal, Sigma, SquareCode, type LucideIcon,
} from 'lucide-react'
import { paramValues } from './run'
import { newEquationNode, newId, newParamNode, newPythonNode } from './types'

type Item = { key: string; label: string; hint: string; icon: LucideIcon; words: string; make: (editor: SlateEditor) => TElement }

const text = (type: string) => () => ({ type, children: [{ text: '' }] }) as TElement
const columns = (widths: string[]) => () => ({
  type: 'column_group', id: newId(),
  children: widths.map((width) => ({ type: 'column', id: newId(), width, children: [{ type: 'p', children: [{ text: '' }] }] })),
}) as unknown as TElement

const uniqueParam = (editor: SlateEditor) => { const taken = paramValues(editor); let i = 1; while (`tham_so_${i}` in taken) i++; return `tham_so_${i}` }

export const ITEMS: Item[] = [
  { key: 'p', label: 'Đoạn văn', hint: 'Văn bản thường', icon: Pilcrow, words: 'doan van text p', make: text('p') },
  { key: 'h1', label: 'Tiêu đề 1', hint: 'Mục lớn', icon: Heading1, words: 'tieu de heading h1', make: text('h1') },
  { key: 'h2', label: 'Tiêu đề 2', hint: 'Mục vừa', icon: Heading2, words: 'tieu de heading h2', make: text('h2') },
  { key: 'h3', label: 'Tiêu đề 3', hint: 'Mục nhỏ', icon: Heading3, words: 'tieu de heading h3', make: text('h3') },
  { key: 'quote', label: 'Trích dẫn', hint: 'Đoạn trích', icon: Quote, words: 'trich dan quote', make: text('blockquote') },
  { key: 'python', label: 'Ô Python', hint: 'Code, hình, bảng', icon: SquareCode, words: 'python code o hinh bang', make: () => newPythonNode('# Viết code Python, nhấn Shift+Enter để chạy\n') as unknown as TElement },
  { key: 'param', label: 'Tham số', hint: 'Thanh trượt điều chỉnh hình', icon: SlidersHorizontal, words: 'tham so slider thanh truot param', make: (e) => newParamNode(uniqueParam(e)) as unknown as TElement },
  { key: 'equation', label: 'Công thức', hint: 'Công thức toán TeX', icon: Sigma, words: 'cong thuc toan equation math tex', make: () => newEquationNode() as unknown as TElement },
  { key: 'col2', label: '2 cột', hint: 'Chia đôi trang', icon: Columns2, words: 'cot columns 2 hai', make: columns(['50%', '50%']) },
  { key: 'col3', label: '3 cột', hint: 'Chia ba trang', icon: Columns3, words: 'cot columns 3 ba', make: columns(['33.33%', '33.33%', '33.34%']) },
  { key: 'hr', label: 'Đường kẻ', hint: 'Ngăn cách phần', icon: Minus, words: 'duong ke hr divider', make: text('hr') },
]

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase()

// ---- Trạng thái mở menu (một menu cho cả trình soạn) ----
type State = { open: boolean; path: Path; mode: 'replace' | 'after'; x: number; y: number }
let state: State = { open: false, path: [0], mode: 'after', x: 0, y: 0 }
const subs = new Set<() => void>()
const setState = (s: Partial<State>) => { state = { ...state, ...s }; subs.forEach((f) => f()) }

/** Mở menu tại khối `path`: 'replace' thay khối trống đó, 'after' chèn sau nó. */
export function openSlash(editor: SlateEditor, path: Path, mode: State['mode']) {
  const node = editor.api.node(path)?.[0]
  const rect = node ? (editor.api.toDOMNode(node) as HTMLElement | undefined)?.getBoundingClientRect() : undefined
  setState({ open: true, path, mode, x: rect?.left ?? 100, y: (rect?.bottom ?? 100) + 4 })
}

/** Gõ "/" ở một đoạn văn trống thì mở menu. Trả về true nếu đã xử lý. */
export function handleSlashKey(editor: SlateEditor, e: React.KeyboardEvent) {
  if (e.key !== '/' || e.ctrlKey || e.metaKey) return false
  const entry = editor.api.block()
  if (!entry) return false
  const [node, path] = entry as [TElement, Path]
  if (node.type !== 'p' || editor.api.string(path) !== '') return false
  e.preventDefault()
  openSlash(editor, path, 'replace')
  return true
}

/** Sau mỗi thay đổi: nếu đoạn văn đang gõ chỉ chứa đúng "/" thì xóa nó và mở menu (hoạt động với mọi bộ gõ). */
export function checkSlashTrigger(editor: SlateEditor) {
  if (state.open || !editor.selection || !editor.api.isCollapsed()) return
  const entry = editor.api.block()
  if (!entry) return
  const [node, path] = entry as [TElement, Path]
  if (node.type !== 'p' || editor.api.string(path) !== '/') return
  editor.tf.delete({ at: { anchor: editor.api.start(path)!, focus: editor.api.end(path)! } })
  openSlash(editor, path, 'replace')
}

export function SlashMenu() {
  const editor = useEditorRef()
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const items = useMemo(() => ITEMS.filter((it) => strip(it.label + ' ' + it.words).includes(strip(q))), [q])

  useEffect(() => { if (s.open) { setQ(''); setActive(0); requestAnimationFrame(() => input.current?.focus()) } }, [s.open])
  if (!s.open) return null

  const close = () => setState({ open: false })
  const choose = (it: Item) => {
    const node = it.make(editor)
    const at = s.mode === 'replace' ? s.path : [...s.path.slice(0, -1), s.path[s.path.length - 1] + 1]
    editor.tf.withoutNormalizing(() => {
      if (s.mode === 'replace') editor.tf.removeNodes({ at: s.path })
      editor.tf.insertNodes(node, { at })
    })
    close()
    editor.tf.select(editor.api.start(at) ?? at)
    editor.tf.focus()
  }

  return (
    <div className="slash-backdrop" onMouseDown={close}>
      <div className="slash" style={{ left: Math.min(s.x, innerWidth - 300), top: Math.min(s.y, innerHeight - 380) }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Chèn khối">
        <input ref={input} value={q} placeholder="Tìm khối: python, cột, công thức…" aria-label="Tìm loại khối"
          onChange={(e) => { setQ(e.target.value); setActive(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) choose(items[active]) }
            else if (e.key === 'Escape') { close(); editor.tf.focus() }
          }} />
        <div className="slash-list" role="listbox">
          {items.map((it, i) => (
            <button key={it.key} type="button" role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseEnter={() => setActive(i)} onClick={() => choose(it)}>
              <it.icon size={17} strokeWidth={1.7} />
              <span><b>{it.label}</b><small>{it.hint}</small></span>
            </button>
          ))}
          {!items.length && <p className="slash-empty">Không có khối nào khớp "{q}"</p>}
        </div>
      </div>
    </div>
  )
}
