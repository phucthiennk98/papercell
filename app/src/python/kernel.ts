// Client bridge to the Pyodide Web Worker, lazily started when the user triggers Python verification.
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

  /** Execute reference Python code on the active datasets and return the exposed result. */
  verify(code: string, params: Record<string, unknown>, files: { key: string; kind: string; content: string }[]): Promise<VerifyRaw> {
    const id = ++this.seq
    const w = this.ensure()
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); w.postMessage({ id, type: 'verify', code, params, files }) })
  }

  /** Execute reference Python code across the parameter grid in the browser, calling onItem after each combination. */
  runGrid(code: string, combos: Record<string, number | string | boolean>[], files: { key: string; kind: string; content: string }[], onItem: (it: GridItem) => void): Promise<void> {
    const id = ++this.seq
    const w = this.ensure()
    this.gridHandlers.set(id, onItem)
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve: () => { this.gridHandlers.delete(id); resolve() }, reject: (e) => { this.gridHandlers.delete(id); reject(e) } })
      w.postMessage({ id, type: 'grid', code, combos, files })
    })
  }

  /** Terminate the running Pyodide worker (automatically respawns on next request). */
  cancel() {
    this.worker?.terminate(); this.worker = null
    this.pending.forEach((p) => p.reject(new Error('Stopped.')))
    this.pending.clear(); this.gridHandlers.clear()
    this.status = { text: 'Python not loaded', ready: false }; this.listeners.forEach((l) => l(this.status))
  }

  subscribe(l: Listener) { this.listeners.add(l); l(this.status); return () => { this.listeners.delete(l) } }
}

export const kernel = new Kernel()
