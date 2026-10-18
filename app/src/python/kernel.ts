// Giao tiếp với worker Python. Worker chỉ khởi động khi có người bấm "Kiểm chứng".
export type GridItem = { i: number; ok: boolean; value?: unknown; error?: string }
export type VerifyRaw = { value?: unknown; stdout?: string; error?: string }

type Listener = (s: { text: string; ready: boolean }) => void

class Kernel {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (r: VerifyRaw) => void; reject: (e: Error) => void }>()
  private listeners = new Set<Listener>()
  private gridHandlers = new Map<number, (item: GridItem) => void>()
  status = { text: 'Python not loaded', ready: false }

  private ensure() {
    if (this.worker) return this.worker
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      const m = e.data
      if (m.type === 'status') { this.status = { text: m.text, ready: !!m.ready }; this.listeners.forEach((l) => l(this.status)); return }
      if (m.type === 'grid-item') { this.gridHandlers.get(m.id)?.(m); return }
      const p = this.pending.get(m.id); if (!p) return
      this.pending.delete(m.id)
      if (m.ok) p.resolve(m.result); else p.reject(new Error(m.error))
    }
    this.worker = w
    return w
  }

  /** Chạy code Python gốc trên dữ liệu, trả về biến ket_qua. */
  verify(code: string, params: Record<string, unknown>, files: { key: string; kind: string; content: string }[]): Promise<VerifyRaw> {
    const id = ++this.seq
    const w = this.ensure()
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); w.postMessage({ id, type: 'verify', code, params, files }) })
  }

  /** Chạy code Python cho cả lưới tổ hợp trong trình duyệt; onItem được gọi sau mỗi tổ hợp. */
  runGrid(code: string, combos: Record<string, number | string | boolean>[], files: { key: string; kind: string; content: string }[], onItem: (it: GridItem) => void): Promise<void> {
    const id = ++this.seq
    const w = this.ensure()
    this.gridHandlers.set(id, onItem)
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => { this.gridHandlers.delete(id); resolve() }, reject: (e) => { this.gridHandlers.delete(id); reject(e) } })
      w.postMessage({ id, type: 'grid', code, combos, files })
    })
  }

  /** Dừng mọi việc đang chạy (tắt worker; lần sau tự khởi động lại). */
  cancel() {
    this.worker?.terminate(); this.worker = null
    this.pending.forEach((p) => p.reject(new Error('Stopped.')))
    this.pending.clear(); this.gridHandlers.clear()
    this.status = { text: 'Python not loaded', ready: false }; this.listeners.forEach((l) => l(this.status))
  }

  subscribe(l: Listener) { this.listeners.add(l); l(this.status); return () => { this.listeners.delete(l) } }
}

export const kernel = new Kernel()
