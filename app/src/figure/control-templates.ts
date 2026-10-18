// Templates whose readers get controls: dropdowns, radio buttons, on/off switches (and a slider).
// Each carries its own sample data so it draws right away.
import { ChartLine, ChartNoAxesColumn, ChartScatter, MapPin, SlidersHorizontal } from 'lucide-react'
import type { FigureParam } from '@/editor/types'
import type { FigureTemplate } from './templates'

const HEAD = (what: string) => `// ${what}
// Every control below the figure is a variable here (dropdown/radio → the chosen option, switch → true/false).
// Uses sample data: replace \`ds\` with data.<file> to use the document's data.`

const select = (name: string, label: string, options: (string | number)[], value: string | number): FigureParam =>
  ({ name, label, kind: 'select', options, value, min: 0, max: 0, step: 1 })
const radio = (name: string, label: string, options: (string | number)[], value: string | number): FigureParam =>
  ({ name, label, kind: 'radio', options, value, min: 0, max: 0, step: 1 })
const toggle = (name: string, label: string, value: boolean): FigureParam =>
  ({ name, label, kind: 'toggle', value, min: 0, max: 1, step: 1 })

/** People with numeric attributes, generated with a fixed seed (same data every time). */
const PEOPLE = `const u = d3.randomUniform.source(d3.randomLcg(6))(0, 1)
const n = d3.randomNormal.source(d3.randomLcg(7))(0, 1)
const ds = d3.range(300).map(() => {
  const age = Math.round(18 + 55 * u())
  const income = Math.max(2, 4 + age * 0.12 + 2 * n())
  const travel_min = Math.max(5, 42 - income * 1.3 + 8 * n())
  const satisfaction = Math.min(10, Math.max(1, 8.2 - travel_min / 14 + 1.2 * n()))
  return { age, income: +income.toFixed(1), travel_min: Math.round(travel_min), satisfaction: +satisfaction.toFixed(1) }
})`

export const CONTROL_TEMPLATES: FigureTemplate[] = [
  {
    id: 'controls-bar', label: 'Bar chart with controls', hint: 'Dropdown variable, radio Top N, switch to sort', icon: SlidersHorizontal,
    keywords: ['controls', 'dropdown', 'radio', 'switch', 'bar', 'interactive'], caption: 'Cities compared on a variable the reader chooses.',
    params: [select('metric', 'Variable', ['population', 'income', 'green_space'], 'income'), radio('top_n', 'Show', [3, 5, 8], 5), toggle('sort_desc', 'Sort by value', true)],
    js: `${HEAD('Bar chart with reader controls')}
const ds = [
  { city: "Hanoi", population: 8.4, income: 10.4, green_space: 2.1 },
  { city: "Ho Chi Minh City", population: 9.4, income: 11.8, green_space: 1.4 },
  { city: "Da Nang", population: 1.2, income: 8.9, green_space: 5.6 },
  { city: "Hai Phong", population: 2.1, income: 7.6, green_space: 3.2 },
  { city: "Can Tho", population: 1.3, income: 7.1, green_space: 4.4 },
  { city: "Hue", population: 1.2, income: 6.3, green_space: 6.8 },
  { city: "Nha Trang", population: 0.5, income: 7.4, green_space: 4.9 },
  { city: "Vung Tau", population: 0.5, income: 8.8, green_space: 5.2 },
]
const units = { population: "Population (million)", income: "Income (million VND / month)", green_space: "Green space (m² / person)" }
let rows = ds.slice()
if (sort_desc) rows.sort((a, b) => b[metric] - a[metric])
rows = rows.slice(0, top_n)
expose(rows.map(d => d[metric]))
return Plot.plot({
  width, height: 50 + 32 * rows.length, marginLeft: 120,
  x: { label: units[metric], grid: true },
  y: { label: null, domain: rows.map(d => d.city) },
  marks: [
    Plot.barX(rows, { y: "city", x: metric, fill: "#2a78d6", tip: true }),
    Plot.ruleX([0]),
  ],
})`,
  },
  {
    id: 'controls-line', label: 'Line chart: pick a series', hint: 'Radio to pick a region, switches to smooth and show points', icon: ChartLine,
    keywords: ['controls', 'radio', 'switch', 'line', 'time', 'series'], caption: 'Monthly values; the reader picks a region.',
    params: [radio('region', 'Region', ['All', 'North', 'Central', 'South'], 'All'), toggle('smooth', 'Smooth (5-month average)', false), toggle('show_points', 'Show points', true)],
    js: `${HEAD('Line chart: radio buttons pick the series, switches change the style')}
const rnd = d3.randomNormal.source(d3.randomLcg(5))(0, 4)
const regions = ["North", "Central", "South"]
const ds = regions.flatMap((r, k) => d3.range(36).map((i) => ({
  month: new Date(2023, i, 1), region: r,
  value: 40 + 10 * k + i * 0.6 + 8 * Math.sin((i + 3 * k) / 4) + rnd(),
})))
const rows = region === "All" ? ds : ds.filter(d => d.region === region)
expose(rows.length)
return Plot.plot({
  width, height: 300,
  x: { label: "Month" }, y: { label: "Value", grid: true },
  color: { legend: region === "All", scheme: "tableau10", domain: regions },
  marks: [
    smooth
      ? Plot.lineY(rows, Plot.windowY({ k: 5 }, { x: "month", y: "value", stroke: "region", strokeWidth: 2 }))
      : Plot.lineY(rows, { x: "month", y: "value", stroke: "region", strokeWidth: 1.5 }),
    show_points ? Plot.dot(rows, { x: "month", y: "value", fill: "region", r: 2.2, tip: true }) : null,
  ],
})`,
  },
  {
    id: 'controls-scatter', label: 'Scatter: choose the axes', hint: 'Dropdowns for X and Y, switch for the trend line', icon: ChartScatter,
    keywords: ['controls', 'dropdown', 'switch', 'scatter', 'correlation', 'axes'], caption: 'Relationship between two variables the reader chooses.',
    params: [select('x_var', 'X axis', ['age', 'income', 'travel_min', 'satisfaction'], 'income'), select('y_var', 'Y axis', ['age', 'income', 'travel_min', 'satisfaction'], 'travel_min'), toggle('trend', 'Trend line', true)],
    js: `${HEAD('Scatter plot: dropdowns choose both axes')}
${PEOPLE}
// Pearson correlation between the two chosen variables
const mx = d3.mean(ds, d => d[x_var]), my = d3.mean(ds, d => d[y_var])
const r = d3.sum(ds, d => (d[x_var] - mx) * (d[y_var] - my))
  / Math.sqrt(d3.sum(ds, d => (d[x_var] - mx) ** 2) * d3.sum(ds, d => (d[y_var] - my) ** 2))
expose(+r.toFixed(3))
return Plot.plot({
  width, height: 320,
  x: { label: x_var }, y: { label: y_var, grid: true },
  marks: [
    Plot.dot(ds, { x: x_var, y: y_var, r: 3, fill: "#2a78d6", fillOpacity: 0.55, tip: true }),
    trend ? Plot.linearRegressionY(ds, { x: x_var, y: y_var, stroke: "#e45d2f" }) : null,
    Plot.text([\`r = \${r.toFixed(2)}\`], { frameAnchor: "top-right", dx: -6, dy: 6, fontSize: 12 }),
  ],
})`,
  },
  {
    id: 'controls-hist', label: 'Histogram: choose a variable', hint: 'Dropdown variable, slider bins, switch for percent', icon: ChartNoAxesColumn,
    keywords: ['controls', 'dropdown', 'switch', 'slider', 'histogram', 'distribution'], caption: 'Distribution of a variable the reader chooses.',
    params: [select('variable', 'Variable', ['age', 'income', 'travel_min', 'satisfaction'], 'income'), { name: 'bins', label: 'Bins', min: 5, max: 50, step: 1, value: 20 }, toggle('as_share', 'Show as %', false)],
    js: `${HEAD('Histogram: dropdown picks the variable, a slider sets the bins')}
${PEOPLE}
expose(d3.mean(ds, d => d[variable]))
return Plot.plot({
  width, height: 280,
  x: { label: variable }, y: { label: as_share ? "Share" : "Count", grid: true, percent: as_share },
  marks: [
    Plot.rectY(ds, Plot.binX({ y: as_share ? "proportion" : "count" }, { x: variable, thresholds: bins, fill: "#2a78d6", tip: true })),
    Plot.ruleY([0]),
  ],
})`,
  },
  {
    id: 'controls-map', label: 'Map with controls', hint: 'Dropdown basemap, radio points or heat map', icon: MapPin,
    keywords: ['controls', 'dropdown', 'radio', 'map', 'basemap', 'heat'], caption: 'Cities on a map; the reader picks the basemap and the style.',
    params: [select('basemap', 'Basemap', ['light', 'streets', 'bright', 'dark'], 'light'), radio('kind', 'Show as', ['points', 'heat'], 'points')],
    js: `${HEAD('Map: dropdown picks the basemap, radio buttons switch points / heat map')}
const ds = [
  { city: "Hanoi", lat: 21.03, lon: 105.85, value: 84 }, { city: "Ho Chi Minh City", lat: 10.78, lon: 106.7, value: 94 },
  { city: "Da Nang", lat: 16.05, lon: 108.2, value: 12 }, { city: "Hai Phong", lat: 20.86, lon: 106.68, value: 21 },
  { city: "Can Tho", lat: 10.03, lon: 105.78, value: 13 }, { city: "Hue", lat: 16.46, lon: 107.59, value: 12 },
  { city: "Nha Trang", lat: 12.24, lon: 109.19, value: 5 }, { city: "Vinh", lat: 18.67, lon: 105.69, value: 6 },
  { city: "Buon Ma Thuot", lat: 12.67, lon: 108.04, value: 5 }, { city: "Quy Nhon", lat: 13.78, lon: 109.22, value: 5 },
]
expose(ds.length)
return pc.map({ data: ds, kind, lat: "lat", lon: "lon", size: "value", color: kind === "points" ? "value" : undefined, basemap, width })`,
  },
]
