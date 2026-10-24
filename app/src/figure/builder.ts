// No-code chart builder: pick a chart type and columns -> generates readable Observable Plot / MapLibre JS code.
import {
  AreaChart, ChartColumn, ChartLine, ChartScatter, ChartNoAxesColumn, BarChartHorizontal, Box, Grid3x3, Table2, MapPin, Flame, Map as MapIcon,
  type LucideIcon,
} from 'lucide-react'
import { asRows } from '@/data/import'
import type { FigureParam } from '@/editor/types'
import type { Basemap } from './map'

export type ChartType = 'bar' | 'barh' | 'line' | 'area' | 'scatter' | 'histogram' | 'box' | 'heatmap' | 'table' | 'map-points' | 'map-heat' | 'map-regions'
export type Agg = 'none' | 'count' | 'sum' | 'mean' | 'median' | 'min' | 'max'
export type Channel = 'x' | 'y' | 'color' | 'size' | 'facet' | 'lat' | 'lon'

export type ChartSpec = {
  data: string
  type: ChartType
  x?: string; y?: string; color?: string; size?: string; facet?: string; lat?: string; lon?: string
  /** Optional dataset columns exposed as interactive scenario/filter controls on the figure. */
  filters?: string[]
  agg: Agg
  bins: number
  sort: 'none' | 'asc' | 'desc'
  xLabel?: string; yLabel?: string
  scheme: string
  basemap: Basemap
}

type ChannelInfo = { channel: Channel; label: string; required?: boolean; hint?: string }
export type ChartTypeInfo = { type: ChartType; label: string; icon: LucideIcon; channels: ChannelInfo[]; agg?: boolean; bins?: boolean; sort?: boolean; map?: boolean }

const C = (channel: Channel, label: string, required = false, hint?: string): ChannelInfo => ({ channel, label, required, hint })

export const CHART_TYPES: ChartTypeInfo[] = [
  { type: 'bar', label: 'Bar', icon: ChartColumn, agg: true, sort: true, channels: [C('x', 'Group (X axis)', true), C('y', 'Value (Y axis)', false, 'empty = count rows'), C('color', 'Color by'), C('facet', 'Facet by')] },
  { type: 'barh', label: 'Horizontal bar', icon: BarChartHorizontal, agg: true, sort: true, channels: [C('y', 'Group (Y axis)', true), C('x', 'Value (X axis)', false, 'empty = count rows'), C('color', 'Color by')] },
  { type: 'line', label: 'Line', icon: ChartLine, agg: true, channels: [C('x', 'X axis (time/number)', true), C('y', 'Y axis', true), C('color', 'One line per'), C('facet', 'Facet by')] },
  { type: 'area', label: 'Area', icon: AreaChart, agg: true, channels: [C('x', 'X axis', true), C('y', 'Y axis', true), C('color', 'Stack by')] },
  { type: 'scatter', label: 'Scatter', icon: ChartScatter, channels: [C('x', 'X axis', true), C('y', 'Y axis', true), C('color', 'Color by'), C('size', 'Size by'), C('facet', 'Facet by')] },
  { type: 'histogram', label: 'Histogram', icon: ChartNoAxesColumn, bins: true, channels: [C('x', 'Variable', true), C('color', 'Color by'), C('facet', 'Facet by')] },
  { type: 'box', label: 'Box plot', icon: Box, channels: [C('y', 'Value', true), C('x', 'Group')] },
  { type: 'heatmap', label: 'Heatmap', icon: Grid3x3, agg: true, channels: [C('x', 'Columns', true), C('y', 'Rows', true), C('color', 'Color value', false, 'empty = count rows')] },
  { type: 'table', label: 'Table', icon: Table2, agg: true, channels: [C('x', 'Group by', false, 'empty = show first rows'), C('y', 'Value column')] },
  { type: 'map-points', label: 'Point map', icon: MapPin, map: true, channels: [C('lat', 'Latitude', true), C('lon', 'Longitude', true), C('color', 'Color by'), C('size', 'Size by')] },
  { type: 'map-heat', label: 'Heat map', icon: Flame, map: true, channels: [C('lat', 'Latitude', true), C('lon', 'Longitude', true), C('size', 'Weight')] },
  { type: 'map-regions', label: 'Choropleth', icon: MapIcon, map: true, channels: [C('color', 'Color by property')] },
]

export const AGG_LABEL: Record<Agg, string> = { none: 'None', count: 'Count', sum: 'Sum', mean: 'Mean', median: 'Median', min: 'Min', max: 'Max' }
export const SCHEMES = [
  'blues', 'greens', 'oranges', 'reds', 'purples',
  'viridis', 'turbo', 'ylorrd', 'rdbu',
  'tableau10', 'observable10', 'set2',
] as const

export const SCHEME_META: Record<string, { label: string; primary: string; swatches: string[] }> = {
  blues:        { label: 'Blues',        primary: '#2a78d6', swatches: ['#bfdbfe', '#60a5fa', '#2a78d6', '#1e40af'] },
  greens:       { label: 'Greens',       primary: '#16a34a', swatches: ['#bbf7d0', '#4ade80', '#16a34a', '#166534'] },
  oranges:      { label: 'Oranges',      primary: '#ea580c', swatches: ['#fed7aa', '#fb923c', '#ea580c', '#9a3412'] },
  reds:         { label: 'Reds',         primary: '#dc2626', swatches: ['#fecaca', '#f87171', '#dc2626', '#991b1b'] },
  purples:      { label: 'Purples',      primary: '#7c3aed', swatches: ['#ddd6fe', '#a78bfa', '#7c3aed', '#4c1d95'] },
  viridis:      { label: 'Viridis',      primary: '#21918c', swatches: ['#440154', '#31688e', '#35b779', '#fde725'] },
  turbo:        { label: 'Turbo',        primary: '#0284c7', swatches: ['#30123b', '#28bbec', '#a2fc3c', '#7a0403'] },
  ylorrd:       { label: 'YlOrRd',       primary: '#e11d48', swatches: ['#fed976', '#fd8d3c', '#e31a1c', '#800026'] },
  rdbu:         { label: 'RdBu',         primary: '#2166ac', swatches: ['#b2182b', '#f4a582', '#92c5de', '#2166ac'] },
  tableau10:    { label: 'Tableau 10',   primary: '#4e79a7', swatches: ['#4e79a7', '#f28e2c', '#e15759', '#76b7b2'] },
  observable10: { label: 'Observable',   primary: '#4269d0', swatches: ['#4269d0', '#efb118', '#ff725c', '#6cc5b0'] },
  set2:         { label: 'Set 2',        primary: '#66c2a5', swatches: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3'] },
}

export const isCustomScheme = (scheme?: string) => !!scheme && scheme.trim().startsWith('#')

/** Parse a custom scheme string like "#2563eb" or "#2563eb,#8b5cf6,#ec4899" into valid hex stops. */
export function parseCustomColors(scheme?: string): string[] {
  if (!scheme) return ['#2a78d6']
  const list = scheme
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^#[0-9a-fA-F]{3,8}$/.test(s))
  return list.length ? list : ['#2a78d6']
}

function tintHex(hex: string, t: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6)
  const n = parseInt(full, 16)
  if (isNaN(n)) return hex
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c: number) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t))
  return '#' + [mix(r), mix(g), mix(b)].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('')
}

/** Return 2–5 hex stops suitable for categorical or continuous scales when using a custom color scheme. */
export function customScaleColors(scheme?: string): string[] {
  const cols = parseCustomColors(scheme)
  if (cols.length >= 2) return cols
  const base = cols[0]
  return [tintHex(base, 0.72), tintHex(base, 0.35), base, tintHex(base, -0.35)]
}

export const typeInfo = (t: ChartType) => CHART_TYPES.find((c) => c.type === t)!

export const defaultSpec = (data = ''): ChartSpec => ({ data, type: 'bar', agg: 'count', bins: 20, sort: 'none', scheme: 'blues', basemap: 'light' })

/** Return labels of any required channels that have not been assigned yet. */
export function missingChannels(s: ChartSpec) {
  return typeInfo(s.type).channels.filter((c) => c.required && !s[c.channel]).map((c) => c.label)
}

const q = (s?: string) => JSON.stringify(s ?? '')
const prop = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s) ? `d.${s}` : `d[${q(s)}]`

const RESERVED_IDENTS = new Set([
  'data', 'width', 'params', 'Plot', 'd3', 'pc', 'result', 'ket_qua', 'expose',
  'so_cot', 'ds', 'rawDs', 'chart', 'sorted', 'table', 'cot', 'isNum',
  'marginL', 'labelLen', 'rotate', 'nFacets',
])

/** Valid JS identifier for a filter parameter derived from a column name. */
export function filterParamName(col: string): string {
  const clean = col.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^(\d)/, '_$1') || 'filter'
  return RESERVED_IDENTS.has(clean) ? `filter_${clean}` : clean
}

// ---- Chart settings line: `const chart = {...}` keeps the Design tab and the code in sync both ways ----
const SPEC_KEYS: (keyof ChartSpec)[] = ['data', 'type', 'x', 'y', 'color', 'size', 'facet', 'lat', 'lon', 'filters', 'agg', 'bins', 'sort', 'xLabel', 'yLabel', 'scheme', 'basemap']
const CHART_LINE = /^const chart = (.*)$/m

export const chartLine = (s: ChartSpec) =>
  `const chart = ${JSON.stringify(Object.fromEntries(SPEC_KEYS.filter((k) => s[k] !== undefined && s[k] !== '' && !(Array.isArray(s[k]) && (s[k] as unknown[]).length === 0)).map((k) => [k, s[k]])))}`

/** Read the settings line back (JSON, or a plain JS object literal). Null if missing or not valid yet. */
export function parseChartLine(js: string): ChartSpec | null {
  const m = CHART_LINE.exec(js)
  if (!m) return null
  let o: unknown
  try { o = JSON.parse(m[1]) } catch { try { o = new Function(`return (${m[1]})`)() } catch { return null } }
  if (!o || typeof o !== 'object') return null
  const v = o as Partial<ChartSpec>
  if (typeof v.type !== 'string' || !CHART_TYPES.some((t) => t.type === v.type)) return null
  const picked = Object.fromEntries(SPEC_KEYS.filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, (v as Record<string, unknown>)[k]]))
  return { ...defaultSpec(String(v.data ?? '')), ...picked } as ChartSpec
}

/** The code without its settings line (to tell "only the settings changed" from "the code was edited"). */
export const withoutChartLine = (js: string) => js.replace(CHART_LINE, '')

/**
 * Code typed by the user, for a figure built with the Design tab. Returns the new spec and code when
 * only the settings line changed (the line is kept exactly as typed), 'pending' while that line is
 * being typed and not valid yet, or 'detached' when the code below it was edited.
 */
export function syncFromCode(spec: ChartSpec, js: string): { spec: ChartSpec; js: string } | 'pending' | 'detached' {
  if (withoutChartLine(js) !== withoutChartLine(codegen(spec))) return 'detached'
  const next = parseChartLine(js)
  if (!next) return 'pending'
  const typed = CHART_LINE.exec(js)![0]
  return { spec: next, js: codegen(next).replace(CHART_LINE, () => typed) }
}

/** Generate JS code (Observable Plot or MapLibre map) from a ChartSpec. */
export function codegen(s: ChartSpec): string {
  const info = typeInfo(s.type)
  /** Code that reads a column's display name (set in the Data panel) at run time. */
  const L = (col: string) => `pc.label(${q(s.data)}, ${q(col)})`
  const intro = `// Generated by the chart builder (Design tab).
// Edit the chart settings on the next line here or in the Design tab: the rest is regenerated.
// Editing the code below the settings detaches it from the Design tab.
${chartLine(s)}`
  const activeFilters = (s.filters ?? []).filter(Boolean)
  const filterExpr = activeFilters.length && s.type !== 'map-regions'
    ? activeFilters.map((c) => `(${filterParamName(c)} === "All" || String(${prop(c)}) === String(${filterParamName(c)}))`).join(' && ')
    : ''
  const head = filterExpr
    ? `${intro}\nconst ds = (data[${q(s.data)}] ?? []).filter((d) => ${filterExpr})`
    : `${intro}\nconst ds = data[${q(s.data)}] ?? []`
  if (!s.data) return `${intro}\nreturn "<p>Pick a dataset in the Design tab.</p>"`
  const miss = missingChannels(s)
  if (miss.length) return `${head}\nreturn "<p>Pick columns for: ${miss.join(', ')}.</p>"`

  if (info.map) {
    const opts = [`data: ds`, `kind: ${q(s.type === 'map-points' ? 'points' : s.type === 'map-heat' ? 'heat' : 'regions')}`,
      s.lat && `lat: ${q(s.lat)}`, s.lon && `lon: ${q(s.lon)}`, s.color && `color: ${q(s.color)}`, s.color && `colorLabel: ${L(s.color)}`, s.size && `size: ${q(s.size)}`,
      `scheme: ${q(s.scheme)}`, `basemap: ${q(s.basemap)}`, `width`].filter(Boolean)
    return `${head}\nexpose(Array.isArray(ds) ? ds.length : ds.features?.length)\nreturn pc.map({\n  ${opts.join(',\n  ')},\n})`
  }

  if (s.type === 'table') {
    if (!s.x) return `${head}
expose(ds.length)
const cot = Object.keys(ds[0] ?? {})
const isNum = (c) => ds.slice(0, 50).every((d) => d[c] == null || typeof d[c] === "number")
return \`<table class="fig-table typed"><thead><tr>\${cot.map((c) => \`<th\${isNum(c) ? ' class="num"' : ""}>\${pc.esc(pc.label(${q(s.data)}, c))}</th>\`).join("")}</tr></thead>
<tbody>\${ds.slice(0, 50).map((d) => \`<tr>\${cot.map((c) => \`<td\${isNum(c) ? ' class="num"' : ""}>\${pc.esc(d[c])}</td>\`).join("")}</tr>\`).join("")}</tbody></table>\``
    const fn = s.agg === 'count' || !s.y ? 'v.length' : `d3.${s.agg === 'none' ? 'sum' : s.agg}(v, (d) => ${prop(s.y)})`
    const head2 = s.agg === 'count' || !s.y ? q('Rows') : `${q(AGG_LABEL[s.agg === 'none' ? 'sum' : s.agg] + ' ')} + ${L(s.y)}`
    return `${head}
const table = d3.rollups(ds, (v) => ${fn}, (d) => ${prop(s.x)})${s.sort === 'desc' ? '.sort((a, b) => b[1] - a[1])' : s.sort === 'asc' ? '.sort((a, b) => a[1] - b[1])' : ''}
expose(table)
return \`<table class="fig-table typed"><thead><tr><th>\${pc.esc(${L(s.x)})}</th><th class="num">\${pc.esc(${head2})}</th></tr></thead>
<tbody>\${table.map(([k, v]) => \`<tr><td>\${pc.esc(k)}</td><td class="num">\${typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v}</td></tr>\`).join("")}</tbody></table>\``
  }

  const facet = s.facet ? `fy: ${q(s.facet)}` : ''
  const custom = isCustomScheme(s.scheme)
  const primaryHex = custom ? parseCustomColors(s.scheme)[0] : (SCHEME_META[s.scheme]?.primary ?? '#2a78d6')
  const color = (key: 'fill' | 'stroke') => (s.color ? `${key}: ${q(s.color)}` : `${key}: ${q(primaryHex)}`)
  const join = (...xs: string[]) => xs.filter(Boolean).join(', ')
  const agg = s.agg === 'none' ? 'sum' : s.agg
  let marks = ''
  let extra: string[] = []
  switch (s.type) {
    case 'bar': {
      const reducer = !s.y || s.agg === 'count' ? `{ y: "count" }` : `{ y: ${q(agg)} }`
      const sortOpt = s.sort === 'none' ? '' : `sort: { x: ${q(s.sort === 'desc' ? '-y' : 'y')} }`
      marks = `Plot.barY(ds, Plot.groupX(${reducer}, { ${join(`x: ${q(s.x)}`, s.y && s.agg !== 'count' ? `y: ${q(s.y)}` : '', color('fill'), facet, sortOpt, 'tip: true')} })),\n    Plot.ruleY([0])`
      break
    }
    case 'barh': {
      const reducer = !s.x || s.agg === 'count' ? `{ x: "count" }` : `{ x: ${q(agg)} }`
      const sortOpt = s.sort === 'none' ? '' : `sort: { y: ${q(s.sort === 'desc' ? '-x' : 'x')} }`
      marks = `Plot.barX(ds, Plot.groupY(${reducer}, { ${join(`y: ${q(s.y)}`, s.x && s.agg !== 'count' ? `x: ${q(s.x)}` : '', color('fill'), sortOpt, 'tip: true')} })),\n    Plot.ruleX([0])`
      extra = ['marginLeft: marginL']
      break
    }
    case 'line':
    case 'area': {
      const mark = s.type === 'line' ? 'lineY' : 'areaY'
      const key = s.type === 'line' ? 'stroke' : 'fill'
      const opts = join(`x: ${q(s.x)}`, `y: ${q(s.y)}`, s.color ? `${key}: ${q(s.color)}` : `${key}: ${q(primaryHex)}`, facet, 'tip: true')
      marks = s.agg === 'none' ? `Plot.${mark}(sorted, { ${opts} })` : `Plot.${mark}(sorted, Plot.groupX({ y: ${q(agg === 'count' ? 'count' : agg)} }, { ${opts} }))`
      if (s.type === 'area') marks += ',\n    Plot.ruleY([0])'
      break
    }
    case 'scatter':
      marks = `Plot.dot(ds, { ${join(`x: ${q(s.x)}`, `y: ${q(s.y)}`, color('fill'), s.size ? `r: ${q(s.size)}` : 'r: 3', facet, 'fillOpacity: 0.7', 'tip: true')} })`
      break
    case 'histogram':
      marks = `Plot.rectY(ds, Plot.binX({ y: "count" }, { ${join(`x: ${q(s.x)}`, color('fill'), facet, 'thresholds: so_cot', 'tip: true')} })),\n    Plot.ruleY([0])`
      break
    case 'box':
      marks = `Plot.boxY(ds, { ${join(s.x ? `x: ${q(s.x)}` : '', `y: ${q(s.y)}`, s.scheme && s.scheme !== 'blues' ? `fill: ${q(primaryHex)}` : '')} })`
      break
    case 'heatmap': {
      const reducer = !s.color || s.agg === 'count' ? `{ fill: "count" }` : `{ fill: ${q(agg)} }`
      marks = `Plot.cell(ds, Plot.group(${reducer}, { ${join(`x: ${q(s.x)}`, `y: ${q(s.y)}`, s.color && s.agg !== 'count' ? `fill: ${q(s.color)}` : '', 'tip: true')} }))`
      const heatScale = custom ? `range: ${JSON.stringify(customScaleColors(s.scheme))}` : `scheme: ${q(s.scheme)}`
      extra = [`color: { ${heatScale}, legend: true, label: ${s.color && s.agg !== 'count' ? L(s.color) : q('Count')} }`, 'marginLeft: marginL']
      break
    }
  }
  const colorScaleProp = custom
    ? `range: ${JSON.stringify(customScaleColors(s.scheme))}`
    : s.scheme && s.scheme !== 'blues'
      ? `scheme: ${q(s.scheme)}`
      : `scheme: typeof ds.find((d) => d[${q(s.color)}] != null)?.[${q(s.color)}] === "number" ? ${q(s.scheme)} : "tableau10"`
  const colorLegend = s.color && s.type !== 'heatmap'
    ? [`color: { legend: true, label: ${L(s.color)}, ${colorScaleProp} }`] : []
  const vn = 'tickFormat: (d) => typeof d === "number" ? d.toLocaleString("en-US") : d instanceof Date ? d.toLocaleDateString("en-US") : d'
  const xNumeric = s.type === 'barh' || s.type === 'scatter' || s.type === 'histogram' || s.type === 'line' || s.type === 'area'
  const yNumeric = s.type !== 'barh' && s.type !== 'heatmap'
  const xCat = (s.type === 'bar' || s.type === 'box' || s.type === 'heatmap') && !!s.x
  const yCat = s.type === 'barh' || s.type === 'heatmap'
  const pre = [
    yCat ? `const marginL = Math.min(220, 16 + 6.5 * (d3.max(ds, (d) => String(d[${q(s.y)}] ?? "").length) ?? 0))` : '',
    xCat ? `const labelLen = d3.max(ds, (d) => String(d[${q(s.x)}] ?? "").length) ?? 0
const rotate = labelLen * 7.5 * new Set(ds.map((d) => d[${q(s.x)}])).size > width - ${yCat ? 'marginL - 20' : '80'}` : '',
    s.type === 'line' || s.type === 'area' ? `const sorted = d3.sort(ds, (d) => d[${q(s.x)}])` : '',
    s.facet ? `const nFacets = new Set(ds.map((d) => d[${q(s.facet)}])).size` : '',
  ].filter(Boolean)
  const xCol = s.type === 'barh' ? (s.agg !== 'count' ? s.x : undefined) : s.x
  const yCol = s.type === 'bar' ? (s.agg !== 'count' ? s.y : undefined) : s.type === 'histogram' ? undefined : s.y
  const xLab = s.xLabel ? q(s.xLabel) : xCol ? L(xCol) : ''
  const yLab = s.yLabel ? q(s.yLabel) : yCol ? L(yCol) : ''
  const xOpts = [xLab ? `label: ${xLab}` : '', xNumeric ? vn : '', xCat ? 'tickRotate: rotate ? -35 : 0' : ''].filter(Boolean)
  const axes = [
    xOpts.length ? `x: { ${xOpts.join(', ')} }` : '',
    `y: { grid: true${yLab ? `, label: ${yLab}` : ''}${yNumeric ? `, ${vn}` : ''} }`,
    s.facet ? 'fy: { label: null }' : '',
  ].filter(Boolean)
  const layout = [
    s.facet ? 'height: Math.max(320, 120 * nFacets)' : 'height: 320',
    xCat ? 'marginBottom: rotate ? Math.min(130, 24 + 4.2 * labelLen) : 30' : '',
    xCat && !yCat ? 'marginLeft: rotate ? Math.max(50, Math.min(120, 5.2 * labelLen)) : 50' : '',
    s.facet ? `marginRight: Math.min(200, 16 + 6.5 * d3.max(ds, (d) => String(d[${q(s.facet)}] ?? "").length))` : '',
  ].filter(Boolean)
  return `${head}
${pre.length ? pre.join('\n') + '\n' : ''}expose(ds.length)
return Plot.plot({
  width,
  ${[...layout, ...extra, ...colorLegend, ...axes].join(',\n  ')},
  marks: [
    ${marks},
  ],
})`
}

/** Build a FigureParam from a dataset column's actual values. */
export function paramFromColumn(
  col: string,
  rows: Record<string, unknown>[],
  label?: string,
  includeAll = true,
): FigureParam {
  const name = filterParamName(col)
  const vals: (string | number | boolean)[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const v = r[col]
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      const k = String(v)
      if (!seen.has(k)) { seen.add(k); vals.push(v) }
    }
  }
  const allNumbers = vals.length > 0 && vals.every((v) => typeof v === 'number')
  if (allNumbers) vals.sort((a, b) => (a as number) - (b as number))

  if (!includeAll && allNumbers && vals.length > 15) {
    const nums = vals as number[]
    const min = nums[0], max = nums[nums.length - 1]
    const span = max - min || 1
    const rawStep = span / 20
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const step = +(Math.max(mag, Math.round(rawStep / mag) * mag)).toPrecision(4)
    return { name, label: label || col, kind: 'range', min, max, step, value: nums[Math.floor(nums.length / 2)] }
  }

  const options: (string | number | boolean)[] = includeAll ? ['All', ...vals.slice(0, 60)] : vals.slice(0, 60)
  if (options.length === 0) options.push('All')
  else if (options.length === 1 && !includeAll) options.push(options[0])
  const kind = options.length <= 4 ? 'radio' : 'select'
  return { name, label: label || col, kind, options, value: options[0], min: 0, max: 0, step: 1 }
}

/** Parameters (sliders / dropdowns / radio buttons) needed by a ChartSpec. */
export function specParams(s: ChartSpec, raw?: unknown, labels?: Record<string, string>): FigureParam[] {
  const out: FigureParam[] = s.type === 'histogram' ? [{ name: 'so_cot', label: 'Bins', min: 5, max: 80, step: 1, value: s.bins }] : []
  const rows = raw ? asRows(raw) : []
  for (const col of s.filters ?? []) {
    if (!col) continue
    const p = paramFromColumn(col, rows, labels?.[col] || col, true)
    if (!out.some((x) => x.name === p.name)) out.push(p)
  }
  return out
}
