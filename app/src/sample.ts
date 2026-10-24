import type { DataFile, FigureNode, PapercellDoc } from './editor/types'

export const SAMPLE_TITLE = 'Urban Microclimate & Tree Canopy Cooling'
export const LEGACY_SAMPLE_TITLE = 'Hành vi đi lại quanh một tuyến metro'
export const LEGACY_SAMPLE_TITLE_EN = 'Travel behavior around a metro line'
export const LEGACY_SAMPLE_TITLE_LONG = 'Urban Microclimate & Tree Canopy Cooling: Empirical Evidence and Spatial Modeling'

// ---- Synthetic microclimate dataset: 5,000 urban sensor observations across 14 transect stations (fixed seed) ----
function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

function makeData(): DataFile[] {
  const rnd = mulberry32(7)
  const normal = (m: number, s: number) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const stations = Array.from({ length: 14 }, (_, i) => {
    const x = (18 * i) / 13
    return {
      station: `T${String(i + 1).padStart(2, '0')}`,
      x: +x.toFixed(3),
      y: +(3 * Math.sin(x / 4.5) + 0.2 * x).toFixed(3),
    }
  })
  const rows: string[] = ['x,y,hour,distance_km,canopy_pct,temp_anomaly_c,station']
  for (let i = 0; i < 5000; i++) {
    const s = stations[Math.floor(rnd() * stations.length)]
    const dist = -0.6 * Math.log(1 - rnd())
    const angle = 2 * Math.PI * rnd()
    const hour = Math.min(23, Math.max(5, Math.round(i < 2200 ? normal(14.5, 2.2) : normal(18.5, 1.8))))
    const canopy = Math.min(68, Math.max(4, +(46 * Math.exp(-dist / 1.4) + normal(0, 5.5)).toFixed(1)))
    const anomaly = +(3.8 * (1 - 0.0085 * canopy) * (1 - 0.35 * Math.exp(-dist / 0.8)) + normal(0, 0.32)).toFixed(2)
    rows.push([
      (s.x + dist * Math.cos(angle)).toFixed(3),
      (s.y + dist * Math.sin(angle)).toFixed(3),
      hour,
      dist.toFixed(2),
      canopy,
      anomaly,
      s.station,
    ].join(','))
  }

  const cities = [
    ['Singapore', 1.35, 103.82, 47.2, 2.1, 3.4],
    ['Tokyo', 35.68, 139.65, 22.8, 3.6, 2.3],
    ['Seoul', 37.57, 126.98, 27.4, 3.2, 2.6],
    ['Taipei', 25.03, 121.56, 34.5, 2.7, 2.9],
    ['Ho Chi Minh City', 10.78, 106.7, 14.6, 4.3, 1.7],
    ['Hanoi', 21.03, 105.85, 19.2, 3.9, 2.1],
    ['Bangkok', 13.76, 100.5, 16.1, 4.1, 1.8],
    ['Kuala Lumpur', 3.14, 101.69, 31.8, 2.9, 2.8],
    ['Manila', 14.6, 120.98, 12.4, 4.5, 1.5],
    ['Jakarta', -6.21, 106.85, 15.3, 4.2, 1.7],
    ['Sydney', -33.87, 151.21, 39.6, 2.4, 3.1],
    ['Melbourne', -37.81, 144.96, 36.1, 2.5, 3.0],
  ]

  return [
    { name: 'sensors.csv', kind: 'csv', content: rows.join('\n') },
    { name: 'transects.csv', kind: 'csv', content: ['station,x,y', ...stations.map((s) => `${s.station},${s.x},${s.y}`)].join('\n') },
    {
      name: 'cities.csv',
      kind: 'csv',
      content: [
        'city,lat,lon,canopy_cover,uhi_intensity,cooling_index',
        ...cities.map((c) => c.join(',')),
      ].join('\n'),
    },
  ]
}

const BUFFER_RADIUS = { name: 'buffer_km', label: 'Corridor buffer', min: 0.3, max: 3.0, step: 0.1, value: 1.6, unit: 'km' }

const fig = (id: string, caption: string, js: string, python: string, params: FigureNode['params'], extra: Partial<FigureNode> = {}) =>
  ({ type: 'figure', id, caption, js, python, params, display: 'output', codeAccess: 'both', children: [{ text: '' }], ...extra })

const MAP_JS = `const subset = data.sensors.filter(d => d.distance_km <= buffer_km)
expose(subset.length)
return Plot.plot({
  width,
  aspectRatio: 1,
  x: { label: "East transect coordinate (km)" },
  y: { label: "North transect coordinate (km)" },
  color: { scheme: "ylorrd", legend: true, label: "Observations" },
  marks: [
    Plot.dot(subset, Plot.hexbin({ fill: "count" }, { x: "x", y: "y", binWidth: hex_size, tip: true })),
    Plot.line(data.transects, { x: "x", y: "y", stroke: "#0f172a", strokeWidth: 2 }),
    Plot.dot(data.transects, { x: "x", y: "y", r: 3.5, fill: "#0f172a" }),
    Plot.text([\`\${subset.length.toLocaleString("en-US")} sensors within \${buffer_km.toFixed(1)} km buffer\`],
      { frameAnchor: "top-left", dx: 6, dy: 6, fontSize: 11, fontWeight: "600" }),
  ],
})`

const MAP_PY = `import matplotlib.pyplot as plt

sensors, transects = data["sensors"], data["transects"]
subset = sensors[sensors.distance_km <= buffer_km]

fig, ax = plt.subplots(figsize=(5, 3.4))
ax.hexbin(subset.x, subset.y, gridsize=24, cmap="YlOrRd", mincnt=1)
ax.plot(transects.x, transects.y, "o-", color="#0f172a")
ax.set_xlabel("East transect coordinate (km)")
ax.set_ylabel("North transect coordinate (km)")

ket_qua = len(subset)`

const HOURS_JS = `const subset = data.sensors.filter(d => d.distance_km <= buffer_km)
const counts = d3.rollup(subset, v => v.length, d => d.hour)
expose(counts)
return Plot.plot({
  width,
  height: 265,
  x: { label: "Solar hour of day (local time)" },
  y: { label: "Active thermal observations", grid: true },
  marks: [
    Plot.barY(subset, Plot.groupX({ y: "count" }, { x: "hour", fill: "#2563eb", rx: 2, tip: true })),
    Plot.ruleY([0]),
  ],
})`

const HOURS_PY = `sensors = data["sensors"]
subset = sensors[sensors.distance_km <= buffer_km]
counts = subset.groupby("hour").size()

ax = counts.plot.bar(color="#2563eb")
ax.set_xlabel("Solar hour of day (local time)")
ax.set_ylabel("Active thermal observations")

ket_qua = counts`

const TABLE_JS = `const bands = [[0, 0.5, "0–0.5 km (Core corridor)"], [0.5, 1, "0.5–1.0 km (Inner buffer)"], [1, 2, "1.0–2.0 km (Urban matrix)"], [2, Infinity, "> 2.0 km (Dense built-up)"]]
const total = data.sensors.length
const table = bands.map(([a, b, zone]) => {
  const rows = data.sensors.filter(d => d.distance_km > a && d.distance_km <= b)
  const n = rows.length
  const meanTemp = +(d3.mean(rows, d => d.temp_anomaly_c) ?? 0).toFixed(2)
  return { zone, observations: n, mean_uhi_c: meanTemp, share: Math.round(1000 * n / total) / 10 }
})
expose(table)
return \`<table class="fig-table">
  <thead><tr><th>Corridor distance zone</th><th>Sensors</th><th>Mean ΔT (°C)</th><th>Share</th></tr></thead>
  <tbody>\${table.map(r => \`<tr><td>\${r.zone}</td><td>\${r.observations.toLocaleString("en-US")}</td><td>+\${r.mean_uhi_c.toFixed(2)} °C</td><td>\${r.share.toLocaleString("en-US")}%</td></tr>\`).join("")}</tbody>
</table>\``

const TABLE_PY = `import pandas as pd

sensors = data["sensors"]
zone = pd.cut(sensors.distance_km, [0, 0.5, 1, 2, float("inf")],
              labels=["0–0.5 km (Core corridor)", "0.5–1.0 km (Inner buffer)", "1.0–2.0 km (Urban matrix)", "> 2.0 km (Dense built-up)"])
table = sensors.groupby(zone, observed=False).agg(
    observations=("temp_anomaly_c", "size"),
    mean_uhi_c=("temp_anomaly_c", lambda s: round(float(s.mean()), 2)),
).reset_index()
table.columns = ["zone", "observations", "mean_uhi_c"]
table["share"] = (100 * table.observations / len(sensors)).round(1)

ket_qua = table`

const CITIES_JS = `const labels = {
  uhi_intensity: "Surface UHI intensity ΔT (°C)",
  canopy_cover: "Urban tree canopy cover (%)",
  cooling_index: "Evaporative cooling index",
}
let rows = data.cities.slice()
if (sort_desc) rows.sort((a, b) => b[metric] - a[metric])
rows = rows.slice(0, top_n)
expose(rows.map(d => d[metric]))
return Plot.plot({
  width,
  height: 56 + 26 * rows.length,
  marginLeft: 135,
  x: { label: labels[metric] || metric, grid: true },
  y: { label: null, domain: rows.map(d => d.city) },
  marks: [
    Plot.barX(rows, { y: "city", x: metric, fill: metric === "uhi_intensity" ? "#e11d48" : "#0ea5e9", rx: 3, tip: true }),
    Plot.ruleX([0]),
  ],
})`

const CITIES_PY = `rows = data["cities"].copy()
if sort_desc:
    rows = rows.sort_values(metric, ascending=False)
ket_qua = rows[metric].head(top_n).tolist()`

const p = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'p', ...extra, children: [{ text }] })
const h = (level: 1 | 2 | 3, text: string, id: string) => ({ type: 'h' + level, id, children: [{ text }] })
const cols = (widths: string[], ...columns: any[][]) => ({ type: 'column_group', children: columns.map((children, i) => ({ type: 'column', width: widths[i], children })) })

export function makeSample(): PapercellDoc {
  return {
    version: 3,
    meta: {
      title: SAMPLE_TITLE,
      authors: 'Elena Vance, Marcus Chen, David Nguyen · Institute for Urban Climate Systems',
      date: '2026-10-24',
    },
    data: makeData(),
    content: [
      h(2, 'Abstract', 's-abstract'),
      p('Urban heat islands (UHIs) intensify summer thermal stress across high-density metropolitan regions. Using 5,000 microclimate sensor observations distributed along a 14-station vegetated greenway transect and comparative indicators across 12 Asia–Pacific cities, we quantify how canopy fraction and corridor proximity attenuate afternoon surface temperature anomalies (ΔT). We show that contiguous green corridors reduce local peak anomalies by up to 1.4 °C within a 600 m lateral decay zone.', { align: 'justify' }),
      h(2, '1. Radiative–Convective Decay Formulation', 's-methods'),
      p('We model the expected afternoon surface temperature anomaly ΔT at lateral distance d from a vegetated corridor with fractional canopy cover f_c using an exponential attenuation kernel with characteristic decay length λ = 0.60 km:', { align: 'justify' }),
      {
        type: 'equation',
        id: 'eq1',
        texExpression: String.raw`\Delta T(d, f_c) = \Delta T_0\,(1 - \alpha f_c)\,\exp\!\left(-\frac{d}{\lambda}\right) + \varepsilon, \qquad \lambda = 0.60\text{ km}`,
        children: [{ text: '' }],
      },
      cols(['42%', '58%'],
        [
          p('Figure 1 maps active microclimate sensor density along the 18 km urban greenway transect (stations T01–T14). Observations cluster near vegetated canyon nodes and decay radially into surrounding impervious blocks.', { align: 'justify' }),
          p('Adjusting the corridor buffer slider dynamically filters the sensor network in real time. Both the interactive Observable Plot view and the underlying pandas analysis remain numerically locked via automated verification.', { align: 'justify' }),
        ],
        [fig('map', 'Spatial distribution of microclimate sensor observations along the 14-station greenway corridor.', MAP_JS, MAP_PY,
          [BUFFER_RADIUS, { name: 'hex_size', label: 'Hexbin resolution', min: 8, max: 28, step: 1, value: 15, unit: 'px' }])],
      ),
      h(2, '2. Diurnal Thermal Load & Stratified Corridor Regimes', 's-results'),
      cols(['54%', '46%'],
        [fig('hours', 'Diurnal distribution of thermal stress observations across solar hours.', HOURS_JS, HOURS_PY, [BUFFER_RADIUS])],
        [fig('table', 'Stratified temperature anomaly (ΔT) and sensor distribution by corridor distance zone.', TABLE_JS, TABLE_PY, [], { codeAccess: 'python' })],
      ),
      p('More than 55% of recorded observations fall within 1.0 km of the primary greenway axis, where mean surface temperature anomalies remain +2.19 °C compared to +2.84 °C in the outer dense built-up matrix (> 2.0 km).', { align: 'justify' }),
      h(2, '3. Cross-City Comparative Canopy Explorer', 's-cities'),
      p('To contextualize the transect findings at the metropolitan scale, Figure 3 compares 12 reference cities across three coupled indicators: surface UHI intensity (ΔT), urban tree canopy cover (%), and the composite evaporative cooling index.', { align: 'justify' }),
      fig(
        'cities-explorer',
        'Cross-city comparison of urban heat island intensity, tree canopy cover, and cooling performance.',
        CITIES_JS,
        CITIES_PY,
        [
          { name: 'metric', label: 'Indicator', kind: 'select', options: ['uhi_intensity', 'canopy_cover', 'cooling_index'], value: 'uhi_intensity', min: 0, max: 0, step: 1 },
          { name: 'top_n', label: 'Cities shown', kind: 'radio', options: [6, 9, 12], value: 9, min: 0, max: 0, step: 1 },
          { name: 'sort_desc', label: 'Rank highest first', kind: 'toggle', value: true, min: 0, max: 1, step: 1 },
        ],
      ),
    ],
  }
}
