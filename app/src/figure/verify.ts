// So kết quả của Python gốc (biến ket_qua) với JS (giá trị truyền vào expose()).
import { kernel } from '../python/kernel'
import type { DataFile, FigureNode, VerifyResult } from '../editor/types'
import { dataKey, parseData, runFigure } from './runtime'

type Leaf = [path: string, value: unknown]

/** Trải phẳng một giá trị lồng nhau thành danh sách (đường dẫn, giá trị lá); khóa đối tượng được sắp xếp. */
function flatten(v: unknown, path = '', out: Leaf[] = []): Leaf[] {
  if (v instanceof Map) v = Object.fromEntries(v)
  if (v instanceof Date) v = v.toISOString()
  if (Array.isArray(v)) v.forEach((x, i) => flatten(x, `${path}[${i}]`, out))
  else if (v && typeof v === 'object') Object.keys(v as object).sort().forEach((k) => flatten((v as any)[k], path ? `${path}.${k}` : k, out))
  else out.push([path, v])
  return out
}

const close = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 + 1e-6 * Math.max(Math.abs(a), Math.abs(b))
  return String(a) === String(b)
}

export async function verifyFigure(fig: FigureNode, files: DataFile[]): Promise<VerifyResult> {
  const at = new Date().toISOString()
  if (!fig.python.trim()) return { ok: false, message: 'Chưa có code Python gốc để đối chiếu.', at }
  const js = await runFigure(fig.js, fig.params, parseData(files), 600)
  if (js.error) return { ok: false, message: 'Code JS lỗi: ' + js.error, at }
  if (js.exposed === undefined) return { ok: false, message: 'Code JS chưa gọi expose(giá_trị) để đưa ra kết quả so sánh.', at }

  const params = Object.fromEntries(fig.params.map((p) => [p.name, p.value]))
  let py
  try { py = await kernel.verify(fig.python, params, files.map((f) => ({ key: dataKey(f.name), kind: f.kind, content: f.content }))) }
  catch (e) { return { ok: false, message: 'Không chạy được Python: ' + (e as Error).message, at } }
  if (py.error) return { ok: false, message: 'Code Python lỗi: ' + py.error, at }

  const a = flatten(py.value), b = flatten(js.exposed)
  const mapB = new Map(b)
  const missing = a.filter(([p]) => !mapB.has(p)).length
  const extra = b.length - (a.length - missing)
  const wrong = a.filter(([p, v]) => mapB.has(p) && !close(v, mapB.get(p)))
  if (!missing && !extra && !wrong.length) return { ok: true, message: `Khớp ${a.length}/${a.length} giá trị (tham số hiện tại).`, at }
  const first = wrong[0] ? ` Ví dụ ${wrong[0][0] || 'giá trị'}: Python = ${String(wrong[0][1])}, JS = ${String(mapB.get(wrong[0][0]))}.` : ''
  return { ok: false, message: `Không khớp: ${wrong.length} giá trị khác, ${missing} thiếu, ${Math.max(0, extra)} thừa.${first}`, at }
}
