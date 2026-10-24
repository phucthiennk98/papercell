// Precomputed scenarios: run Local Python (ket_qua) or JavaScript (expose(value)) across every parameter combination once,
// compress the results into the document, and look up the precomputed result on slider movement when reading.
import { isChoice, paramKind, type DataFile, type FigureNode, type FigureParam, type ParamValue } from '@/editor/types'
import { packText, unpackText } from '@/lib/pack'

export type GridAxis = { name: string; values: ParamValue[] }

export type ScenarioCache = {
  /** Precomputed grid: one array of values per parameter. Combinations ordered with the last parameter varying fastest. */
  grid: GridAxis[]
  /** Result (ket_qua from Python or expose() from JS) for each combination, gzip-compressed and base64-encoded. */
  payload: string
  count: number
  bytes: number
  /** Fingerprint of the source code + data + grid; changing any of them marks cached results stale. */
  fingerprint: string
  engine: 'local' | 'js' | 'pyodide'
  at: string
  seconds: number
  failed: number
}

/** Values to precompute: a slider goes from min to max by `step`; a dropdown uses its options; a switch is off/on. */
export function axisValues(p: FigureParam, step = p.step): ParamValue[] {
  const kind = paramKind(p)
  if (isChoice(kind)) return [...(p.options ?? [])]
  if (kind === 'toggle') return [false, true]
  const n = Math.floor((p.max - p.min) / step + 1e-9) + 1
  const dec = (String(step).split('.')[1] ?? '').length
  return Array.from({ length: n }, (_, i) => +(p.min + i * step).toFixed(dec))
}

export const comboCount = (grid: GridAxis[]) => grid.reduce((n, a) => n * a.values.length, 1)

/** Combination #i of the grid (last parameter changes fastest). */
export function comboAt(grid: GridAxis[], i: number): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {}
  for (let k = grid.length - 1; k >= 0; k--) {
    const len = grid[k].values.length
    out[grid[k].name] = grid[k].values[i % len]
    i = Math.floor(i / len)
  }
  return out
}

/** Position of one axis value: nearest grid number for sliders, exact match for dropdowns and switches. */
function nearest(a: GridAxis, v: ParamValue | undefined): number {
  if (typeof v === 'number' && a.values.every((x) => typeof x === 'number')) {
    let best = 0
    a.values.forEach((x, j) => { if (Math.abs((x as number) - v) < Math.abs((a.values[best] as number) - v)) best = j })
    return best
  }
  const j = a.values.findIndex((x) => String(x) === String(v))
  return j < 0 ? 0 : j
}

/** Index of a parameter value dictionary in the grid. */
export function indexOf(grid: GridAxis[], values: Record<string, ParamValue>): number {
  let idx = 0
  for (const a of grid) idx = idx * a.values.length + nearest(a, values[a.name] ?? a.values[0])
  return idx
}

/** Nearest grid value (so sliders snap to precomputed points). */
export function snap(grid: GridAxis[], name: string, v: number): number {
  const a = grid.find((g) => g.name === name); if (!a) return v
  const x = a.values[nearest(a, v)]
  return typeof x === 'number' ? x : v
}

// ---- Compression: JSON -> gzip -> base64 (native CompressionStream in browser) ----
export async function encodeResults(results: unknown[]): Promise<{ payload: string; bytes: number }> {
  const { b64, bytes } = await packText(JSON.stringify(results))
  return { payload: b64, bytes }
}

const decoded = new Map<string, Promise<unknown[]>>()
/** Decompress once and memoize by payload signature. */
export function decodeResults(payload: string): Promise<unknown[]> {
  const key = payload.length + ':' + payload.slice(0, 48) + payload.slice(-48)
  if (!decoded.has(key)) {
    decoded.set(key, (async () => {
      return JSON.parse(await unpackText(payload)) as unknown[]
    })())
  }
  return decoded.get(key)!
}

// ---- Fingerprint ----
async function sha256(text: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}
export const fingerprint = (
  fig: Pick<FigureNode, 'python' | 'js'>,
  files: DataFile[],
  grid: GridAxis[],
  engine: ScenarioCache['engine'] = 'local',
) =>
  sha256(JSON.stringify({
    engine: engine === 'js' ? 'js' : 'python',
    code: engine === 'js' ? fig.js : fig.python,
    data: files.map((f) => [f.name, f.content.length, f.content]),
    grid,
  }))

export const formatBytes = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b > 1e3 ? Math.ceil(b / 1e3) + ' KB' : b + ' B')
