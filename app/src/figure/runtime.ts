// Execute figure card JS code with cached parsed datasets.
import * as Plot from '@observablehq/plot'
import * as d3 from 'd3'
import { createContext } from 'react'
import { esc, makeMap, type MapOptions } from './map'
import type { DataFile, FigureParam } from '../editor/types'
import { decodeResults, indexOf, type ScenarioCache } from './scenarios'

export type Dataset = Record<string, unknown>
/** Column display names per dataset: labels[dataset][column]. */
export type Labels = Record<string, Record<string, string>>

export const labelsOf = (files: DataFile[]): Labels => Object.fromEntries(files.map((f) => [dataKey(f.name), f.labels ?? {}]))

/** Active document datasets shared across all figure cards. */
export const DataContext = createContext<{ files: DataFile[]; data: Dataset; setFiles: (f: DataFile[]) => void }>({ files: [], data: {}, setFiles: () => {} })

/** Convert filename to a valid JS identifier: "trips.csv" → "trips". */
export const dataKey = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1')

const cache = new Map<string, unknown>()
export function parseData(files: DataFile[]): Dataset {
  const out: Dataset = {}
  for (const f of files) {
    const k = `${f.name}:${f.content.length}:${f.content.slice(0, 64)}`
    if (!cache.has(k)) {
      try { cache.set(k, f.kind === 'csv' ? d3.csvParse(f.content, d3.autoType) : JSON.parse(f.content)) }
      catch { cache.set(k, null) }
    }
    out[dataKey(f.name)] = cache.get(k)
  }
  return out
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>

export type RunOutput = { node: Node | null; html: string | null; exposed: unknown; error: string | null }

/** Execute figure JS with current parameters and datasets, returning a DOM element or HTML string. */
export async function runFigure(js: string, params: FigureParam[], data: Dataset, width: number, scenarios?: ScenarioCache, labels: Labels = {}): Promise<RunOutput> {
  let exposed: unknown = undefined
  const expose = (v: unknown) => { exposed = v; return v }
  const names = params.map((p) => p.name)
  try {
    const fn = new AsyncFunction('Plot', 'd3', 'data', 'width', 'expose', 'params', 'pc', 'result', 'ket_qua', ...names, js)
    const values = Object.fromEntries(params.map((p) => [p.name, p.value]))
    // Nearest precomputed Python scenario output for the current parameter values (if available)
    const ketQua = scenarios ? (await decodeResults(scenarios.payload))[indexOf(scenarios.grid, values)] : undefined
    // pc.label(dataset, column): the column's display name set in the Data panel, or the column name itself
    const label = (ds: string, col: string) => labels[ds]?.[col]?.trim() || col
    const pc = { map: (o: MapOptions) => makeMap({ width, ...o }), esc, label }
    const r = await fn(Plot, d3, data, width, expose, values, pc, ketQua, ketQua, ...params.map((p) => p.value))
    if (r instanceof Node) return { node: r, html: null, exposed, error: null }
    if (typeof r === 'string') return { node: null, html: r, exposed, error: null }
    return { node: null, html: null, exposed, error: 'The code must return a figure (Plot.plot(...)) or an HTML string.' }
  } catch (e) {
    return { node: null, html: null, exposed, error: (e as Error).message || String(e) }
  }
}
