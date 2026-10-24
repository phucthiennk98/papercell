// "Chart gallery" document: at least one example of every figure type the app supports,
// with varied synthetic data to try things on. The numbers are synthetic (fixed seed), NOT real data.
import type { DataFile, FigureNode, PapercellDoc } from './editor/types'
import { codegen, defaultSpec, specParams, type ChartSpec } from './figure/builder'
import { FIGURE_TEMPLATES, figureFromTemplate } from './figure/templates'
import { controlsSection, paramsDemo } from './demo-params'

export const GALLERY_TITLE = 'Chart gallery'

function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// Provinces: name, region, approximate coordinates; population (thousands) and indicators are synthetic.
const PROVINCES: [string, string, number, number, number][] = [
  ['Ha Noi', 'Red River Delta', 21.03, 105.85, 8400], ['Hai Phong', 'Red River Delta', 20.86, 106.68, 2100],
  ['Bac Ninh', 'Red River Delta', 21.18, 106.07, 1500], ['Nam Dinh', 'Red River Delta', 20.43, 106.18, 1880],
  ['Thai Binh', 'Red River Delta', 20.45, 106.34, 1870], ['Quang Ninh', 'Red River Delta', 20.95, 107.08, 1360],
  ['Lao Cai', 'Northern Uplands', 22.48, 103.97, 770], ['Thai Nguyen', 'Northern Uplands', 21.59, 105.85, 1330],
  ['Lang Son', 'Northern Uplands', 21.85, 106.76, 800], ['Dien Bien', 'Northern Uplands', 21.39, 103.02, 640],
  ['Thanh Hoa', 'North Central Coast', 19.81, 105.78, 3720], ['Nghe An', 'North Central Coast', 18.67, 105.69, 3420],
  ['Hue', 'North Central Coast', 16.46, 107.59, 1160], ['Quang Binh', 'North Central Coast', 17.47, 106.62, 910],
  ['Da Nang', 'South Central Coast', 16.05, 108.2, 1220], ['Quang Nam', 'South Central Coast', 15.57, 108.47, 1520],
  ['Binh Dinh', 'South Central Coast', 13.78, 109.22, 1500], ['Khanh Hoa', 'South Central Coast', 12.24, 109.19, 1260],
  ['Dak Lak', 'Central Highlands', 12.67, 108.04, 1930], ['Lam Dong', 'Central Highlands', 11.94, 108.44, 1330],
  ['Gia Lai', 'Central Highlands', 13.98, 108.0, 1590], ['Ho Chi Minh City', 'Southeast', 10.78, 106.7, 9400],
  ['Binh Duong', 'Southeast', 11.0, 106.65, 2760], ['Dong Nai', 'Southeast', 10.95, 106.82, 3250],
  ['Ba Ria - Vung Tau', 'Southeast', 10.35, 107.08, 1180], ['Can Tho', 'Mekong Delta', 10.03, 105.78, 1250],
  ['An Giang', 'Mekong Delta', 10.52, 105.13, 1900], ['Kien Giang', 'Mekong Delta', 10.0, 105.08, 1750],
  ['Ca Mau', 'Mekong Delta', 9.18, 105.15, 1200], ['Long An', 'Mekong Delta', 10.54, 106.41, 1730],
]
const REGIONS = [...new Set(PROVINCES.map((t) => t[1]))]
const MODES = ['Motorbike', 'Car', 'Bus', 'Walking', 'Bicycle', 'Ride-hailing']
const AGE_GROUPS = ['18–24', '25–34', '35–44', '45–54', '55+']

function makeData(): DataFile[] {
  const rnd = mulberry32(42)
  const normal = (m: number, s: number) => m + s * Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd())
  const pick = <T,>(xs: T[], w?: number[]) => {
    if (!w) return xs[Math.floor(rnd() * xs.length)]
    let r = rnd() * w.reduce((a, b) => a + b, 0)
    for (let i = 0; i < xs.length; i++) { r -= w[i]; if (r <= 0) return xs[i] }
    return xs[xs.length - 1]
  }

  // 1. Provinces
  const provinces = PROVINCES.map(([name, region, lat, lon, population]) => {
    const urban = Math.min(0.95, Math.max(0.12, 0.2 + population / 12000 + normal(0, 0.08)))
    return { name, region, lat, lon, population, urban_share: +urban.toFixed(2), income: +(4 + 9 * urban + normal(0, 0.8)).toFixed(1) }
  })

  // 2. Monthly series 2023–2025 per region: upward trend, Tet seasonality and noise
  const monthly: string[] = ['month,region,spending,transactions']
  REGIONS.forEach((v, k) => {
    const base = 40 + 12 * k
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10)
      const season = i % 12 === 0 || i % 12 === 1 ? 1.25 : 1
      const spend = base * (1 + 0.012 * i) * season + normal(0, 3)
      monthly.push([d, v, spend.toFixed(1), Math.round(spend * (18 + normal(0, 1.5)))].join(','))
    }
  })

  // 3. Travel behaviour survey: 1,500 people, with coordinates around their province
  const survey: string[] = ['id,province,region,lat,lon,age,age_group,gender,income,mode,trips_per_week,travel_min,satisfaction']
  const w = provinces.map((t) => t.population)
  for (let i = 0; i < 1500; i++) {
    const t = pick(provinces, w)
    const age = Math.round(Math.min(75, Math.max(18, normal(37, 12))))
    const group = age < 25 ? AGE_GROUPS[0] : age < 35 ? AGE_GROUPS[1] : age < 45 ? AGE_GROUPS[2] : age < 55 ? AGE_GROUPS[3] : AGE_GROUPS[4]
    const inc = Math.max(2, Math.exp(normal(Math.log(t.income), 0.45)))
    const mode = pick(MODES, [60, 6 + inc * 1.2, 8 * t.urban_share, 6, 4, 5 + 10 * t.urban_share * (age < 35 ? 1.5 : 0.6)])
    const minutes = Math.max(5, normal({ Motorbike: 25, Car: 35, Bus: 48, Walking: 15, Bicycle: 20, 'Ride-hailing': 28 }[mode]!, 9))
    const score = Math.round(Math.min(10, Math.max(1, normal(7.5 - minutes / 25 + (mode === 'Car' ? 0.6 : 0), 1.4))))
    survey.push([i + 1, t.name, t.region, (t.lat + normal(0, 0.12)).toFixed(4), (t.lon + normal(0, 0.12)).toFixed(4), age, group, rnd() < 0.5 ? 'Male' : 'Female',
      inc.toFixed(1), mode, Math.max(1, Math.round(normal(9, 3))), minutes.toFixed(0), score].join(','))
  }

  // 4. 1° × 1° grid cells (GeoJSON) over the provinces: number of respondents and mean income per cell
  const rows = survey.slice(1).map((r) => r.split(','))
  const cells = new Map<string, { n: number; inc: number }>()
  for (const r of rows) {
    const k = `${Math.floor(+r[3])},${Math.floor(+r[4])}`
    const c = cells.get(k) ?? { n: 0, inc: 0 }; c.n++; c.inc += +r[8]; cells.set(k, c)
  }
  const features = [...cells].map(([k, c]) => {
    const [la, lo] = k.split(',').map(Number)
    return {
      type: 'Feature', properties: { cell: `${la}°N ${lo}°E`, respondents: c.n, mean_income: +(c.inc / c.n).toFixed(1) },
      geometry: { type: 'Polygon', coordinates: [[[lo, la], [lo, la + 1], [lo + 1, la + 1], [lo + 1, la], [lo, la]]] },
    }
  })

  return [
    { name: 'provinces.csv', kind: 'csv', content: ['name,region,lat,lon,population,urban_share,income', ...provinces.map((t) => [t.name, t.region, t.lat, t.lon, t.population, t.urban_share, t.income].join(','))].join('\n') },
    { name: 'monthly.csv', kind: 'csv', content: monthly.join('\n') },
    { name: 'survey.csv', kind: 'csv', content: survey.join('\n') },
    { name: 'grid_cells.geojson', kind: 'json', content: JSON.stringify({ type: 'FeatureCollection', features }) },
  ]
}

let n = 0
const specFig = (caption: string, s: Partial<ChartSpec> & Pick<ChartSpec, 'data' | 'type'>): FigureNode => {
  const spec = { ...defaultSpec(s.data), ...s }
  return { type: 'figure', id: `g${++n}`, caption, js: codegen(spec), python: '', params: specParams(spec), spec, display: 'output', codeAccess: 'both', children: [{ text: '' }] }
}
const codeFig = (caption: string, js: string, params: FigureNode['params'] = [], python = ''): FigureNode =>
  ({ type: 'figure', id: `g${++n}`, caption, js, python, params, display: 'output', codeAccess: 'both', children: [{ text: '' }] })
const tplFig = (id: string): FigureNode => ({ ...figureFromTemplate(FIGURE_TEMPLATES.find((t) => t.id === id)!), id: `g${++n}` })

const p = (text: string) => ({ type: 'p', children: [{ text }] })
const h = (level: 2 | 3, text: string) => ({ type: 'h' + level, id: `g${++n}`, children: [{ text }] })
const cols = (...columns: FigureNode[]) => ({ type: 'column_group', children: columns.map((f) => ({ type: 'column', width: `${100 / columns.length}%`, children: [f] })) })

const STACK_JS = `// 100% stacked bars: travel mode share by age group (hand-written Observable Plot)
const ds = data.survey
expose(ds.length)
return Plot.plot({
  width, height: 300, marginLeft: 50,
  x: { label: "Age group", domain: ["18–24", "25–34", "35–44", "45–54", "55+"] },
  y: { label: "Share", percent: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [
    Plot.barY(ds, Plot.groupX({ y: "proportion-facet" }, { x: "age_group", fill: "mode", offset: "normalize", tip: true })),
    Plot.ruleY([0]),
  ],
})`

const DOT_JS = `// Dot plot with a slider: provinces with income above the threshold are highlighted
const ds = data.provinces.slice().sort((a, b) => b.income - a.income)
expose(ds.filter(d => d.income >= threshold).length)
return Plot.plot({
  width, height: 560, marginLeft: 130,
  x: { label: "Income (million VND / month)", grid: true },
  y: { label: null, domain: ds.map(d => d.name) },
  marks: [
    Plot.ruleX([threshold], { stroke: "#e45d2f", strokeDasharray: "4,3" }),
    Plot.ruleY(ds, { y: "name", x1: 0, x2: "income", stroke: "#e5e7eb" }),
    Plot.dot(ds, { y: "name", x: "income", r: 5, fill: d => d.income >= threshold ? "#2a78d6" : "#cbd5e1", tip: true }),
  ],
})`

const DOT_PY = `provinces = data["provinces"]
result = int((provinces.income >= threshold).sum())`

const DENSITY_JS = `// Density lines of travel time by mode; smoothness set by the slider
const ds = data.survey
expose(ds.length)
return Plot.plot({
  width, height: 300,
  x: { label: "Travel time (minutes)" },
  y: { label: "Density", grid: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [
    Plot.areaY(ds, Plot.normalizeY("sum", Plot.binX({ y: "count" }, { x: "travel_min", fill: "mode", thresholds: bins, fillOpacity: 0.15, curve: "basis" }))),
    Plot.lineY(ds, Plot.normalizeY("sum", Plot.binX({ y: "count" }, { x: "travel_min", stroke: "mode", thresholds: bins, curve: "basis" }))),
  ],
})`

const CORR_JS = `// Correlation matrix of the survey's numeric variables (computed with d3)
const vars = ["age", "income", "trips_per_week", "travel_min", "satisfaction"]
const ds = data.survey
const r = (a, b) => {
  const ma = d3.mean(ds, d => d[a]), mb = d3.mean(ds, d => d[b])
  const s = d3.sum(ds, d => (d[a] - ma) * (d[b] - mb))
  return s / Math.sqrt(d3.sum(ds, d => (d[a] - ma) ** 2) * d3.sum(ds, d => (d[b] - mb) ** 2))
}
const m = vars.flatMap(a => vars.map(b => ({ a, b, r: +r(a, b).toFixed(2) })))
expose(m)
return Plot.plot({
  width, height: 320, marginLeft: 110, marginBottom: 60,
  x: { label: null, tickRotate: -25, domain: vars }, y: { label: null, domain: vars },
  color: { scheme: "rdbu", domain: [-1, 1], legend: true, label: "Correlation" },
  marks: [
    Plot.cell(m, { x: "a", y: "b", fill: "r", tip: true }),
    Plot.text(m, { x: "a", y: "b", text: d => d.r.toFixed(2), fill: d => Math.abs(d.r) > 0.5 ? "white" : "black" }),
  ],
})`

const CORR_PY = `vars = ["age", "income", "trips_per_week", "travel_min", "satisfaction"]
c = data["survey"][vars].corr().round(2)
result = [{"a": a, "b": b, "r": float(c.loc[b, a])} for a in vars for b in vars]`

const WAFFLE_JS = `// Waffle chart: each square ≈ 1% of respondents
const counts = d3.rollups(data.survey, v => v.length, d => d.mode).sort((a, b) => b[1] - a[1])
const total = d3.sum(counts, d => d[1])
let cells = []
counts.forEach(([mode, n]) => { for (let i = 0; i < Math.round(100 * n / total); i++) cells.push({ mode }) })
cells = cells.slice(0, 100).map((d, i) => ({ ...d, col: i % 10, row: Math.floor(i / 10) }))
expose(counts)
return Plot.plot({
  width: Math.min(width, 420), height: 330, padding: 0.12,
  x: { axis: null }, y: { axis: null, reverse: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [Plot.cell(cells, { x: "col", y: "row", fill: "mode", rx: 3, tip: true })],
})`

const TREND_JS = `// Trend line: moving average with a min–max band over the window (Southeast region)
const raw = data.monthly.filter(d => d.region === "Southeast")
const win = (i, f) => f(raw.slice(Math.max(0, i - window_size + 1), i + 1), d => d.spending)
const ds = raw.map((d, i) => ({ ...d, low: win(i, d3.min), high: win(i, d3.max), avg: win(i, d3.mean) }))
expose(ds.map(d => +d.avg.toFixed(2)))
return Plot.plot({
  width, height: 280,
  x: { label: "Month" }, y: { label: "Spending (billion VND)", grid: true },
  marks: [
    Plot.areaY(ds, { x: "month", y1: "low", y2: "high", fill: "#dbeafe" }),
    Plot.line(ds, { x: "month", y: "spending", stroke: "#94a3b8" }),
    Plot.line(ds, { x: "month", y: "avg", stroke: "#2a78d6", strokeWidth: 2.5 }),
    Plot.dot(ds, { x: "month", y: "spending", r: 2, fill: "#94a3b8", tip: true }),
  ],
})`

const CARDS_JS = `// KPI cards in HTML (not a chart): a quick summary of the survey
const ds = data.survey
const cards = [
  ["Respondents", ds.length.toLocaleString("en-US"), ""],
  ["Median income", d3.median(ds, d => d.income).toFixed(1), "million VND / month"],
  ["Mean travel time", Math.round(d3.mean(ds, d => d.travel_min)), "minutes"],
  ["Mean satisfaction", d3.mean(ds, d => d.satisfaction).toFixed(1), "/ 10"],
]
expose(cards.map(t => t[1]))
return \`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;padding:4px">\${cards.map(([t, v, unit]) =>
  \`<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px"><div style="font-size:12px;color:#6b7280">\${pc.esc(t)}</div>
   <div style="font-size:24px;font-weight:600;margin-top:4px">\${v} <span style="font-size:12px;font-weight:400;color:#6b7280">\${unit}</span></div></div>\`).join("")}</div>\``

const GEO_BIVARIATE_JS = `// Bivariate D3-Geo vector map: 1° GeoJSON grid cells + filtered province hubs
const cells = data.grid_cells
const provs = data.provinces.filter(d => d.population >= min_pop)
expose(provs.length)
return Plot.plot({
  width, height: 360,
  projection: { type: "mercator", domain: cells, inset: 14 },
  color: { scheme: "ylgnbu", legend: true, label: "Grid mean income (M VND)" },
  marks: [
    Plot.graticule({ stroke: "#cbd5e1", strokeOpacity: 0.4 }),
    Plot.geo(cells, {
      fill: f => f.properties.mean_income,
      stroke: "#64748b",
      strokeWidth: 0.75,
      fillOpacity: 0.82,
      tip: true,
      title: f => \`\${f.properties.cell}\\nMean income: \${f.properties.mean_income}M VND (n=\${f.properties.respondents})\`,
    }),
    Plot.dot(provs, {
      x: "lon", y: "lat",
      r: d => 3 + Math.sqrt(d.population) * 0.085,
      fill: "#e11d48", stroke: "#ffffff", strokeWidth: 1.4,
    }),
    Plot.text(provs.slice(0, 8), {
      x: "lon", y: "lat", text: "name", dy: -9,
      fontSize: 10, fontWeight: 600, fill: "#0f172a", stroke: "#ffffff", strokeWidth: 2.5,
    }),
  ],
})`

const GEO_BIVARIATE_PY = `import geopandas as gpd

provs = data["provinces"]
gdf = gpd.GeoDataFrame(provs, geometry=gpd.points_from_xy(provs.lon, provs.lat))
result = int((gdf["population"] >= min_pop).sum())`

const CONTOUR_JS = `// 2D joint density contours (D3 / Observable Plot contour density)
const ds = data.survey.filter(d => ["Motorbike", "Car", "Bus", "Ride-hailing"].includes(d.mode))
expose(ds.length)
return Plot.plot({
  width, height: 320,
  x: { label: "Monthly income (million VND)", grid: true },
  y: { label: "Commute duration (minutes)", grid: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [
    Plot.density(ds, { x: "income", y: "travel_min", stroke: "mode", bandwidth, thresholds: 8, strokeWidth: 1.4 }),
    Plot.dot(ds.slice(0, 350), { x: "income", y: "travel_min", fill: "mode", r: 2, fillOpacity: 0.45, tip: true }),
  ],
})`

const FOREST_JS = `// Regional mean income with 95% confidence intervals (Forest / Error-bar plot)
const groups = d3.rollups(
  data.survey,
  v => {
    const n = v.length
    const mean = d3.mean(v, d => d.income)
    const sd = d3.deviation(v, d => d.income) || 0
    const ci = 1.96 * sd / Math.sqrt(n)
    return { n, mean: +mean.toFixed(2), low: +(mean - ci).toFixed(2), high: +(mean + ci).toFixed(2) }
  },
  d => d.region
).map(([region, s]) => ({ region, ...s })).sort((a, b) => b.mean - a.mean)
expose(groups.filter(d => d.mean >= ref_line).length)
return Plot.plot({
  width, height: 320, marginLeft: 145,
  x: { label: "Mean monthly income ± 95% CI (M VND)", grid: true },
  y: { label: null, domain: groups.map(d => d.region) },
  marks: [
    Plot.ruleX([ref_line], { stroke: "#e11d48", strokeDasharray: "4,3", strokeWidth: 1.5 }),
    Plot.link(groups, { y1: "region", y2: "region", x1: "low", x2: "high", stroke: "#475569", strokeWidth: 2.2 }),
    Plot.dot(groups, {
      y: "region", x: "mean", r: 5.5,
      fill: d => d.mean >= ref_line ? "#2563eb" : "#94a3b8",
      stroke: "#ffffff", strokeWidth: 1.5, tip: true,
    }),
  ],
})`

const FOREST_PY = `survey = data["survey"]
means = survey.groupby("region")["income"].mean()
result = int((means >= ref_line).sum())`

const PARALLEL_JS = `// Multi-indicator normalized parallel coordinates profile by region
const metrics = ["income", "travel_min", "trips_per_week", "satisfaction"]
const byReg = d3.rollups(
  data.survey,
  v => Object.fromEntries(metrics.map(m => [m, d3.mean(v, d => d[m])])),
  d => d.region
)
const extents = Object.fromEntries(metrics.map(m => [m, d3.extent(byReg, ([, o]) => o[m])]))
const pts = byReg.flatMap(([region, o]) =>
  metrics.map(m => {
    const [lo, hi] = extents[m]
    return { region, metric: m, norm: hi > lo ? (o[m] - lo) / (hi - lo) : 0.5, raw: +o[m].toFixed(2) }
  })
)
expose(byReg.length)
return Plot.plot({
  width, height: 320,
  x: { label: "Indicator axis", domain: metrics },
  y: { label: "Normalized score (0 = min, 1 = max)", domain: [0, 1], grid: true },
  color: { legend: true, scheme: "tableau10" },
  marks: [
    Plot.ruleX(metrics, { stroke: "#cbd5e1" }),
    Plot.line(pts, {
      x: "metric", y: "norm", z: "region",
      stroke: "region",
      strokeWidth: d => highlight === "All" || d.region === highlight ? 2.8 : 1.2,
      strokeOpacity: d => highlight === "All" || d.region === highlight ? 1 : 0.25,
    }),
    Plot.dot(pts, {
      x: "metric", y: "norm", fill: "region", r: 4,
      fillOpacity: d => highlight === "All" || d.region === highlight ? 1 : 0.25,
      tip: true, title: d => \`\${d.region} · \${d.metric}: \${d.raw}\`,
    }),
  ],
})`

export function makeGallery(): PapercellDoc {
  n = 0
  return {
    version: 3,
    meta: { title: GALLERY_TITLE, authors: 'Spatial Analytics Group · Papercell Showcase', date: '2026-10-24' },
    data: makeData(),
    content: [
      p('A comprehensive reference showcase of interactive chart types, GeoPandas & D3-Geo vector maps, scientific equations, precomputed Python models, and reader parameter controls supported in Papercell — built on synthetic multi-region demographic, expenditure, and mobility survey datasets.'),
      h(2, '1. GeoPandas & D3-Geo Vector Maps (Spatial Analytics)'),
      p('Publication-grade vector maps rendered directly with Observable Plot / D3-Geo (Plot.geo, Plot.centroid, Plot.arrow, Plot.sphere) and paired with GeoPandas (geopandas.GeoDataFrame) verification scripts.'),
      cols(
        tplFig('geo-choropleth'),
        tplFig('geo-flows'),
      ),
      cols(
        tplFig('geo-projection'),
        codeFig('Bivariate spatial grid & regional hubs (GeoPandas + D3-Geo).', GEO_BIVARIATE_JS,
          [{ name: 'min_pop', label: 'Min population', min: 500, max: 3000, step: 250, value: 1000, unit: 'k' }], GEO_BIVARIATE_PY),
      ),
      h(2, '2. Advanced D3 & Statistical Visualizations'),
      {
        type: 'equation',
        id: `g${++n}`,
        texExpression: String.raw`T_{ij} = \kappa\,\frac{P_i^{\alpha}\,A_j^{\gamma}}{d_{ij}^{\beta}}\,\exp(-\lambda\,c_{ij}), \qquad \beta = 1.45,\;\lambda = 0.08`,
        description: [
          String.raw`• $T_{ij}$: Expected daily origin–destination flow between zone $i$ and corridor hub $j$`,
          String.raw`• $P_i, A_j$: Origin population mass ($10^3$) and destination employment attraction index`,
          String.raw`• $d_{ij}, c_{ij}$: Geodesic network distance ($\text{km}$) and generalized travel time cost ($\text{min}$)`,
          String.raw`• $\beta = 1.45, \lambda = 0.08$: Power-law impedance exponent and exponential deterrence parameter`,
        ].join('\n'),
        descriptionMode: 'inline',
        children: [{ text: '' }],
      },
      cols(
        codeFig('2D joint density contours: income vs. travel duration by mode.', CONTOUR_JS,
          [{ name: 'bandwidth', label: 'Contour bandwidth', min: 10, max: 40, step: 5, value: 22 }]),
        codeFig('Regional income ± 95% confidence interval forest plot (with Python verify).', FOREST_JS,
          [{ name: 'ref_line', label: 'Reference benchmark', min: 5, max: 9, step: 0.2, value: 6.8, unit: 'M VND' }], FOREST_PY),
      ),
      cols(
        codeFig('Multi-indicator normalized parallel coordinates profile by region.', PARALLEL_JS,
          [{ name: 'highlight', label: 'Highlight region', kind: 'select', options: ['All', 'Southeast', 'Red River Delta', 'Mekong Delta', 'North Central Coast'], value: 'Southeast', min: 0, max: 0, step: 1 }]),
        codeFig('Correlation matrix (with original Python to verify).', CORR_JS, [], CORR_PY),
      ),
      h(2, '3. Basic charts (Design tab)'),
      cols(
        specFig('Bar: total population by region.', { data: 'provinces', type: 'bar', x: 'region', y: 'population', agg: 'sum', sort: 'desc', yLabel: 'Population (thousands)' }),
        specFig('Horizontal bar: mean income by region.', { data: 'provinces', type: 'barh', y: 'region', x: 'income', agg: 'mean', sort: 'desc', xLabel: 'Income (million VND / month)' }),
      ),
      cols(
        specFig('Line: monthly spending, one line per region.', { data: 'monthly', type: 'line', x: 'month', y: 'spending', color: 'region', agg: 'sum' }),
        specFig('Stacked area: monthly transactions.', { data: 'monthly', type: 'area', x: 'month', y: 'transactions', color: 'region', agg: 'sum' }),
      ),
      cols(
        specFig('Scatter: urban share vs income, dot size by population.', { data: 'provinces', type: 'scatter', x: 'urban_share', y: 'income', color: 'region', size: 'population' }),
        specFig('Histogram: income distribution by gender.', { data: 'survey', type: 'histogram', x: 'income', color: 'gender', bins: 40 }),
      ),
      cols(
        specFig('Box plot: satisfaction by travel mode.', { data: 'survey', type: 'box', y: 'satisfaction', x: 'mode' }),
        specFig('Heatmap: respondents by age group × travel mode.', { data: 'survey', type: 'heatmap', x: 'age_group', y: 'mode', agg: 'count', scheme: 'purples' }),
      ),
      specFig('Facets: travel mode in each region.', { data: 'survey', type: 'bar', x: 'mode', facet: 'region', agg: 'count' }),
      cols(
        specFig('Table: mean income by region.', { data: 'survey', type: 'table', x: 'region', y: 'income', agg: 'mean', sort: 'desc' }),
        specFig('Table: respondents by travel mode.', { data: 'survey', type: 'table', x: 'mode', agg: 'count', sort: 'desc' }),
      ),
      specFig('Table: first rows of the province data (scrolls sideways when narrow).', { data: 'provinces', type: 'table' }),
      h(2, '4. Interactive Tile Maps (MapLibre, OpenFreeMap basemaps)'),
      specFig('Point map: provinces, colored by region, sized by population.', { data: 'provinces', type: 'map-points', lat: 'lat', lon: 'lon', color: 'region', size: 'population', basemap: 'light' }),
      cols(
        specFig('Heat map: where survey respondents live.', { data: 'survey', type: 'map-heat', lat: 'lat', lon: 'lon', basemap: 'dark' }),
        specFig('Choropleth (GeoJSON): respondents in each 1° cell.', { data: 'grid_cells', type: 'map-regions', color: 'respondents', scheme: 'ylorrd', basemap: 'streets' }),
      ),
      h(2, '5. Built-in templates (Figure button)'),
      p('Templates carry their own sample data inside the code and have sliders. The "Python model" template needs the Verify & Precompute tab: press Run to get a figure.'),
      cols(tplFig('line'), tplFig('scatter')),
      cols(tplFig('histogram'), tplFig('hexbin')),
      tplFig('model'),
      h(2, '6. Custom Observable Plot, D3 & HTML Figures'),
      codeFig('KPI cards in HTML.', CARDS_JS),
      cols(
        codeFig('100% stacked bars: travel mode share by age group.', STACK_JS),
        codeFig('Waffle chart: each square ≈ 1% of respondents.', WAFFLE_JS),
      ),
      codeFig('Dot plot: income by province, threshold set by a slider.', DOT_JS,
        [{ name: 'threshold', label: 'Income threshold', min: 4, max: 12, step: 0.5, value: 8, unit: 'M VND' }], DOT_PY),
      paramsDemo('en'),
      codeFig('Density of travel time by mode.', DENSITY_JS, [{ name: 'bins', label: 'Bins', min: 10, max: 60, step: 5, value: 30 }]),
      codeFig('Trend with moving average (Southeast).', TREND_JS, [{ name: 'window_size', label: 'Moving window', min: 1, max: 12, step: 1, value: 3, unit: 'months' }]),
      ...controlsSection(),
      p('Add a figure: use the "Figure" button on the toolbar, type / on an empty line, or click + next to the ⠿ handle left of any block.'),
    ],
  }
}
