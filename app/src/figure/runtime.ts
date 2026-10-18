// Chạy code JS của thẻ hình. Dữ liệu được phân tích một lần rồi dùng lại.
import * as Plot from '@observablehq/plot'
import * as d3 from 'd3'
import { createContext } from 'react'
import { esc, makeMap, type MapOptions } from './map'
import type { DataFile, FigureParam } from '../editor/types'
import { decodeResults, indexOf, type ScenarioCache } from './scenarios'

export type Dataset = Record<string, unknown>

/** Dữ liệu của tài liệu đang mở, dùng chung cho mọi thẻ hình. */
export const DataContext = createContext<{ files: DataFile[]; data: Dataset; setFiles: (f: DataFile[]) => void }>({ files: [], data: {}, setFiles: () => {} })

/** Tên file → tên biến hợp lệ: "trips.csv" → "trips". */
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

/** Chạy code JS với tham số và dữ liệu; kết quả là một phần tử DOM hoặc chuỗi HTML. */
export async function runFigure(js: string, params: FigureParam[], data: Dataset, width: number, scenarios?: ScenarioCache): Promise<RunOutput> {
  let exposed: unknown = undefined
  const expose = (v: unknown) => { exposed = v; return v }
  const names = params.map((p) => p.name)
  try {
    const fn = new AsyncFunction('Plot', 'd3', 'data', 'width', 'expose', 'params', 'pc', 'ket_qua', ...names, js)
    const values = Object.fromEntries(params.map((p) => [p.name, p.value]))
    // Kết quả Python đã tính sẵn cho tổ hợp tham số gần nhất (nếu có)
    const ketQua = scenarios ? (await decodeResults(scenarios.payload))[indexOf(scenarios.grid, values)] : undefined
    const pc = { map: (o: MapOptions) => makeMap({ width, ...o }), esc }
    const r = await fn(Plot, d3, data, width, expose, values, pc, ketQua, ...params.map((p) => p.value))
    if (r instanceof Node) return { node: r, html: null, exposed, error: null }
    if (typeof r === 'string') return { node: null, html: r, exposed, error: null }
    return { node: null, html: null, exposed, error: 'Code cần return một hình (Plot.plot(...)) hoặc một chuỗi HTML.' }
  } catch (e) {
    return { node: null, html: null, exposed, error: (e as Error).message || String(e) }
  }
}
