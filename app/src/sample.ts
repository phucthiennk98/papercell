import type { DataFile, FigureNode, PapercellDoc } from './editor/types'

export const SAMPLE_TITLE = 'Travel behavior around a metro line'
export const LEGACY_SAMPLE_TITLE = 'Hành vi đi lại quanh một tuyến metro'

// ---- Synthetic data: 5,000 trips around 14 stations (fixed seed) ----
function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function makeData(): DataFile[] {
  const rnd = mulberry32(7)
  const normal = (m: number, s: number) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const stations = Array.from({ length: 14 }, (_, i) => {
    const x = (18 * i) / 13
    return { station: `S${String(i + 1).padStart(2, '0')}`, x: +x.toFixed(3), y: +(3 * Math.sin(x / 4.5) + 0.2 * x).toFixed(3) }
  })
  const rows: string[] = ['x,y,hour,distance_km,station']
  for (let i = 0; i < 5000; i++) {
    const s = stations[Math.floor(rnd() * stations.length)]
    const dist = -0.6 * Math.log(1 - rnd()), angle = 2 * Math.PI * rnd()
    const hour = Math.min(23, Math.max(5, Math.round(i < 2500 ? normal(7.5, 1) : normal(17.8, 1.2))))
    rows.push([(s.x + dist * Math.cos(angle)).toFixed(3), (s.y + dist * Math.sin(angle)).toFixed(3), hour, dist.toFixed(2), s.station].join(','))
  }
  return [
    { name: 'trips.csv', kind: 'csv', content: rows.join('\n') },
    { name: 'stations.csv', kind: 'csv', content: ['station,x,y', ...stations.map((s) => `${s.station},${s.x},${s.y}`)].join('\n') },
  ]
}

const RADIUS = { name: 'radius_km', label: 'Station radius', min: 0.2, max: 3, step: 0.1, value: 1.5, unit: 'km' }

const fig = (id: string, caption: string, js: string, python: string, params: FigureNode['params'], extra: Partial<FigureNode> = {}) =>
  ({ type: 'figure', id, caption, js, python, params, display: 'output', codeAccess: 'both', children: [{ text: '' }], ...extra })

const MAP_JS = `const nearby = data.trips.filter(d => d.distance_km <= radius_km)
expose(nearby.length)
return Plot.plot({
  width,
  aspectRatio: 1,
  x: { label: "East (km)" },
  y: { label: "North (km)" },
  color: { scheme: "blues", legend: true, label: "Trips" },
  marks: [
    Plot.dot(nearby, Plot.hexbin({ fill: "count" }, { x: "x", y: "y", binWidth: bin_width })),
    Plot.line(data.stations, { x: "x", y: "y", stroke: "#1f2937" }),
    Plot.dot(data.stations, { x: "x", y: "y", r: 3, fill: "#1f2937" }),
    Plot.text([\`\${nearby.length.toLocaleString("en-US")} trips within \${radius_km.toLocaleString("en-US")} km\`],
      { frameAnchor: "top-left", dx: 4, dy: 4, fontSize: 11 }),
  ],
})`

const MAP_PY = `import matplotlib.pyplot as plt

trips, stations = data["trips"], data["stations"]
nearby = trips[trips.distance_km <= radius_km]

fig, ax = plt.subplots(figsize=(5, 3.4))
ax.hexbin(nearby.x, nearby.y, gridsize=24, cmap="Blues", mincnt=1)
ax.plot(stations.x, stations.y, "o-", color="#1f2937")
ax.set_xlabel("East (km)")
ax.set_ylabel("North (km)")

ket_qua = len(nearby)`

const HOURS_JS = `const nearby = data.trips.filter(d => d.distance_km <= radius_km)
const counts = d3.rollup(nearby, v => v.length, d => d.hour)
expose(counts)
return Plot.plot({
  width,
  height: 260,
  x: { label: "Hour of day" },
  y: { label: "Trips", grid: true },
  marks: [
    Plot.barY(nearby, Plot.groupX({ y: "count" }, { x: "hour", fill: "#2a78d6", tip: true })),
    Plot.ruleY([0]),
  ],
})`

const HOURS_PY = `trips = data["trips"]
nearby = trips[trips.distance_km <= radius_km]
counts = nearby.groupby("hour").size()

ax = counts.plot.bar(color="#2a78d6")
ax.set_xlabel("Hour of day")
ax.set_ylabel("Trips")

ket_qua = counts`

const TABLE_JS = `const bands = [[0, 0.5, "under 0.5 km"], [0.5, 1, "0.5–1 km"], [1, 2, "1–2 km"], [2, Infinity, "over 2 km"]]
const total = data.trips.length
const table = bands.map(([a, b, band]) => {
  const n = data.trips.filter(d => d.distance_km > a && d.distance_km <= b).length
  return { band, trips: n, share: Math.round(1000 * n / total) / 10 }
})
expose(table)
return \`<table class="fig-table">
  <thead><tr><th>Distance to station</th><th>Trips</th><th>Share</th></tr></thead>
  <tbody>\${table.map(r => \`<tr><td>\${r.band}</td><td>\${r.trips.toLocaleString("en-US")}</td><td>\${r.share.toLocaleString("en-US")}%</td></tr>\`).join("")}</tbody>
</table>\``

const TABLE_PY = `import pandas as pd

trips = data["trips"]
band = pd.cut(trips.distance_km, [0, 0.5, 1, 2, float("inf")],
              labels=["under 0.5 km", "0.5–1 km", "1–2 km", "over 2 km"])
table = trips.groupby(band, observed=False).size().reset_index()
table.columns = ["band", "trips"]
table["share"] = (100 * table.trips / len(trips)).round(1)

ket_qua = table`

const p = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'p', ...extra, children: [{ text }] })
const h = (level: 1 | 2 | 3, text: string, id: string) => ({ type: 'h' + level, id, children: [{ text }] })
const cols = (widths: string[], ...columns: any[][]) => ({ type: 'column_group', children: columns.map((children, i) => ({ type: 'column', width: widths[i], children })) })

export function makeSample(): PapercellDoc {
  return {
    version: 3,
    meta: { title: SAMPLE_TITLE, authors: 'Sample author · Papercell', date: '2026-10-18' },
    data: makeData(),
    content: [
      h(2, 'Abstract', 's-abstract'),
      p('This is a sample Papercell article. Each figure is an interactive JS card with built-in parameter controls. Click any figure to open a larger view. The dataset consists of 5,000 synthetic trips around 14 metro stations (fixed random seed, not real-world data).', { align: 'justify' }),
      h(2, '1. Data and methods', 's-methods'),
      p('Each trip represents a geocoded origin. The distance d from a trip origin to its nearest station follows an exponential distribution with mean μ = 0.6 km:', { align: 'justify' }),
      { type: 'equation', id: 'eq1', texExpression: String.raw`f(d) = \frac{1}{\mu}\, e^{-d/\mu}, \qquad d \ge 0`, children: [{ text: '' }] },
      cols(['40%', '60%'],
        [
          p('Figure 1 shows trip density concentrated along the metro corridor and tapering off with distance from stations.', { align: 'justify' }),
          p('Every figure stores both the author’s original Python code and the converted JS code. In Edit mode, open a figure and select the "Verify" tab to compare the outputs of both versions on the same dataset.', { align: 'justify' }),
        ],
        [fig('map', 'Hexbin trip density around the metro corridor.', MAP_JS, MAP_PY,
          [RADIUS, { name: 'bin_width', label: 'Hexbin size', min: 8, max: 30, step: 1, value: 16, unit: 'px' }])],
      ),
      h(2, '2. Results', 's-results'),
      cols(['55%', '45%'],
        [fig('hours', 'Trips by hour of day: morning and evening commute peaks.', HOURS_JS, HOURS_PY, [RADIUS])],
        [fig('table', 'Trip distribution by distance to the nearest station.', TABLE_JS, TABLE_PY, [], { codeAccess: 'python' })],
      ),
      p('More than half of all trips originate within 1 km of a metro station. Drag the sliders inside each figure to explore how the results change.', { align: 'justify' }),
    ],
  }
}
