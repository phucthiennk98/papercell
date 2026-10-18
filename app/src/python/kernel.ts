// Giao tiếp với worker Python. Worker chỉ khởi động khi có người bấm "Kiểm chứng".
export type VerifyRaw = { value?: unknown; stdout?: string; error?: string }

type Listener = (s: { text: string; ready: boolean }) => void

class Kernel {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (r: VerifyRaw) => void; reject: (e: Error) => void }>()
  private listeners = new Set<Listener>()
  status = { text: 'Python chưa tải', ready: false }

  private ensure() {
    if (this.worker) return this.worker
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      const m = e.data
      if (m.type === 'status') { this.status = { text: m.text, ready: !!m.ready }; this.listeners.forEach((l) => l(this.status)); return }
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

  subscribe(l: Listener) { this.listeners.add(l); l(this.status); return () => { this.listeners.delete(l) } }
}

export const kernel = new Kernel()
