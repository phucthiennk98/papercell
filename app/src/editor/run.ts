import type { SlateEditor, TElement } from 'platejs'
import { kernel } from '../python/kernel'
import type { ParamNode, PythonNode } from './types'

let execCounter = 0
const running = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const isRunning = (id: string) => running.has(id)
export const onRunningChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Kernel đã chạy đủ mọi ô từ khi khởi động chưa (để biết có thể chỉ chạy lại một phần). */
let warm = false
kernel.onRestart(() => { warm = false })

const isType = (t: string) => (n: unknown) => (n as TElement).type === t
const cellsOf = (editor: SlateEditor) => [...editor.api.nodes({ at: [], match: isType('python') })].map(([n]) => n as unknown as PythonNode)

/** Giá trị hiện tại của mọi tham số trong bài, theo tên biến. */
export function paramValues(editor: SlateEditor) {
  const out: Record<string, number> = {}
  for (const [n] of editor.api.nodes({ at: [], match: isType('param') })) { const p = n as unknown as ParamNode; if (p.name) out[p.name] = p.value }
  return out
}

const findPath = (editor: SlateEditor, id: string) =>
  editor.api.node({ at: [], match: (n) => (n as TElement).type === 'python' && (n as any).id === id })?.[1]

/** Chạy một ô và ghi kết quả vào tài liệu. */
export async function runCell(editor: SlateEditor, id: string, code: string) {
  running.add(id); emit()
  try {
    const r = await kernel.run(code, paramValues(editor))
    const at = findPath(editor, id)
    if (at) editor.tf.setNodes({ outputs: r.outputs, stdout: r.stdout, stderr: r.stderr, error: r.error, execCount: ++execCounter } as Partial<PythonNode>, { at })
    return !r.error
  } catch (e) {
    const at = findPath(editor, id)
    if (at) editor.tf.setNodes({ error: String((e as Error).message), outputs: [] } as Partial<PythonNode>, { at })
    return false
  } finally {
    running.delete(id); emit()
  }
}

/** Chạy lần lượt mọi ô theo thứ tự trong bài, dừng ở ô lỗi đầu tiên. */
export async function runAll(editor: SlateEditor) {
  for (const c of cellsOf(editor)) if (!(await runCell(editor, c.id, c.code))) return false
  warm = true
  return true
}

// ---- Phụ thuộc giữa ô và tham số ----
const ASSIGN = /^[ \t]*([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)[ \t]*[-+*/%@&|^]?=(?!=)/gm
const DEF = /^[ \t]*(?:def|class)[ \t]+([A-Za-z_]\w*)/gm
const FOR = /^[ \t]*for[ \t]+([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)[ \t]+in\b/gm

function definedNames(code: string) {
  const names = new Set<string>()
  for (const re of [ASSIGN, DEF, FOR]) for (const m of code.matchAll(re)) m[1].split(',').forEach((s) => names.add(s.trim()))
  return names
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Các ô cần chạy lại khi tham số `name` đổi: ô nhắc tới nó, và ô dùng biến mà những ô đó tạo ra. */
export function dependentCells(cells: PythonNode[], name: string) {
  const dirty = new Set([name]); const out: PythonNode[] = []
  for (const c of cells) {
    const re = new RegExp(`\\b(${[...dirty].map(escape).join('|')})\\b`)
    if (re.test(c.code)) { out.push(c); definedNames(c.code).forEach((n) => dirty.add(n)) }
  }
  return out
}

// Mỗi tham số chỉ chạy một lượt tại một thời điểm; đổi tiếp trong lúc chạy thì chạy thêm đúng một lượt với giá trị mới nhất.
const busy = new Map<string, boolean>()
const again = new Set<string>()

export async function rerunForParam(editor: SlateEditor, name: string) {
  if (busy.get(name)) { again.add(name); return }
  busy.set(name, true)
  try {
    do {
      again.delete(name)
      if (!warm) { await runAll(editor); continue }
      for (const c of dependentCells(cellsOf(editor), name)) if (!(await runCell(editor, c.id, c.code))) break
    } while (again.has(name))
  } finally { busy.set(name, false) }
}
