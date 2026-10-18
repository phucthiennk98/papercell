import type { SlateEditor, TElement } from 'platejs'
import { kernel } from '../python/kernel'
import type { PythonNode } from './types'

let execCounter = 0
const running = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const isRunning = (id: string) => running.has(id)
export const onRunningChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

const findPath = (editor: SlateEditor, id: string) => {
  const entry = editor.api.node({ at: [], match: (n) => (n as TElement).type === 'python' && (n as any).id === id })
  return entry?.[1]
}

/** Chạy một ô và ghi kết quả vào tài liệu. */
export async function runCell(editor: SlateEditor, id: string, code: string) {
  running.add(id); emit()
  try {
    const r = await kernel.run(code)
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
  const cells = [...editor.api.nodes({ at: [], match: (n) => (n as TElement).type === 'python' })].map(([n]) => n as unknown as PythonNode)
  for (const c of cells) if (!(await runCell(editor, c.id, c.code))) break
}
