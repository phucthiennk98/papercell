/** Display mode for a figure card in the article. */
export type FigureDisplay = 'output' | 'both' | 'code' | 'hidden'
/** Which code tabs readers are allowed to inspect in the figure dialog. */
export type CodeAccess = 'none' | 'js' | 'python' | 'both'

export type ParamValue = number | string | boolean
/** How a parameter is shown to readers: a slider, a dropdown, radio buttons or an on/off switch. */
export type ParamKind = 'range' | 'select' | 'radio' | 'toggle'
/** Kinds that pick one value from a list of options. */
export const isChoice = (k: ParamKind) => k === 'select' || k === 'radio'
export type FigureParam = {
  name: string; label: string
  /** Empty = 'range' (slider). */
  kind?: ParamKind
  /** Slider bounds (range only). */
  min: number; max: number; step: number
  value: ParamValue
  unit?: string
  /** Choices of a dropdown or radio buttons. */
  options?: (string | number | boolean)[]
}
export const paramKind = (p: FigureParam): ParamKind => p.kind ?? 'range'

import type { ChartSpec } from '@/figure/builder'
import type { ScenarioCache } from '@/figure/scenarios'

export type VerifyResult = { ok: boolean; message: string; at: string }

export type FigureNode = {
  type: 'figure'
  id: string
  caption: string
  /** JS rendering code: receives Plot, d3, data, width, expose(), and each parameter as a local variable. */
  js: string
  /** Researcher's reference Python code used for verification and scenario precomputation. */
  python: string
  params: FigureParam[]
  display: FigureDisplay
  codeAccess: CodeAccess
  verify?: VerifyResult
  /** Present when the figure is driven by the visual chart builder; JS code is generated from this spec. */
  spec?: ChartSpec
  /** True once the user manually edits the JS code so the Design tab stops overwriting it. */
  specDetached?: boolean
  /** Caption label: numbered as a Figure or a Table (separate counters), or not numbered. Empty = automatic. */
  label?: CaptionKind
  /** Inner padding around the chart (px). Empty = the document default (DocMeta.figurePadding). */
  padding?: number
  /** Backup of custom JS code before switching to the Design builder, used by "Restore previous code". */
  codeBackup?: { js: string; params: FigureParam[]; spec?: ChartSpec; specDetached?: boolean }
  /** Precomputed Python outputs across the parameter grid (enables Python-free HTML export). */
  scenarios?: ScenarioCache
  /** Automatically open the figure dialog on the Design tab right after insertion. */
  autoOpen?: boolean
  children: [{ text: '' }]
}

export type EquationNode = { type: 'equation'; id: string; texExpression: string; children: [{ text: '' }] }

export type CaptionKind = 'figure' | 'table' | 'none'

export const CAPTION_LABEL: Record<CaptionKind, string> = { figure: 'Figure', table: 'Table', none: 'No number' }

export type DataFile = {
  name: string; kind: 'csv' | 'json'; content: string
  /** Display names for columns (column → label). Empty = use the column name from the file. */
  labels?: Record<string, string>
}

export type DocMeta = {
  title: string; authors: string; date: string
  /** Default inner padding of figure cards (px); figures can override it. */
  figurePadding?: number
}

export const DEFAULT_FIG_PADDING = 12

export type PapercellDoc = {
  version: 3
  meta: DocMeta
  data: DataFile[]
  content: any[]
}

export const DISPLAY_LABEL: Record<FigureDisplay, string> = {
  output: 'Figure only',
  both: 'Figure + code below',
  code: 'Code only',
  hidden: 'Hidden when published',
}

export const ACCESS_LABEL: Record<CodeAccess, string> = {
  none: 'No code visible',
  js: 'JS code only',
  python: 'Original Python only',
  both: 'Python and JS',
}

export const newId = () => Math.random().toString(36).slice(2, 10)

export const STARTER_JS = `// Available: Plot, d3, data (attached datasets), width, expose(value)
// Each parameter is a local variable of the same name. Return a DOM node (Plot.plot) or HTML string.
const ds = data[Object.keys(data)[0]] ?? []
return Plot.plot({
  width,
  marks: [Plot.text(["New figure: open it to write code"], { frameAnchor: "middle" })],
})`

export const newFigureNode = (): FigureNode => ({
  type: 'figure', id: newId(), caption: '', js: STARTER_JS, python: '', params: [],
  display: 'output', codeAccess: 'both', children: [{ text: '' }],
})

export const newEquationNode = (tex = 'E = mc^2'): EquationNode => ({ type: 'equation', id: newId(), texExpression: tex, children: [{ text: '' }] })
