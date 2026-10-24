// Templates whose readers get controls: dropdowns, radio buttons, on/off switches (and a slider).
// Each carries its own sample data so it draws right away.
import { ChartLine, ChartNoAxesColumn, ChartScatter, Globe, Map as MapIcon, MapPin, Route, SlidersHorizontal } from 'lucide-react'
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


export const GEO_TEMPLATES: FigureTemplate[] = [
  {
    id: 'geo-choropleth',
    label: 'GeoChoropleth polygons (D3 / GeoPandas)',
    hint: 'Vector polygon choropleth with metric selector, color palette & centroid labels (Plot.geo)',
    icon: MapIcon,
    keywords: ['geo', 'geopandas', 'd3', 'choropleth', 'map', 'polygon', 'ban do', 'vung'],
    caption: 'Spatial distribution across urban districts (D3-Geo & GeoPandas vector choropleth).',
    params: [
      select('metric', 'Metric', ['uhi_c', 'canopy_pct', 'pop_density'], 'uhi_c'),
      select('scheme', 'Palette', ['ylorrd', 'viridis', 'blues', 'greens', 'purples'], 'ylorrd'),
      toggle('show_labels', 'District labels', true),
    ],
    python: `# GeoPandas / pandas spatial aggregation over district polygons
import geopandas as gpd

districts = [
    {"code": "D1", "uhi_c": 4.2, "canopy_pct": 11.5, "pop_density": 24.8},
    {"code": "D2", "uhi_c": 2.1, "canopy_pct": 28.4, "pop_density": 11.2},
    {"code": "D3", "uhi_c": 3.8, "canopy_pct": 14.0, "pop_density": 21.5},
    {"code": "D4", "uhi_c": 3.5, "canopy_pct": 15.8, "pop_density": 19.4},
    {"code": "D5", "uhi_c": 2.9, "canopy_pct": 20.2, "pop_density": 16.0},
    {"code": "D6", "uhi_c": 1.6, "canopy_pct": 34.5, "pop_density": 8.4},
    {"code": "D7", "uhi_c": 3.1, "canopy_pct": 18.6, "pop_density": 17.2},
    {"code": "D8", "uhi_c": 2.4, "canopy_pct": 25.0, "pop_density": 13.5},
    {"code": "D9", "uhi_c": 1.3, "canopy_pct": 38.2, "pop_density": 6.9},
]
gdf = gpd.GeoDataFrame.from_features([
    {"type": "Feature", "properties": d, "geometry": {"type": "Point", "coordinates": [105.8, 21.0]}}
    for d in districts
])
result = round(float(gdf[metric].mean()), 2)
`,
    js: `// Publication-grade vector choropleth map using Plot.geo + d3.geoCentroid (no external tiles needed)
const rows = [
  { code: "D1", name: "Central Core", gx: 1, gy: 1, uhi_c: 4.2, canopy_pct: 11.5, pop_density: 24.8 },
  { code: "D2", name: "River East", gx: 2, gy: 1, uhi_c: 2.1, canopy_pct: 28.4, pop_density: 11.2 },
  { code: "D3", name: "West Quarter", gx: 0, gy: 1, uhi_c: 3.8, canopy_pct: 14.0, pop_density: 21.5 },
  { code: "D4", name: "North Hub", gx: 1, gy: 2, uhi_c: 3.5, canopy_pct: 15.8, pop_density: 19.4 },
  { code: "D5", name: "Midtown", gx: 0, gy: 2, uhi_c: 2.9, canopy_pct: 20.2, pop_density: 16.0 },
  { code: "D6", name: "Green Belt", gx: 2, gy: 2, uhi_c: 1.6, canopy_pct: 34.5, pop_density: 8.4 },
  { code: "D7", name: "South Port", gx: 1, gy: 0, uhi_c: 3.1, canopy_pct: 18.6, pop_density: 17.2 },
  { code: "D8", name: "Canal Ward", gx: 0, gy: 0, uhi_c: 2.4, canopy_pct: 25.0, pop_density: 13.5 },
  { code: "D9", name: "Wetland Park", gx: 2, gy: 0, uhi_c: 1.3, canopy_pct: 38.2, pop_density: 6.9 },
]
// Build contiguous irregular district polygons in lon/lat coordinates
const corner = (ix, iy) => {
  const dx = Math.sin(ix * 1.9 + iy * 2.3) * 0.008
  const dy = Math.cos(ix * 2.1 - iy * 1.7) * 0.006
  return [+(105.78 + ix * 0.045 + dx).toFixed(4), +(20.96 + iy * 0.038 + dy).toFixed(4)]
}
const geojson = {
  type: "FeatureCollection",
  features: rows.map((r) => {
    const p0 = corner(r.gx, r.gy), p1 = corner(r.gx + 1, r.gy)
    const p2 = corner(r.gx + 1, r.gy + 1), p3 = corner(r.gx, r.gy + 1)
    return {
      type: "Feature",
      properties: r,
      geometry: { type: "Polygon", coordinates: [[p0, p3, p2, p1, p0]] },
    }
  }),
}
const labels = {
  uhi_c: "Surface heat anomaly ΔT (°C)",
  canopy_pct: "Tree canopy cover (%)",
  pop_density: "Population density (k / km²)",
}
expose(+d3.mean(rows, (d) => d[metric]).toFixed(2))
return Plot.plot({
  width,
  height: 360,
  projection: { type: "mercator", domain: geojson, inset: 14 },
  color: { scheme, legend: true, label: labels[metric] || metric },
  marks: [
    Plot.geo(geojson, {
      fill: (f) => f.properties[metric],
      stroke: "#ffffff",
      strokeWidth: 1.6,
      tip: true,
      title: (f) => \`\${f.properties.code} · \${f.properties.name}\\n\${labels[metric]}: \${f.properties[metric]}\`,
    }),
    show_labels
      ? Plot.text(
          geojson.features,
          Plot.centroid({
            text: (f) => \`\${f.properties.code}\\n\${f.properties[metric]}\`,
            fill: "#0f172a",
            stroke: "#ffffff",
            strokeWidth: 3,
            fontSize: 11,
            fontWeight: 600,
          }),
        )
      : null,
  ],
})`,
  },
  {
    id: 'geo-flows',
    label: 'Spatial OD flow & hub map (D3-Geo)',
    hint: 'Origin–destination corridor arcs, regional boundary & proportional hubs',
    icon: Route,
    keywords: ['geo', 'geopandas', 'd3', 'flow', 'network', 'arrow', 'od', 'map', 'ban do'],
    caption: 'Origin–destination corridor flows and hub volumes (D3-Geo vector network).',
    params: [
      { name: 'min_flow', label: 'Min corridor flow', min: 10, max: 70, step: 5, value: 20, unit: 'k' },
      { name: 'bend', label: 'Arc curvature', min: 0, max: 40, step: 5, value: 22, unit: '°' },
    ],
    python: `# Total active corridor volume at or above min_flow threshold
flows = [68, 54, 46, 39, 34, 28, 24, 18, 14]
result = int(sum(v for v in flows if v >= min_flow))
`,
    js: `// Spatial origin-destination flow network over a regional polygon boundary
const region = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Metropolitan Basin" },
    geometry: {
      type: "Polygon",
      coordinates: [[[105.72, 20.94], [105.71, 21.06], [105.80, 21.15], [105.94, 21.16], [106.01, 21.08], [105.98, 20.97], [105.86, 20.92], [105.72, 20.94]]],
    },
  }],
}
const hubs = [
  { id: "Core", lon: 105.85, lat: 21.03, jobs: 120 },
  { id: "North", lon: 105.83, lat: 21.12, jobs: 65 },
  { id: "East", lon: 105.95, lat: 21.05, jobs: 80 },
  { id: "South", lon: 105.86, lat: 20.95, jobs: 55 },
  { id: "West", lon: 105.75, lat: 21.04, jobs: 72 },
  { id: "Tech Park", lon: 105.92, lat: 21.12, jobs: 60 },
]
const byId = Object.fromEntries(hubs.map((h) => [h.id, h]))
const pairs = [
  ["West", "Core", 68], ["North", "Core", 54], ["East", "Core", 46],
  ["South", "Core", 39], ["North", "Tech Park", 34], ["East", "Tech Park", 28],
  ["West", "North", 24], ["South", "East", 18], ["West", "South", 14],
].map(([from, to, volume]) => ({
  from, to, volume,
  lon1: byId[from].lon, lat1: byId[from].lat,
  lon2: byId[to].lon, lat2: byId[to].lat,
}))
const active = pairs.filter((d) => d.volume >= min_flow)
expose(d3.sum(active, (d) => d.volume))
return Plot.plot({
  width,
  height: 360,
  projection: { type: "mercator", domain: region, inset: 18 },
  color: { scheme: "blues", legend: true, label: "Corridor flow (k trips / day)" },
  marks: [
    Plot.graticule({ stroke: "#cbd5e1", strokeOpacity: 0.45 }),
    Plot.geo(region, { fill: "#f8fafc", stroke: "#94a3b8", strokeWidth: 1.4 }),
    Plot.arrow(active, {
      x1: "lon1", y1: "lat1", x2: "lon2", y2: "lat2",
      stroke: "volume",
      strokeWidth: (d) => 1.2 + d.volume / 22,
      bend,
      headLength: 8,
      inset: 9,
      tip: true,
      title: (d) => \`\${d.from} → \${d.to}: \${d.volume}k trips/day\`,
    }),
    Plot.dot(hubs, { x: "lon", y: "lat", r: (d) => 4 + Math.sqrt(d.jobs) * 0.65, fill: "#0f172a", stroke: "#ffffff", strokeWidth: 1.8 }),
    Plot.text(hubs, { x: "lon", y: "lat", text: "id", dy: -12, fontSize: 11, fontWeight: 600, fill: "#0f172a", stroke: "#ffffff", strokeWidth: 3 }),
  ],
})`,
  },
  {
    id: 'geo-projection',
    label: 'Globe & projection map (D3-Geo)',
    hint: 'Switch map projections (Orthographic, Equal Earth, Mercator) & rotate longitude',
    icon: Globe,
    keywords: ['geo', 'geopandas', 'd3', 'globe', 'projection', 'sphere', 'graticule', 'map', 'ban do'],
    caption: 'Global monitoring stations rendered with interactive D3-Geo map projections.',
    params: [
      radio('proj', 'Projection', ['orthographic', 'equal-earth', 'mercator'], 'orthographic'),
      { name: 'lon0', label: 'Center longitude', min: -180, max: 180, step: 15, value: 105, unit: '°' },
      { name: 'lat0', label: 'Center latitude', min: -45, max: 45, step: 15, value: 15, unit: '°' },
    ],
    python: `import geopandas as gpd

lons = [105.8, 139.7, 103.8, 121.5, 77.2, 151.2, 2.3, -0.1, -74.0, -122.4, -46.6, 31.2]
lats = [21.0, 35.7, 1.3, 31.2, 28.6, -33.9, 48.9, 51.5, 40.7, 37.8, -23.5, 30.0]
pts = gpd.points_from_xy(lons, lats)
result = len(pts)
`,
    js: `// Interactive D3-Geo projection with sphere, graticules, landmass polygons & station anomalies
const stations = [
  { city: "Hanoi", lon: 105.8, lat: 21.0, anomaly: 1.45, obs: 92 },
  { city: "Tokyo", lon: 139.7, lat: 35.7, anomaly: 1.62, obs: 110 },
  { city: "Singapore", lon: 103.8, lat: 1.3, anomaly: 1.18, obs: 85 },
  { city: "Shanghai", lon: 121.5, lat: 31.2, anomaly: 1.54, obs: 105 },
  { city: "New Delhi", lon: 77.2, lat: 28.6, anomaly: 1.78, obs: 98 },
  { city: "Sydney", lon: 151.2, lat: -33.9, anomaly: 0.95, obs: 76 },
  { city: "Paris", lon: 2.3, lat: 48.9, anomaly: 1.34, obs: 88 },
  { city: "London", lon: -0.1, lat: 51.5, anomaly: 1.21, obs: 84 },
  { city: "New York", lon: -74.0, lat: 40.7, anomaly: 1.41, obs: 102 },
  { city: "San Francisco", lon: -122.4, lat: 37.8, anomaly: 1.12, obs: 79 },
  { city: "Sao Paulo", lon: -46.6, lat: -23.5, anomaly: 1.28, obs: 81 },
  { city: "Cairo", lon: 31.2, lat: 30.0, anomaly: 1.67, obs: 74 },
]
expose(stations.length)
return Plot.plot({
  width,
  height: 360,
  projection: { type: proj, rotate: [-lon0, -lat0] },
  color: { scheme: "ylorrd", legend: true, label: "Thermal anomaly (°C)" },
  marks: [
    Plot.sphere({ fill: "#f0f9ff", stroke: "#94a3b8", strokeWidth: 1.2 }),
    Plot.graticule({ stroke: "#64748b", strokeOpacity: 0.28 }),
    Plot.dot(stations, {
      x: "lon", y: "lat",
      r: (d) => 4 + d.obs / 22,
      fill: "anomaly",
      stroke: "#0f172a",
      strokeWidth: 1,
      tip: true,
      title: (d) => \`\${d.city}: +\${d.anomaly} °C (\${d.obs} sensors)\`,
    }),
    Plot.text(stations, { x: "lon", y: "lat", text: "city", dy: -10, fontSize: 10.5, fontWeight: 600, fill: "#0f172a", stroke: "#ffffff", strokeWidth: 2.5 }),
  ],
})`,
  },
]
