// Chart templates for quick insertion. Each template carries sample data so it draws right away;
// replace `ds` with data.<file> to use the document's data.
import { Database, ChartColumn, ChartLine, ChartScatter, ChartNoAxesColumn, Hexagon, Table2, SquareCode, FlaskConical, type LucideIcon } from 'lucide-react'
import { newId, type FigureNode, type FigureParam } from '@/editor/types'
import { codegen, defaultSpec, specParams, type ChartType } from './builder'
import { CONTROL_TEMPLATES } from './control-templates'

export type FigureTemplate = { id: string; label: string; hint: string; icon: LucideIcon; keywords: string[]; js: string; python?: string; params?: FigureParam[]; caption?: string }

const HEAD = (what: string) => `// ${what}
// Available: Plot, d3, data.<file>, width, expose(value); every parameter is a variable.
// Uses sample data: replace \`ds\` with data.<file> to use the document's data.`

export const FIGURE_TEMPLATES: FigureTemplate[] = [
  {
    id: 'data', label: 'From data (pick columns)', hint: 'Load CSV, Excel… then pick columns, no code', icon: Database,
    keywords: ['data', 'csv', 'excel', 'columns'], js: '',
  },
  {
    id: 'bar', label: 'Bar chart', hint: 'Compare values across groups', icon: ChartColumn, keywords: ['bar', 'column'],
    js: `${HEAD('Bar chart')}
const ds = [
  { group: "Group A", value: 28 }, { group: "Group B", value: 55 },
  { group: "Group C", value: 43 }, { group: "Group D", value: 91 }, { group: "Group E", value: 64 },
]
expose(ds)
return Plot.plot({
  width, height: 280, marginLeft: 48,
  x: { label: null },
  y: { grid: true, label: "Value" },
  marks: [
    Plot.barY(ds, { x: "group", y: "value", fill: "#2a78d6", tip: true }),
    Plot.ruleY([0]),
  ],
})`,
  },
  {
    id: 'line', label: 'Line chart', hint: 'Trend over time', icon: ChartLine, keywords: ['line', 'time', 'trend'],
    params: [{ name: 'window_size', label: 'Smoothing (points)', min: 1, max: 15, step: 1, value: 1 }],
    js: `${HEAD('Line chart with moving-average smoothing')}
const rnd = d3.randomNormal.source(d3.randomLcg(1))(0, 6)
const ds = d3.range(60).map((i) => ({ month: i + 1, value: 50 + i * 0.8 + 12 * Math.sin(i / 5) + rnd() }))
expose(ds.length)
return Plot.plot({
  width, height: 280,
  x: { label: "Month" },
  y: { grid: true, label: "Value" },
  marks: [
    Plot.line(ds, { x: "month", y: "value", stroke: "#94a3b8", strokeWidth: 1 }),
    Plot.line(ds, Plot.windowY({ k: window_size, x: "month", y: "value", stroke: "#2a78d6", strokeWidth: 2 })),
  ],
})`,
  },
  {
    id: 'scatter', label: 'Scatter plot', hint: 'Relationship between two variables', icon: ChartScatter, keywords: ['scatter', 'correlation'],
    params: [{ name: 'dot_size', label: 'Dot size', min: 1, max: 8, step: 0.5, value: 3 }],
    js: `${HEAD('Scatter plot with a linear regression line')}
const rnd = d3.randomNormal.source(d3.randomLcg(2))(0, 8)
const ds = d3.range(150).map(() => { const x = Math.random() * 100; return { x, y: 0.6 * x + 10 + rnd() } })
expose(ds.length)
return Plot.plot({
  width, height: 300,
  x: { label: "Variable X" },
  y: { grid: true, label: "Variable Y" },
  marks: [
    Plot.dot(ds, { x: "x", y: "y", r: dot_size, fill: "#2a78d6", fillOpacity: 0.6 }),
    Plot.linearRegressionY(ds, { x: "x", y: "y", stroke: "#e45d2f" }),
  ],
})`,
  },
  {
    id: 'histogram', label: 'Histogram', hint: 'Distribution of one variable', icon: ChartNoAxesColumn, keywords: ['histogram', 'distribution', 'frequency'],
    params: [{ name: 'bins', label: 'Bins', min: 5, max: 60, step: 1, value: 20 }],
    js: `${HEAD('Histogram: distribution of a numeric variable')}
const rnd = d3.randomExponential.source(d3.randomLcg(3))(1 / 0.6)
const ds = d3.range(2000).map(() => ({ distance: rnd() }))
expose(ds.length)
return Plot.plot({
  width, height: 280,
  x: { label: "Distance (km)" },
  y: { grid: true, label: "Count" },
  marks: [
    Plot.rectY(ds, Plot.binX({ y: "count" }, { x: "distance", thresholds: bins, fill: "#2a78d6", tip: true })),
    Plot.ruleY([0]),
  ],
})`,
  },
  {
    id: 'hexbin', label: 'Density (hexbin)', hint: 'Point density in hexagonal cells', icon: Hexagon, keywords: ['map', 'density', 'hexbin', 'hexagon'],
    params: [{ name: 'cell_size', label: 'Cell size', min: 6, max: 30, step: 1, value: 14, unit: 'px' }],
    js: `${HEAD('Density map: points binned into hexagons')}
const rx = d3.randomNormal.source(d3.randomLcg(4))
const ds = [...d3.range(800).map(() => ({ x: rx(10, 3)(), y: rx(5, 2)() })), ...d3.range(500).map(() => ({ x: rx(20, 2)(), y: rx(9, 1.5)() }))]
expose(ds.length)
return Plot.plot({
  width, aspectRatio: 1,
  x: { label: "East (km)" }, y: { label: "North (km)" },
  color: { scheme: "blues", legend: true, label: "Points" },
  marks: [Plot.dot(ds, Plot.hexbin({ fill: "count" }, { x: "x", y: "y", binWidth: cell_size }))],
})`,
  },
  {
    id: 'table', label: 'Summary table', hint: 'HTML summary table', icon: Table2, keywords: ['table', 'summary'],
    js: `${HEAD('Summary table: returns an HTML string')}
const ds = [
  { metric: "Observations", value: 5000 },
  { metric: "Mean (km)", value: 0.6 },
  { metric: "Median (km)", value: 0.42 },
]
expose(ds)
return \`<table class="fig-table typed">
  <thead><tr><th>Metric</th><th class="num">Value</th></tr></thead>
  <tbody>\${ds.map((r) => \`<tr><td>\${r.metric}</td><td class="num">\${r.value.toLocaleString("en-US")}</td></tr>\`).join("")}</tbody>
</table>\``,
  },
  {
    id: 'model', label: 'Python model (precomputed)', hint: 'Heavy Python runs ahead for every combination; readers only move sliders', icon: FlaskConical,
    keywords: ['python', 'model', 'precompute', 'scenario', 'simulation'],
    caption: 'Spatial diffusion of a behavior',
    params: [
      { name: 'influence', label: 'Neighbor influence', min: 0.05, max: 0.5, step: 0.05, value: 0.15 },
      { name: 'radius', label: 'Neighborhood radius', min: 0.02, max: 0.2, step: 0.02, value: 0.06 },
    ],
    python: `# Behavior diffusion: at each step, people who have not adopted yet are influenced by neighbors within the radius.
# This code only runs on the author's computer (Precompute tab); readers get the precomputed results.
import numpy as np

rng = np.random.default_rng(7)
n = 800
xy = rng.random((n, 2))
d = np.sqrt(((xy[:, None, :] - xy[None, :, :]) ** 2).sum(-1))
near = (d < radius) & (d > 0)
adopted = rng.random(n) < 0.02

share = []
for step in range(40):
    neighbors = near[:, adopted].sum(1)
    p = 1 - (1 - influence) ** neighbors
    adopted = adopted | (rng.random(n) < p)
    share.append(round(float(adopted.mean()), 4))

ket_qua = [{"step": i + 1, "share": v} for i, v in enumerate(share)]
`,
    js: `// Draws from the precomputed Python result (ket_qua); nothing is recomputed in the browser.
if (!ket_qua) return '<div class="fig-empty">Not precomputed yet. Open the figure (✎) → <b>Precompute</b> tab → press <b>Run</b>.</div>'
expose(ket_qua)
return Plot.plot({
  width, height: 280,
  x: { label: "Step" },
  y: { grid: true, label: "Share adopted", percent: true, domain: [0, 100] },
  marks: [
    Plot.areaY(ket_qua, { x: "step", y: "share", fill: "#2a78d6", fillOpacity: 0.12 }),
    Plot.line(ket_qua, { x: "step", y: "share", stroke: "#2a78d6", strokeWidth: 2, tip: true }),
    Plot.ruleY([0]),
  ],
})`,
  },
  ...CONTROL_TEMPLATES,
  {
    id: 'blank', label: 'Blank figure', hint: 'Write your own code, or ask AI', icon: SquareCode, keywords: ['blank', 'code', 'js'],
    js: `${HEAD('Blank figure')}
return Plot.plot({ width, height: 160, marks: [Plot.text(["Open the figure (✎) to write code"], { frameAnchor: "middle", fontSize: 14 })] })`,
  },
]

export const figureFromTemplate = (t: FigureTemplate): FigureNode => {
  if (t.id === 'data') {
    const spec = defaultSpec('')
    return { type: 'figure', id: newId(), caption: '', js: codegen(spec), python: '', params: [], spec, autoOpen: true, display: 'output', codeAccess: 'both', children: [{ text: '' }] }
  }
  return {
    type: 'figure', id: newId(), caption: t.id === 'blank' ? '' : t.caption ?? t.label, js: t.js, python: t.python ?? '',
    params: (t.params ?? []).map((p) => ({ ...p })), display: 'output', codeAccess: 'both', children: [{ text: '' }],
  }
}

function insertNode(editor: any, node: FigureNode) {
  const block = editor.api.block()
  const emptyPara = block && block[0].type === 'p' && editor.api.isEmpty(block[0])
  if (emptyPara) editor.tf.replaceNodes(node, { at: block[1] })
  else editor.tf.insertNodes(node, { select: true })
}

/** Insert a figure from a template after the selected block (or in place of an empty paragraph). */
export function insertFigure(editor: any, templateId: string) {
  const t = FIGURE_TEMPLATES.find((x) => x.id === templateId) ?? FIGURE_TEMPLATES[FIGURE_TEMPLATES.length - 1]
  insertNode(editor, figureFromTemplate(t))
}

/** Insert a chart-builder figure of `type`; the dialog opens on the Design tab to pick columns. */
export function insertChart(editor: any, type: ChartType) {
  const spec = { ...defaultSpec(''), type }
  insertNode(editor, { type: 'figure', id: newId(), caption: '', js: codegen(spec), python: '', params: specParams(spec), spec, autoOpen: true, display: 'output', codeAccess: 'both', children: [{ text: '' }] })
}
