// Giao tiếp với worker Python từ giao diện.
export type CellOutput = { mime: 'image/svg+xml' | 'text/html' | 'text/plain'; data: string }
export type RunResult = { stdout: string; stderr: string; outputs: CellOutput[]; error: string | null }

type Listener = (s: { text: string; ready: boolean }) => void

class Kernel {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<number, { resolve: (r: RunResult) => void; reject: (e: Error) => void }>()
  private listeners = new Set<Listener>()
  status = { text: 'Python chưa khởi động', ready: false }

  private ensure() {
    if (this.worker) return this.worker
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e) => {
      const m = e.data
      if (m.type === 'status') { this.status = { text: m.text, ready: !!m.ready }; this.listeners.forEach((l) => l(this.status)); return }
      const p = this.pending.get(m.id); if (!p) return
      this.pending.delete(m.id)
      if (m.ok) p.resolve(m.result) ; else p.reject(new Error(m.error))
    }
    this.worker = w
    return w
  }

  start() { this.ensure() }

  run(code: string, params: Record<string, unknown> = {}): Promise<RunResult> {
    const id = ++this.seq
    const w = this.ensure()
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); w.postMessage({ id, type: 'run', code, params }) })
  }

  /** Khởi động lại: xóa toàn bộ biến. */
  restart() {
    this.worker?.terminate(); this.worker = null
    this.pending.forEach((p) => p.reject(new Error('Kernel đã khởi động lại')))
    this.pending.clear()
    this.ensure()
  }

  subscribe(l: Listener) { this.listeners.add(l); l(this.status); return () => { this.listeners.delete(l) } }
}

export const kernel = new Kernel()
