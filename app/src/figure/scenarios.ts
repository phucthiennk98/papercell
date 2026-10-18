// "Kịch bản tính sẵn": chạy Python gốc cho mọi tổ hợp tham số một lần (trên máy tác giả),
// nén kết quả vào tài liệu; khi đọc bài chỉ tra kết quả theo vị trí thanh trượt, không cần Python.
import type { DataFile, FigureNode, FigureParam } from '@/editor/types'
import { packText, unpackText } from '@/lib/pack'

export type GridAxis = { name: string; values: number[] }

export type ScenarioCache = {
  /** Lưới đã tính: mỗi tham số một dãy giá trị. Tổ hợp xếp theo thứ tự: tham số cuối thay đổi nhanh nhất. */
  grid: GridAxis[]
  /** Kết quả (biến ket_qua của Python) cho từng tổ hợp, nén gzip rồi mã base64. */
  payload: string
  count: number
  bytes: number
  /** Dấu vân tay của code Python + dữ liệu + lưới; đổi một trong ba là kết quả cũ. */
  fingerprint: string
  engine: 'local' | 'pyodide'
  at: string
  seconds: number
  failed: number
}

/** Lưới tính sẵn mặc định: đi từ min tới max theo bước của thanh trượt. */
export function axisValues(p: FigureParam, step = p.step): number[] {
  const n = Math.floor((p.max - p.min) / step + 1e-9) + 1
  const dec = (String(step).split('.')[1] ?? '').length
  return Array.from({ length: n }, (_, i) => +(p.min + i * step).toFixed(dec))
}

export const comboCount = (grid: GridAxis[]) => grid.reduce((n, a) => n * a.values.length, 1)

/** Tổ hợp thứ i của lưới (tham số cuối thay đổi nhanh nhất). */
export function comboAt(grid: GridAxis[], i: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (let k = grid.length - 1; k >= 0; k--) {
    const len = grid[k].values.length
    out[grid[k].name] = grid[k].values[i % len]
    i = Math.floor(i / len)
  }
  return out
}

/** Vị trí của bộ giá trị tham số trong lưới; mỗi tham số lấy giá trị lưới gần nhất. */
export function indexOf(grid: GridAxis[], values: Record<string, number>): number {
  let idx = 0
  for (const a of grid) {
    const v = values[a.name] ?? a.values[0]
    let best = 0
    a.values.forEach((x, j) => { if (Math.abs(x - v) < Math.abs(a.values[best] - v)) best = j })
    idx = idx * a.values.length + best
  }
  return idx
}

/** Giá trị lưới gần nhất (để thanh trượt "bắt" vào đúng điểm đã tính). */
export function snap(grid: GridAxis[], name: string, v: number) {
  const a = grid.find((g) => g.name === name); if (!a) return v
  return a.values.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), a.values[0])
}

// ---- Nén: JSON → gzip → base64 (trình duyệt tự làm bằng CompressionStream) ----
export async function encodeResults(results: unknown[]): Promise<{ payload: string; bytes: number }> {
  const { b64, bytes } = await packText(JSON.stringify(results))
  return { payload: b64, bytes }
}

const decoded = new Map<string, Promise<unknown[]>>()
/** Giải nén một lần rồi nhớ lại (theo nội dung). */
export function decodeResults(payload: string): Promise<unknown[]> {
  const key = payload.length + ':' + payload.slice(0, 48) + payload.slice(-48)
  if (!decoded.has(key)) {
    decoded.set(key, (async () => {
      return JSON.parse(await unpackText(payload)) as unknown[]
    })())
  }
  return decoded.get(key)!
}

// ---- Dấu vân tay ----
async function sha256(text: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
export const fingerprint = (fig: Pick<FigureNode, 'python'>, files: DataFile[], grid: GridAxis[]) =>
  sha256(JSON.stringify({ code: fig.python, data: files.map((f) => [f.name, f.content.length, f.content]), grid }))

export const formatBytes = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? Math.ceil(b / 1e3) + ' KB' : b + ' B')
