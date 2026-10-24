// No-op Python kernel stub for exported HTML files where scenario results are precomputed.
const off = () => Promise.reject(new Error('Published files do not run Python.'))
export type GridItem = { i: number; ok: boolean; value?: unknown; error?: string }
export const kernel = { status: { text: 'No Python', ready: false }, verify: off, runGrid: off, cancel() {}, subscribe: () => () => {} }
